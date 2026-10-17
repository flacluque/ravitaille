import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { extractGear, fetchExtractorStatus, humanError } from '../api/client';
import { loadGear, saveGear } from '../api/storage';
import { ConfirmBar } from './ConfirmBar';
import { UndoToast, useUndo } from './UndoToast';
import type { ExtractorStatus, RacePlan } from '../api/types';
import {
  GEAR_STATUS_LABEL,
  gearId,
  mergeExtracted,
  suggestions,
  templateItems,
  waterCheck,
  type GearItem,
  type GearStatus,
} from '../lib/gear';
import type { NutritionProfile } from '../lib/nutrition';

interface Props {
  /** La checklist est propre à chaque course. */
  raceName: string;
  plan: RacePlan | undefined;
  profile: NutritionProfile;
}

const GROUPS: GearStatus[] = ['MANDATORY', 'RECOMMENDED', 'PERSONAL'];

/** Checklist du matériel : lue dans le règlement, partie d'une liste type, ou saisie ; à cocher en faisant le sac. */
export function GearCard({ raceName, plan, profile }: Props) {
  const [items, setItems] = useState<GearItem[]>(() => loadGear(raceName));
  const [newName, setNewName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [extractor, setExtractor] = useState<ExtractorStatus | null>(null);
  const [reading, setReading] = useState(false);
  const [pendingRules, setPendingRules] = useState<File | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [readNotes, setReadNotes] = useState<string[]>([]);

  // Changement de course : on recharge sa propre liste.
  useEffect(() => {
    setItems(loadGear(raceName));
    setReadNotes([]);
    setReadError(null);
  }, [raceName]);
  useEffect(() => {
    fetchExtractorStatus().then(setExtractor).catch(() => setExtractor(null));
  }, []);

  const update = (next: GearItem[]) => {
    setItems(next);
    saveGear(raceName, next);
  };
  const latest = useRef(items);
  latest.current = items;
  const undo = useUndo();
  function remove(item: GearItem) {
    const index = items.findIndex((i) => i.id === item.id);
    update(items.filter((i) => i.id !== item.id));
    undo.offer(`« ${item.name} » retiré du sac.`, () => {
      const next = [...latest.current];
      next.splice(Math.min(index, next.length), 0, item);
      update(next);
    });
  }
  const patch = (id: string, change: Partial<GearItem>) => update(items.map((i) => (i.id === id ? { ...i, ...change } : i)));
  const add = (name: string, status: GearStatus = 'PERSONAL') => {
    if (name.trim()) update([...items, { id: gearId(), name: name.trim(), status, packed: false }]);
  };

  function chooseRules(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (items.some((i) => i.status !== 'PERSONAL')) setPendingRules(file);
    else void readRules(file);
  }

  async function readRules(file: File) {
    setPendingRules(null);
    setReading(true);
    setReadError(null);
    try {
      const gear = await extractGear(file, raceName);
      update(mergeExtracted(items, gear));
      setReadNotes([
        ...(gear.race ? [`Liste lue pour « ${gear.race} ». Vérifie qu'il s'agit bien de ta course.`] : []),
        ...gear.warnings,
      ]);
    } catch (err) {
      setReadError(humanError(err));
    } finally {
      setReading(false);
    }
  }

  const packed = items.filter((i) => i.packed).length;
  const mandatory = items.filter((i) => i.status === 'MANDATORY');
  const mandatoryMissing = mandatory.filter((i) => !i.packed).length;
  const water = waterCheck(items, profile);
  const ideas = suggestions(items, plan);

  return (
    <div className="card gear">
      <div className="card-head gear-head">
        <div>
          <h2>Matériel</h2>
          <p className="muted small">
            {items.length === 0
              ? 'Lis le règlement de ta course, ou pars de la liste type.'
              : `${packed} / ${items.length} prêts`
                + (mandatory.length ? ` · ${mandatoryMissing === 0 ? 'tout l\'obligatoire est prêt ✓' : `${mandatoryMissing} obligatoire${mandatoryMissing > 1 ? 's' : ''} à préparer`}` : '')}
          </p>
        </div>
        <div className="editor-actions">
          {(!extractor || (extractor.enabled && extractor.ready)) && (
            <button type="button" onClick={() => fileInput.current?.click()} disabled={reading}
              title="Une IA lit la liste du matériel dans le règlement (image ou PDF)">
              {reading ? 'Lecture…' : 'Lire le règlement'}
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*,.pdf,application/pdf" hidden onChange={chooseRules} />
          {items.length === 0 && (
            <button type="button" className={extractor && !(extractor.enabled && extractor.ready) ? '' : 'ghost'}
              onClick={() => update(templateItems())}>Liste type</button>
          )}
        </div>
      </div>

      {pendingRules && (
        <ConfirmBar
          message={`Remplacer la liste actuelle (sauf tes éléments perso) par la lecture de ${pendingRules.name} ?`}
          confirmLabel="Lire et remplacer"
          onConfirm={() => void readRules(pendingRules)}
          onCancel={() => setPendingRules(null)}
        />
      )}
      {reading && <p className="scan-progress" role="status"><span className="spinner" aria-hidden /> Lecture du règlement… (de 30 s à 2 min)</p>}
      {readError && <p className="field-error" role="alert">{readError}</p>}
      {readNotes.length > 0 && (
        <div className="scan-check" role="note">
          <strong>À vérifier :</strong>
          <ul>{readNotes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      {water && <p className={water.ok ? 'gear-water ok' : 'gear-water ko'}>{water.ok ? '💧 ' : '⚠ '}{water.message}</p>}
      {ideas.length > 0 && (
        <div className="gear-ideas">
          {ideas.map((idea) => (
            <button key={idea} type="button" className="chip" onClick={() => add(idea.replace(/ \(.*\)$/, ''), 'PERSONAL')}
              title="Ajouter à ta liste">
              + {idea}
            </button>
          ))}
        </div>
      )}

      {GROUPS.map((group) => {
        const list = items.filter((i) => i.status === group);
        if (list.length === 0) return null;
        return (
          <div key={group} className="gear-group">
            <h3>{GEAR_STATUS_LABEL[group]} <span className="muted small">{list.filter((i) => i.packed).length}/{list.length}</span></h3>
            <ul className="gear-list">
              {list.map((item) => (
                <li key={item.id} className={item.packed ? 'packed' : ''}>
                  <label>
                    <input type="checkbox" checked={item.packed} onChange={(e) => patch(item.id, { packed: e.target.checked })} />
                    <span>{item.name}</span>
                  </label>
                  <select value={item.status} onChange={(e) => patch(item.id, { status: e.target.value as GearStatus })} aria-label="Statut">
                    {GROUPS.map((g) => <option key={g} value={g}>{GEAR_STATUS_LABEL[g]}</option>)}
                  </select>
                  <button type="button" className="ghost icon-btn" aria-label={`Supprimer ${item.name}`}
                    onClick={() => remove(item)}>✕</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <form className="gear-add" onSubmit={(e) => { e.preventDefault(); add(newName); setNewName(''); }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ajouter un élément (ex. bâtons, crème anti-frottements)" aria-label="Nouvel élément" />
        <button type="submit" className="ghost" disabled={!newName.trim()}>Ajouter</button>
      </form>
      <UndoToast undo={undo} />
    </div>
  );
}
