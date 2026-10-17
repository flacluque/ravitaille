import { useEffect, useMemo, useState } from 'react';
import { crewOffset, latestPass, meeting, nextMeeting, type CrewShare } from '../lib/crew';
import { formatClockFromMinutes, localMinutes } from '../lib/format';
import { formatDelay, nowMinutes } from '../lib/race';
import { driveTime, mapsLink, type DriveTime } from '../lib/route';
import { statusText } from './StatusBadge';
import { StatusShape } from './StatusShape';

interface Pass { index: number; at: number }
interface Saved { pass: Pass | null; margin: number; checked: Record<string, boolean> }

/** Avance à prendre sur l'arrivée la plus tôt : court, confortable, large. */
const MARGINS = [15, 30, 60];

function storageKey(share: CrewShare) {
  return `trail-planner:assistance-suivi:${share.race}:${share.start}`;
}

function load(share: CrewShare): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(share)) ?? 'null') as Partial<Saved> | null;
    return { pass: raw?.pass ?? null, margin: typeof raw?.margin === 'number' ? raw.margin : 15, checked: raw?.checked ?? {} };
  } catch {
    return { pass: null, margin: 15, checked: {} };
  }
}

/**
 * La page de l'assistance, ouverte depuis le lien du coureur : où et quand le retrouver, quoi lui
 * préparer, combien de route entre deux points. Tout vient du lien ; ce que l'assistance saisit
 * (passages, cases cochées, marge) reste sur son téléphone.
 */
