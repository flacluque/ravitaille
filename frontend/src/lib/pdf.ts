import type { jsPDF } from 'jspdf';
import type { CourseView, CutoffStatus, RacePlan } from '../api/types';
import { ACCENT_COLOR, STATUS_COLORS, TRACK_COLOR } from './colors';
import { durationMinutes, formatClock, formatDuration, formatHm, formatKm, formatPace } from './format';
import { bindingCutoff, tightestCutoff } from './plan';
import { niceTicks } from './track';

/**
 * Plan de course en PDF A4, généré dans le navigateur : il se télécharge aussi hors ligne, le jour J.
 * jsPDF n'est chargé qu'au premier clic (il pèse plus lourd que le reste de l'appli).
 */
export interface PdfInput {
  course: CourseView;
  plans: RacePlan[];
  /** Scénario détaillé (les autres apparaissent dans la comparaison). */
  selected: number;
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CONTENT_W = PAGE_W - 2 * M;
const FOOTER_H = 10;

const TEXT: RGB = [28, 31, 29];
const MUTED: RGB = [107, 111, 105];
const BORDER: RGB = [226, 221, 210];
const STATUS_BG: Record<CutoffStatus, RGB> = {
  NONE: [255, 255, 255],
  OK: [220, 252, 231],
  TIGHT: [254, 243, 199],
  MISSED: [254, 226, 226],
};

type RGB = [number, number, number];

export async function downloadPlanPdf(input: PdfInput): Promise<void> {
  const doc = await buildPlanPdf(input);
  doc.save(pdfFilename(input.course.race.name));
}

export function pdfFilename(raceName: string): string {
  const slug = raceName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `plan-${slug || 'course'}.pdf`;
}

export async function buildPlanPdf({ course, plans, selected }: PdfInput): Promise<jsPDF> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const plan = plans[Math.min(selected, plans.length - 1)];
  doc.setProperties({ title: `Plan de course : ${course.race.name}`, creator: 'Trail Planner' });

  let y = header(doc, course, plan);
  y = scenarioBoxes(doc, plans, selected, y + 6);

  if (course.track) {
    y = ensureSpace(doc, y + 7, 58);
    y = profile(doc, course, plan, y);
  }

  const table = (title: string, startY: number, options: Parameters<typeof autoTable>[1]) => {
    let top = ensureSpace(doc, startY + 7, 30);
    top = sectionTitle(doc, title, top);
    autoTable(doc, {
      startY: top,
      margin: { left: M, right: M, bottom: M + FOOTER_H },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 }, textColor: TEXT, lineColor: BORDER },
      headStyles: { fillColor: rgb(ACCENT_COLOR), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { lineWidth: { bottom: 0.2 } },
      ...options,
    });
    return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };

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

  // --- Heures de passage du scénario détaillé ---
  y = table(`Heures de passage · scénario ${plan.scenario.name.toLowerCase()}`, y, {
    head: [['Point', 'Km', 'D+', 'Tronçon', 'Allure', 'Arrêt', 'Arrivée', 'Barrière', 'Marge']],
    body: plan.checkpoints.map((eta, i) => {
      const cutoff = bindingCutoff(eta);
      const stop = durationMinutes(eta.stop);
      return [
        `${pdfText(eta.code)}  ${pdfText(eta.name)}`,
        formatKm(eta.km),
        String(Math.round(eta.cumulativeGainM)),
        i === 0 ? '' : `${formatDuration(eta.legDuration)}\n${formatKm(eta.legDistanceKm)} km +${Math.round(eta.legGainM)} m`,
        i === 0 ? '' : formatPace(eta.legPaceMinPerKm).replace('/km', ''),
        stop > 0 ? `${Math.round(stop)} min` : '',
        formatClock(eta.arrival),
        cutoff ? formatClock(cutoff.at) + (cutoff.out ? '\n(sortie)' : '') : '',
        cutoff ? formatHm(cutoff.marginMinutes) : '',
      ];
    }),
    columnStyles: {
      0: { cellWidth: 52 },
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' }, 7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 8) {
        colorStatus(data.cell.styles, plan.checkpoints[data.row.index].status);
      }
    },
  });

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
          data.cell.styles.fillColor = rgb(TRACK_COLOR);
        }
      },
    });
  }

  notes(doc, plan, y + 6);
  footers(doc);
  return doc;
}

