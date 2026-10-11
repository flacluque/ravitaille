# Trail Planner

Planificateur de course trail : à partir du roadbook (et/ou de la trace GPX) et de tes courses
de référence, il calcule les **heures de passage à chaque ravito**, les **marges sur les barrières
horaires** et le **temps total**, selon trois scénarios (optimiste / réaliste / prudent).

> v0.1 : moteur de calcul + API REST + front React (carte, profil altimétrique, tableau imprimable, hors ligne).

## Lancer le projet

Prérequis : Java 21, Maven 3.9+.

```bash
mvn test                 # tests unitaires (parser GPX, analyse, modèle, planificateur)
mvn spring-boot:run      # API sur http://localhost:8080
```

### Le front (React)

Prérequis : Node.js 20+. Dans un second terminal, l'API tournant à côté :

```bash
cd frontend
npm install              # la première fois
npm run dev              # http://localhost:5173 (les appels /api sont relayés vers le port 8080)
```

- **Carte et profil synchronisés** : survole l'un ou l'autre pour voir l'altitude, le D+ cumulé et
  l'heure de passage estimée (interpolée entre deux ravitos).
- **Trois scénarios** : clique sur une carte pour afficher son tableau détaillé ; le tableau de
  comparaison les met côte à côte.
- **Ma course** : saisis le roadbook de ta course (un point par ravito : km, D+ cumulé, type de
  ravito, barrières « 14h30 » dont le jour est déduit tout seul), ou importe-le en JSON (même format
  que `src/main/resources/samples/bogomiles/roadbook.json`). La trace GPX est **facultative** : sans
  elle, pas de carte ni de profil, et le calcul se fait sur le D+ du roadbook. Ta course et ta trace
  restent dans ton navigateur ; « Exporter » télécharge le roadbook pour le garder.
- **Lire un roadbook (image / PDF)** : une IA lit le roadbook de l'organisation et remplit le
  tableau de « Ma course » ; tu vérifies ligne par ligne, le roadbook d'origine affiché au-dessus.
  Voir « Lecture automatique des roadbooks » plus bas.
- **Télécharger le PDF** : le plan en A4, prêt à garder sur le téléphone ou à imprimer. Il contient
  les trois scénarios, le profil avec les ravitos, tes références, les heures de passage du scénario
  sélectionné (marges en couleur) et la comparaison des scénarios. Il est généré dans le navigateur,
  donc ça marche aussi hors ligne.
- **Hors ligne** : le dernier plan calculé est gardé dans le navigateur, et l'appli est une PWA
  (installable sur le téléphone, fonctionne sans réseau une fois chargée — build de production :
  `npm run build && npm run preview`).

```bash
npm test                 # tests unitaires (formatage, barrières, interpolation, profil)
npm run build            # vérification TypeScript + build de production dans frontend/dist
```

### Essayer l'API tout de suite (Raid des Bogomiles embarqué)

```bash
# Tableau texte des 3 scénarios avec ta référence 60 km / 3 200 m D+ en 8h48
curl "http://localhost:8080/api/demo/bogomiles/report?refKm=60&refGain=3200&refTime=PT8H48M"

# Même chose en JSON
curl "http://localhost:8080/api/demo/bogomiles"

# Comparaison roadbook 2026 vs trace GPX, point par point
curl "http://localhost:8080/api/demo/bogomiles/check"

# Ce que le front dessine : roadbook, trace rééchantillonnée et position des ravitos sur la trace
curl "http://localhost:8080/api/demo/bogomiles/course?stepKm=0.1"
```

### Avec tes propres fichiers

```bash
# Analyse d'une trace : distance, D+/D-, profil rééchantillonné tous les 100 m
curl -F "gpx=@ma-trace.gpx" http://localhost:8080/api/tracks/analyze

# Course à dessiner (carte, profil, ravitos) à partir de ton roadbook et de ta trace
curl -F "race=@mon-roadbook.json;type=application/json" -F "gpx=@ma-trace.gpx" \
     http://localhost:8080/api/courses

# Plans + course à dessiner en une requête (ce qu'utilise le front pour « Ma course »)
curl -F "request=@requests/plan-bogomiles.json;type=application/json" -F "gpx=@ma-trace.gpx" \
     http://localhost:8080/api/plans/full

# Plan de course : roadbook + références en JSON, trace GPX optionnelle
curl -F "request=@requests/plan-bogomiles.json;type=application/json" \
     -F "gpx=@ma-trace.gpx" \
     http://localhost:8080/api/plans
```

`requests/plan-bogomiles.json` est un exemple complet de requête. Les durées sont au format
ISO-8601 (`PT8H48M` = 8 h 48) et les dates en heure locale (`2026-10-23T14:30:00`).

## Lecture automatique des roadbooks

L'IA qui lit les roadbooks se choisit dans `src/main/resources/application.properties`
(`trailplanner.extraction.*`). Par défaut : **Ollama**, une IA locale et gratuite, rien ne sort de ta machine.

```bash
# 1. Installer Ollama : https://ollama.com (appli macOS), puis la lancer
# 2. Télécharger le modèle de vision (~6 Go, une seule fois)
ollama pull qwen2.5vl:7b
# 3. Relancer l'API : le bouton « Lire un roadbook » de l'éditeur est prêt
```

- Images (PNG, JPEG, photo de téléphone) et PDF. Dans un livret de plus de 4 pages (accès, navettes,
  règlement...), seules les 4 pages qui décrivent le parcours sont lues, repérées grâce à leur texte
  (heures, km, mots-clés). Quand le PDF contient du texte, il est envoyé au modèle avec les images :
  les nombres y sont exacts. Compter 30 s à 2 min par roadbook.
