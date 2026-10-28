---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/src/components/MobileNav.tsx"]
---

## Scope

Appli iPhone (Capacitor) et site ouvert sur téléphone (≤ 860 px) : navigation, accueil, compte « Moi », premier lancement. Le site sur ordinateur garde sa mise en page. Mode : Operate.

## Audience and job

Traileur qui prépare une course précise puis la court : voir où il en est, son heure d'arrivée et ses marges, brancher Strava pour un plan à son rythme, préparer ravitos, sac, montre et assistance.

## Direction contract

FORM: seed:d11ab270bb60456e (dégradé, sans challengers) · structure B « Tableau de bord », choisie par Flavien parmi A, B, C.
THESIS: l'appli s'ouvre sur l'état de SA course (compte à rebours, arrivée, marge la plus serrée, sac) et non sur une page de site ; elle refuse le menu « Plus » fourre-tout : quatre vraies sections, Accueil · Plan · Ravitos · Moi.
OWN-WORLD: identité existante : vert forêt #1f4d3a, crème, orange trace #e8893a, Barlow / Barlow Semi Condensed pour heures et titres ; listes groupées iOS (lignes blanches arrondies, chevrons, en-têtes de groupe), grands titres, barre d'onglets à 4 entrées, contrôles segmentés.
STORY: en un coup d'œil, le coureur sait quand il part, quand il arrive, où ça coince ; tant que le plan suit l'exemple, une alerte Strava le lui dit et ouvre la connexion. Tout ce qui le concerne (Strava, références, profil, retours de course, analyse, calcul) est dans Moi.
FIRST VIEWPORT: Accueil : grand titre = nom de la course, date et heure de départ ; quatre tuiles (départ dans N jours · arrivée prévue · marge la plus serrée · sac x/y) ; alerte Strava si références d'exemple ; lignes Ta montre, Ton assistance, PDF.
SIGNATURE: les tuiles de l'accueil en chiffres Barlow Semi Condensed, la marge la plus serrée colorée par son état ; le jour J l'accueil devient la vue En course.
RISKS: les références dans Moi, loin du plan : l'alerte d'accueil et une ligne « Ton rythme » dans Plan y mènent ; premier lancement guidé (bienvenue → ta course → ton rythme).

## Unresolved

Comptes, Premium et réglages d'abonnement : pas encore construits.