// ---------------------------------------------------------------------------------------------

function header(doc: jsPDF, course: CourseView, plan: RacePlan): number {
  doc.setFillColor(...rgb(ACCENT_COLOR));
  doc.rect(0, 0, PAGE_W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(pdfText(course.race.name), M, 13, { maxWidth: CONTENT_W - 32 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Départ ${longDateTime(course.race.start)}`, M, 20);
  doc.text(`${formatKm(plan.totalDistanceKm)} km · ${Math.round(plan.totalGainM).toLocaleString('fr-FR').replace(/\s/g, ' ')} m D+ · `
    + `${Math.round(plan.totalEffortKm)} km-effort · dénivelé : ${plan.elevationSource === 'TRACK' ? 'trace GPX' : 'roadbook officiel'}`, M, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TRAIL PLANNER', PAGE_W - M, 9, { align: 'right' });
  return 30;
}

function scenarioBoxes(doc: jsPDF, plans: RacePlan[], selected: number, y: number): number {
  const gap = 4;
  const w = (CONTENT_W - gap * (plans.length - 1)) / plans.length;
  const h = 27;
  plans.forEach((p, i) => {
    const x = M + i * (w + gap);
    const isSelected = i === selected;
    doc.setDrawColor(...(isSelected ? rgb(ACCENT_COLOR) : BORDER));
    doc.setLineWidth(isSelected ? 0.6 : 0.25);
    doc.roundedRect(x, y, w, h, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(p.scenario.name.toUpperCase() + (isSelected ? '  ·  DÉTAILLÉ' : ''), x + 3.5, y + 5.5);
    doc.setFontSize(15);
    doc.setTextColor(...TEXT);
    doc.text(formatClock(p.finish), x + 3.5, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${formatDuration(p.totalDuration)} de course · arrêts ${formatDuration(p.totalStops)}`, x + 3.5, y + 18);
    const tightest = tightestCutoff(p);
    if (tightest) {
      const margin = formatHm(tightest.cutoff.marginMinutes);
      doc.text(fit(doc, `Plus serrée : ${pdfText(tightest.eta.name)}`, w - 9 - badgeWidth(doc, margin)), x + 3.5, y + 23);
      badge(doc, margin, tightest.eta.status, x + w - 3.5, y + 23);
    }
  });
  return y + h;
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
  let y = sectionTitle(doc, `Profil · ${formatKm(track.distanceKm)} km, ${Math.round(track.gainM)} m D+ mesurés sur la trace`, top);
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
    doc.text(String(v), left - 1.5, py(v) + 1, { align: 'right' });
  }
  for (const v of niceTicks(0, maxKm, 10)) {
    doc.text(`${v} km`, px(v), plotTop + height + 4, { align: 'center' });
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

  // Ravitos : trait pointillé et pastille colorée selon la marge du scénario détaillé
  course.markers.forEach((m, i) => {
    const color = rgb(STATUS_COLORS[plan.checkpoints[i]?.status ?? 'NONE']);
    const x = px(m.trackKm);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(x, plotTop - 1, x, base);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...color);
    doc.circle(x, plotTop - 3.2, m.aid === 'FULL' ? 2.4 : 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(m.code.length > 2 ? 4.5 : 5.5);
    doc.setTextColor(255, 255, 255);
    doc.text(pdfText(m.code), x, plotTop - 2.3, { align: 'center' });
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
    doc.text(`Trail Planner · plan généré le ${generated}`, M, PAGE_H - M + 5);
    doc.text(`Page ${i} / ${pages}`, PAGE_W - M, PAGE_H - M + 5, { align: 'right' });
  }
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
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
