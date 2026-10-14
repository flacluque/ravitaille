import { useState } from 'react';
import type { RacePlan, Service } from '../api/types';
import { formatClock, formatDuration, formatKm } from '../lib/format';
import {
  CARB_LEVELS, computeNutrition, describeFill, describeItems, describeRhythm, describeTake, KIND_LABELS, liters,
  MEAL_CARBS_G, type NutritionPlan, type NutritionProfile, type Product, type ProductKind,
} from '../lib/nutrition';

interface Props {
  plan: RacePlan;
  /** Services de chaque point, dans l'ordre du plan. */
  services: Service[][];
  /** Profil partagé avec la checklist du matériel (eau obligatoire comparée aux flasques). */
  profile: NutritionProfile;
  onProfileChange: (profile: NutritionProfile) => void;
  /** Codes des points où l'assistance attend le coureur. */
  crew: string[];
  onCrewChange: (codes: string[]) => void;
}

const hour = (iso: string) => formatClock(iso).replace(/^\S+ /, '');

/** L'onglet Ravitos : le profil en quelques clics, l'assistance, puis la course tronçon par tronçon. */
export function RavitosView({ plan, services, profile, onProfileChange, crew, onCrewChange }: Props) {
  const n = computeNutrition(plan, services, profile, crew);
  const etas = plan.checkpoints;
  const last = etas.length - 1;
  const firstCrew = n.points.find((p) => p.index > 0 && (p.crew || p.dropBag));
  const startCount = Object.values(n.points[0].take).reduce((s, v) => s + v, 0) + n.points[0].takeDrinkDoses;
  const raceHours = n.legs.reduce((s, l) => s + l.minutes, 0) / 60;

  return (
    <div className="ravitos">
      <ProfileCard profile={profile} onChange={onProfileChange} />
      <CrewCard plan={plan} services={services} crew={crew} onChange={onCrewChange} />

      <section className="ravitos-totals" aria-label="Sur toute la course">
        <div className="stat">
          <span className="stat-label">Glucides</span>
          <span className="stat-value">{Math.round(n.totals.carbsG)} <small>g</small></span>
          <span className="muted small">{raceHours > 0 ? `${Math.round(n.totals.carbsG / raceHours)} g/h en moyenne` : ''}
            {n.totals.aidCarbsG > 0 && ` · dont ${Math.round(n.totals.aidCarbsG)} g aux ravitos`}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Eau</span>
          <span className="stat-value">{liters(n.totals.waterMl)}</span>
          <span className="muted small">{profile.waterDayMlPerHour} ml/h, {profile.waterNightMlPerHour} la nuit</span>
        </div>
        <div className="stat">
          <span className="stat-label">À emporter au départ</span>
          <span className="stat-value">{startCount} <small>produit{startCount > 1 ? 's' : ''}</small></span>
          <span className="muted small">{firstCrew ? `jusqu'à ${firstCrew.crew ? 'ton assistance' : 'ton sac'} à ${etas[firstCrew.index].name}` : 'pour toute la course'}</span>
        </div>
      </section>

      {n.alerts.length > 0 && <ul className="warnings">{n.alerts.map((a) => <li key={a}>{a}</li>)}</ul>}

      <section className="ravitos-timeline" aria-label="La course, tronçon par tronçon">
        <div className="ravitos-start">
          <strong>Au départ · {formatClock(plan.start)}</strong>
          <span>{describeFill(n.points[0].fillFlasks, n.points[0].fillDrinkFlasks, n, 'Partir avec')}, et bien boire avant le départ</span>
          <span>Emporter {describeTake(n.points[0], n, profile) || 'rien'}
            {firstCrew && <>, jusqu'à {firstCrew.crew ? 'ton assistance' : 'ton sac'} à {etas[firstCrew.index].name}</>}</span>
        </div>

        {n.legs.map((leg) => {
          const from = etas[leg.index - 1];
          const to = etas[leg.index];
          const point = n.points[leg.index];
          const isLast = leg.index === last;
          const noWater = !isLast && point.fillFlasks === 0;
          return (
            <div key={to.code} className="ravitos-step">
              <article className="ravitos-leg">
                <div className="ravitos-leg-head">
                  <span className="muted small">
                    {hour(from.departure)} → {hour(to.arrival)} · {from.name} → {to.name} · {formatDuration(to.legDuration)}
                    {' '}· {formatKm(to.legDistanceKm)} km, +{Math.round(to.legGainM)} m
                  </span>
                  <span className="ravitos-tags">
                    {leg.nightMinutes >= 15 && <span className="tag-night">nuit {formatDuration(`PT${Math.round(leg.nightMinutes)}M`)}</span>}
                    {noWater && <span className="tag-dry">pas d'eau au prochain point</span>}
                  </span>
                </div>
                <p className="ravitos-rhythm">{describeRhythm(leg, n, plan)}</p>
                {leg.sequence.length > 1 && (
                  <ol className="ravitos-seq" aria-label="Ordre de prise">
                    {leg.sequence.map((id, k) => {
                      const p = n.foods.find((f) => f.id === id);
                      return <li key={k} className={p?.kind === 'GEL' ? 'gel' : 'solid'}>{k + 1}. {p?.name}</li>;
                    })}
                  </ol>
                )}
                <p className="ravitos-meta small">
                  <span><strong>Boire</strong> {leg.refilled ? describeFill(leg.flasks, leg.drinkFlasks, n, '').trim() : 'la fin de tes flasques'}</span>
                  <span><strong>Glucides</strong> {Math.round(leg.aidCarbsG + leg.drinkCarbsG + leg.itemsCarbsG)} g
                    {leg.aidCarbsG > 0 && ` dont ${leg.aidCarbsG} au ravito`}</span>
                </p>
              </article>
              <ArrivalBox plan={plan} n={n} profile={profile} index={leg.index} />
            </div>
          );
        })}
      </section>

      <CrewSheet plan={plan} n={n} profile={profile} />

      <section className="card">
        <h2>Liste de courses</h2>
        <p className="ravitos-todo">{describeItems(n.totals.items, profile.products) || 'Aucun produit'}
          {n.drink && n.totals.drinkDoses > 0 && `, ${n.totals.drinkDoses} doses de ${n.drink.name}`}</p>
      </section>

      <p className="muted small">
        Un quart de glucides en moins la première heure (l'estomac se met en route) et 10 % de moins la nuit (digestion plus
        lente). Le sodium vient de ta boisson énergétique. Repères courants en ultra, à ajuster : pas un conseil médical.
      </p>
    </div>
  );
}

function ArrivalBox({ plan, n, profile, index }: { plan: RacePlan; n: NutritionPlan; profile: NutritionProfile; index: number }) {
  const eta = plan.checkpoints[index];
  const point = n.points[index];
  const isLast = index === plan.checkpoints.length - 1;
  const take = describeTake(point, n, profile);
  const todo: { label: string; kind: 'plain' | 'crew' }[] = [];
  if (!isLast) {
    if (point.fillFlasks > 0) todo.push({ label: describeFill(point.fillFlasks, point.fillDrinkFlasks, n), kind: 'plain' });
    if (point.eatG > 0) todo.push({ label: point.eatG >= MEAL_CARBS_G ? `Repas chaud (≈ ${point.eatG} g)` : `Manger au ravito (≈ ${point.eatG} g)`, kind: 'plain' });
    if (take) todo.push({ label: `${point.crew ? 'Assistance : récupérer' : 'Sac : prendre'} ${take}`, kind: 'crew' });
    if (point.fillFlasks === 0) todo.push({ label: 'Pas d\'eau ici', kind: 'plain' });
  }
  const stop = Math.round((new Date(eta.departure).getTime() - new Date(eta.arrival).getTime()) / 60000);
  return (
    <div className={`ravitos-arrival${point.crew || point.dropBag ? ' crew' : ''}${isLast ? ' finish' : ''}`}>
      <div className="ravitos-arrival-head">
        <strong>{isLast ? `Arrivée · ${formatClock(eta.arrival)}` : `${eta.name} · ${hour(eta.arrival)}`}</strong>
        <span className="small">{isLast ? 'Bravo !' : point.crew ? 'ton assistance est là' : point.dropBag ? 'sac de délestage'
          : `${stop > 0 ? `arrêt ${stop} min` : 'sans arrêt'} · km ${formatKm(eta.km)}`}</span>
      </div>
      {todo.length > 0 && (
        <ul className="ravitos-chips">{todo.map((t) => <li key={t.label} className={t.kind}>{t.label}</li>)}</ul>
      )}
    </div>
  );
}

function CrewSheet({ plan, n, profile }: { plan: RacePlan; n: NutritionPlan; profile: NutritionProfile }) {
  const stops = n.points.filter((p) => p.crew);
  if (stops.length === 0) return null;
  return (
    <section className="card crew-sheet">
      <div className="card-head">
        <h2>Fiche pour mon assistance</h2>
        <p className="muted small">À lui envoyer ; elle est aussi dans le PDF.</p>
      </div>
      <ul>
        {stops.map((p) => {
          const eta = plan.checkpoints[p.index];
          const next = n.legs[p.index];
          return (
            <li key={eta.code}>
              <span className="crew-sheet-where"><strong>{eta.name}</strong><span className="muted small">vers {formatClock(eta.arrival)} · km {formatKm(eta.km)}</span></span>
              <span>
                Préparer : {describeTake(p, n, profile) || 'rien'}
                {next && next.refilled && p.fillFlasks > 0 && ` · ${describeFill(p.fillFlasks, p.fillDrinkFlasks, n, '').trim()} prêtes`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CrewCard({ plan, services, crew, onChange }: { plan: RacePlan; services: Service[][]; crew: string[]; onChange: (c: string[]) => void }) {
  const etas = plan.checkpoints;
  const candidates = etas.map((eta, i) => ({ eta, i })).filter(({ eta, i }) =>
    i > 0 && i < etas.length - 1 && ((services[i] ?? []).length > 0 || crew.includes(eta.code)));
  const toggle = (code: string) => onChange(crew.includes(code) ? crew.filter((c) => c !== code) : [...crew, code]);
  return (
    <section className="card crew-card">
      <div className="card-head">
        <h2>Mon assistance</h2>
        <p className="muted small">Où elle t'attend avec la suite de tes produits et de ta boisson.</p>
      </div>
      <div className="crew-choices">
        {candidates.map(({ eta, i }) => {
          const on = crew.includes(eta.code);
          const allowed = (services[i] ?? []).includes('ASSISTANCE');
          return (
            <button key={eta.code} type="button" aria-pressed={on} className={on ? 'active' : ''} onClick={() => toggle(eta.code)}>
              {eta.name}
              <span className="small">vers {hour(eta.arrival)} · km {formatKm(eta.km)}{allowed ? ' · assistance autorisée' : ''}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProfileCard({ profile, onChange }: { profile: NutritionProfile; onChange: (p: NutritionProfile) => void }) {
  const [draft, setDraft] = useState<{ name: string; carbs: string; kind: ProductKind }>({ name: '', carbs: '', kind: 'SOLID' });
  const set = (patch: Partial<NutritionProfile>) => onChange({ ...profile, ...patch });
  const setProduct = (id: string, patch: Partial<Product>) =>
    set({ products: profile.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const drink = profile.products.find((p) => p.enabled && p.kind === 'DRINK');
  const carbs = Number(draft.carbs.replace(',', '.'));
  const canAdd = draft.name.trim() !== '' && carbs > 0;
  function add() {
    if (!canAdd) return;
    set({ products: [...profile.products, { id: `p${Date.now().toString(36)}`, name: draft.name.trim(), kind: draft.kind, carbsG: carbs, enabled: true }] });
    setDraft({ name: '', carbs: '', kind: draft.kind });
  }
  const isLevel = CARB_LEVELS.some((l) => l.value === profile.carbsPerHour);

  return (
    <section className="card profile-card">
      <h2>Mon profil</h2>
      <div className="profile-row">
        <div className="profile-field">
          <span className="profile-label">Mon niveau</span>
          <div className="segmented" role="group" aria-label="Glucides par heure">
            {CARB_LEVELS.map((l) => (
              <button key={l.value} type="button" aria-pressed={profile.carbsPerHour === l.value}
                className={profile.carbsPerHour === l.value ? 'active' : ''} onClick={() => set({ carbsPerHour: l.value })}>
                <strong>{l.value}</strong> g/h<span className="small">{l.label}</span>
              </button>
            ))}
          </div>
          <label className="inline-number">
            ou <input type="number" min={20} max={150} step={5} value={profile.carbsPerHour}
              onChange={(e) => set({ carbsPerHour: Math.max(0, Number(e.target.value) || 0) })}
              aria-label="Glucides par heure" className={isLevel ? '' : 'custom'} /> g/h
          </label>
        </div>
        <div className="profile-field">
          <span className="profile-label">Mes flasques</span>
          <div className="segmented" role="group" aria-label="Flasques">
            {[2, 3, 4].map((f) => (
              <button key={f} type="button" aria-pressed={profile.flasks === f} className={profile.flasks === f ? 'active' : ''}
                onClick={() => set({ flasks: f, drinkFlasks: Math.min(profile.drinkFlasks, f) })}>
                {f} × {profile.flaskMl} ml
              </button>
            ))}
          </div>
        </div>
        <div className="profile-field">
          <span className="profile-label">Dont remplies de {drink?.name ?? 'boisson énergétique'}</span>
          <div className="segmented" role="group" aria-label="Flasques de boisson énergétique">
            {Array.from({ length: profile.flasks + 1 }, (_, k) => k).map((k) => (
              <button key={k} type="button" aria-pressed={profile.drinkFlasks === k} className={profile.drinkFlasks === k ? 'active' : ''}
                onClick={() => set({ drinkFlasks: k })} disabled={!drink && k > 0}>
                {k === 0 ? 'aucune' : k}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="check eat-at-aid">
        <input type="checkbox" checked={profile.eatAtAid} onChange={(e) => set({ eatAtAid: e.target.checked })} />
        Je mange aux ravitos <span className="muted small">≈ 30 g, 60 g aux repas chauds</span>
      </label>

      <div className="profile-products">
        <span className="profile-label">Mes produits</span>
        <ul>
          {profile.products.map((p) => (
            <li key={p.id} className={p.enabled ? '' : 'off'}>
              <input type="checkbox" checked={p.enabled} onChange={(e) => setProduct(p.id, { enabled: e.target.checked })}
                aria-label={`Utiliser ${p.name}`} />
              <span className="product-name">{p.name}</span>
              <span className={`kind-tag ${p.kind.toLowerCase()}`}>{KIND_LABELS[p.kind]}</span>
              <span className="muted small">{p.carbsG} g de glucides{p.kind === 'DRINK' ? ' par flasque' : ''}</span>
              <button type="button" className="ghost icon-btn" aria-label={`Retirer ${p.name}`}
                onClick={() => set({ products: profile.products.filter((q) => q.id !== p.id) })}>✕</button>
            </li>
          ))}
        </ul>
        <div className="product-add">
          <label>Nom du produit
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex. : Barre Näak" /></label>
          <label>Glucides (g)
            <input inputMode="decimal" value={draft.carbs} onChange={(e) => setDraft({ ...draft, carbs: e.target.value })} placeholder="25" /></label>
          <label>Type
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ProductKind })}>
              <option value="GEL">Gel</option>
              <option value="SOLID">Solide (barre, compote…)</option>
              <option value="DRINK">Boisson (par flasque)</option>
            </select></label>
          <button type="button" onClick={add} disabled={!canAdd}>Ajouter</button>
        </div>
      </div>

      <details className="profile-fine">
        <summary>Réglages fins</summary>
        <div className="profile-fine-grid">
          <label>Eau de jour (ml/h)
            <input type="number" min={0} step={50} value={profile.waterDayMlPerHour}
              onChange={(e) => set({ waterDayMlPerHour: Math.max(0, Number(e.target.value) || 0) })} /></label>
          <label>Eau de nuit (ml/h)
            <input type="number" min={0} step={50} value={profile.waterNightMlPerHour}
              onChange={(e) => set({ waterNightMlPerHour: Math.max(0, Number(e.target.value) || 0) })} /></label>
          <label>Contenance d'une flasque (ml)
            <input type="number" min={100} step={50} value={profile.flaskMl}
              onChange={(e) => set({ flaskMl: Math.max(100, Number(e.target.value) || 500) })} /></label>
        </div>
      </details>
    </section>
  );
}
