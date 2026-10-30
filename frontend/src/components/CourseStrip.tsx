import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CourseView, Marker, RacePlan } from '../api/types';
import { STATUS_COLORS, TRACK_COLOR } from '../lib/colors';
import { durationMinutes, formatClock, formatHm, formatKm } from '../lib/format';
import { bindingCutoff, estimatedMinutesAt, nightSpans, tightestCutoff } from '../lib/plan';

interface Props {
  plan: RacePlan;
  course: CourseView;
  /** Le jour J : minutes « locales » de maintenant et avance/retard sur le plan, pour placer le coureur. */
  live?: { now: number; offset: number } | null;
}

// Dessin à l'échelle du téléphone : la largeur de la carte de l'accueil.
const W = 358;
const H = 112;
const TOP = 10;
const BASE = 76;

/**
 * La course d'un coup d'œil, sur l'accueil : le profil, les ravitos, la nuit, et la barrière la plus serrée marquée et
 * nommée. Le jour J, le coureur y avance. Sans trace GPX, le profil est refait avec le dénivelé du roadbook.
 */
export function CourseStrip({ plan, course, live = null }: Props) {
  const etas = plan.checkpoints;
  const total = plan.totalDistanceKm;

  // Profil (km, altitude) et position de chaque point le long du profil.
  const { points, at } = useMemo(() => {
    const profile = course.track?.profile ?? [];
    if (profile.length > 1 && course.markers.length === etas.length) {
      const scale = total / profile[profile.length - 1].km;
      const step = Math.max(1, Math.floor(profile.length / 240));
      return {
        points: profile.filter((_, i) => i % step === 0 || i === profile.length - 1).map((p) => [p.km * scale, p.elevationM] as const),
        at: course.markers.map((m) => m.trackKm * scale),
      };
    }
    // Sans trace : l'altitude relative, montées moins descentes, de point en point.
    let alt = 0;
    const pts = etas.map((e, i) => {
      if (i > 0) alt += e.legGainM - e.legLossM;
      return [e.km, alt] as const;
    });
    return { points: pts, at: etas.map((e) => e.km) };
  }, [course, etas, total]);

  const minAlt = Math.min(...points.map((p) => p[1]));
  const maxAlt = Math.max(...points.map((p) => p[1]));
  const x = (km: number) => (Math.max(0, Math.min(total, km)) / Math.max(total, 0.001)) * W;
  const y = (alt: number) => BASE - ((alt - minAlt) / Math.max(1, maxAlt - minAlt)) * (BASE - TOP);
  const altAt = (km: number) => {
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] >= km) {
        const [k0, a0] = points[i - 1];
        const [k1, a1] = points[i];
        return k1 === k0 ? a1 : a0 + ((km - k0) / (k1 - k0)) * (a1 - a0);
      }
    }
    return points[points.length - 1][1];
  };
  const line = points.map(([km, alt], i) => `${i ? 'L' : 'M'}${x(km).toFixed(1)} ${y(alt).toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${BASE} L0 ${BASE} Z`;

  const markers: Marker[] = course.markers.length === etas.length ? course.markers
    : etas.map((e, i) => ({ code: e.code, name: e.name, km: e.km, trackKm: at[i] } as Marker));
  const nights = nightSpans(plan, markers.map((m, i) => ({ ...m, trackKm: at[i] })));

  const tight = tightestCutoff(plan);
  // L'heure d'arrivée est déjà dans la tuile voisine : sous la frise, la barrière d'arrivée.
  const finishCut = bindingCutoff(etas[etas.length - 1]);
  const tightIndex = tight ? etas.indexOf(tight.eta) : -1;
  const tightColor = tight ? STATUS_COLORS[tight.eta.status] : STATUS_COLORS.NONE;

  // Le jour J : le km où devrait être le coureur, d'après le plan recalé sur ses pointages.
  let runnerKm: number | null = null;
  if (live && markers.length === etas.length) {
    const target = live.now - live.offset;
    const startMin = estimatedMinutesAt(0, plan, markers, course.track?.profile);
    const endMin = estimatedMinutesAt(markers[markers.length - 1].trackKm, plan, markers, course.track?.profile);
    if (startMin !== null && endMin !== null && target > startMin && target < endMin) {
      let lo = 0;
      let hi = markers[markers.length - 1].trackKm;
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        if ((estimatedMinutesAt(mid, plan, markers, course.track?.profile) ?? 0) < target) lo = mid; else hi = mid;
      }
      runnerKm = (lo / Math.max(markers[markers.length - 1].trackKm, 0.001)) * total;
    }
  }

  const tightX = tightIndex >= 0 ? x(at[tightIndex]) : 0;
  // Le nom de la barrière, centré sous son point quand il y a la place, sinon calé sur le bord : jamais hors du cadre.
  const tightLabel = tight ? `${tight.eta.name} · ${formatHm(tight.cutoff.marginMinutes)} de marge` : '';
  const labelRef = useRef<SVGTextElement>(null);
  const [labelW, setLabelW] = useState(tightLabel.length * 6.6);
  useLayoutEffect(() => {
    const measure = () => { if (labelRef.current) setLabelW(labelRef.current.getComputedTextLength()); };
    measure();
    // Mesuré de nouveau une fois la police de l'appli chargée (plus large ou plus étroite que celle de secours).
    void document.fonts?.ready.then(measure);
  }, [tightLabel]);
  const labelX = Math.min(Math.max(tightX - labelW / 2, 0), Math.max(0, W - labelW));
  const nightMinutes = durationMinutes(plan.nightDuration);
  const summary = `Profil de la course : ${formatKm(total)} km, ${etas.length} points${nightMinutes > 0 ? `, ${formatHm(nightMinutes)} de nuit` : ''}`
    + (tight ? `. Barrière la plus serrée : ${tight.eta.name}, ${formatHm(tight.cutoff.marginMinutes)} de marge.` : '.');

  return (
    <svg className="course-strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      {nights.map(([from, to]) => (
        <rect key={from} className="strip-night" x={x(from)} y={0} width={Math.max(0, x(to) - x(from))} height={BASE} />
      ))}
      {nights[0] && x(nights[0][1]) - x(nights[0][0]) > 34 && (
        <text x={x(nights[0][0]) + 5} y={11} className="strip-label">nuit</text>
      )}
      <path d={area} fill={TRACK_COLOR} fillOpacity={0.14} />
      <path d={line} fill="none" stroke={TRACK_COLOR} strokeWidth={2} strokeLinejoin="round" />
      <line x1={0} x2={W} y1={BASE} y2={BASE} className="strip-base" />
      {at.map((km, i) => i > 0 && i < at.length - 1 && i !== tightIndex && (
        <circle key={etas[i].code} cx={x(km)} cy={y(altAt(km))} r={3.5} className="strip-point" />
      ))}
      {tightIndex >= 0 && <>
        <line x1={tightX} x2={tightX} y1={y(altAt(at[tightIndex]))} y2={BASE + 6} stroke={tightColor} strokeWidth={1.5} />
        <circle cx={tightX} cy={y(altAt(at[tightIndex]))} r={5.5} fill={tightColor} className="strip-tight" />
        <text ref={labelRef} x={labelX} y={BASE + 19} className={`strip-tight-label ${tight!.eta.status.toLowerCase()}`}>
          {tightLabel}
        </text>
      </>}
      {runnerKm !== null && <>
        <line x1={x(runnerKm)} x2={x(runnerKm)} y1={y(altAt(runnerKm))} y2={BASE} className="strip-runner-line" />
        <circle cx={x(runnerKm)} cy={y(altAt(runnerKm))} r={6} className="strip-runner" />
      </>}
      <text x={0} y={H - 2} className="strip-label">Départ {formatClock(plan.start).split(' ')[1]}</text>
      <text x={W} y={H - 2} textAnchor="end" className="strip-label">
        {finishCut ? `Barrière d'arrivée ${formatClock(finishCut.at)}` : `Arrivée ${formatClock(plan.finish)}`}
      </text>
    </svg>
  );
}
