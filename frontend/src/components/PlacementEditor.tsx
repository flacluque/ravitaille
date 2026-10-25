import { useMemo, useState } from 'react';
import type { CourseView, Placement, RacePlan } from '../api/types';
import { formatClockFromMinutes, formatKm, formatMeters } from '../lib/format';
import { estimatedMinutesAt } from '../lib/plan';
import {
  autoPosition, bounds, checkPlacement, currentPositions, savedPositions, type EditedPosition,
} from '../lib/placement';
import { CourseMap } from './CourseMap';

interface Props {
  course: CourseView;
  plan: RacePlan;
  saving: boolean;
  hoverKm: number | null;
  onHover: (trackKm: number | null) => void;
  /** Positions à garder, point par point (null : position automatique). */
  onSave: (positions: (number | null)[]) => void;
  onCancel: () => void;
}

const SOURCE_LABELS: Record<Placement, string> = {
  MANUAL: 'placé à la main',
  WAYPOINT: 'waypoint du GPX',
  ROADBOOK: 'km du roadbook',
};

const STEP_KM = 0.1;

function signedKm(km: number): string {
  if (Math.abs(km) < 0.05) return '=';
  return `${km > 0 ? '+' : '−'}${formatKm(Math.abs(km))} km`;
}

/**
 * « Ajuster les ravitos » : chaque ravito se fait glisser sur la carte jusqu'à sa vraie place sur la trace. Le km du
 * roadbook reste affiché ; le plan, le parcours Garmin et le code du champ utilisent la position sur la trace.
 */
