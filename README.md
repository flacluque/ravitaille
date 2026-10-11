# Trail Planner

Planificateur de course trail : à partir du roadbook (et/ou de la trace GPX) et de tes courses
de référence, il calcule les **heures de passage à chaque ravito**, les **marges sur les barrières
horaires** et le **temps total**, selon trois scénarios (optimiste / réaliste / prudent).

> v0.1 : moteur de calcul + API REST. Le front (React + carte + profil) arrive à l'étape suivante.

## Lancer le projet

Prérequis : Java 21, Maven 3.9+.

```bash
mvn test                 # tests unitaires (parser GPX, analyse, modèle, planificateur)
mvn spring-boot:run      # API sur http://localhost:8080
```

### Essayer tout de suite (Raid des Bogomiles embarqué)

```bash
# Tableau texte des 3 scénarios avec ta référence 60 km / 3 200 m D+ en 8h48
curl "http://localhost:8080/api/demo/bogomiles/report?refKm=60&refGain=3200&refTime=PT8H48M"

# Même chose en JSON
curl "http://localhost:8080/api/demo/bogomiles"

# Comparaison roadbook 2026 vs trace GPX, point par point
curl "http://localhost:8080/api/demo/bogomiles/check"
```

### Avec tes propres fichiers

```bash
# Analyse d'une trace : distance, D+/D-, profil rééchantillonné tous les 100 m
curl -F "gpx=@ma-trace.gpx" http://localhost:8080/api/tracks/analyze

# Plan de course : roadbook + références en JSON, trace GPX optionnelle
curl -F "request=@requests/plan-bogomiles.json;type=application/json" \
     -F "gpx=@ma-trace.gpx" \
     http://localhost:8080/api/plans
```

`requests/plan-bogomiles.json` est un exemple complet de requête. Les durées sont au format
ISO-8601 (`PT8H48M` = 8 h 48) et les dates en heure locale (`2026-10-23T14:30:00`).

## Le modèle de calcul

1. **Kilomètre-effort** (convention ITRA) : `E = distance (km) + D+ (m) / 100`.
2. **Loi de fatigue de Riegel** appliquée à l'effort : le temps pour atteindre l'effort cumulé `E`
   vaut `T(E) = a × E^b`. Avec `b > 1`, l'allure se dégrade au fil de la course.
3. **Calibration** : `a` est déduit de tes courses de référence (`a = T_ref / E_ref^b`, moyenné
   si tu en donnes plusieurs). Le temps de référence inclut les arrêts de cette course-là.
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
└── api       Spring Boot : contrôleur REST, service, DTO
```

Le cœur (`gpx`, `track`, `model`, `engine`, `report`) est en Java pur : il ne dépend pas de Spring
et pourra être réutilisé tel quel (CLI, appli mobile via une API, batch de calibration...).

## Feuille de route

- [x] **v0.1** : GPX, roadbook, heures de passage, barrières, 3 scénarios, nuit
- [ ] **v0.1-front** : React + TypeScript, carte Leaflet, profil altimétrique, tableau imprimable, PWA hors ligne
- [ ] **v0.2** : plan nutrition / hydratation par tronçon, checklist matériel obligatoire
- [ ] **v0.3** : import de l'historique (Strava/Garmin) et calibration par tranche de pente (montée/descente)
- [ ] **v0.4** : mode assistance (crew) : où et quand retrouver le coureur
