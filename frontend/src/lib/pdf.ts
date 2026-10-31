import type { jsPDF } from 'jspdf';
import { saveFile } from './files';
import type { CellHookData, RowInput, UserOptions } from 'jspdf-autotable';
import type { CourseView, CutoffStatus, RacePlan, Service } from '../api/types';
import { ACCENT_COLOR, STATUS_COLORS, TRACK_COLOR } from './colors';
import { durationMinutes, formatClock, formatDuration, formatHm, formatKm, formatPace, localMinutes } from './format';
import { GEAR_STATUS_LABEL, waterCheck, type GearItem, type GearStatus } from './gear';
import {
  computeNutrition, describeActions, describeFill, describeRhythm, describeTake, describeTotals, type NutritionPlan, type NutritionProfile,
} from './nutrition';
import { bindingCutoff, nightSpans, tightestCutoff, worstCutoff } from './plan';
import { SERVICE_INFO } from './services';
import { niceTicks } from './track';

/**
 * Plan de course en PDF A4, généré dans le navigateur : il se télécharge aussi hors ligne, le jour J.
 * jsPDF n'est chargé qu'au premier clic (il pèse plus lourd que le reste de l'appli).
 * Même grammaire que l'écran « Mon plan » : du papier, des filets noirs, l'heure d'arrivée en grand
 * et les passages comme un roadbook (un point par ligne, le tronçon entre deux points).
 */
export interface PdfInput {
  course: CourseView;
  plans: RacePlan[];
  /** Scénario détaillé (les autres apparaissent dans la comparaison). */
  selected: number;
  /** Services de chaque point (même ordre que le plan) : sous chaque ravito, et pour la nutrition. */
  services?: Service[][];
  /** Avec les services : section nutrition et hydratation du scénario détaillé. */
  nutrition?: NutritionProfile;
  /** Checklist du matériel de la course. */
  gear?: GearItem[];
  /** Codes des points où l'assistance attend le coureur. */
  crew?: string[];
  /** « summary » : une page à garder sur soi (passages, barrières, ravitos) ; « full » (défaut) : tout le plan. */
  variant?: 'summary' | 'full';
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CONTENT_W = PAGE_W - 2 * M;
const FOOTER_H = 10;

const TEXT: RGB = [28, 31, 29];
const MUTED: RGB = [107, 111, 105];
const BORDER: RGB = [216, 210, 196];
const NIGHT: RGB = [236, 234, 228];
const STATUS_BG: Record<CutoffStatus, RGB> = {
  NONE: [255, 255, 255],
  OK: [220, 252, 231],
  TIGHT: [254, 243, 199],
  MISSED: [254, 226, 226],
};

type RGB = [number, number, number];

export async function downloadPlanPdf(input: PdfInput): Promise<void> {
  const doc = await buildPlanPdf(input);
  await saveFile(doc.output('blob'), pdfFilename(input.course.race.name, input.variant), `Plan · ${input.course.race.name}`);
}

export function pdfFilename(raceName: string, variant: PdfInput['variant'] = 'full'): string {
  const slug = raceName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `plan-${slug || 'course'}${variant === 'summary' ? '-resume' : ''}.pdf`;
}

export async function buildPlanPdf({ course, plans, selected, services, nutrition, gear, crew = [], variant = 'full' }: PdfInput): Promise<jsPDF> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const plan = plans[Math.min(selected, plans.length - 1)];
  doc.setProperties({ title: `Plan de course : ${course.race.name}`, creator: 'Ravitime' });

  let y = header(doc, course, plan);
  y = hero(doc, plans, selected, y + 7);

  if (course.track && variant === 'full') {
    y = ensureSpace(doc, y + 11, 58);
    y = profile(doc, course, plan, y);
  }