export function CrewView({ share }: { share: CrewShare }) {
  const start = localMinutes(share.start);
  const [saved, setSaved] = useState<Saved>(() => load(share));
  const save = (next: Saved) => {
    setSaved(next);
    try {
      localStorage.setItem(storageKey(share), JSON.stringify(next));
    } catch {
      // stockage indisponible : vaut pour la session
    }
  };
  const [now, setNow] = useState(() => nowMinutes() - start);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMinutes() - start), 30_000);
    return () => window.clearInterval(timer);
  }, [start]);

  const clock = (rel: number) => formatClockFromMinutes(start + rel);
  const pass = latestPass(share, saved.pass);
  const offset = crewOffset(share, pass);
  const nextIndex = nextMeeting(share, pass, now);
  const [sheet, setSheet] = useState(false);
  // Temps de route : par défaut depuis le rendez-vous précédent (là où est l'assistance), sinon le dernier passage.
  const previousMeeting = (next: number | null) => [...share.crew].reverse().find((i) => next !== null && i < next);
  const [from, setFrom] = useState(() => previousMeeting(nextIndex) ?? pass?.index ?? 0);
  const [to, setTo] = useState(() => nextIndex ?? share.points.length - 1);
  const who = share.runner ?? 'ton coureur';

  return (
    <div className="cv">
      <header className="cv-head">
        <span className="cv-brand">Trail Planner · Assistance</span>
        <h1>Suivre {share.runner ?? 'la course'}</h1>
        <p>{share.race} · départ {clock(0)}</p>
      </header>

      <main className="cv-main">
        {nextIndex !== null && <NextMeeting share={share} index={nextIndex} pass={pass} now={now} saved={saved} save={save}
          clock={clock} onRoute={() => { setFrom(previousMeeting(nextIndex) ?? pass?.index ?? 0); setTo(nextIndex); document.getElementById('cv-route')?.scrollIntoView({ behavior: 'smooth' }); }} />}

        <section className="cv-card" aria-label="Dernier passage">
          <span className="cv-label">Dernier passage connu</span>
          <strong className="cv-pass">
            {pass ? `${share.points[pass.index].name} à ${clock(pass.at)}` : now < 0 ? `Départ dans ${formatDelay(-now)}` : "Aucun pour l'instant : heures du plan"}
          </strong>
          {pass && (
            <span className={offset > 1 ? 'cv-offset late' : 'cv-offset'}>
              {Math.abs(offset) < 2 ? "Pile à l'heure du plan" : `${formatDelay(offset)} ${offset < 0 ? "d'avance" : 'de retard'} sur le plan`}
              {share.fix && pass === share.fix && ' (envoyé par le coureur)'}
            </span>
          )}
          <button type="button" className="cv-primary" onClick={() => setSheet(true)}>Saisir un passage</button>
          <p className="cv-note">Recopie l'heure vue sur le suivi en direct de l'organisation : les rendez-vous se recalent.</p>
        </section>

        {share.crew.length > 1 && (
          <section aria-label="Tous les rendez-vous" className="cv-list">
            <h2>Tous les rendez-vous</h2>
            {share.crew.map((i) => {
              const m = meeting(share, i, pass, saved.margin);
              return (
                <div key={i} className={m.passed ? 'cv-meet passed' : 'cv-meet'}>
                  <div>
                    <strong>{share.points[i].name}</strong>
                    <span className="cv-note">km {share.points[i].km} · {m.passed ? 'passé' : i === nextIndex ? 'prochain' : 'ensuite'}</span>
                  </div>
                  <div className="cv-meet-time">
                    <strong>{clock(m.likely)}</strong>
                    <span className="cv-note">{clock(m.early)} – {clock(m.late)}</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <RouteCard share={share} from={from} to={to} setFrom={setFrom} setTo={setTo} pass={pass} margin={saved.margin} clock={clock} />

        <section className="cv-card" aria-label="Réglage">
          <span className="cv-field" id="cv-margin">Être sur place avant son arrivée la plus tôt</span>
          <div className="segmented" role="group" aria-labelledby="cv-margin">
            {MARGINS.map((m) => (
              <button key={m} type="button" aria-pressed={saved.margin === m} className={saved.margin === m ? 'active' : ''}
                onClick={() => save({ ...saved, margin: m })}>{m === 60 ? '1 h avant' : `${m} min avant`}</button>
            ))}
          </div>
        </section>

        <p className="cv-note">
          Plan envoyé par {who} le {new Date(share.sentAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.
          Tout est dans le lien : rien n'est stocké sur un serveur, et la page marche sans réseau une fois ouverte.
          S'il t'envoie un lien plus récent, ouvre-le.
        </p>
      </main>

      {sheet && <PassSheet share={share} pass={pass} clock={clock} start={start}
        onCancel={() => setSheet(false)}
        onSave={(p) => { save({ ...saved, pass: p }); setSheet(false); }} />}
    </div>
  );
}

function NextMeeting({ share, index, pass, now, saved, save, clock, onRoute }: {
  share: CrewShare; index: number; pass: Pass | null; now: number; saved: Saved; save: (s: Saved) => void;
  clock: (rel: number) => string; onRoute: () => void;
}) {
  const p = share.points[index];
  const m = meeting(share, index, pass, saved.margin);
  const status = m.margin === null ? 'NONE' : m.margin < 0 ? 'MISSED' : m.margin < 60 ? 'TIGHT' : 'OK';
  return (
    <section aria-label="Prochain rendez-vous" className="cv-next-wrap">
      <h2>{m.passed ? 'Dernier rendez-vous' : 'Prochain rendez-vous'}</h2>
      <div className="cv-next">
        <div className="cv-next-head">
          <span className="code">{p.code}</span>
          <strong>{p.name}</strong>
        </div>
        <div className="cv-next-body">
          <span className="cv-label">{m.passed ? 'Passé à' : 'Sois là avant'}</span>
          <strong className="cv-big">{clock(m.passed ? m.likely : m.beThere)}</strong>
          {!m.passed && (
            <span className="cv-countdown">
              {m.beThere > now ? `dans ${formatDelay(m.beThere - now)}` : "Il peut arriver d'une minute à l'autre"}
            </span>
          )}
          {!m.passed && (
            <span>Il arrive entre <strong>{clock(m.early)}</strong> et <strong>{clock(m.late)}</strong>, le plus probable
              vers <strong>{clock(m.likely)}</strong>.</span>
          )}
          {p.cutoff !== null && m.margin !== null && (
            <span className="cv-cutoff">Barrière {p.cutoffOut ? 'en sortie ' : ''}{clock(p.cutoff)}
              <span className={`badge status-${status.toLowerCase()}`}>
                {status !== 'OK' && <StatusShape status={status} size={11} />}{statusText(status, m.margin)}
              </span>
            </span>
          )}
        </div>
        {p.prepare.length > 0 && (
          <div className="cv-next-prep">
            <h3>À préparer</h3>
            {p.prepare.map((item, k) => {
              const key = `${index}:${k}`;
              const done = !!saved.checked[key];
              return (
                <label key={key} className={done ? 'cv-check done' : 'cv-check'}>
                  <input type="checkbox" checked={done}
                    onChange={() => save({ ...saved, checked: { ...saved.checked, [key]: !done } })} />
                  <span>{item}</span>
                </label>
              );
            })}
          </div>
        )}
        {p.nightAfter && (
          <p className="race-night cv-night">La suite passe de nuit : frontale chargée, piles de rechange et couche chaude prêtes.</p>
        )}
        {p.lat !== null && !m.passed && (
          <div className="cv-next-prep">
            <button type="button" className="cv-secondary" onClick={onRoute}>Combien de route pour y aller ?</button>
          </div>
        )}
      </div>
    </section>
  );
}

function RouteCard({ share, from, to, setFrom, setTo, pass, margin, clock }: {
  share: CrewShare; from: number; to: number; setFrom: (i: number) => void; setTo: (i: number) => void;
  pass: Pass | null; margin: number; clock: (rel: number) => string;
}) {
  const located = useMemo(() => share.points.map((p, i) => ({ p, i })).filter(({ p }) => p.lat !== null && p.lon !== null), [share]);
  const [result, setResult] = useState<DriveTime | null>(null);
  const [loading, setLoading] = useState(false);
  const a = share.points[from];
  const b = share.points[to];
  useEffect(() => {
    if (from === to || a.lat === null || b.lat === null) { setResult(null); return; }
    let cancelled = false;
    setLoading(true);
    void driveTime({ lat: a.lat, lon: a.lon! }, { lat: b.lat, lon: b.lon! }).then((r) => {
      if (!cancelled) { setResult(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [from, to, a, b]);

  if (located.length < 2) {
    return (
      <section id="cv-route" className="cv-card" aria-label="Temps de route">
        <h2>Temps de route entre deux points</h2>
        <p className="cv-note">Le coureur n'a pas ajouté la trace GPX de la course : les points n'ont pas de position, le temps
          de route ne peut pas être calculé.</p>
      </section>
    );
  }
  const arrival = meeting(share, to, pass, margin);
  const leaveBy = result ? arrival.early - margin - result.minutes : null;
  return (
    <section id="cv-route" className="cv-card" aria-label="Temps de route">
      <h2>Temps de route entre deux points</h2>
      <label className="cv-field">De
        <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
          {located.map(({ p, i }) => <option key={i} value={i}>{p.code} · {p.name}</option>)}
        </select>
      </label>
      <label className="cv-field">À
        <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
          {located.map(({ p, i }) => <option key={i} value={i}>{p.code} · {p.name}</option>)}
        </select>
      </label>
      {from === to ? <p className="cv-note">Choisis deux points différents.</p> : (
        <>
          <div className="cv-route-result" aria-live="polite">
            <strong>{loading || !result ? '…' : formatDelay(result.minutes)}</strong>
            <span>{result && !loading ? `de route · ${result.km} km` : 'calcul de l\'itinéraire'}</span>
          </div>
          {result && leaveBy !== null && !arrival.passed && (
            <p>Il peut arriver à {b.name} dès {clock(arrival.early)} : pars de {a.name} avant <strong>{clock(leaveBy)}</strong>
              {margin > 0 ? ` pour y être ${margin} min avant.` : '.'}</p>
          )}
          <a className="cv-primary cv-link" href={mapsLink({ lat: a.lat!, lon: a.lon! }, { lat: b.lat!, lon: b.lon! })}
            target="_blank" rel="noreferrer">Ouvrir l'itinéraire dans Maps</a>
          <p className="cv-note">
            {result?.source === 'estimate'
              ? 'Pas de réseau : estimation approximative (à vol d\'oiseau). '
              : 'Itinéraire OpenStreetMap (OSRM), sans le trafic, 5 min comptées pour se garer. '}
            Les accès réservés à l'assistance et les parkings sont dans le guide de l'organisation.
          </p>
        </>
      )}
    </section>
  );
}

function PassSheet({ share, pass, clock, start, onCancel, onSave }: {
  share: CrewShare; pass: Pass | null; clock: (rel: number) => string; start: number;
  onCancel: () => void; onSave: (p: Pass) => void;
}) {
  const [index, setIndex] = useState(() => Math.min(share.points.length - 1, (pass?.index ?? 0) + 1));
  const planned = share.points[index].arrivals[share.likely];
  const [time, setTime] = useState(() => toInput(start + planned));
  // L'heure saisie est rapportée au jour le plus proche de l'heure prévue (passage après minuit).
  const at = useMemo(() => {
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const wall = h * 60 + m;
    const expected = start + planned;
    const day = Math.round((expected - wall) / 1440);
    return wall + day * 1440 - start;
  }, [time, start, planned]);
  const delta = at === null ? 0 : at - planned;
  return (
    <div className="cv-sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="cv-sheet" role="dialog" aria-label="Saisir un passage">
        <h2>Saisir un passage</h2>
        <label className="cv-field">Point
          <select value={index} onChange={(e) => {
            const i = Number(e.target.value);
            setIndex(i);
            setTime(toInput(start + share.points[i].arrivals[share.likely]));
          }}>
            {share.points.map((p, i) => i > 0 && <option key={i} value={i}>{p.code} · {p.name} (prévu {clock(p.arrivals[share.likely])})</option>)}
          </select>
        </label>
        <label className="cv-field">Heure de passage
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <p className="cv-note">
          {at === null ? '' : Math.abs(delta) < 2 ? "Pile à l'heure du plan." : `${formatDelay(delta)} ${delta < 0 ? "d'avance" : 'de retard'} : les rendez-vous suivants se décalent d'autant.`}
        </p>
        <div className="cv-sheet-actions">
          <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
          <button type="button" disabled={at === null} onClick={() => at !== null && onSave({ index, at })}>Recaler</button>
        </div>
      </div>
    </div>
  );
}

function toInput(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
