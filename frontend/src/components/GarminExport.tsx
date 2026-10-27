import { useEffect, useMemo, useRef, useState } from 'react';
import type { CourseView, RacePlan, Service } from '../api/types';
import { formatClock } from '../lib/format';
import { buildCiqPlan, encodeCiqPlan } from '../lib/ciq';
import { buildCourseFit, fitCoursePoints, fitFilename, type FitPointKind } from '../lib/fit';
import { buildCourseGpx, gpxFilename, gpxWaypoints } from '../lib/gpx';
import { loadWatchBrand, saveWatchBrand, type WatchBrand } from '../api/storage';

interface Props {
  course: CourseView;
  plans: RacePlan[];
  /** Scénario affiché dans Mon plan : celui du partenaire virtuel par défaut. */
  selected: number;
  services: Service[][];
  onClose: () => void;
}

const HELP = [
  'La montre te dira « en retard » dès que tu perds le rythme d\'un très bon jour.',
  'Ton rythme habituel : le plus parlant pour la plupart des courses.',
  'Plus lent : tu seras souvent « en avance », la montre ne t\'alerte que si ça se gâte vraiment.',
];

const STEPS = {
  phone: [
    'Ouvre le fichier téléchargé (dans tes Téléchargements) avec l\'appli Garmin Connect.',
    'Enregistre le parcours : tu y vois déjà les ravitos, leurs heures prévues et le profil.',
    '« Envoyer vers l\'appareil », puis synchronise ta montre.',
  ],
  connect: [
    'Sur connect.garmin.com (ordinateur) : Entraînement et planification › Parcours › Importer.',
    'Choisis le fichier, puis « Nouveau parcours » et enregistre.',
    '« Envoyer vers l\'appareil », puis synchronise ta montre.',
  ],
  usb: [
    'Branche ta montre à l\'ordinateur avec son câble.',
    'Copie le fichier dans le dossier GARMIN › NewFiles de la montre.',
    'Débranche : le parcours apparaît dans Navigation › Parcours.',
  ],
};

const HOWS: [keyof typeof STEPS, string][] = [['phone', 'Téléphone'], ['connect', 'Ordinateur'], ['usb', 'Câble USB']];

// Import d'un parcours GPX, marque par marque (aides officielles de COROS, Suunto et Polar).
const OTHER_STEPS = {
  coros: [
    'Ouvre le fichier téléchargé et choisis l\'appli COROS pour l\'ouvrir.',
    'Enregistre l\'itinéraire : les ravitos apparaissent sur la trace, avec leur heure prévue.',
    'Synchronise l\'itinéraire sur ta montre depuis l\'appli.',
  ],
  suunto: [
    'Appli Suunto, sur la carte : bouton + › Importer un itinéraire (.gpx).',
    'Choisis le fichier téléchargé et enregistre l\'itinéraire.',
    'Synchronise ta montre : l\'itinéraire est prêt pour la navigation.',
  ],
  polar: [
    'Sur flow.polar.com (ordinateur) : Favoris › Importer un itinéraire, puis dépose le fichier (GPX, 25 Mo au plus).',
    'Ajoute l\'itinéraire à tes favoris.',
    'Synchronise ta montre.',
  ],
  other: [
    'Importe le fichier dans l\'appli de ta montre, comme un itinéraire ou un parcours GPX.',
    'Les ravitos sont des points du parcours (waypoints), avec leur heure prévue dans le nom.',
    'Synchronise ta montre.',
  ],
};
const OTHER_HOWS: [keyof typeof OTHER_STEPS, string][] = [['coros', 'COROS'], ['suunto', 'Suunto'], ['polar', 'Polar'], ['other', 'Autre']];

const ICON: Record<FitPointKind, string> = { start: '▶', finish: '⚑', aid: '●', water: '●', checkpoint: '◆' };

/**
 * Export du plan vers la montre. Garmin : un parcours .fit (trace, ravitos, heures du plan pour le partenaire virtuel)
 * et le code du champ Prochain Ravito. Autres marques : un parcours .gpx, ravitos en waypoints avec leur heure prévue.
 */