  // Tableaux façon roadbook : en-tête en petites capitales grises sur un filet noir, lignes séparées d'un filet fin.
  const table = (title: string, startY: number, options: Parameters<typeof autoTable>[1]) => {
    let top = ensureSpace(doc, startY + 9, 30);
    if (title) top = sectionTitle(doc, title, top);
    const { didParseCell, didDrawCell, columnStyles } = options;
    autoTable(doc, {
      startY: top,
      margin: { left: M, right: M, bottom: M + FOOTER_H },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 }, textColor: TEXT, lineColor: BORDER },
      headStyles: { textColor: MUTED, fontStyle: 'bold', fontSize: 6.5 },
      bodyStyles: { lineWidth: { bottom: 0.2 } },
      ...options,
      didParseCell: (data) => {
        if (data.section === 'head') {
          if (typeof data.cell.raw === 'string') data.cell.text = [data.cell.raw.toUpperCase()];
          const align = (columnStyles as Record<number, { halign?: string }> | undefined)?.[data.column.index]?.halign;
          if (align) data.cell.styles.halign = align as 'right';
        }
        didParseCell?.(data);
      },
      didDrawCell: (data) => {
        if (data.section === 'head') {
          doc.setDrawColor(...TEXT);
          doc.setLineWidth(0.6);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
        didDrawCell?.(data);
      },
    });
    return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };

  if (variant === 'summary') {
    summary(doc, plan, y, table, services, nutrition, crew);
    footers(doc);
    return doc;
  }

  if (plan.references.length > 1) {
    y = table('Tes références', y, {
      head: [['Référence', 'Date', 'Type', 'Poids', 'Arrivée seule']],
      body: plan.references.map((r) => [
        `${pdfText(r.label)}\n${formatKm(r.distanceKm)} km · ${Math.round(r.elevationGainM)} m D+ · ${formatDuration(r.duration)}`,
        r.date ? longDate(r.date) : '-',
        r.kind === 'TRAINING' ? 'Entraînement' : 'Course',
        `${Math.round(r.weight * 100)} %`,
        formatClock(r.predictedFinish),
      ]),
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
    });
  }

  // --- Préparation (historique Strava) ---
  if (plan.training) y = training(doc, plan, y, table);

  // --- Heures de passage du scénario détaillé, en roadbook ---
  y = roadbook(doc, plan, y, table, { services, crew });

  // --- Nutrition et hydratation du scénario détaillé ---
  if (nutrition && services) {
    const n = computeNutrition(plan, services, nutrition, crew);
    const names = plan.checkpoints.map((c) => pdfText(c.name));
    const last = plan.checkpoints.length - 1;
    let top = ensureSpace(doc, y + 11, 40);
    top = sectionTitle(doc, `Nutrition et hydratation · scénario ${plan.scenario.name.toLowerCase()}`, top) + 2;
    doc.setFontSize(8.5);
    const intro = [
      `${nutrition.carbsPerHour} g de glucides par heure (moins la première heure et la nuit), ${nutrition.waterDayMlPerHour} ml d'eau `
        + `par heure (${nutrition.waterNightMlPerHour} la nuit)${nutrition.eatAtAid ? ', en mangeant aux ravitos' : ''}.`,
      `Au départ : ${pdfText(describeActions(n.points[0], n, nutrition, true)) || 'rien à préparer'}.`,
      ...n.alerts.map((a) => `Attention : ${pdfText(a)}`),
    ];
    doc.setTextColor(...TEXT);
    for (const line of intro.flatMap((l) => doc.splitTextToSize(l, CONTENT_W) as string[])) {
      top = ensureSpace(doc, top + 1, 4);
      doc.text(line, M, top + 2);
      top += 4;
    }
    y = table('', top - 5, {
      head: [['Tronçon', 'Durée', 'Consigne', 'Glucides', "Au point d'arrivée"]],
      body: n.legs.map((leg) => [
        `${names[leg.index - 1]} ->\n${names[leg.index]}`,
        formatHm(leg.minutes) + (leg.nightMinutes >= 15 ? `\ndont ${formatHm(leg.nightMinutes)} de nuit` : ''),
        pdfText(describeRhythm(leg, n, plan)) + (leg.sequence.length > 1 ? `\n${pdfText(sequenceText(leg.sequence, n))}` : ''),
        `${Math.round(leg.aidCarbsG + leg.drinkCarbsG + leg.itemsCarbsG)} g`,
        leg.index === last ? 'arrivée' : pdfText(describeActions(n.points[leg.index], n, nutrition, false)) || '-',
      ]),
      columnStyles: {
        0: { cellWidth: 38 }, 1: { halign: 'right', cellWidth: 20 }, 2: { cellWidth: 52 }, 3: { halign: 'right', cellWidth: 16 },
      },
      didParseCell: (data) => {
        if (data.section === 'head' && (data.column.index === 1 || data.column.index === 3)) data.cell.styles.halign = 'right';
      },
    });
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    const total = doc.splitTextToSize(`Sur la course : ${pdfText(describeTotals(n, nutrition))}.`, CONTENT_W) as string[];
    let ty = ensureSpace(doc, y + 5, total.length * 4);
    for (const line of total) {
      doc.text(line, M, ty);
      ty += 4;
    }
    y = ty - 2;

    // --- Fiche pour l'assistance ---
    const stops = n.points.filter((p) => p.crew);
    if (stops.length > 0) {
      y = table('Fiche pour mon assistance', y, {
        head: [['Point', 'Vers', 'Préparer']],
        body: stops.map((p) => [
          names[p.index],
          formatClock(plan.checkpoints[p.index].arrival),
          pdfText([describeTake(p, n, nutrition), p.fillFlasks > 0 ? `${describeFill(p.fillFlasks, p.fillDrinkFlasks, n, '').trim()} prêtes` : '']
            .filter(Boolean).join(' · ')) || 'rien',
        ]),
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 24, fontStyle: 'bold' } },
      });
    }
  }

  // --- Comparaison des scénarios ---
  if (plans.length > 1) {
    y = table('Comparaison des scénarios', y, {
      head: [['Point', 'Km', 'Barrière', ...plans.map((p) => p.scenario.name)]],
      body: plan.checkpoints.map((eta, i) => {
        const cutoff = bindingCutoff(eta);
        return [
          `${pdfText(eta.code)}  ${pdfText(eta.name)}`,
          formatKm(eta.km),
          cutoff ? formatClock(cutoff.at) : '',
          ...plans.map((p) => {
            const e = p.checkpoints[i];
            const c = bindingCutoff(e);
            return formatClock(e.arrival) + (c ? `\nmarge ${formatHm(c.marginMinutes)}` : '');
          }),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 60 }, 1: { halign: 'right' }, 2: { halign: 'right' },
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
      },
      didParseCell: (data) => {
        const p = plans[data.column.index - 3];
        if (data.section === 'body' && p) {
          // Fond coloré seulement pour les marges serrées ou dépassées : l'œil va à l'essentiel.
          const status = p.checkpoints[data.row.index].status;
          if (status === 'OK') data.cell.styles.textColor = rgb(STATUS_COLORS.OK);
          else if (status !== 'NONE') colorStatus(data.cell.styles, status);
        }
        if (data.section === 'head' && data.column.index - 3 === selected) {
          data.cell.styles.textColor = TEXT;
          data.cell.text = [`${plans[selected].scenario.name.toUpperCase()} (DÉTAILLÉ)`];
        }
      },
    });
  }

  // --- Matériel : checklist à cocher ---
  if (gear && gear.length > 0) {
    const order: GearStatus[] = ['MANDATORY', 'RECOMMENDED', 'PERSONAL'];
    const sorted = order.flatMap((st) => gear.filter((i) => i.status === st));
    const packed = gear.filter((i) => i.packed).length;
    const water = nutrition ? waterCheck(gear, nutrition) : null;
    let top = ensureSpace(doc, y + 11, 30);
    top = sectionTitle(doc, `Matériel · ${packed} / ${gear.length} prêts`, top);
    if (water) {
      doc.setFontSize(8.5);
      doc.setTextColor(...rgb(STATUS_COLORS[water.ok ? 'OK' : 'TIGHT']));
      doc.text(doc.splitTextToSize(pdfText(water.message), CONTENT_W) as string[], M, top + 3);
      top += 5;
    }
    y = table('', top - 5, {
      head: [['', 'Élément', 'Statut']],
      body: sorted.map((i) => ['', pdfText(i.name), GEAR_STATUS_LABEL[i.status]]),
      columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 28, textColor: MUTED } },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 0) return;
        // Case à cocher dessinée : les polices standard du PDF n'ont pas de symbole de case.
        const size = 3.2;
        const x = data.cell.x + 2.4;
        const yy = data.cell.y + (data.cell.height - size) / 2;
        doc.setDrawColor(...MUTED);
        doc.setLineWidth(0.3);
        doc.rect(x, yy, size, size, 'S');
        if (sorted[data.row.index].packed) {
          doc.setDrawColor(...rgb(ACCENT_COLOR));
          doc.setLineWidth(0.5);
          doc.line(x + 0.6, yy + size * 0.55, x + size * 0.42, yy + size - 0.6);
          doc.line(x + size * 0.42, yy + size - 0.6, x + size - 0.4, yy + 0.5);
        }
      },
    });
  }

  notes(doc, plan, y + 6);
  footers(doc);
  return doc;
}

