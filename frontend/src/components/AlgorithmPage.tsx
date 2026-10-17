import { useEffect, useState } from 'react';
import type { RacePlan } from '../api/types';
import { formatDuration, formatKm } from '../lib/format';
import { formEffect } from '../lib/training';

/** Une source citée : auteurs, année, titre, revue, lien. */
interface Source {
  id: string;
  cite: string;
  title: string;
  where: string;
  url: string;
}

const SOURCES: Source[] = [
  { id: 'itra', cite: 'ITRA', title: 'Kilomètre-effort et indice de performance', where: 'International Trail Running Association', url: 'https://itra.run' },
  { id: 'riegel', cite: 'Riegel (1981)', title: 'Athletic records and human endurance', where: 'American Scientist, 69(3), 285-290', url: 'https://scholar.google.com/scholar?q=Riegel+1981+%22Athletic+records+and+human+endurance%22' },
  { id: 'vickers', cite: 'Vickers et Vertosick (2016)', title: 'An empirical study of race times in recreational endurance runners', where: 'BMC Sports Science, Medicine and Rehabilitation, 8:26', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5000509/' },
  { id: 'tanda', cite: 'Tanda (2011)', title: 'Prediction of marathon performance time on the basis of training indices', where: 'Journal of Human Sport and Exercise, 6(3)', url: 'https://rua.ua.es/dspace/handle/10045/18930' },
  { id: 'tanda2022', cite: 'Tanda et al. (2022)', title: 'Validation du modèle de Tanda sur des données Strava', where: 'Journal of Human Sport and Exercise', url: 'https://iris.unige.it/handle/11567/1022501' },
  { id: 'knechtle', cite: 'Knechtle et al. (2015)', title: 'Effects of training and anthropometric factors on marathon and 100 km ultramarathon race performance', where: 'Open Access Journal of Sports Medicine, 6', url: 'https://www.dovepress.com/effects-of-training-and-anthropometric-factors-on-marathon-and-100-km--peer-reviewed-fulltext-article-OAJSM' },
  { id: 'leadville', cite: 'Baldea (enquête Leadville 100)', title: 'Ultramarathon success is reflected in training experiences', where: 'Coaching and Sport Science Review', url: 'https://coachsci.sdsu.edu/csa/vol161/baldea.htm' },
  { id: 'bosquet', cite: 'Bosquet et al. (2007)', title: 'Effects of tapering on performance: a meta-analysis', where: 'Medicine & Science in Sports & Exercise, 39(8), 1358-1365', url: 'https://pubmed.ncbi.nlm.nih.gov/17762369/' },
  { id: 'taper2023', cite: 'Méta-analyse (2023)', title: 'Effects of tapering on performance in endurance athletes', where: 'PLOS ONE', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/' },
  { id: 'mujika', cite: 'Mujika et Padilla (2000)', title: 'Detraining: loss of training-induced physiological and performance adaptations', where: 'Sports Medicine, 30(2-3) ; synthèse récente : Frontiers in Physiology (2020)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7593778/' },
  { id: 'banister', cite: 'Banister et al. (1975) ; étude de cas en course à pied', title: 'Modèle impulsion-réponse (condition / fatigue)', where: 'Performance modeling in an Olympic 1500-m finalist', url: 'https://lida.sport-iat.de/ta/Record/4025945?lng=en' },
  { id: 'minetti', cite: 'Minetti et al. (2002)', title: 'Energy cost of walking and running at extreme uphill and downhill slopes', where: 'Journal of Applied Physiology, 93(3), 1039-1046', url: 'https://iris.unibs.it/retrieve/ddc633e4-3c03-4e2e-e053-3705fe0a4c80/Minetti%20JAP%202002.pdf' },
  { id: 'trap', cite: 'Fogliato et al. (2020)', title: 'TRAP: A Predictive Framework for Trail Running Assessment of Performance', where: 'arXiv:2002.01328', url: 'https://arxiv.org/abs/2002.01328' },
];

function Ref({ id }: { id: string }) {
  const n = SOURCES.findIndex((s) => s.id === id) + 1;
  return <a className="cite" href={`#source-${id}`} title={SOURCES[n - 1]?.cite}>[{n}]</a>;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** « Comment ça marche » : le calcul pas à pas, pour qui veut le vérifier, avec les études sur lesquelles il s'appuie. */
export function AlgorithmPage({ plan }: { plan: RacePlan | undefined }) {
  const t = plan?.training;
  return (
    <article className="algo">
      <header className="algo-head">
        <h1>Comment ça marche</h1>
        <p className="muted">
          Le détail du calcul des heures de passage, pour qui veut le vérifier ou le discuter. Les coefficients
          viennent d'études publiées (numéros entre crochets, sources en bas de page) ; ce sont des ordres de
          grandeur, pas des lois exactes.
        </p>
      </header>
      <AlgoToc />

      {plan && (
        <section className="card algo-mine">
          <h2>Ton plan en chiffres · scénario {plan.scenario.name.toLowerCase()}</h2>
          <dl>
            <dt>Effort de la course</dt>
            <dd>{formatKm(plan.totalDistanceKm)} km + {Math.round(plan.totalGainM)} m D+ / 100 = <strong>{formatKm(plan.totalEffortKm)} km-effort</strong></dd>
            <dt>Exposant de fatigue b</dt>
            <dd><strong>{plan.scenario.fatigueExponent.toLocaleString('fr-FR')}</strong>, forme du jour ×{plan.scenario.paceFactor.toLocaleString('fr-FR')}, nuit ×{plan.scenario.nightFactor.toLocaleString('fr-FR')}</dd>
            <dt>Références</dt>
            <dd>
              <ul>
                {plan.references.map((r, i) => (
                  <li key={`${r.label}-${i}`}>
                    {r.label || `Référence ${i + 1}`} : {formatKm(r.distanceKm)} km, {Math.round(r.elevationGainM)} m D+ en {formatDuration(r.duration)}
                    {' '}→ poids <strong>{pct(r.weight)}</strong> (récence ×{r.recencyFactor.toLocaleString('fr-FR')}, distance ×{r.distanceFactor.toLocaleString('fr-FR')}
                    {r.kind === 'TRAINING' ? ', entraînement' : ''}{r.formFactor && r.formFactor !== 1 ? `, forme ${formEffect(r.formFactor)}` : ''})
                  </li>
                ))}
              </ul>
            </dd>
            {t?.active && (
              <>
                <dt>Préparation</dt>
                <dd>
                  {Math.round(t.target.weeklyEffortKm)} km-effort par semaine sur {t.target.blockWeeks ?? 12} semaines,
                  sensibilité α = <strong>{t.elasticity.toLocaleString('fr-FR')}</strong>
                  {t.personalRaces > 0 ? ` (ajustée sur tes ${t.personalRaces} courses)` : ' (valeur par défaut)'}
                </dd>
              </>
            )}
            <dt>Temps prévu</dt>
            <dd><strong>{formatDuration(plan.totalDuration)}</strong>, dont {formatDuration(plan.totalStops)} d'arrêts et {formatDuration(plan.nightDuration)} de nuit</dd>
          </dl>
        </section>
      )}

      <section id="algo-effort">
        <h2>1. Kilomètre-effort</h2>
        <p>
          Pour comparer des courses de profils différents, on ramène distance et dénivelé à une seule unité, le
          kilomètre-effort, comme l'ITRA <Ref id="itra" /> :
        </p>
        <p className="formula">E = distance (km) + D+ (m) / 100</p>
        <p>
          100 m de montée « coûtent » autant qu'un kilomètre à plat. La descente n'est pas comptée à part : son coût
          énergétique est faible <Ref id="minetti" />, et la fatigue qu'elle cause est prise en compte par la loi de
          fatigue ci-dessous.
        </p>
      </section>

      <section id="algo-riegel">
        <h2>2. Loi de fatigue de Riegel</h2>
        <p>Le temps pour atteindre l'effort cumulé E suit une loi de puissance <Ref id="riegel" /> :</p>
        <p className="formula">T(E) = a × E<sup>b</sup></p>
        <p>
          Avec b &gt; 1, l'allure se dégrade au fil de la course : c'est la fatigue, sans paramètre de plus. Riegel
          trouve b de 1,05 à 1,08 en course à pied ; Vickers et Vertosick <Ref id="vickers" /> montrent que la formule
          est trop optimiste au-delà du semi-marathon, d'où des exposants un peu plus élevés selon le scénario :
        </p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Scénario</th><th className="num">b</th><th className="num">Forme du jour</th><th className="num">Nuit</th><th className="num">Ravito / base de vie</th></tr></thead>
            <tbody>
              <tr><td>Optimiste</td><td className="num">1,06</td><td className="num">×0,96</td><td className="num">+5 %</td><td className="num">2 / 8 min</td></tr>
              <tr><td>Réaliste</td><td className="num">1,07</td><td className="num">×1,00</td><td className="num">+10 %</td><td className="num">4 / 15 min</td></tr>
              <tr><td>Prudent</td><td className="num">1,08</td><td className="num">×1,05</td><td className="num">+15 %</td><td className="num">6 / 25 min</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="algo-references">
        <h2>3. Calibration sur tes références</h2>
        <p>Le coefficient a vient de tes performances passées (temps arrêts compris) :</p>
        <p className="formula">a = Σ poids<sub>i</sub> × T<sub>i</sub> / E<sub>i</sub><sup>b</sup>  (Σ poids = 1)</p>
        <p>Le poids de chaque référence est le produit de trois facteurs, puis normalisé :</p>
        <ul>
          <li><strong>Récence</strong> : ×0,5<sup>jours / demi-vie</sup>, avec une demi-vie de 180 jours, ou 365 jours quand
            la forme est mesurée par l'entraînement (section 4) : l'écart de forme n'a plus à être deviné.</li>
          <li><strong>Distance</strong> : 1 / (1 + |ln(E<sub>course</sub> / E<sub>référence</sub>)|). Extrapoler d'un 20 km
            vers un 100 km est moins fiable que d'un 80 km : ×0,6 pour un effort deux fois plus court.</li>
          <li><strong>Entraînement</strong> : une sortie chronométrée est rarement courue à fond. Son temps est converti en
            temps de course (×0,90) et elle pèse ×0,6.</li>
        </ul>
      </section>

      <section id="algo-forme">
        <h2>4. Forme d'entraînement (avec Strava)</h2>
        <p>
          Les deux meilleurs prédicteurs d'un temps de course sont les temps passés et le kilométrage hebdomadaire
          <Ref id="vickers" /> ; Tanda <Ref id="tanda" /> prédit l'allure marathon à partir du volume et de l'allure des
          semaines de préparation, et Knechtle <Ref id="knechtle" /> trouve que le volume compte encore plus sur 100 km.
          On compare donc la préparation de chaque référence à la tienne.
        </p>
        <ol>
          <li><strong>Bloc de préparation</strong> : les 10 à 16 semaines (réglable, 12 par défaut) avant la semaine de
            course, exclue car souvent allégée. Pour ta course à venir, le bloc s'arrête à aujourd'hui. Volume V = km-effort
            moyens par semaine (randonnées comprises si tu le choisis).</li>
          <li><strong>Correction</strong> du temps de chaque référence :
            <p className="formula">T'<sub>i</sub> = T<sub>i</sub> × (V<sub>i</sub> / V<sub>course</sub>)<sup>α</sup>, limité à ±8 %</p>
            Chez Tanda, la sensibilité du temps au volume va de 0,06 à 0,13 au niveau amateur : on retient α = 0,10
            (+10 % de volume ≈ −0,9 % de temps). Le plafond de ±8 % rappelle que ces coefficients viennent d'études sur
            route. Le modèle a été validé sur des données Strava <Ref id="tanda2022" />.</li>
          <li><strong>Calibration personnelle</strong> : à partir de 3 courses dont la préparation est connue, on estime α par
            les moindres carrés sur y = ln T − b ln E et x = ln V (pente −α), puis on la rapproche de 0,10 :
            <p className="formula">α = (α̂ × S<sub>xx</sub> + 0,10 × 0,5) / (S<sub>xx</sub> + 0,5), borné à [0 ; 0,25]</p>
            S<sub>xx</sub> mesure la dispersion des volumes : tant qu'ils varient peu, la valeur par défaut l'emporte.</li>
          <li><strong>Sortie longue</strong> : en ultra, la plus longue sortie de la préparation est liée au temps final
            <Ref id="leadville" />. Sous 40 % de l'effort de la course, le scénario prudent compte 2 % de plus.</li>
          <li><strong>Désentraînement</strong> : 3 à 4 semaines d'arrêt coûtent de 4 à 25 % de performance <Ref id="mujika" />.
            Si le volume des 4 dernières semaines tombe sous la moitié de celui du bloc, une alerte s'affiche (sans
            corriger le temps). Les 2 semaines avant la course sont exclues : un affûtage qui réduit le volume de 40 à 60 %
            améliore la performance <Ref id="bosquet" /> <Ref id="taper2023" />.</li>
        </ol>
        <p className="muted small">
          Écarté : le modèle de Banister (condition − fatigue) <Ref id="banister" />, bon pour suivre la charge mais peu
          prédictif seul ; les modèles à grande échelle (TRAP <Ref id="trap" />, indices ITRA / UTMB), qui demandent les
          résultats de milliers de coureurs.
        </p>
      </section>

      <section id="algo-simulation">
        <h2>5. Simulation pas à pas</h2>
        <ol>
          <li>Le parcours est découpé en tronçons entre ravitos, chacun en pas de 0,05 km-effort.</li>
          <li>À chaque pas, le temps vaut a × ((E + ΔE)<sup>b</sup> − E<sup>b</sup>) × forme du jour, × facteur de nuit
            si l'horloge est dans la plage frontale.</li>
          <li>Aux ravitos, on ajoute l'arrêt du scénario. L'arrivée et chaque passage tombent de cette horloge.</li>
          <li>Barrières : marge = barrière − passage. Plus d'1 h : OK ; moins d'1 h : serrée ; négative : dépassée.</li>
          <li>Le D+ vient du roadbook officiel s'il est complet (le parcours de l'année), sinon de la trace GPX, filtrée
            par une hystérésis de 3 m contre le bruit altimétrique.</li>
        </ol>
      </section>

      <section id="algo-nutrition">
        <h2>6. Nutrition et hydratation</h2>
        <ul>
          <li>Objectif d'un tronçon = durée × glucides par heure (60, 75 ou 90 g/h selon l'entraînement du ventre), avec un quart
            de moins la première heure (l'estomac se met en route) et 10 % de moins la nuit (digestion plus lente).</li>
          <li>Si tu manges aux ravitos : ≈ 30 g par ravito avec du solide, ≈ 60 g aux repas chauds, décomptés du tronçon suivant.</li>
          <li>Eau : jour × 500 ml/h, nuit × 400 ml/h. Les flasques sont remplies à chaque point d'eau pour tenir jusqu'au suivant,
            celles de boisson énergétique d'abord (autant que tu le choisis) ; leurs glucides sont décomptés.</li>
          <li>Le reste vient de tes produits, pris à tour de rôle, d'où la consigne « 1 gel toutes les 40 min ». Ce qui manque
            sur un tronçon passe au suivant.</li>
          <li>On ne porte que jusqu'au prochain point d'assistance ou sac de délestage, qui donne la suite ; la fiche pour
            l'assistance dit quoi préparer à chaque point.</li>
        </ul>
        <p className="muted small">Repères courants en ultra, à ajuster : ce ne sont pas des conseils médicaux.</p>
      </section>

      <section id="algo-limites">
        <h2>7. Limites</h2>
        <ul>
          <li>L'intensité de l'entraînement (fractionné, seuil) n'est pas mesurée sans fréquence cardiaque ni puissance.</li>
          <li>La technicité du terrain, la chaleur et l'altitude ne sont pas modélisées.</li>
          <li>Les études citées portent surtout sur la route (marathon, 100 km) : en trail, ce sont des ordres de grandeur.</li>
        </ul>
      </section>

      <section id="algo-sources" className="algo-sources">
        <h2>Sources</h2>
        <ol>
          {SOURCES.map((s) => (
            <li key={s.id} id={`source-${s.id}`}>
              <strong>{s.cite}</strong>, <a href={s.url} target="_blank" rel="noreferrer"><em>{s.title}</em></a>, {s.where}.
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

const TOC: [string, string][] = [
  ['algo-effort', '1. Kilomètre-effort'], ['algo-riegel', '2. Loi de fatigue'], ['algo-references', '3. Références'],
  ['algo-forme', "4. Forme d'entraînement"], ['algo-simulation', '5. Simulation'], ['algo-nutrition', '6. Nutrition'],
  ['algo-limites', '7. Limites'], ['algo-sources', 'Sources'],
];

/** Sommaire collé en haut de l'écran, qui suit la lecture : la section en cours est soulignée. */
function AlgoToc() {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const sections = TOC.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setCurrent(visible[0].target.id);
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return (
    <nav className="algo-toc" aria-label="Sommaire">
      {TOC.map(([id, label]) => (
        <a key={id} href={`#${id}`} aria-current={current === id ? 'location' : undefined}>{label}</a>
      ))}
    </nav>
  );
}
