# Champ de données Connect IQ « Prochain Ravito »

Champ pour montre Garmin à écran rond (fēnix 6, 7 et 8, epix, Enduro, Forerunner, vívoactive et Venu : liste dans
`manifest.xml`) : le **prochain ravito de ton plan**, la distance pour y arriver,
l'**heure d'arrivée estimée** et ton **écart au plan**. À 300 m d'un ravito, la montre vibre trois fois, quel que
soit l'écran affiché (et le champ affiche « RAVITO DANS xxx M »). Il ne lit pas les points du parcours : les virages ajoutés par
Garmin Connect ne le gênent pas, et il marche même sans parcours chargé.

## Le calcul

Le site génère un **code du plan** (`TP1;…`, voir `frontend/src/lib/ciq.ts`, qui sert de référence testée) :
l'heure du départ, l'effort selon la pente cumulé à chaque km de la trace, et pour chaque ravito son km et ses heures
d'arrivée et de départ prévues.

Avec la distance et le temps écoulé donnés par la montre :

- **prochain ravito** : le premier dont le km est au-delà de ta position ;
- **écart au plan** = ton temps écoulé − le temps prévu au même km. Entre deux ravitos, le temps prévu suit le
  terrain (montées et descentes, comme le calcul du plan), pas une allure régulière. Au ravito, l'arrêt prévu ne
  compte pas comme du retard ;
- **arrivée estimée** = heure prévue au ravito + écart.

## Compiler et installer (sur ton ordinateur)

1. Installe le **SDK Connect IQ** avec le *SDK Manager* (developer.garmin.com/connect-iq/sdk, compte Garmin),
   puis télécharge dans le SDK Manager **tous les appareils listés dans `manifest.xml`** : l'export compile le champ
   pour chacun. Un appareil inconnu de ton SDK bloque la compilation : `Ctrl/Cmd+Shift+P` → « Monkey C: Edit Products »
   pour cocher ou décocher les montres (certaines, comme la vívoactive 6 ou la Forerunner 970, demandent un SDK récent).
2. Installe **Visual Studio Code** et l'extension **Monkey C** (Garmin). `Ctrl/Cmd+Shift+P` →
   « Monkey C: Generate a Developer Key » (une seule fois).
3. Ouvre le dossier `connectiq/`. Pour essayer sur le **simulateur** : Exécuter › Exécuter sans débogage, puis
   choisir l'appareil (`fenix7xpro` pour une Fenix 7X Pro). Dans le simulateur : File › Edit Persistent Storage ›
   Edit Application.Properties data pour coller un code ; Simulation › Activity Data (distance en m, temps en ms)
   ou Simulation › FIT Data › Playback File pour faire avancer la course.
4. Sur la montre, par le **store Connect IQ en bêta** (sans câble) :
   - « Monkey C: Export Project » produit un `.iq` ;
   - sur **apps-developer.garmin.com** (compte Garmin) : téléverser le `.iq` en **application bêta**, visible de toi
     seul (pour une nouvelle version : l'ajouter à la même fiche) ;
   - sur le téléphone, ouvrir `https://apps.garmin.com/fr-FR/apps/<identifiant de l'appli>` et l'installer depuis
     l'appli Connect IQ. Une appli bêta n'apparaît pas dans la recherche du store.

   Chaque modèle de montre est un appareil distinct (la 7X Pro n'est pas la 7X) : il doit figurer dans
   `manifest.xml`, sinon le champ est invisible pour lui.

## Avant d'ajouter des montres au store

Dans le simulateur, vérifier au moins un petit écran (`fr255s`, 218 px), un grand AMOLED (`fr965`, 454 px) et une
ancienne montre (`fenix6`) : textes qui ne débordent pas de l'écran rond, et mémoire (File › View Memory) avec le code
d'une longue course (100 km et plus). Instinct et écrans rectangulaires ne sont pas encore pris en charge.

## Pour chaque course

1. Sur le site : « Télécharger ▾ › Parcours pour ma Garmin », section **Champ Prochain Ravito** : copie le code.
2. Appli Connect IQ du téléphone › Prochain Ravito › **Réglages** : colle le code, enregistre.
3. Sur la montre : réglages de l'activité Trail › Écrans de données : ajoute le champ (seul pour la version
   complète, ou dans un écran à 2 champs pour la version compacte, de préférence sur l'écran que tu regardes le plus).

Pas d'écran d'alerte à 300 m : celui d'un champ Connect IQ ne s'affiche que si l'on regarde déjà la page du champ, et
aucun réglage de la montre ne le change (fēnix 7 Pro : pas de Connect IQ dans Réglages › Alarmes). La vibration en
trois temps prévient, quel que soit l'écran.

## À vérifier sur la montre

Le champ tourne sur le simulateur et sur une Fenix 7X Pro (installé en bêta depuis le store). Reste à vérifier :
que les réglages de l'appli Connect IQ acceptent un code de 500 à 1 000 caractères, et que la vibration en trois temps
se distingue bien en course.

## Publication sur le store

`manifest.xml` porte l'identifiant de la **version publique** et le réglage « Code du plan » est vide par défaut.
Pour une version bêta de test, remettre l'identifiant bêta (en commentaire dans `manifest.xml`). Textes de la fiche
du store : `STORE.md`.