// ---------------------------------------------------------------------------------------------

/** Résumé d'une page : ce qu'il faut emporter au départ, puis passages, barrières et actions à chaque ravito. */
/** "1. Gel Décathlon, 2. Gel Décathlon, 3. Compote Baouw" */
function sequenceText(sequence: string[], n: NutritionPlan): string {
  return sequence.map((id, k) => `${k + 1}. ${n.foods.find((f) => f.id === id)?.name ?? id}`).join(', ');
}

function summary(doc: jsPDF, plan: RacePlan, y: number, table: (title: string, startY: number, options: UserOptions) => number,
  services: Service[][] | undefined, nutrition: NutritionProfile | undefined, crew: string[]) {
  const n = nutrition && services ? computeNutrition(plan, services, nutrition, crew) : null;
  let top = y + 6;
  if (n && nutrition) {
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    const start = `Au départ : ${pdfText(describeActions(n.points[0], n, nutrition, true)) || 'rien à préparer'}.`;
    for (const line of doc.splitTextToSize(start, CONTENT_W) as string[]) {
      doc.text(line, M, top + 2);
      top += 4.2;
    }
    for (const alert of n.alerts) {
      doc.setTextColor(...rgb(STATUS_COLORS.TIGHT));
      doc.text(doc.splitTextToSize(`Attention : ${pdfText(alert)}`, CONTENT_W) as string[], M, top + 2);
      top += 4.2;
    }
  }
  const last = plan.checkpoints.length - 1;
  roadbook(doc, plan, top - 4, table, {
    services, crew, title: `Passages et ravitos · scénario ${plan.scenario.name.toLowerCase()}`,
    todo: (i) => {
      const actions = n && nutrition && i > 0 && i < last ? describeActions(n.points[i], n, nutrition, false) : '';
      const next = n && i < last ? describeRhythm(n.legs[i], n, plan) : '';
      const rhythm = next ? `Ensuite : ${next.charAt(0).toLowerCase()}${next.slice(1)}` : '';
      // pdfText ne garde pas les retours à la ligne : on les remet après coup.
      return i === last ? 'arrivée' : [actions, rhythm].filter(Boolean).map(pdfText).join('\n');
    },
  });
}

type TableFn = (title: string, startY: number, options: UserOptions) => number;
type RowKind = 'day' | 'leg' | 'point';

/** « 1h11 de marge », « serré : 0h58 de marge », « dépassée de 0h20 » : comme les badges de l'appli. */
export function marginText(status: CutoffStatus, minutes: number): string {
  if (status === 'MISSED') return `dépassée de ${formatHm(Math.abs(minutes))}`;
  if (status === 'TIGHT') return `serré : ${formatHm(minutes)} de marge`;
  return `${formatHm(minutes)} de marge`;
}

