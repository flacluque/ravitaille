# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

L'appli iPhone (Capacitor, `frontend/ios`) d'abord ; Android viendra plus tard avec la même structure et ses propres
conventions. Le même code React sert aussi le site : sur téléphone, le site suit le design de l'appli ; sur
ordinateur, il garde sa mise en page large.

## Users

Des traileurs et ultra-traileurs qui préparent une course précise (30 à 170 km, souvent de nuit, avec barrières
horaires et ravitaillements), seuls ou avec une assistance (proche qui les suit et les attend aux ravitos). Ils
préparent le plan les semaines et la veille de la course, chez eux ; le jour J, ils le consultent en courant, au
téléphone ou sur leur montre (Garmin surtout). Presque tous ont Strava.

## Product Purpose

Ravitime calcule les heures de passage à chaque ravito d'une course, à partir des courses passées du coureur
(références, ou importées de Strava), et en tire tout ce qui se prépare : marges sur les barrières horaires, nuit,
nutrition ravito par ravito, sac et matériel obligatoire, plan sur la montre (.fit / champ Connect IQ « Prochain
Ravito », ou .gpx), lien de suivi pour l'assistance, retour de course. Réussite : le coureur arrive aux ravitos à
l'heure annoncée, sans mauvaise surprise sur les barrières.

## Positioning

Pas de moyenne générique : le plan part des propres temps du coureur, convertis en kilomètres-effort, avec son coût
personnel selon la pente et sa fatigue mesurés sur Strava, et trois scénarios (optimiste, réaliste, prudent). Le
roadbook officiel (photo ou PDF) est lu par l'IA, les ravitos se placent sur la trace GPX.

## Operating Context

- Préparation : saisir ou importer la course (roadbook, trace GPX), ses références (Strava ou à la main), régler
  nutrition et matériel, comparer les scénarios.
- Jour J : vue « En course » (prochain ravito, avance/retard, pointage), montre Garmin avec le parcours .fit et le
  champ Prochain Ravito, PDF dans la poche, lien envoyé à l'assistance.
- Après : retour de course depuis l'activité Strava, qui affine la fatigue pour les plans suivants.
- Souvent hors réseau en montagne : le dernier plan reste disponible sans connexion.

## Capabilities and Constraints

- Front React + TypeScript (Vite) dans `frontend/`, API Spring Boot ; appli iOS par Capacitor (Strava dans le
  navigateur intégré, retour par `ravitime://`, partage iOS des fichiers).
- Onglets actuels : Accueil, Mon plan, En course, Ravitos, Sac, Analyse détaillée, Comment ça marche ; exports PDF,
  montre ; exemple embarqué (Raid des Bogomiles 2026).
- Pas de compte pour l'instant : tout est gardé dans le navigateur / l'appli. Comptes, Premium (annuel ou pass course)
  et réglages : décidés dans le principe, pas encore construits.
- Accès en test par code d'invitation.
- Strava : lecture seule ; marque et logo Strava à respecter (règles d'affichage de Strava).

## Brand Commitments

- Nom : Ravitime (site et appli) ; champ Garmin : Prochain Ravito.
- Vouvoiement exclu : l'appli tutoie le coureur, en français, ton direct et concret.
- Couleurs et icône existantes : vert forêt #1f4d3a, crème #f6f4ef, orange trace #e8893a ; icône montagne et trace.
- Polices embarquées Barlow (texte) et Barlow Semi Condensed (titres, heures), pour la lecture en mouvement.

## Evidence on Hand

- Exemple réel : Raid des Bogomiles 2026 (`src/main/resources/samples/bogomiles`), Trail des Troubadours.
- Aucun témoignage, chiffre d'utilisateurs ni avis : à ne pas inventer.

## Product Principles

1. Ton rythme, pas une moyenne : chaque chiffre vient des courses du coureur, et l'appli dit d'où il vient.
2. Lisible en courant : l'essentiel (prochain ravito, heure, marge) se lit d'un coup d'œil, de nuit, fatigué.
3. Strava d'abord, la saisie à la main toujours possible.
4. Rien ne se perd hors réseau.
5. Honnête sur l'incertitude : trois scénarios et des marges, pas une heure magique.

## Accessibility & Inclusion

Lecture en mouvement, de nuit, en plein soleil : contrastes forts, chiffres grands, cibles tactiles larges (gants,
doigts froids). Rien sous 12 px.