- Beaucoup de roadbooks ne donnent le dénivelé qu'en dessin (profil) : l'IA laisse alors le D+ vide
  plutôt que de l'inventer, et il faut ajouter la trace GPX de la course.
- L'IA ne fait que **pré-remplir** l'éditeur : rien n'est calculé sans ta relecture.
- Changer de modèle : `trailplanner.extraction.ollama.model=...` (après `ollama pull ...`).
- Désactiver : `trailplanner.extraction.provider=none`.
- Ajouter une autre IA (cloud...) : une implémentation de `RoadbookExtractor` et une ligne dans
  `ExtractionConfig` ; ni le front ni le reste du backend ne changent.

**Mesurer la qualité d'un modèle** sur de vrais roadbooks (comparés à une saisie à la main) :

```bash
mvn test -Dtest=RoadbookExtractionEvalTest -Dollama=true -Dollama.model=qwen2.5vl:7b
```

Le test affiche, point par point, les champs mal lus et un score global. Pour ajouter un roadbook de
test : l'image dans `src/test/resources/roadbooks/`, la saisie de référence dans
`src/main/resources/samples/<course>/roadbook.json`, et une ligne dans `RoadbookExtractionEvalTest`.

## Le modèle de calcul

1. **Kilomètre-effort** (convention ITRA) : `E = distance (km) + D+ (m) / 100`.
2. **Loi de fatigue de Riegel** appliquée à l'effort : le temps pour atteindre l'effort cumulé `E`
   vaut `T(E) = a × E^b`. Avec `b > 1`, l'allure se dégrade au fil de la course.
3. **Calibration** : `a` est déduit de tes performances de référence (`a = T_ref / E_ref^b`).
   Le temps de référence inclut les arrêts. Avec plusieurs références, on fait une moyenne pondérée
   pour tenir compte de ta progression depuis ta course de référence :
   - **récence** : le poids est divisé par deux tous les 6 mois écoulés avant la course ;
   - **distance** : poids `1 / (1 + |ln(effort course / effort référence)|)`, soit ×0,6 pour un
     effort deux fois plus court ;
   - **entraînement** : une sortie chronométrée compte comme une course 10 % plus rapide, avec un
     poids ×0,6 (la conversion reste approximative).

   Le plan indique aussi l'arrivée prédite par chaque référence seule, et son poids.
4. **Simulation pas à pas** (tous les 0,05 km-effort) : on applique la forme du jour, le facteur
   de nuit si l'horloge est dans la plage frontale, puis les arrêts aux ravitos.
5. **Barrières horaires** : entrée et/ou sortie de ravito. Statut `OK` (> 1 h de marge), `TIGHT`
   (< 1 h), `MISSED` (dépassée).

| Scénario  | Forme du jour | Exposant fatigue | Facteur nuit | Arrêt ravito | Arrêt base de vie |
|-----------|--------------:|-----------------:|-------------:|-------------:|------------------:|
| Optimiste | 0,96          | 1,06             | +5 %         | 2 min        | 8 min             |
| Réaliste  | 1,00          | 1,07             | +10 %        | 4 min        | 15 min            |
| Prudent   | 1,05          | 1,08             | +15 %        | 6 min        | 25 min            |

Tous ces paramètres sont surchargeables dans la requête (`scenarios`).

### Roadbook ou trace GPX ?

`elevationSource` = `AUTO` (défaut), `ROADBOOK` ou `TRACK`. En `AUTO`, on prend le D+ officiel du
roadbook s'il est complet : c'est le parcours de l'année, alors qu'une trace GPX trouvée en ligne
date souvent d'une édition précédente. La trace sert alors au profil et au contrôle de cohérence.

Pour le dénivelé mesuré sur la trace, on filtre le bruit altimétrique (hystérésis de 3 m) : sans
ce filtre, la trace des Bogomiles donne ~4 500 m D+ au lieu de ~3 770 m.

## Architecture

```
fr.trailplanner
├── gpx       Lecture GPX en streaming (StAX), sans dépendance
├── track     Distance (haversine), D+/D- filtré, profil cumulé interpolable
├── model     Course, ravitos, références, scénarios, plage de nuit (records)
├── engine    Modèle d'effort, découpage en tronçons, planificateur
├── report    Rendu texte imprimable
├── api       Spring Boot : contrôleur REST, service, DTO
└── extract   Lecture des roadbooks par une IA (interface + Ollama), préparation des images / PDF

frontend/src
├── api         Types (miroir des records Java), client, copie hors ligne du dernier plan
├── lib         Formatage (durées ISO, heures), barrières, interpolation, géométrie du profil, PDF
└── components  Formulaire, scénarios, carte Leaflet, profil SVG, tableaux
```

Le cœur (`gpx`, `track`, `model`, `engine`, `report`) est en Java pur : il ne dépend pas de Spring
et pourra être réutilisé tel quel (CLI, appli mobile via une API, batch de calibration...).

## Feuille de route

- [x] **v0.1** : GPX, roadbook, heures de passage, barrières, 3 scénarios, nuit
- [x] **v0.1-front** : React + TypeScript, carte Leaflet, profil altimétrique, tableau imprimable, PWA hors ligne
- [x] **v0.1-import** : saisir / importer son roadbook, trace GPX facultative
- [x] **v0.1-lecture** : lecture du roadbook (image / PDF) par une IA configurable, Ollama par défaut
- [x] **v0.1-références** : plusieurs références datées (courses, entraînements), pondérées
- [ ] **v0.2** : plan nutrition / hydratation par tronçon, checklist matériel obligatoire
- [ ] **v0.3** : import de l'historique (Strava/Garmin) et calibration par tranche de pente (montée/descente)
- [ ] **v0.4** : mode assistance (crew) : où et quand retrouver le coureur