/** Jour de la semaine d'une heure locale ISO : « SAMEDI ». */
function weekday(iso: string): string {
  const m = LOCAL.exec(iso);
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long' }).toUpperCase();
}

/**
 * Les heures de passage comme dans « Mon plan » : un repère par jour, un point par ligne (code encadré,
 * heure en gras, barrière et marge), et entre deux points le tronçon sur un trait orange.
 * Avec `todo`, une colonne « À faire » remplace le D+ (résumé d'une page).
 */
function roadbook(doc: jsPDF, plan: RacePlan, y: number, table: TableFn,
  { services, crew = [], todo, title }: { services?: Service[][]; crew?: string[]; todo?: (i: number) => string; title?: string }): number {
  const head = todo
    ? ['', 'Point', 'Arrivée', 'Barrière', 'Marge', 'À faire']
    : ['', 'Point', 'Km', 'D+', 'Arrivée', 'Barrière', 'Marge'];
  const cols = head.length;
  const kinds: RowKind[] = [];
  const status: CutoffStatus[] = [];
  const body: RowInput[] = [];
  const last = plan.checkpoints.length - 1;
  plan.checkpoints.forEach((eta, i) => {
    const prev = plan.checkpoints[i - 1];
    if (prev) {
      const night = !!eta.legNightDuration && durationMinutes(eta.legNightDuration) >= 15;
      kinds.push('leg');
      status.push('NONE');
      body.push(['', {
        content: `${formatKm(eta.legDistanceKm)} km · +${Math.round(eta.legGainM)} m · ${formatDuration(eta.legDuration)}`
          + ` · ${formatPace(eta.legPaceMinPerKm)}${night ? ' · de nuit' : ''}`,
        colSpan: cols - 1,
      }]);
    }
    const time = i === 0 ? eta.departure : eta.arrival;
    if (!prev || weekday(prev.arrival) !== weekday(time)) {
      kinds.push('day');
      status.push('NONE');
      body.push([{ content: weekday(time), colSpan: cols }]);
    }
    const cutoff = bindingCutoff(eta);
    const stop = Math.round(durationMinutes(eta.stop));
    // Résumé : le km et l'assistance sous le nom (les services se lisent dans « À faire »).
    const details = [
      todo ? `km ${formatKm(eta.km)}` : servicesText(services?.[i]),
      !todo && stop > 0 && i > 0 && i < last ? `arrêt ${stop} min` : '',
      crew.includes(eta.code) ? 'ASSISTANCE' : '',
    ].filter(Boolean).join(' · ');
    kinds.push('point');
    status.push(cutoff ? eta.status : 'NONE');
    body.push([
      pdfText(eta.code),
      `${pdfText(eta.name)}${details ? `\n${details}` : ''}`,
      ...(todo ? [] : [formatKm(eta.km), String(Math.round(eta.cumulativeGainM))]),
      formatClock(time).replace(/^\S+ /, ''),
      cutoff ? formatClock(cutoff.at) + (cutoff.out ? '\nen sortie' : '') : '',
      cutoff ? marginText(eta.status, cutoff.marginMinutes) : '',
      ...(todo ? [todo(i)] : []),
    ]);
  });
  const timeCol = todo ? 2 : 4;
  const cutCol = todo ? 3 : 5;
  const marginCol = todo ? 4 : 6;
  return table(title ?? `Heures de passage · scénario ${plan.scenario.name.toLowerCase()}`, y, {
    head: [head],
    body,
    rowPageBreak: 'avoid',
    styles: { font: 'helvetica', fontSize: todo ? 7.5 : 8.5, cellPadding: todo ? { top: 1, bottom: 1, left: 1.4, right: 1.4 } : { top: 1.5, bottom: 1.5, left: 1.6, right: 1.6 },
      textColor: TEXT, lineColor: BORDER, valign: 'middle' },
    columnStyles: todo
      ? { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 40 }, 2: { cellWidth: 15, halign: 'right' }, 3: { cellWidth: 19, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' } }
      : { 0: { cellWidth: 11, halign: 'center' }, 2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 14, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' }, 5: { cellWidth: 28, halign: 'right' }, 6: { cellWidth: 34, halign: 'right' } },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const kind = kinds[data.row.index];
      const st = data.cell.styles;
      if (kind === 'leg') {
        st.lineWidth = 0;
        st.textColor = MUTED;
        st.fontSize = 7;
        st.cellPadding = todo ? { top: 0.6, bottom: 0.6, left: 1.4, right: 1.4 } : { top: 1.2, bottom: 1.2, left: 1.6, right: 1.6 };
        st.halign = 'left';
      } else if (kind === 'day') {
        st.fontStyle = 'bold';
        st.fontSize = 6.5;
        st.lineWidth = 0;
        st.cellPadding = todo ? { top: 1.6, bottom: 0.6, left: 1.4, right: 1.4 } : { top: 2.6, bottom: 0.8, left: 1.6, right: 1.6 };
        st.halign = 'left';
      } else {
        if (data.column.index === 0) { st.fontStyle = 'bold'; st.fontSize = 7.5; }
        if (data.column.index === timeCol) { st.fontStyle = 'bold'; st.fontSize = todo ? 10.5 : 12; }
        if (data.column.index === cutCol || (!todo && (data.column.index === 2 || data.column.index === 3))) st.textColor = MUTED;
        if (data.column.index === marginCol && status[data.row.index] !== 'NONE') {
          st.fontStyle = 'bold';
          st.fontSize = 7;
          st.textColor = rgb(STATUS_COLORS[status[data.row.index]]);
        }
        if (todo && data.column.index === 5) st.fontSize = 7;
      }
    },
    // Marge : une pastille derrière le texte, comme les badges de l'appli (dessinée avant le texte).
    willDrawCell: (data: CellHookData) => {
      if (data.section !== 'body') return;
      // Tronçon : trait orange dans la colonne des codes, comme le fil du roadbook à l'écran.
      if (kinds[data.row.index] === 'leg' && data.column.index === 0) {
        const { x, y: cy, width, height } = data.cell;
        doc.setDrawColor(...rgb(TRACK_COLOR));
        doc.setLineWidth(0.8);
        doc.line(x + width / 2, cy, x + width / 2, cy + height);
      }
      if (kinds[data.row.index] !== 'point' || data.column.index !== marginCol) return;
      const st = status[data.row.index];
      const text = data.cell.text.join(' ');
      if (st === 'NONE' || !text) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const w = doc.getTextWidth(text) + 3;
      const pad = (data.cell.styles.cellPadding as { right: number }).right;
      doc.setFillColor(...STATUS_BG[st]);
      doc.roundedRect(data.cell.x + data.cell.width - pad - w + 1.5, data.cell.y + data.cell.height / 2 - 2.1, w, 4.2, 2, 2, 'F');
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section !== 'body') return;
      const kind = kinds[data.row.index];
      const { x, y: cy, width, height } = data.cell;
      if (kind === 'day' && data.column.index === 0) {
        doc.setDrawColor(...TEXT);
        doc.setLineWidth(0.3);
        doc.line(M, cy + height, PAGE_W - M, cy + height);
      }
      // Code du point encadré.
      if (kind === 'point' && data.column.index === 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        const w = Math.max(6.5, doc.getTextWidth(String(data.cell.raw)) + 2.4);
        doc.setDrawColor(...TEXT);
        doc.setLineWidth(0.4);
        doc.roundedRect(x + (width - w) / 2, cy + height / 2 - 2.4, w, 4.8, 0.8, 0.8, 'S');
        doc.setFont('helvetica', 'normal');
      }
    },
  });
}

