import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Marker, RacePlan, TrackSummary } from '../api/types';
import { STATUS_COLORS, TRACK_COLOR } from '../lib/colors';
import { formatClockFromMinutes, formatKm } from '../lib/format';
import { estimatedMinutesAt } from '../lib/plan';
import { niceTicks, pointAtKm } from '../lib/track';

interface Props {
  track: TrackSummary;
  markers: Marker[];
  plan: RacePlan;
  hoverKm: number | null;
  onHover: (trackKm: number | null) => void;
}

const HEIGHT = 240;
const M = { top: 30, right: 12, bottom: 26, left: 44 };

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

  const hover = hoverKm === null ? null : pointAtKm(track.profile, hoverKm);
  const hoverTime = hover ? estimatedMinutesAt(hover.km, plan, markers) : null;

  return (
    <div className="profile" ref={ref}>
      {width > 0 && paths && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Profil altimétrique : ${formatKm(track.distanceKm)} km, ${track.gainM} m D+`}
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
              <text x={M.left - 6} y={scales.y(v)} dy="0.32em" textAnchor="end">{v}</text>
            </g>
          ))}
          {niceTicks(0, scales.maxKm, Math.max(2, Math.floor(innerW / 70))).map((v) => (
            <text key={`x${v}`} className="axis" x={scales.x(v)} y={HEIGHT - 8} textAnchor="middle">{v} km</text>
          ))}

          <path d={paths.area} fill="url(#profile-fill)" />
          <path d={paths.line} fill="none" stroke={TRACK_COLOR} strokeWidth={1.8} strokeLinejoin="round" />

          {markers.map((m, i) => {
            const eta = plan.checkpoints[i];
            const x = scales.x(m.trackKm);
            const color = STATUS_COLORS[eta?.status ?? 'NONE'];
            return (
              <g key={m.code} className="cp">
                <line x1={x} x2={x} y1={M.top - 6} y2={M.top + innerH} stroke={color} strokeDasharray="3 3" opacity={0.6} />
                <circle cx={x} cy={M.top - 12} r={m.aid === 'FULL' ? 9 : 7.5} fill={color} />
                <text x={x} y={M.top - 12} dy="0.34em" textAnchor="middle" className="cp-code">
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
          <span className="muted">Survole le profil ou la carte pour voir l'heure de passage estimée.</span>
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
