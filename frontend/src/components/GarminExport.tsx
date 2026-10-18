import { useEffect, useMemo, useRef, useState } from 'react';
import type { CourseView, RacePlan, Service } from '../api/types';
import { formatClock } from '../lib/format';
import { buildCourseFit, fitCoursePoints, fitFilename, type FitPointKind } from '../lib/fit';

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
    'Enregistre le parcours : tu y vois déjà les ravitos, leurs barrières et le profil.',
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

const ICON: Record<FitPointKind, string> = { start: '▶', finish: '⚑', aid: '●', water: '●', checkpoint: '◆' };

/**
 * Export du plan vers une montre Garmin : un fichier de parcours .fit (trace, ravitos, heures du plan pour le
 * partenaire virtuel), puis comment l'envoyer sur la montre.
 */
export function GarminExport({ course, plans, selected, services, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scenario, setScenario] = useState(Math.min(selected, plans.length - 1));
  const [cutInName, setCutInName] = useState(true);
  const [checkpoints, setCheckpoints] = useState(true);
  const [how, setHow] = useState<keyof typeof STEPS>('phone');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const plan = plans[scenario];
  const options = { cutInName, checkpoints };
  const points = useMemo(() => fitCoursePoints(course, plan, services, { cutInName, checkpoints }),
    [course, plan, services, cutInName, checkpoints]);
  const filename = fitFilename(course.race.name);

  // <dialog> modal : focus piégé, Échap et fond gérés par le navigateur. Pas de close() au démontage :
  // le retirer du DOM suffit (et close() déclencherait onClose pendant le double montage du mode strict).
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => setState('idle'), [scenario, cutInName, checkpoints]);

  async function download() {
    setState('busy');
    try {
      const bytes = await buildCourseFit(course, plan, services, options);
      if (!bytes) throw new Error('sans trace');
      const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }));
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
        <h2 id="garmin-title">Envoyer le plan sur ta Garmin</h2>
        <p className="muted">Un fichier de parcours <strong>.fit</strong> : la trace, tes ravitos et les heures de ton plan. La montre te
          guide, t'alerte avant chaque ravito et te dit si tu es en avance.</p>

        {!course.track ? (
          <p className="banner warn" role="status">Ajoute la trace GPX de ta course (« Modifier ma course ») : la montre en a besoin pour
            te guider.</p>
        ) : <>
          <section className="garmin-part" aria-labelledby="garmin-vp">
            <span id="garmin-vp" className="overline">Partenaire virtuel</span>
            <div className="plan-hero-scenarios garmin-scenarios" role="group" aria-labelledby="garmin-vp">
              {plans.map((p, i) => (
                <button key={p.scenario.name} type="button" aria-pressed={i === scenario} className={i === scenario ? 'active' : ''}
                  onClick={() => setScenario(i)}>
                  {p.scenario.name}<span>arrivée {formatClock(p.finish)}</span>
                </button>
              ))}
            </div>
            {plans.length === 3 && <span className="muted small">{HELP[scenario]}</span>}
          </section>

          <section className="garmin-part" aria-labelledby="garmin-opts">
            <span id="garmin-opts" className="overline">Sur la montre</span>
            <label className="check"><input type="checkbox" checked={cutInName} onChange={(e) => setCutInName(e.target.checked)} />
              Barrière horaire dans le nom des points</label>
            <label className="check"><input type="checkbox" checked={checkpoints} onChange={(e) => setCheckpoints(e.target.checked)} />
              Aussi les pointages sans ravito</label>
          </section>

          <section className="garmin-part" aria-labelledby="garmin-preview">
            <span id="garmin-preview" className="overline">Aperçu des points ({points.length})</span>
            <ul className="garmin-points">
              {points.map((p) => (
                <li key={p.index}><span aria-hidden className={`garmin-icon garmin-${p.kind}`}>{ICON[p.kind]}</span> {p.name}</li>
              ))}
            </ul>
            <span className="muted small">Comme sur la montre : 15 caractères, sans accents.</span>
          </section>

          <button type="button" className="garmin-download" onClick={() => void download()} disabled={state === 'busy'}>
            {state === 'busy' ? 'Préparation…' : state === 'done' ? '✓ Parcours téléchargé' : 'Télécharger le parcours (.fit)'}
          </button>
          {state === 'done' && <p className="muted small" role="status">Fichier : {filename}, dans tes téléchargements.</p>}
          {state === 'failed' && <p className="field-error" role="alert">Le fichier n'a pas pu être préparé : réessaie.</p>}

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
              personnalisé avec le champ « Waypoint suivant » (le nom du prochain ravito, avec sa barrière), et les champs de
              navigation qui t'intéressent, comme la distance jusqu'à ce point. Les noms des champs varient selon les modèles.</p>
            <p className="garmin-dday"><strong>Le jour J :</strong> lance une activité Trail, puis <strong>Navigation › Parcours ›
              {' '}{course.race.name} › Suivre le parcours</strong>.</p>
            <p className="muted small">Tu as recalculé ton plan ? Renvoie le fichier : les heures du partenaire virtuel viennent du plan.</p>
          </section>
        </>}
      </div>
    </dialog>
  );
}
