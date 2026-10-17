---
target: toute l appli (critique)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/trail-planner/frontend/src/App.tsx"
target_fingerprint: "sha256:36919ed3faec97e42539e85c9f89ad5ceee77a0d75cc967dfe1b944db9733a28"
target_path: /home/user/trail-planner/frontend/src/App.tsx
timestamp: 2026-10-17T19-02-51Z
slug: frontend-src-app-tsx
---
Méthode : double évaluation (A : revue de design · B : détecteur + navigateur), cible frontend/src/App.tsx (toute l'appli), bureau 1280 et téléphone 390, clair et sombre.

## Score de santé du design : 26/40 (Acceptable, haut de fourchette)
| # | Heuristique | Note | Problème principal |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | « D'après l'heure, sans recalage » en tête de « En course » est opaque |
| 2 | Correspondance avec le monde réel | 3 | Vocabulaire roadbook excellent, mais « recalage », « scénario », « km-effort » restent du jargon d'outil |
| 3 | Contrôle et liberté | 2 | « Je suis à … » enregistre en un tap, sans confirmation ni annulation immédiate |
| 4 | Cohérence | 2 | Panneau Exemple/Ma course + références répété sur Ravitos, Sac, Analyse ; deux styles de sélecteur de scénario |
| 5 | Prévention des erreurs | 2 | Recalage possible très tôt ; « Lire un roadbook » actif quand l'IA est indisponible |
| 6 | Reconnaissance plutôt que rappel | 3 | Axe d'altitude du profil sans unité |
| 7 | Flexibilité | 3 | Liens profonds, PDF, clavier sur le profil, hors ligne |
| 8 | Esthétique et minimalisme | 3 | Déroulé des Ravitos : ~20 cartes de même poids |
| 9 | Récupération après erreur | 2 | Message développeur (variable d'environnement Gemini) et erreur brute « Calcul impossible : … » |
| 10 | Aide et documentation | 3 | Légende « ? » flottante qui chevauche le tableau |

## Spécificité du design
Clairement pensé pour le trail : codes roadbook, vue « En course » feuilletable, vocabulaire coureur, hero qui vire à l'ambre. Deux zones restent génériques : l'Accueil (schéma SaaS hero + grille + étapes + cartes) et les cartes blanches arrondies de « Mon plan ». Le roadbook ne s'exprime vraiment que dans « En course » et la page assistance.
Détecteur : 1 résultat CLI (border-accent-on-rounded sur .cv-next-head, faux positif : séparateur horizontal) ; navigateur : 11 × line-length sur #algorithme (vrai positif, lignes de 102 à 130 caractères), cramped-padding sur l'attribution Leaflet (faux positif, tiers), cream-palette global (choix de style, pas un défaut). Aucun échec de contraste, aucun élément sans nom accessible, pas de débordement horizontal à 390 px.

## Points forts
1. « En course » : un vrai roadbook de poche (un point par écran, heure > marge > tronçon > à faire, gros bouton au pouce).
2. Statuts lisibles sans couleur : texte en clair + forme (cercle, triangle, carré, anneau), contrastes ≥ 4,5:1 partout.
3. Page assistance orientée action : « Sois là avant », fourchette, checklist, temps de route.

## Problèmes prioritaires
1. [P1] Le pire scénario est caché par défaut : hero vert « 1h04 de marge » (réaliste) alors que Prudent est « serré : 0h58 » ; colonne Prudent coupée dans Analyse > Comparaison à 1280 px. Correctif : marge minimale tous scénarios dans le hero, comparaison sans coupure. → /impeccable clarify
2. [P1] « Je suis à … » irréversible et à tout moment : un tap dans la poche décale les marges et le lien de l'assistance. Correctif : toast « Recalé à 17h40 · Annuler », confirmation si l'heure est loin de l'arrivée prévue, statut reformulé. → /impeccable harden
3. [P2] Architecture des pages secondaires : panneau Exemple/Ma course + références répété hors de « Mon plan », et au fond de la page sur téléphone (Jordan ne trouve pas comment passer à sa course). Correctif : le limiter à Mon plan, en haut sur téléphone. → /impeccable layout
4. [P2] Erreurs techniques montrées au coureur (variable d'environnement, erreur brute) et bouton principal actif alors qu'inutilisable. Correctif : messages humains, « Saisir à la main » en principal quand l'IA est indisponible. → /impeccable harden
5. [P2] Lisibilité et cibles : lignes de 102 à 130 caractères sur « Comment ça marche » ; cibles tactiles sous 44 px (renvois [1]…[13], liens « Modifier », « Tableau détaillé », bouton « ? » de 40 px qui chevauche le tableau mobile, badge de marge cassé sur 3 lignes). → /impeccable adapt puis /impeccable typeset

## Signaux par persona
- Casey (mobile) : recalage sans annulation ; « ? » masque « km 33,0 » ; badge « 10h25 / de / marge » sur 3 lignes ; flèches ‹ › petites.
- Jordan (première visite) : « EXEMPLE » partout et sélecteur Exemple/Ma course en bas de page ; « Ma course » s'ouvre sur une erreur de configuration ; scénarios non expliqués ; « fourchette 01h12 – 04h20 » sans jour.
- Sam (clavier, lecteur d'écran) : lignes du tableau des passages non atteignables au clavier ; Déroulé/Réglages en role="tab" sans tabpanel ni flèches ; feuille « Plus » sans aria-modal ni piège de focus ; libellé du profil (101,5 km) qui contredit l'en-tête (103 km).

## Observations mineures
Menu PDF qui change de place ; sélecteur de scénario dupliqué dans Analyse ; avertissements qui répètent le hero ; carte gris clair en sombre sans tuiles ; deux boutons pleins empilés dans Réglages ; niveau 70 g/h non mis en évidence ; « Saisir un passage » au-dessus du rendez-vous sur la page assistance ; 7 options de marge ; temps de route qui part du Départ par défaut ; sommaire de « Comment ça marche » qui déborde légèrement sur bureau ; fin de course (« Bravo ! ») bien sobre pour 15 h d'effort.

## Questions à se poser
1. Si la vraie question est « est-ce que je passe la barrière ? », pourquoi le plan s'ouvre-t-il sur le scénario médian plutôt que sur le pire ?
2. « En course » est la vue la plus réussie : pourquoi « Mon plan » n'adopte-t-il pas la même grammaire roadbook au lieu de cartes ?
3. L'assistance a-t-elle besoin d'un temps de route depuis le Départ, ou faut-il partir par défaut du rendez-vous précédent ?