/** Ta préparation : chiffres clés, volume par semaine en barres, correction de chaque référence, alertes. */
function training(doc: jsPDF, plan: RacePlan, y: number,
  table: (title: string, startY: number, options: UserOptions) => number): number {
  const t = plan.training!;
  const b = t.target;
  let top = ensureSpace(doc, y + 11, 52);
  top = sectionTitle(doc, 'Ta préparation (Strava)', top) + 2;
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT);
  if (t.active) {
    const share = plan.totalEffortKm > 0 ? ` (${Math.round((100 * b.longestEffortKm) / plan.totalEffortKm)} % de la course)` : '';
    const n = b.blockWeeks ?? 12;
    const line = `${n} semaines : ${Math.round(b.weeklyEffortKm)} km-effort par semaine (${formatKm(b.weeklyKm)} km, `
      + `${Math.round(b.weeklyGainM)} m D+), plus longue sortie ${Math.round(b.longestEffortKm)} km-effort${share}, `
      + `${b.activeWeeks} semaines sur ${n} avec au moins 2 sorties.`;
    for (const l of doc.splitTextToSize(pdfText(line), CONTENT_W) as string[]) {
      doc.text(l, M, top + 2);
      top += 4;
    }
  }
  // Barres : volume des 16 dernières semaines, le bloc en couleur, sa moyenne en pointillé.
  if (t.weeks.length > 0) {
    const chartH = 22;
    const base = top + 4 + chartH;
    const max = Math.max(...t.weeks.map((w) => w.effortKm), b.weeklyEffortKm, 10);
    const slot = CONTENT_W / t.weeks.length;
    t.weeks.forEach((w, i) => {
      const h = (w.effortKm / max) * chartH;
      doc.setFillColor(...rgb(ACCENT_COLOR));
      if (w.start < b.start) doc.setFillColor(190, 205, 196);
      if (h > 0) doc.rect(M + i * slot + 0.6, base - h, slot - 1.2, h, 'F');
      if (i % 4 === 0) {
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        const [, mm, dd] = w.start.split('-');
        doc.text(`${dd}/${mm}`, M + i * slot + slot / 2, base + 3.2, { align: 'center' });
      }
    });
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.2);
    doc.line(M, base, M + CONTENT_W, base);
    if (t.active) {
      const ay = base - (b.weeklyEffortKm / max) * chartH;
      doc.setDrawColor(...TEXT);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(M, ay, M + CONTENT_W, ay);
      doc.setLineDashPattern([], 0);
      doc.setFontSize(6.5);
      doc.setTextColor(...TEXT);
      doc.text(`moyenne ${Math.round(b.weeklyEffortKm)}`, M + CONTENT_W, ay - 1, { align: 'right' });
    }
    top = base + 5;
  }
  const refs = plan.references.filter((r) => r.weeklyEffortKm != null);
  if (t.active && refs.length > 0) {
    top = table('', top - 5, {
      head: [['Référence', 'Sa préparation', 'Écart de volume', 'Temps corrigé']],
      body: refs.map((r) => {
        const pct = Math.round((b.weeklyEffortKm / r.weeklyEffortKm! - 1) * 100);
        const f = ((r.formFactor ?? 1) - 1) * 100;
        return [pdfText(r.label), `${Math.round(r.weeklyEffortKm!)} km-effort / sem.`, `${pct >= 0 ? '+' : '-'}${Math.abs(pct)} %`,
          `${f > 0 ? '+' : f < 0 ? '-' : ''}${Math.abs(f).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`];
      }),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index >= 1) data.cell.styles.halign = 'right';
      },
    }) + 2;
  }
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  for (const l of t.notes.flatMap((n) => doc.splitTextToSize(pdfText(n), CONTENT_W) as string[])) {
    top = ensureSpace(doc, top + 1, 4);
    doc.text(l, M, top + 2);
    top += 3.6;
  }
  return top;
}