export function GarminExport({ course, plans, selected, services, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scenario, setScenario] = useState(Math.min(selected, plans.length - 1));
  const [timeInName, setTimeInName] = useState(true);
  const [checkpoints, setCheckpoints] = useState(true);
  const [how, setHow] = useState<keyof typeof STEPS>('phone');
  const [brand, setBrand] = useState<WatchBrand>(loadWatchBrand);
  const [otherHow, setOtherHow] = useState<keyof typeof OTHER_STEPS>('coros');
  const chooseBrand = (b: WatchBrand) => { setBrand(b); saveWatchBrand(b); };
  const garmin = brand === 'garmin';
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const plan = plans[scenario];
  const options = { timeInName, checkpoints };
  const points = useMemo(() => fitCoursePoints(course, plan, services, { timeInName, checkpoints }),
    [course, plan, services, timeInName, checkpoints]);
  const waypoints = useMemo(() => gpxWaypoints(course, plan, services, { timeInName, checkpoints }),
    [course, plan, services, timeInName, checkpoints]);
  const filename = garmin ? fitFilename(course.race.name) : gpxFilename(course.race.name);
  const ciqPlan = useMemo(() => buildCiqPlan(course, plan), [course, plan]);
  const ciqCode = ciqPlan ? encodeCiqPlan(ciqPlan) : '';
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [ciqCode]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(ciqCode);
      setCopied(true);
    } catch {
      // Presse-papiers refusé : le code reste sélectionnable dans le champ.
    }
  }

  // <dialog> modal : focus piégé, Échap et fond gérés par le navigateur. Pas de close() au démontage :
  // le retirer du DOM suffit (et close() déclencherait onClose pendant le double montage du mode strict).
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => setState('idle'), [scenario, timeInName, checkpoints, brand]);

  async function download() {
    setState('busy');
    try {
      let blob: Blob;
      if (garmin) {
        const bytes = await buildCourseFit(course, plan, services, options);
        if (!bytes) throw new Error('sans trace');
        blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });
      } else {
        const gpx = buildCourseGpx(course, plan, services, options);
        if (!gpx) throw new Error('sans trace');
        blob = new Blob([gpx], { type: 'application/gpx+xml' });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setState('done');
    } catch {
      setState('failed');
    }
  }

  return (
    <dialog ref={dialog} className="garmin" aria-labelledby="garmin-title" onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
      <div className="garmin-body">
        <button type="button" className="garmin-close" aria-label="Fermer" onClick={() => dialog.current?.close()}>✕</button>
        <h2 id="garmin-title">Envoyer le plan sur ta montre</h2>
        <div className="watch-brand" role="group" aria-label="Ta montre">
          <button type="button" aria-pressed={garmin} className={garmin ? 'active' : ''} onClick={() => chooseBrand('garmin')}>
            <strong>J'ai une Garmin</strong><span>Parcours .fit avec partenaire virtuel, et champ Prochain Ravito</span>
          </button>
          <button type="button" aria-pressed={!garmin} className={!garmin ? 'active' : ''} onClick={() => chooseBrand('other')}>
            <strong>Autre marque</strong><span>COROS, Suunto, Polar… : parcours .gpx avec les ravitos et leur heure prévue</span>
          </button>
        </div>
        {garmin ? (
          <p className="muted">Un fichier de parcours <strong>.fit</strong> : la trace, tes ravitos et les heures de ton plan. La montre te
            guide, te montre le prochain ravito et te dit si tu es en avance.</p>
        ) : (
          <p className="muted">Un fichier de parcours <strong>.gpx</strong>, que toutes les marques importent : la trace, et chaque ravito
            en point du parcours avec son nom et son heure de passage prévue. Le partenaire virtuel et le champ Prochain Ravito sont
            propres à Garmin.</p>
        )}

        {!course.track ? (
          <p className="banner warn" role="status">Ajoute la trace GPX de ta course (« Modifier ma course ») : la montre en a besoin pour
            te guider.</p>
        ) : <>
          <section className="garmin-part" aria-labelledby="garmin-vp">
            <span id="garmin-vp" className="overline">{garmin ? 'Partenaire virtuel' : 'Heures prévues'}</span>
            <div className="plan-hero-scenarios garmin-scenarios" role="group" aria-labelledby="garmin-vp">
              {plans.map((p, i) => (
                <button key={p.scenario.name} type="button" aria-pressed={i === scenario} className={i === scenario ? 'active' : ''}
                  onClick={() => setScenario(i)}>
                  {p.scenario.name}<span>arrivée {formatClock(p.finish)}</span>
                </button>
              ))}
            </div>
            {plans.length === 3 && garmin && <span className="muted small">{HELP[scenario]}</span>}
          </section>

          <section className="garmin-part" aria-labelledby="garmin-opts">
            <span id="garmin-opts" className="overline">Sur la montre</span>
            <label className="check"><input type="checkbox" checked={timeInName} onChange={(e) => setTimeInName(e.target.checked)} />
              Heure de passage prévue dans le nom des points</label>
            <span className="muted small">Celle du scénario choisi ci-dessus, par exemple « Greffeil 21h58 ».</span>
            <label className="check"><input type="checkbox" checked={checkpoints} onChange={(e) => setCheckpoints(e.target.checked)} />
              Aussi les pointages sans ravito</label>
          </section>

          <section className="garmin-part" aria-labelledby="garmin-preview">
            <span id="garmin-preview" className="overline">Aperçu des points ({garmin ? points.length : waypoints.length})</span>
            <ul className="garmin-points">
              {(garmin ? points : waypoints).map((p) => (
                <li key={p.index}><span aria-hidden className={`garmin-icon garmin-${p.kind}`}>{ICON[p.kind]}</span> {p.name}</li>
              ))}
            </ul>
            <span className="muted small">{garmin ? 'Comme sur la montre : 15 caractères, sans accents.'
              : 'Nom complet : selon le modèle, la montre peut le raccourcir.'}</span>
          </section>

          <button type="button" className="garmin-download" onClick={() => void download()} disabled={state === 'busy'}>
            {state === 'busy' ? 'Préparation…' : state === 'done' ? '✓ Parcours téléchargé'
              : `Télécharger le parcours (${garmin ? '.fit' : '.gpx'})`}
          </button>
          {state === 'done' && <p className="muted small" role="status">Fichier : {filename}, dans tes téléchargements.</p>}
          {state === 'failed' && <p className="field-error" role="alert">Le fichier n'a pas pu être préparé : réessaie.</p>}

          {!garmin && (
            <section className="garmin-part plan-rule" aria-labelledby="garmin-next">
              <div className="garmin-next-head">
                <span id="garmin-next" className="overline">Et ensuite</span>
                <div className="plan-hero-scenarios garmin-how" role="group" aria-label="Ta marque">
                  {OTHER_HOWS.map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={otherHow === id} className={otherHow === id ? 'active' : ''}
                      onClick={() => setOtherHow(id)}>{label}</button>
                  ))}
                </div>
              </div>
              <ol>{OTHER_STEPS[otherHow].map((s) => <li key={s}>{s}</li>)}</ol>
              <p className="garmin-dday"><strong>Le jour J :</strong> lance la navigation sur l'itinéraire « {course.race.name} » :
                {' '}chaque ravito s'affiche avec son heure prévue.</p>
              <p className="muted small">Tu as recalculé ton plan ? Renvoie le fichier : les heures des ravitos viennent du plan.</p>
            </section>
          )}

          {garmin && <>
          <section className="garmin-part plan-rule" aria-labelledby="garmin-next">
            <div className="garmin-next-head">
              <span id="garmin-next" className="overline">Et ensuite</span>
              <div className="plan-hero-scenarios garmin-how" role="group" aria-label="Comment l'envoyer">
                {HOWS.map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={how === id} className={how === id ? 'active' : ''}
                    onClick={() => setHow(id)}>{label}</button>
                ))}
              </div>
            </div>
            <ol>{STEPS[how].map((s) => <li key={s}>{s}</li>)}</ol>
            <p><strong>Une seule fois, sur la montre :</strong> dans les réglages de ton activité Trail, ajoute un écran de données
              personnalisé avec le champ « Waypoint suivant » (le nom du prochain ravito, avec l'heure où tu dois y arriver), et les champs de
              navigation qui t'intéressent, comme la distance jusqu'à ce point. Les noms des champs varient selon les modèles.</p>
            <p className="garmin-dday"><strong>Le jour J :</strong> lance une activité Trail, puis <strong>Navigation › Parcours ›
              {' '}{course.race.name} › Suivre le parcours</strong>.</p>
            <p className="muted small">Tu as recalculé ton plan ? Renvoie le fichier : les heures du partenaire virtuel viennent du plan.</p>
          </section>

          <section className="garmin-part plan-rule" aria-labelledby="garmin-ciq">
            <span id="garmin-ciq" className="overline">Champ Prochain Ravito (Connect IQ)</span>
            <p>Le champ de données « Prochain Ravito » affiche le prochain ravito de ton plan, la distance, l'heure d'arrivée
              estimée et ton écart au plan, sans les virages de Garmin Connect. Colle ce code dans ses réglages (appli Connect IQ ›
              Prochain Ravito › Réglages), pour le scénario {plan.scenario.name.toLowerCase()}.</p>
            <textarea className="garmin-code" readOnly value={ciqCode} rows={3} aria-label="Code du plan pour le champ Prochain Ravito"
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="ghost" onClick={() => void copyCode()}>{copied ? '✓ Code copié' : 'Copier le code'}</button>
            <p><strong>À 300 m de chaque ravito, la montre vibre trois fois</strong>, quel que soit l'écran affiché. Pas d'écran
              d'alerte : jette un œil au champ, il affiche alors « Ravito dans … m ». Le plus simple est de le mettre sur l'écran
              que tu regardes le plus (réglages de ton activité Trail › Écrans de données), en version compacte à côté de tes
              autres champs.</p>
          </section>
          </>}
        </>}
      </div>
    </dialog>
  );
}
