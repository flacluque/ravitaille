import { Fragment, useState } from 'react';
import { MoonIcon } from './Icons';
import type { Marker, RacePlan, Service } from '../api/types';
import { durationMinutes, formatClock, formatDuration, formatKm, formatPace } from '../lib/format';
import { bindingCutoff } from '../lib/plan';
import { codesNote, ServiceIcons } from './PassageTable';
import { Legend } from './Legend';
import { StatusBadge } from './StatusBadge';

interface Props {
  plan: RacePlan;
  markers: Marker[];
  services: Service[][];
  /** Codes des points où l'assistance attend le coureur. */
  crew: string[];
  onHover: (trackKm: number | null) => void;
  onDetails: () => void;
}

/** Jour de la semaine d'une heure locale ISO, en toutes lettres (« Samedi »). */
function weekday(iso: string): string {
  const day = new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long' });
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * Les heures de passage comme un roadbook : un point par ligne, l'heure en grand, et le tronçon qui y mène
 * entre deux points. Un point se déplie pour l'arrêt et l'allure.
 */
export function Roadbook({ plan, markers, services, crew, onHover, onDetails }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const last = plan.checkpoints.length - 1;
  return (
    <section className="roadbook" aria-label={`Heures de passage, scénario ${plan.scenario.name.toLowerCase()}`}>
      <div className="roadbook-head">
        <h2>Heures de passage</h2>
        <span className="roadbook-tools">
          <button type="button" className="link-btn" onClick={onDetails}>Tableau détaillé</button>
          <Legend />
        </span>
      </div>
      <div className="roadbook-cols" aria-hidden>
        <span>Point</span><span className="num">km</span><span className="num">Arrivée</span><span className="num">Barrière</span>
      </div>
      <ol className="roadbook-list">
        {plan.checkpoints.map((eta, i) => {
          const prev = plan.checkpoints[i - 1];
          const day = weekday(eta.arrival);
          const newDay = !prev || weekday(prev.arrival) !== day;
          const cutoff = bindingCutoff(eta);
          const night = !!eta.legNightDuration && durationMinutes(eta.legNightDuration) >= 15;
          const stop = Math.round(durationMinutes(eta.stop));
          const marker = markers[i];
          const isOpen = open === eta.code;
          const isCrew = crew.includes(eta.code);
          return (
            <Fragment key={eta.code}>
              {prev && (
                <li className="roadbook-leg">
                  <span className="roadbook-leg-line" aria-hidden />
                  <span>
                    <span className="sr-only">Tronçon : </span>
                    {formatKm(eta.legDistanceKm)} km · +{Math.round(eta.legGainM)} m · {formatDuration(eta.legDuration)}
                    <span className="roadbook-pace"> · {formatPace(eta.legPaceMinPerKm)}</span>
                    {night && <strong className="roadbook-night"> · <MoonIcon /> de nuit</strong>}
                  </span>
                </li>
              )}
              {newDay && <li className="roadbook-day" aria-hidden>{day}</li>}
              <li className={`roadbook-point status-row-${eta.status.toLowerCase()}`}>
                <button type="button" className="roadbook-row" aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : eta.code)}
                  onMouseEnter={() => marker && onHover(marker.trackKm)} onMouseLeave={() => onHover(null)}
                  onFocus={() => marker && onHover(marker.trackKm)} onBlur={() => onHover(null)}>
                  <span className="code roadbook-code">{eta.code}</span>
                  <span className="roadbook-name">
                    <span className="roadbook-title">{eta.name}</span>
                    <span className="roadbook-sub">
                      <span className="rb-m">km {formatKm(eta.km)}</span>
                      {isCrew && <strong className="roadbook-crew">Assistance</strong>}
                    </span>
                    {cutoff && <span className="rb-m"><StatusBadge status={eta.status} minutes={cutoff.marginMinutes} /></span>}
                  </span>
                  <span className="num roadbook-km">{formatKm(eta.km)}</span>
                  <span className="num roadbook-time">
                    <span className="sr-only">{i === 0 ? 'Départ' : 'Arrivée'} </span>
                    {formatClock(i === 0 ? eta.departure : eta.arrival).replace(/^\S+ /, '')}
                    {cutoff && (
                      <span className="roadbook-cut rb-m">
                        barrière {formatClock(cutoff.at).replace(/^\S+ /, '')}{cutoff.out ? ' (sortie)' : ''}
                      </span>
                    )}
                  </span>
                  <span className="num roadbook-barrier">
                    {cutoff && <>
                      <span className="roadbook-cut">Barrière {formatClock(cutoff.at)}{cutoff.out ? ' en sortie' : ''}</span>
                      <StatusBadge status={eta.status} minutes={cutoff.marginMinutes} />
                    </>}
                  </span>
                </button>
                {isOpen && (
                  <div className="roadbook-detail">
                    <ServiceIcons services={services[i] ?? []} />
                    <span>
                      {i === 0 ? 'Départ' : i === last ? 'Arrivée' : stop > 0 ? `${stop} min d'arrêt prévu` : 'Pas d\'arrêt prévu'}
                      {' · '}D+ cumulé {Math.round(eta.cumulativeGainM)} m
                      {prev && <> · allure du tronçon {formatPace(eta.legPaceMinPerKm)} · −{Math.round(eta.legLossM)} m</>}
                    </span>
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      <p className="muted small">
        Touche un point pour l'arrêt, le ravito et l'allure.{codesNote(plan) ? ` ${codesNote(plan)}` : ''}
      </p>
    </section>
  );
}
