import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Marker, RacePlan, TrackSummary } from '../api/types';
import { STATUS_COLORS, TRACK_COLOR } from '../lib/colors';
import { statusShapePaint, statusShapePath, statusTextOffset } from '../lib/markerShape';
import { formatClockFromMinutes, formatKm } from '../lib/format';
import { estimatedMinutesAt, nightSpans } from '../lib/plan';
import { niceTicks, pointAtKm } from '../lib/track';

interface Props {
  track: TrackSummary;
  markers: Marker[];
  plan: RacePlan;
  hoverKm: number | null;
  onHover: (trackKm: number | null) => void;
}

const HEIGHT = 240;
const M = { top: 36, right: 14, bottom: 26, left: 54 };

/** Profil altimétrique en SVG : ravitos, barrières, et heure de passage estimée au survol. */
export function ElevationProfile({ track, markers, plan, hoverKm, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = HEIGHT - M.top - M.bottom;

  const scales = useMemo(() => {
    const maxKm = track.profile[track.profile.length - 1]?.km ?? 1;
    const pad = Math.max(20, (track.maxElevationM - track.minElevationM) * 0.08);
    const yMin = Math.max(0, Math.floor((track.minElevationM - pad) / 50) * 50);
    const yMax = Math.ceil((track.maxElevationM + pad) / 50) * 50;
    return {
      maxKm,
      yMin,
      yMax,
      x: (km: number) => M.left + (km / maxKm) * innerW,
      y: (ele: number) => M.top + (1 - (ele - yMin) / (yMax - yMin)) * innerH,
    };
  }, [track, innerW, innerH]);

  const paths = useMemo(() => {
    if (innerW <= 0) return null;
    const pts = track.profile.map((p) => `${scales.x(p.km).toFixed(1)},${scales.y(p.elevationM).toFixed(1)}`);
    const line = `M${pts.join('L')}`;
    const base = M.top + innerH;
    const area = `${line}L${scales.x(scales.maxKm).toFixed(1)},${base}L${M.left},${base}Z`;
    return { line, area };
  }, [track, scales, innerW, innerH]);

  function handlePointer(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const km = ((e.clientX - rect.left - M.left) / innerW) * scales.maxKm;
    onHover(km < 0 || km > scales.maxKm ? null : km);
  }

  const nights = useMemo(() => nightSpans(plan, markers), [plan, markers]);

  const hover = hoverKm === null ? null : pointAtKm(track.profile, hoverKm);
  const hoverTime = hover ? estimatedMinutesAt(hover.km, plan, markers, track.profile) : null;

  // Lecture au clavier : flèches = 1 km (Maj : 10 km), Page préc./suiv. = point précédent/suivant, Début/Fin.
  function handleKey(e: KeyboardEvent<SVGSVGElement>) {
    const at = hoverKm ?? 0;
    const step = e.shiftKey ? 10 : 1;
    const stops = markers.map((m) => m.trackKm);
    const moves: Record<string, () => number> = {
      ArrowRight: () => at + step,
      ArrowUp: () => at + step,
      ArrowLeft: () => at - step,
      ArrowDown: () => at - step,
      PageDown: () => stops.find((k) => k > at + 0.05) ?? scales.maxKm,
      PageUp: () => [...stops].reverse().find((k) => k < at - 0.05) ?? 0,
      Home: () => 0,
      End: () => scales.maxKm,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    onHover(Math.min(scales.maxKm, Math.max(0, moves[e.key]())));
  }

  return (
    <div className="profile" ref={ref}>
      {width > 0 && paths && (
        <svg
          width={width}
          height={HEIGHT}
          role="slider"
          tabIndex={0}
          aria-label={`Profil altimétrique : ${formatKm(plan.totalDistanceKm)} km, ${Math.round(plan.totalGainM)} m D+. Flèches pour avancer d'un km, Page suivante pour le point suivant`}
          aria-valuemin={0}
          aria-valuemax={Math.round(scales.maxKm)}
          aria-valuenow={hover ? Math.round(hover.km * 10) / 10 : 0}
          aria-valuetext={hover
            ? `km ${formatKm(hover.km)}, ${Math.round(hover.elevationM)} m${hoverTime !== null ? `, passage vers ${formatClockFromMinutes(hoverTime)}` : ''}`
            : 'départ'}
          onKeyDown={handleKey}
          onFocus={() => { if (hoverKm === null) onHover(0); }}
          onBlur={() => onHover(null)}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => onHover(null)}
        >
          <defs>
            <linearGradient id="profile-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TRACK_COLOR} stopOpacity="0.35" />
              <stop offset="100%" stopColor={TRACK_COLOR} stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {niceTicks(scales.yMin, scales.yMax, 4).map((v) => (
            <g key={`y${v}`} className="grid">
              <line x1={M.left} x2={M.left + innerW} y1={scales.y(v)} y2={scales.y(v)} />
              <text x={M.left - 6} y={scales.y(v)} dy="0.32em" textAnchor="end">{v} m</text>
            </g>
          ))}
          {niceTicks(0, scales.maxKm, Math.max(2, Math.floor(innerW / 70))).map((v) => (
            <text key={`x${v}`} className="axis" x={scales.x(v)} y={HEIGHT - 8} textAnchor="middle">{v} km</text>
          ))}

          {nights.map(([from, to]) => (
            <rect key={from} className="night-band" x={scales.x(from)} y={M.top - 4} width={Math.max(0, scales.x(to) - scales.x(from))}
              height={innerH + 4} />
          ))}
          {nights[0] && (
            <text className="night-label" x={scales.x(nights[0][0]) + 4} y={M.top + 10}>☾ de nuit</text>
          )}

          <path d={paths.area} fill="url(#profile-fill)" />
          <path d={paths.line} fill="none" stroke={TRACK_COLOR} strokeWidth={1.8} strokeLinejoin="round" />

          {markers.map((m, i) => {
            const eta = plan.checkpoints[i];
            const x = scales.x(m.trackKm);
            const status = eta?.status ?? 'NONE';
            const color = STATUS_COLORS[status];
            const r = m.aid === 'FULL' ? 11.5 : 10;
            const { fill, stroke } = statusShapePaint(status);
            return (
              <g key={m.code} className={`cp cp-${status.toLowerCase()}`}>
                <line x1={x} x2={x} y1={M.top - 6} y2={M.top + innerH} stroke={color} strokeDasharray="3 3" opacity={0.6} />
                <path d={statusShapePath(status, x, M.top - 15, r)} fill={fill}
                  stroke={status === 'NONE' ? stroke : 'none'} strokeWidth={1.6} strokeLinejoin="round" />
                <text x={x} y={M.top - 15 + statusTextOffset(status, r)} dy="0.34em" textAnchor="middle" className="cp-code">
                  {m.code}
                </text>
                <title>{`${m.code} · ${m.name} (km ${m.km})`}</title>
              </g>
            );
          })}

          {hover && (
            <g pointerEvents="none">
              <line className="hover-line" x1={scales.x(hover.km)} x2={scales.x(hover.km)} y1={M.top} y2={M.top + innerH} />
              <circle className="hover-dot" cx={scales.x(hover.km)} cy={scales.y(hover.elevationM)} r={4.5} />
            </g>
          )}
        </svg>
      )}
      <div className="profile-readout" aria-live="polite">
        {hover ? (
          <>
            <strong>km {formatKm(hover.km)}</strong>
            <span>{Math.round(hover.elevationM)} m</span>
            <span>+{Math.round(hover.cumulativeGainM)} m D+</span>
            {hoverTime !== null && <span>passage ≈ {formatClockFromMinutes(hoverTime)}</span>}
          </>
        ) : (
          <span className="muted">Survole le profil ou la carte (ou parcours le profil au clavier) pour voir l'heure de passage estimée.</span>
        )}
      </div>
    </div>
  );
}

function useWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