export function PlacementEditor({ course, plan, saving, hoverKm, onHover, onSave, onCancel }: Props) {
  const initial = useMemo(() => currentPositions(course), [course]);
  const [positions, setPositions] = useState<EditedPosition[]>(initial);
  const last = positions.length - 1;
  const checks = positions.map((pos, i) => checkPlacement(course, i, pos));
  const [selected, setSelected] = useState(() => {
    const first = checks.findIndex((c) => c.warn);
    return first > 0 ? first : Math.min(1, last);
  });
  const dirty = positions.some((p, i) => p.manual !== initial[i].manual || Math.abs(p.km - initial[i].km) > 0.005);
  const track = course.track!;

  const move = (i: number, km: number) => {
    setPositions((ps) => ps.map((p, j) => (j === i ? { km, manual: true } : p)));
    onHover(km);
  };
  const reset = (i: number) => {
    setPositions((ps) => ps.map((p, j) => (j === i ? { km: autoPosition(course.markers[i]).km, manual: false } : p)));
  };

  const warned = checks.flatMap((c, i) => (c.warn ? [course.markers[i].name] : []));
  const m = course.markers[selected];
  const pos = positions[selected];
  const check = checks[selected];
  const b = selected > 0 && selected < last ? bounds(positions, selected) : null;
  const source: Placement = pos.manual ? 'MANUAL' : autoPosition(m).placement;
  const roadbookKm = m.roadbookTrackKm ?? m.trackKm;
  const eta = estimatedMinutesAt(pos.km, plan, course.markers, track.profile);
  const etaBefore = Math.abs(pos.km - initial[selected].km) > 0.05
    ? estimatedMinutesAt(initial[selected].km, plan, course.markers, track.profile) : null;
  const gain = course.race.checkpoints[selected]?.gainM;

  return (
    <section className="placement plan-rule no-print" aria-label="Placer les ravitos sur la trace">
      <div className="placement-head">
        <div>
          <span className="overline">Carte · ajuster les ravitos</span>
          <h2>Place chaque ravito à sa vraie place sur la trace</h2>
          <p className="muted small">Fais glisser un ravito sur la carte, ou règle-le ci-contre. Le km du roadbook reste
            affiché ; le plan, le parcours Garmin et le code du champ utilisent la position sur ta trace.</p>
        </div>
        <div className="placement-actions">
          {dirty && <span className="placement-dirty small">Modifications non enregistrées</span>}
          <button type="button" className="ghost" onClick={onCancel} disabled={saving}>{dirty ? 'Annuler' : 'Fermer'}</button>
          <button type="button" onClick={() => onSave(savedPositions(positions))} disabled={!dirty || saving}>
            {saving ? 'Calcul…' : 'Enregistrer les positions'}
          </button>
        </div>
      </div>

      {warned.length > 0 && (
        <p className="placement-warn" role="status">
          <strong>{warned.length === 1 ? '1 ravito à vérifier' : `${warned.length} ravitos à vérifier`} :</strong>{' '}
          {warned.join(', ')}. Fais-les glisser à leur vraie place, ou garde leur position si elle est juste.
        </p>
      )}

      <div className="placement-grid">
        <div className="placement-map">
          <CourseMap track={track} markers={course.markers} plan={plan} hoverKm={hoverKm} onHover={onHover}
            edit={{ positions, selected, warn: checks.map((c) => c.warn), onSelect: setSelected, onMove: move }} />
          <p className="muted small">Un ravito reste sur la trace, entre celui d'avant et celui d'après. Clique sur la trace
            pour y amener le ravito sélectionné. Rond pointillé : le km du roadbook
            {course.markers.some((x) => typeof x.waypointKm === 'number') && <>. Losange vert : le waypoint du GPX</>}.</p>
        </div>

        <div className="placement-side">
          {b && (
            <div className="placement-card">
              <div className="placement-card-head">
                <span className={`placement-num${check.warn ? ' is-warn' : ''}`}>{selected}</span>
                <h3>{m.name}</h3>
                <span className={`placement-src src-${source.toLowerCase()}`}>{SOURCE_LABELS[source]}</span>
              </div>
              <dl className="placement-figures">
                <div><dt>Roadbook</dt><dd>{formatKm(m.km)} km</dd></div>
                <div><dt>Sur ta trace</dt><dd className="placement-track">{formatKm(pos.km)} km</dd></div>
                <div><dt>Écart</dt><dd>{signedKm(pos.km - roadbookKm)}</dd></div>
                <div>
                  <dt>Passage prévu</dt>
                  <dd>{eta === null ? '—' : formatClockFromMinutes(eta)}</dd>
                  {etaBefore !== null && <span className="muted small">avant : {formatClockFromMinutes(etaBefore)}</span>}
                </div>
              </dl>

              {check.expectedGainM === null ? (
                <p className="placement-gain">Le roadbook ne donne pas le D+ de ce point : pas de vérification possible.</p>
              ) : (
                <p className={`placement-gain${check.gainOff ? ' is-off' : ''}`}>
                  <strong>D+ {check.gainOff ? '⚠' : '✓'}</strong>{' '}
                  Roadbook {formatMeters(gain ?? 0)}
                  {Math.abs(check.expectedGainM - (gain ?? 0)) >= 1 && <> ({formatMeters(check.expectedGainM)} au D+ de ta trace)</>}
                  {' '}· trace {formatMeters(check.trackGainM)} ici
                  {check.gainOff
                    ? `. Le ravito est sans doute ${check.trackGainM < check.expectedGainM ? 'plus loin' : 'plus tôt'} sur la trace.`
                    : ' : ça colle.'}
                </p>
              )}

              {check.conflict && typeof m.waypointKm === 'number' && (
                <div className="placement-conflict">
                  <p>Le waypoint <strong>« {m.waypointName} »</strong> du GPX est à <strong>{formatKm(m.waypointKm)} km</strong>,
                    le roadbook annonce <strong>{formatKm(m.km)} km</strong> ({formatKm(Math.abs(m.waypointKm - roadbookKm))} km
                    d'écart). Lequel est juste ?</p>
                  <div className="placement-buttons">
                    <button type="button" onClick={() => move(selected, m.waypointKm!)}>Garder le waypoint · {formatKm(m.waypointKm)} km</button>
                    <button type="button" className="ghost" onClick={() => move(selected, roadbookKm)}>Garder le roadbook · {formatKm(roadbookKm)} km</button>
                  </div>
                </div>
              )}

              <div className="placement-fine">
                <button type="button" className="ghost" aria-label="100 m plus tôt"
                  onClick={() => move(selected, Math.max(b.lo, pos.km - STEP_KM))}>− 100 m</button>
                <input type="range" min={Math.round(b.lo * 100)} max={Math.round(b.hi * 100)} value={Math.round(pos.km * 100)}
                  aria-label={`Position de ${m.name} sur la trace`} aria-valuetext={`${formatKm(pos.km)} km`}
                  onChange={(e) => move(selected, Number(e.target.value) / 100)} />
                <button type="button" className="ghost" aria-label="100 m plus loin"
                  onClick={() => move(selected, Math.min(b.hi, pos.km + STEP_KM))}>+ 100 m</button>
              </div>
              <button type="button" className="link-btn" disabled={!pos.manual} onClick={() => reset(selected)}>
                {autoPosition(m).placement === 'WAYPOINT' ? 'Remettre sur le waypoint du GPX' : 'Remettre au km du roadbook'}
              </button>
            </div>
          )}

          <ol className="placement-list">
            {positions.map((p, i) => {
              const end = i === 0 || i === last;
              const mk = course.markers[i];
              const src: Placement = p.manual ? 'MANUAL' : autoPosition(mk).placement;
              return (
                <li key={mk.code}>
                  <button type="button" className={`placement-row${i === selected ? ' is-selected' : ''}`} disabled={end}
                    aria-current={i === selected || undefined} onClick={() => setSelected(i)}>
                    <span className={`placement-num${end ? ' is-end' : checks[i].warn ? ' is-warn' : ''}`}>{end ? '' : i}</span>
                    <span className="placement-row-name">
                      {mk.name}
                      {checks[i].warn && <span className="placement-row-warn"> · à vérifier</span>}
                      {!end && <span className="muted small">{SOURCE_LABELS[src]}</span>}
                    </span>
                    <span className="num">
                      <strong>{formatKm(p.km)} km</strong>
                      <span className="muted small">roadbook {formatKm(mk.km)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
