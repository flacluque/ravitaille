import { useEffect, useMemo, useState } from 'react';
import { crewOffset, latestPass, meeting, nextMeeting, type CrewShare } from '../lib/crew';
import { formatClockFromMinutes, localMinutes } from '../lib/format';
import { formatDelay, nowMinutes } from '../lib/race';
import { driveTime, mapsLink, type DriveTime } from '../lib/route';
import { statusText } from './StatusBadge';
import { StatusShape } from './StatusShape';

interface Pass { index: number; at: number }
interface Saved { pass: Pass | null; margin: number; checked: Record<string, boolean> }

const MARGINS = [0, 10, 15, 20, 30, 45, 60];

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
  const [from, setFrom] = useState(() => pass?.index ?? 0);
  const [to, setTo] = useState(() => nextIndex ?? share.points.length - 1);
  const who = share.runner ?? 'ton coureur';

  return (
    <div className="crew">
      <header className="crew-head">
        <span className="crew-brand">Trail Planner · Assistance</span>
        <h1>Suivre {share.runner ?? 'la course'}</h1>
        <p>{share.race} · départ {clock(0)}</p>
      </header>

      <main className="crew-main">
        <section className="cv-card" aria-label="Dernier passage">
          <span className="crew-label">Dernier passage connu</span>
          <strong className="crew-pass">
            {pass ? `${share.points[pass.index].name} à ${clock(pass.at)}` : now < 0 ? `Départ dans ${formatDelay(-now)}` : "Aucun pour l'instant : heures du plan"}
          </strong>
          {pass && (
            <span className={offset > 1 ? 'crew-offset late' : 'crew-offset'}>
              {Math.abs(offset) < 2 ? "Pile à l'heure du plan" : `${formatDelay(offset)} ${offset < 0 ? "d'avance" : 'de retard'} sur le plan`}
              {share.fix && pass === share.fix && ' (envoyé par le coureur)'}
            </span>
          )}
          <button type="button" className="crew-primary" onClick={() => setSheet(true)}>Saisir un passage</button>
          <p className="crew-note">Recopie l'heure vue sur le suivi en direct de l'organisation : les rendez-vous se recalent.</p>
        </section>

        {nextIndex !== null && <NextMeeting share={share} index={nextIndex} pass={pass} now={now} saved={saved} save={save}
          clock={clock} onRoute={() => { setFrom(pass?.index ?? 0); setTo(nextIndex); document.getElementById('crew-route')?.scrollIntoView({ behavior: 'smooth' }); }} />}

        {share.crew.length > 1 && (
          <section aria-label="Tous les rendez-vous" className="crew-list">
            <h2>Tous les rendez-vous</h2>
            {share.crew.map((i) => {
              const m = meeting(share, i, pass, saved.margin);
              return (
                <div key={i} className={m.passed ? 'crew-meet passed' : 'crew-meet'}>
                  <div>
                    <strong>{share.points[i].name}</strong>
                    <span className="crew-note">km {share.points[i].km} · {m.passed ? 'passé' : i === nextIndex ? 'prochain' : 'ensuite'}</span>
                  </div>
                  <div className="crew-meet-time">
                    <strong>{clock(m.likely)}</strong>
                    <span className="crew-note">{clock(m.early)} – {clock(m.late)}</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <RouteCard share={share} from={from} to={to} setFrom={setFrom} setTo={setTo} pass={pass} margin={saved.margin} clock={clock} />

        <section className="cv-card" aria-label="Réglage">
          <label className="crew-field">Être sur place avant son arrivée la plus tôt
            <select value={saved.margin} onChange={(e) => save({ ...saved, margin: Number(e.target.value) })}>
              {MARGINS.map((m) => <option key={m} value={m}>{m === 0 ? 'pile à l\'heure' : `${m} min avant`}</option>)}
            </select>
          </label>
        </section>

        <p className="crew-note">
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
    <section aria-label="Prochain rendez-vous" className="crew-next-wrap">
      <h2>{m.passed ? 'Dernier rendez-vous' : 'Prochain rendez-vous'}</h2>
      <div className="crew-next">
        <div className="crew-next-head">
          <span className="code">{p.code}</span>
          <strong>{p.name}</strong>
        </div>
        <div className="crew-next-body">
          <span className="crew-label">{m.passed ? 'Passé à' : 'Sois là avant'}</span>
          <strong className="crew-big">{clock(m.passed ? m.likely : m.beThere)}</strong>
          {!m.passed && (
            <span className="crew-countdown">
              {m.beThere > now ? `dans ${formatDelay(m.beThere - now)}` : "Il peut arriver d'une minute à l'autre"}
            </span>
          )}
          {!m.passed && (
            <span>Il arrive entre <strong>{clock(m.early)}</strong> et <strong>{clock(m.late)}</strong>, le plus probable
              vers <strong>{clock(m.likely)}</strong>.</span>
          )}
          {p.cutoff !== null && m.margin !== null && (
            <span className="crew-cutoff">Barrière {p.cutoffOut ? 'en sortie ' : ''}{clock(p.cutoff)}
              <span className={`badge status-${status.toLowerCase()}`}>
                {status !== 'OK' && <StatusShape status={status} size={11} />}{statusText(status, m.margin)}
              </span>
            </span>
          )}
        </div>
        {p.prepare.length > 0 && (
          <div className="crew-next-prep">
            <h3>À préparer</h3>
            {p.prepare.map((item, k) => {
              const key = `${index}:${k}`;
              const done = !!saved.checked[key];
              return (
                <label key={key} className={done ? 'crew-check done' : 'crew-check'}>
                  <input type="checkbox" checked={done}
                    onChange={() => save({ ...saved, checked: { ...saved.checked, [key]: !done } })} />
                  <span>{item}</span>
                </label>
              );
            })}
          </div>
        )}
        {p.nightAfter && (
          <p className="race-night crew-night">La suite passe de nuit : frontale chargée, piles de rechange et couche chaude prêtes.</p>
        )}
        {p.lat !== null && !m.passed && (
          <div className="crew-next-prep">
            <button type="button" className="crew-secondary" onClick={onRoute}>Combien de route pour y aller ?</button>
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
      <section id="crew-route" className="cv-card" aria-label="Temps de route">
        <h2>Temps de route entre deux points</h2>
        <p className="crew-note">Le coureur n'a pas ajouté la trace GPX de la course : les points n'ont pas de position, le temps
          de route ne peut pas être calculé.</p>
      </section>
    );
  }
  const arrival = meeting(share, to, pass, margin);
  const leaveBy = result ? arrival.early - margin - result.minutes : null;
  return (
    <section id="crew-route" className="cv-card" aria-label="Temps de route">
      <h2>Temps de route entre deux points</h2>
      <label className="crew-field">De
        <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
          {located.map(({ p, i }) => <option key={i} value={i}>{p.code} · {p.name}</option>)}
        </select>
      </label>
      <label className="crew-field">À
        <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
          {located.map(({ p, i }) => <option key={i} value={i}>{p.code} · {p.name}</option>)}
        </select>
      </label>
      {from === to ? <p className="crew-note">Choisis deux points différents.</p> : (
        <>
          <div className="crew-route-result" aria-live="polite">
            <strong>{loading || !result ? '…' : formatDelay(result.minutes)}</strong>
            <span>{result && !loading ? `de route · ${result.km} km` : 'calcul de l\'itinéraire'}</span>
          </div>
          {result && leaveBy !== null && !arrival.passed && (
            <p>Il peut arriver à {b.name} dès {clock(arrival.early)} : pars de {a.name} avant <strong>{clock(leaveBy)}</strong>
              {margin > 0 ? ` pour y être ${margin} min avant.` : '.'}</p>
          )}
          <a className="crew-primary crew-link" href={mapsLink({ lat: a.lat!, lon: a.lon! }, { lat: b.lat!, lon: b.lon! })}
            target="_blank" rel="noreferrer">Ouvrir l'itinéraire dans Maps</a>
          <p className="crew-note">
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
        <label className="crew-field">Point
          <select value={index} onChange={(e) => {
            const i = Number(e.target.value);
            setIndex(i);
            setTime(toInput(start + share.points[i].arrivals[share.likely]));
          }}>
            {share.points.map((p, i) => i > 0 && <option key={i} value={i}>{p.code} · {p.name} (prévu {clock(p.arrivals[share.likely])})</option>)}
          </select>
        </label>
        <label className="crew-field">Heure de passage
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <p className="crew-note">
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
