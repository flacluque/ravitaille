import { useEffect, useRef, useState } from 'react';
import type { RacePlan, TrainingWeek } from '../api/types';
import { formatKm } from '../lib/format';
import { comparedReferences, formEffect, axisTicks, volumeChange, weekLabel } from '../lib/training';
import { StravaLogo } from './StravaLogo';

const H = 170;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

/**
 * Ta préparation : volume par semaine (historique Strava), comparé à celui des références, et ce que
 * le plan en retient (correction de forme, alertes).
 */
export function TrainingCard({ plan }: { plan: RacePlan }) {
  const t = plan.training;
  const [hover, setHover] = useState<number | null>(null);
  if (!t) return null;
  const refs = comparedReferences(plan.references);
  const block = t.target;
  const n = block.blockWeeks ?? 12;
  const raceShare = plan.totalEffortKm > 0 ? Math.round((100 * block.longestEffortKm) / plan.totalEffortKm) : null;
  const shown = hover !== null ? t.weeks[hover] : null;

  return (
    <section className="card training">
      <div className="card-head">
        <h2><span className="strava-mark small"><StravaLogo size={13} /></span> Ta préparation</h2>
        <p className="muted small">
          Les {n} semaines avant ta course{block.end > new Date().toISOString().slice(0, 10) ? ", jusqu'à aujourd'hui" : ''},
          d'après Strava. Volume en km-effort : 100 m de D+ comptent comme 1 km.
        </p>
      </div>

      {t.active && (
        <div className="training-stats">
          <div className="stat">
            <span className="stat-label">Volume moyen</span>
            <span className="stat-value">{Math.round(block.weeklyEffortKm)} <small>km-effort / sem.</small></span>
            <span className="muted small">{formatKm(block.weeklyKm)} km · {Math.round(block.weeklyGainM).toLocaleString('fr-FR')} m D+ par semaine</span>
          </div>
          <div className={t.lowSpecificity ? 'stat warn' : 'stat'}>
            <span className="stat-label">Plus longue sortie</span>
            <span className="stat-value">{Math.round(block.longestEffortKm)} <small>km-effort</small></span>
            {raceShare !== null && <span className="muted small">{raceShare} % de l'effort de la course</span>}
          </div>
          <div className="stat">
            <span className="stat-label">Régularité</span>
            <span className="stat-value">{block.activeWeeks} <small>/ {n} semaines</small></span>
            <span className="muted small">avec au moins 2 sorties</span>
          </div>
        </div>
      )}

      {t.weeks.length > 0 && (
        <figure className="training-chart">
          <WeeksChart weeks={t.weeks} average={t.active ? block.weeklyEffortKm : null} blockStart={block.start}
            hover={hover} onHover={setHover} />
          <figcaption className="muted small" aria-live="polite">
            {shown
              ? <>Semaine du {weekLabel(shown)} : <strong>{Math.round(shown.effortKm)} km-effort</strong> ({formatKm(shown.km)} km,
                {' '}{Math.round(shown.gainM).toLocaleString('fr-FR')} m D+), {shown.sessions} sortie{shown.sessions > 1 ? 's' : ''}</>
              : <>Volume par semaine sur {t.weeks.length} semaines : en couleur pleine, les {n} semaines de préparation{t.active ? ', en pointillé leur moyenne' : ''} ; en pâle, les semaines d'avant.</>}
          </figcaption>
        </figure>
      )}

      {t.active && refs.length > 0 && (
        <div className="table-scroll">
          <table className="training-refs">
            <thead>
              <tr><th>Référence</th><th className="num">Sa préparation</th><th className="num">Écart</th><th className="num">Temps corrigé</th></tr>
            </thead>
            <tbody>
              {refs.map((r, i) => (
                <tr key={`${r.label}-${i}`}>
                  <td>{r.label}</td>
                  <td className="num">{Math.round(r.weeklyEffortKm)} / sem.</td>
                  <td className="num">{volumeChange(block.weeklyEffortKm, r.weeklyEffortKm)}</td>
                  <td className="num strong">{formEffect(r.formFactor ?? 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {t.notes.length > 0 && <ul className="training-notes">{t.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

      {t.active && (
        <p className="muted small training-method">
          Le temps de chaque référence est corrigé selon l'écart de volume entre sa préparation et la tienne
          ({t.personalRaces > 0
            ? `sensibilité ajustée sur tes ${t.personalRaces} courses : +10 % de volume, −${formatPct(t.elasticity)} de temps`
            : `+10 % de volume ≈ −${formatPct(t.elasticity)} de temps, d'après Tanda 2011`}), dans la limite de ±8 %.
        </p>
      )}
    </section>
  );
}

/** Effet de +10 % de volume, pour une sensibilité donnée. */
function formatPct(elasticity: number): string {
  const pct = (1 - Math.pow(1.1, -elasticity)) * 100;
  return `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function WeeksChart({ weeks, average, blockStart, hover, onHover }: {
  weeks: TrainingWeek[];
  average: number | null;
  blockStart: string;
  hover: number | null;
  onHover: (i: number | null) => void;
}) {
  // Dessiné à la largeur réelle : les textes gardent leur taille sur téléphone.
  const ref = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const max = Math.max(...weeks.map((w) => w.effortKm), average ?? 0, 10);
  const ticks = axisTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.max(4, slot - 4);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" className="weeks-chart"
      aria-label={`Volume par semaine : ${weeks.map((w) => `${weekLabel(w)} ${Math.round(w.effortKm)}`).join(', ')}`}
      onMouseLeave={() => onHover(null)}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
          <text x={PAD.left - 6} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">{v}</text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const x = PAD.left + i * slot + (slot - barW) / 2;
        const h = Math.max(0, y(0) - y(w.effortKm));
        const r = Math.min(4, barW / 2, h);
        const inBlock = w.start >= blockStart;
        return (
          <g key={w.start} onMouseEnter={() => onHover(i)} onFocus={() => onHover(i)} onBlur={() => onHover(null)}
            tabIndex={0} aria-label={`Semaine du ${weekLabel(w)} : ${Math.round(w.effortKm)} km-effort`}>
            <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} className="hit" />
            {h > 0 && (
              <path className={`bar${inBlock ? '' : ' before'}${hover === i ? ' hover' : ''}`}
                d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`} />
            )}
            {i % (W < 480 ? 5 : 4) === 0 && <text x={x + barW / 2} y={H - 6} className="axis" textAnchor="middle">{weekLabel(w)}</text>}
          </g>
        );
      })}
      {average !== null && (
        <g className="avg">
          <line x1={PAD.left} x2={W - PAD.right} y1={y(average)} y2={y(average)} />
          <text x={W - PAD.right - 2} y={y(average) - 5} textAnchor="end" className="axis strong">moyenne {Math.round(average)}</text>
        </g>
      )}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="baseline" />
    </svg>
  );
}