function header(doc: jsPDF, course: CourseView, plan: RacePlan): number {
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(pdfText(course.race.name), M, M + 4, { maxWidth: CONTENT_W - 32 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Départ ${longDateTime(course.race.start)} · ${formatKm(plan.totalDistanceKm)} km · `
    + `${Math.round(plan.totalGainM).toLocaleString('fr-FR').replace(/\s/g, ' ')} m D+ · ${Math.round(plan.totalEffortKm)} km-effort`
    + ` · dénivelé : ${plan.elevationSource === 'TRACK' ? 'trace GPX' : 'roadbook officiel'}`, M, M + 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...rgb(ACCENT_COLOR));
  doc.text('TRAIL PLANNER', PAGE_W - M, M + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(...TEXT);
  doc.setLineWidth(0.8);
  doc.line(M, M + 14, PAGE_W - M, M + 14);
  return M + 14;
}

/**
 * Le bandeau de « Mon plan » : l'heure d'arrivée en grand, la frise du départ à la barrière d'arrivée
 * (fourchette des scénarios), les trois scénarios et ce qu'il faut surveiller.
 */
function hero(doc: jsPDF, plans: RacePlan[], selected: number, top: number): number {
  const plan = plans[Math.min(selected, plans.length - 1)];
  const first = plans[0];
  const lastPlan = plans[plans.length - 1];
  const leftW = CONTENT_W * 0.56;
  const right = M + leftW + 8;
  const rightW = PAGE_W - M - right;

  // Gauche : heure d'arrivée
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`ARRIVÉE PRÉVUE · SCÉNARIO ${plan.scenario.name.toUpperCase()}`, M, top + 2);
  const [day, time] = splitClock(formatClock(plan.finish));
  doc.setFontSize(15);
  doc.text(day, M, top + 15);
  const dayW = doc.getTextWidth(day) + 2.5;
  doc.setFontSize(34);
  doc.setTextColor(...TEXT);
  doc.text(time, M + dayW, top + 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const sameDay = splitClock(formatClock(first.finish))[0] === splitClock(formatClock(lastPlan.finish))[0];
  const bound = (iso: string) => (sameDay ? splitClock(formatClock(iso))[1] : formatClock(iso));
  doc.text(`${formatDuration(plan.totalDuration)} de course`
    + (plans.length > 1 ? ` · entre ${bound(first.finish)} et ${bound(lastPlan.finish)} selon ta journée` : ''), M, top + 21);

  // Frise : départ → barrière d'arrivée, fourchette des scénarios et scénario détaillé.
  const fy = top + 28;
  const startMin = localMinutes(plan.start);
  const finishCut = bindingCutoff(plan.checkpoints[plan.checkpoints.length - 1]);
  const lastFinish = localMinutes(lastPlan.finish);
  const endMin = finishCut ? Math.max(localMinutes(finishCut.at), lastFinish) : lastFinish + (lastFinish - startMin) * 0.1;
  const fx = (iso: string) => M + ((localMinutes(iso) - startMin) / Math.max(1, endMin - startMin)) * leftW;
  doc.setDrawColor(...TEXT);
  doc.setLineWidth(0.4);
  doc.line(M, fy, M + leftW, fy);
  if (plans.length > 1) {
    doc.setFillColor(205, 219, 211);
    doc.roundedRect(fx(first.finish), fy - 1.4, Math.max(1, fx(lastPlan.finish) - fx(first.finish)), 2.8, 1.4, 1.4, 'F');
  }
  doc.setFillColor(...rgb(ACCENT_COLOR));
  doc.circle(fx(plan.finish), fy, 1.6, 'F');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(`Départ ${formatClock(plan.start)}`, M, fy + 4.5);
  if (finishCut) {
    doc.setDrawColor(...rgb(STATUS_COLORS.MISSED));
    doc.setLineWidth(0.6);
    doc.line(M + leftW, fy - 2.4, M + leftW, fy + 1.6);
    doc.setTextColor(...rgb(STATUS_COLORS.MISSED));
    doc.text(`Barrière d'arrivée ${formatClock(finishCut.at)}`, M + leftW, fy + 4.5, { align: 'right' });
  }

  // Droite : les scénarios, puis « À surveiller »
  let ry = top + 2;
  if (plans.length > 1) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('SCÉNARIOS', right, ry);
    ry += 5;
    plans.forEach((p, i) => {
      const on = i === selected;
      doc.setFont('helvetica', on ? 'bold' : 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...(on ? TEXT : MUTED));
      doc.text(p.scenario.name + (on ? ' (détaillé)' : ''), right, ry);
      doc.text(formatClock(p.finish), PAGE_W - M, ry, { align: 'right' });
      ry += 4.6;
    });
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(right, ry - 2.6, PAGE_W - M, ry - 2.6);
    ry += 2;
  }
  const tightest = tightestCutoff(plan);
  const worst = worstCutoff(plans);
  if (tightest) {
    const watchTop = ry - 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('À SURVEILLER', right + 3.5, ry);
    ry += 4.6;
    const line = (label: string, name: string, status: CutoffStatus, minutes: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TEXT);
      doc.text(fit(doc, `${label} : ${pdfText(name)}`, rightW - 3.5), right + 3.5, ry);
      ry += 4.4;
      badge(doc, marginText(status, minutes), status, right + 3.5 + badgeWidth(doc, marginText(status, minutes)), ry);
      ry += 5;
    };
    line('Barrière la plus serrée', tightest.eta.name, tightest.eta.status, tightest.cutoff.marginMinutes);
    if (worst && worst.scenario !== selected && worst.cutoff.marginMinutes < tightest.cutoff.marginMinutes) {
      line(`Au pire (${plans[worst.scenario].scenario.name.toLowerCase()})`, worst.eta.name, worst.eta.status, worst.cutoff.marginMinutes);
    }
    doc.setDrawColor(...TEXT);
    doc.setLineWidth(0.8);
    doc.line(right, watchTop, right, ry - 3);
  }
  return Math.max(fy + 6, ry);
}

