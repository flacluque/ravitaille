import { useMemo, useState } from 'react';
import type { RacePlan, Service } from '../api/types';
import { formatHm } from '../lib/format';
import {
  computeNutrition,
  DEFAULT_PROFILE,
  describeItems,
  liters,
  type NutritionPlan,
  type NutritionProfile,
  type PointActions,
  type Product,
  type ProductKind,
} from '../lib/nutrition';

const STORAGE_KEY = 'trail-planner:nutrition';

export function loadProfile(): NutritionProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<NutritionProfile>) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function saveProfile(profile: NutritionProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // stockage indisponible : le profil vaut pour la session
  }
}

interface Props {
  plan: RacePlan;
  /** Services de chaque point, dans l'ordre du plan. */
  services: Service[][];
}

/** Plan de nutrition et d'hydratation du scénario affiché. */
export function NutritionCard({ plan, services }: Props) {
  const [profile, setProfile] = useState<NutritionProfile>(loadProfile);
  const nutrition = useMemo(() => computeNutrition(plan, services, profile), [plan, services, profile]);
  const change = (next: NutritionProfile) => {
    setProfile(next);
    saveProfile(next);
  };
  const names = plan.checkpoints.map((c) => c.name);

  return (
    <div className="card nutrition">
      <div className="card-head">
        <h2>Nutrition et hydratation · scénario {plan.scenario.name.toLowerCase()}</h2>
        <p className="muted small">
          {profile.carbsPerHour} g de glucides par heure, {profile.waterDayMlPerHour} ml d'eau par heure
          ({profile.waterNightMlPerHour} la nuit). Le solide des ravitos est un bonus : il n'est pas compté.
        </p>
      </div>

      <ProfileEditor profile={profile} onChange={change} />

      <div className="nutrition-start">
        <strong>Au départ</strong>
        <span>{actionsText(nutrition.points[0], nutrition, profile, true) || 'rien à préparer'}</span>
      </div>

      {nutrition.alerts.length > 0 && (
        <ul className="warnings">{nutrition.alerts.map((a) => <li key={a}>{a}</li>)}</ul>
      )}

      <div className="table-scroll">
        <table className="nutrition-table">
          <thead>
            <tr>
              <th>Tronçon</th>
              <th className="num">Durée</th>
              <th className="num">Glucides</th>
              <th className="num">Eau</th>
              <th>À consommer</th>
              <th>Au point d'arrivée</th>
            </tr>
          </thead>
          <tbody>
            {nutrition.legs.map((leg) => {
              const i = leg.index;
              const isFinish = i === plan.checkpoints.length - 1;
              const consume = [
                describeItems(leg.items, profile.products),
                leg.drinkMl >= 50 && nutrition.drink ? `${Math.round(leg.drinkMl / 50) * 50} ml ${nutrition.drink.name}` : '',
              ].filter(Boolean).join(' + ');
              return (
                <tr key={i}>
                  <td className="leg-name">
                    <small className="muted">{names[i - 1]} →</small>
                    <span>{names[i]}</span>
                  </td>
                  <td className="num" data-label="Durée">
                    {formatHm(leg.minutes)}
                    {leg.nightMinutes >= 15 && <small className="muted" title="dont de nuit"> 🌙 {formatHm(leg.nightMinutes)}</small>}
                  </td>
                  <td className="num" data-label="Glucides">{Math.round(leg.carbsG)} g</td>
                  <td className="num" data-label="Eau">{(Math.round(leg.waterMl / 50) * 50).toLocaleString('fr-FR')} ml</td>
                  <td data-label="À consommer">{consume || <span className="muted">-</span>}</td>
                  <td data-label="Au point d'arrivée">{isFinish ? <span className="muted">arrivée</span> : actionsText(nutrition.points[i], nutrition, profile, false) || <span className="muted">-</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="nutrition-total">
        <strong>Sur la course :</strong> {Math.round(nutrition.totals.carbsG)} g de glucides, {liters(nutrition.totals.waterMl)} d'eau
        {' '}→ {[
          describeItems(nutrition.totals.items, profile.products),
          nutrition.drink && nutrition.totals.drinkDoses > 0 ? `${nutrition.totals.drinkDoses} doses de ${nutrition.drink.name}` : '',
        ].filter(Boolean).join(', ') || 'aucun produit'}.
      </p>
    </div>
  );
}

/** "Remplir 3 flasques (dont 1 de Meltonic) · Prendre : 4 Gel, 2 Compote, 1 dose de Meltonic". */
function actionsText(p: PointActions, n: NutritionPlan, profile: NutritionProfile, start: boolean): string {
  const parts: string[] = [];
  if (p.fillFlasks > 0) {
    const flasks = `${p.fillFlasks} flasque${p.fillFlasks > 1 ? 's' : ''}`;
    const drink = p.fillDrinkFlasks > 0 && n.drink ? ` (dont ${p.fillDrinkFlasks} de ${n.drink.name})` : '';
    parts.push(`${start ? 'Flasques pleines' : 'Remplir'} : ${flasks}${drink}`);
  }
  const take = [
    describeItems(p.restock, profile.products),
    p.restockDrinkDoses > 0 && n.drink ? `${p.restockDrinkDoses} dose${p.restockDrinkDoses > 1 ? 's' : ''} de ${n.drink.name}` : '',
  ].filter(Boolean).join(', ');
  if (take) parts.push(`${start ? 'Emporter' : 'Récupérer'} : ${take}`);
  return parts.join(' · ');
}

const KINDS: { value: ProductKind; label: string }[] = [
  { value: 'GEL', label: 'Gel' },
  { value: 'COMPOTE', label: 'Compote' },
  { value: 'BAR', label: 'Barre' },
  { value: 'DRINK', label: 'Boisson (par flasque)' },
  { value: 'OTHER', label: 'Autre solide' },
];

function ProfileEditor({ profile, onChange }: { profile: NutritionProfile; onChange: (p: NutritionProfile) => void }) {
  const set = (patch: Partial<NutritionProfile>) => onChange({ ...profile, ...patch });
  const setProduct = (id: string, patch: Partial<Product>) =>
    set({ products: profile.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);

  return (
    <details className="nutrition-profile">
      <summary>Mon profil nutrition</summary>
      <div className="profile-grid">
        <label><span>Glucides (g/h)</span>
          <input inputMode="numeric" value={profile.carbsPerHour} onChange={(e) => set({ carbsPerHour: num(e.target.value) })} /></label>
        <label><span>Eau le jour (ml/h)</span>
          <input inputMode="numeric" value={profile.waterDayMlPerHour} onChange={(e) => set({ waterDayMlPerHour: num(e.target.value) })} /></label>
        <label><span>Eau la nuit (ml/h)</span>
          <input inputMode="numeric" value={profile.waterNightMlPerHour} onChange={(e) => set({ waterNightMlPerHour: num(e.target.value) })} /></label>
        <label><span>Flasques</span>
          <input inputMode="numeric" value={profile.flasks} onChange={(e) => set({ flasks: Math.max(1, Math.round(num(e.target.value))) })} /></label>
        <label><span>Contenance (ml)</span>
          <input inputMode="numeric" value={profile.flaskMl} onChange={(e) => set({ flaskMl: Math.max(100, num(e.target.value)) })} /></label>
        <label><span>Dont de boisson énergétique</span>
          <input inputMode="numeric" value={profile.drinkFlasks} onChange={(e) => set({ drinkFlasks: Math.min(profile.flasks, Math.round(num(e.target.value))) })} /></label>
      </div>
      <label className="check">
        <input type="checkbox" checked={profile.hasCrew} onChange={(e) => set({ hasCrew: e.target.checked })} />
        J'ai une assistance qui peut me réapprovisionner (aux points 🤝)
      </label>

      <div className="products">
        <div className="product-row product-head"><span>Produit</span><span>Type</span><span>Glucides (g)</span><span>Part</span><span /></div>
        {profile.products.map((p) => (
          <div className="product-row" key={p.id}>
            <input value={p.name} onChange={(e) => setProduct(p.id, { name: e.target.value })} aria-label="Nom du produit" />
            <select value={p.kind} onChange={(e) => setProduct(p.id, { kind: e.target.value as ProductKind })} aria-label="Type">
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input inputMode="numeric" value={p.carbsG} onChange={(e) => setProduct(p.id, { carbsG: num(e.target.value) })} aria-label="Glucides" />
            {p.kind === 'DRINK'
              ? <span className="muted small">par flasque</span>
              : <input inputMode="numeric" value={p.share} onChange={(e) => setProduct(p.id, { share: num(e.target.value) })} aria-label="Part" title="Part relative : 2 gels pour 1 compote = 2 et 1" />}
            <button type="button" className="ghost icon-btn" aria-label={`Supprimer ${p.name}`}
              onClick={() => set({ products: profile.products.filter((q) => q.id !== p.id) })}>✕</button>
          </div>
        ))}
        <div className="product-actions">
          <button type="button" className="ghost small-btn"
            onClick={() => set({ products: [...profile.products, { id: `p-${Date.now()}`, name: 'Nouveau produit', kind: 'BAR', carbsG: 30, share: 1 }] })}>
            + Ajouter un produit
          </button>
          <button type="button" className="ghost small-btn" onClick={() => onChange(DEFAULT_PROFILE)}>Valeurs par défaut</button>
        </div>
      </div>
      <p className="muted small">
        Repères courants en ultra (pas des conseils médicaux) : la tolérance aux glucides s'entraîne, et les besoins en eau
        varient beaucoup avec la chaleur.
      </p>
    </details>
  );
}