/** « sam 02h35 » → [« sam », « 02h35 »]. */
function splitClock(text: string): [string, string] {
  const i = text.indexOf(' ');
  return i < 0 ? ['', text] : [text.slice(0, i), text.slice(i + 1)];
}

/** Coupe le texte avec « … » pour qu'il tienne dans la largeur (police et taille courantes). */
function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function badgeWidth(doc: jsPDF, text: string): number {
  const size = doc.getFontSize();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const w = doc.getTextWidth(text) + 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  return w;
}

function badge(doc: jsPDF, text: string, status: CutoffStatus, right: number, baseline: number) {
  const w = badgeWidth(doc, text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setFillColor(...STATUS_BG[status]);
  doc.roundedRect(right - w, baseline - 3.1, w, 4.2, 1.5, 1.5, 'F');
  doc.setTextColor(...rgb(STATUS_COLORS[status]));
  doc.text(text, right - 1.5, baseline, { align: 'right' });
  doc.setFont('helvetica', 'normal');
}

function profile(doc: jsPDF, course: CourseView, plan: RacePlan, top: number): number {
  const track = course.track!;
  let y = sectionTitle(doc, `Profil · ${formatKm(plan.totalDistanceKm)} km, ${Math.round(plan.totalGainM)} m D+`, top);
  const left = M + 10;
  const width = CONTENT_W - 10;
  const plotTop = y + 7;
  const height = 34;
  const maxKm = track.profile[track.profile.length - 1]?.km ?? 1;
  const pad = Math.max(20, (track.maxElevationM - track.minElevationM) * 0.08);
  const yMin = Math.max(0, Math.floor((track.minElevationM - pad) / 50) * 50);
  const yMax = Math.ceil((track.maxElevationM + pad) / 50) * 50;
  const px = (km: number) => left + (km / maxKm) * width;
  const py = (ele: number) => plotTop + (1 - (ele - yMin) / (yMax - yMin)) * height;

  // Grille et altitudes
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.15);
  for (const v of niceTicks(yMin, yMax, 4)) {
    doc.line(left, py(v), left + width, py(v));
    doc.text(`${v} m`, left - 1.5, py(v) + 1, { align: 'right' });
  }
  for (const v of niceTicks(0, maxKm, 10)) {
    doc.text(`${v} km`, px(v), plotTop + height + 4, { align: 'center' });
  }

  // Nuit : bandes grisées, comme à l'écran.
  const nights = nightSpans(plan, course.markers);
  doc.setFillColor(...NIGHT);
  for (const [from, to] of nights) doc.rect(px(from), plotTop, Math.max(0, px(to) - px(from)), height, 'F');
  if (nights[0]) {
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text('de nuit', px(nights[0][0]) + 1.2, plotTop + 3);
  }

  // Relief : 400 points suffisent à l'œil et gardent le PDF léger.
  const stride = Math.max(1, Math.ceil(track.profile.length / 400));
  const pts = track.profile.filter((_, i) => i % stride === 0 || i === track.profile.length - 1)
    .map((p) => [px(p.km), py(p.elevationM)] as [number, number]);
  const base = plotTop + height;
  const area: [number, number][] = [[pts[0][0], base], ...pts, [pts[pts.length - 1][0], base]];
  doc.setFillColor(250, 226, 214);
  doc.lines(relative(area), area[0][0], area[0][1], [1, 1], 'F', true);
  doc.setDrawColor(...rgb(TRACK_COLOR));
  doc.setLineWidth(0.35);
  doc.lines(relative(pts), pts[0][0], pts[0][1], [1, 1], 'S', false);

  // Ravitos : trait pointillé et forme du statut (rond, triangle, carré, anneau), comme sur la carte et le profil.
  course.markers.forEach((m, i) => {
    const status = plan.checkpoints[i]?.status ?? 'NONE';
    const color = rgb(STATUS_COLORS[status]);
    const x = px(m.trackKm);
    const cy = plotTop - 3.4;
    const r = m.aid === 'FULL' ? 2.5 : 2.1;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(x, plotTop - 1, x, base);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...color);
    if (status === 'TIGHT') doc.triangle(x, cy - r * 1.25, x - r * 1.2, cy + r * 0.85, x + r * 1.2, cy + r * 0.85, 'F');
    else if (status === 'MISSED') doc.rect(x - r, cy - r, 2 * r, 2 * r, 'F');
    else if (status === 'NONE') {
      doc.setFillColor(255, 255, 255);
      doc.setLineWidth(0.35);
      doc.circle(x, cy, r, 'FD');
    } else doc.circle(x, cy, r, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(m.code.length > 2 ? 4.5 : 5.5);
    if (status === 'NONE') doc.setTextColor(...color);
    else doc.setTextColor(255, 255, 255);
    doc.text(pdfText(m.code), x, cy + (status === 'TIGHT' ? 1.4 : 0.9), { align: 'center' });
  });
  doc.setFont('helvetica', 'normal');
  return base + 5;
}

function notes(doc: jsPDF, plan: RacePlan, top: number) {
  const s = plan.scenario;
  const lines = [
    ...plan.warnings.map((w) => `Attention : ${pdfText(w)}`),
    `Scénario ${s.name.toLowerCase()} : arrêt de ${s.lightStopMinutes} min par ravito, ${s.fullStopMinutes} min par base de vie, `
      + `allure de nuit ${Math.round((s.nightFactor - 1) * 100)} % plus lente. Marge : avance sur la barrière horaire `
      + '(sur la sortie du ravito quand le roadbook le précise).',
    'Heures estimées à partir de tes performances de référence (kilomètre-effort et loi de fatigue) : '
      + 'une prévision, pas une promesse. Écoute ton corps le jour J.',
  ];
  doc.setFontSize(7.5);
  const wrapped = lines.flatMap((l) => doc.splitTextToSize(l, CONTENT_W) as string[]);
  let y = ensureSpace(doc, top, wrapped.length * 3.6 + 2);
  doc.setTextColor(...MUTED);
  for (const line of wrapped) {
    doc.text(line, M, y);
    y += 3.6;
  }
}

function footers(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - M + 1, PAGE_W - M, PAGE_H - M + 1);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Ravitime · plan généré le ${generated}`, M, PAGE_H - M + 5);
    doc.text(`Page ${i} / ${pages}`, PAGE_W - M, PAGE_H - M + 5, { align: 'right' });
  }
}

/** Services d'un point en toutes lettres (les polices du PDF n'ont pas les icônes) : "eau · solide · assistance". */
function servicesText(services: Service[] | undefined): string {
  return (services ?? []).map((s) => SERVICE_INFO[s].short).join(' · ');
}

/** Titre de section sous un filet noir, comme les blocs de « Mon plan ». */
function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setDrawColor(...TEXT);
  doc.setLineWidth(0.6);
  doc.line(M, y - 5, PAGE_W - M, y - 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(pdfText(title), M, y);
  doc.setFont('helvetica', 'normal');
  return y + 3;
}

/** Saute une page si `needed` mm ne tiennent plus avant le pied de page. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= PAGE_H - M - FOOTER_H) return y;
  doc.addPage();
  return M + 4;
}

function colorStatus(styles: { fillColor: unknown; textColor: unknown }, status: CutoffStatus) {
  styles.fillColor = STATUS_BG[status];
  styles.textColor = rgb(STATUS_COLORS[status]);
}

function relative(points: [number, number][]): [number, number][] {
  return points.slice(1).map(([x, yy], i) => [x - points[i][0], yy - points[i][1]]);
}

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

/** "2026-10-23T11:00:00" → "vendredi 23 octobre 2026 à 11h00" (heure locale de course, sans fuseau). */
export function longDateTime(iso: string): string {
  const m = LOCAL.exec(iso);
  if (!m) return iso;
  const date = longDate(iso);
  return m[4] ? `${date} à ${m[4]}h${m[5]}` : date;
}

function longDate(iso: string): string {
  const m = LOCAL.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('fr-FR', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * Les polices standard du PDF (Helvetica) ne couvrent que l'alphabet latin occidental : les accents
 * français passent, pas les symboles ni les caractères d'autres alphabets d'un roadbook importé.
 */
export function pdfText(text: string): string {
  return text
    .replace(/≈/g, 'env.')
    .replace(/[→⇒]/g, '->')
    .replace(/[⚠✕✗]/g, '')
    .replace(/[  ]/g, ' ')
    .normalize('NFC')
    .replace(/[^ -~ -ÿŒœŠšŸŽž–—‘’“”•…€·]/g, '')
    .trim();
}
