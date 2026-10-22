# Champ de données Connect IQ « Trail Planner »

Champ pour montre Garmin (Fenix 7, 7S, 7X et leurs versions Pro pour l'instant) : le **prochain ravito de ton plan**, la distance pour y arriver,
l'**heure d'arrivée estimée** et ton **écart au plan**. À 300 m d'un ravito, la montre vibre et affiche une alerte
« RAVITO DANS 300 M ». Il ne lit pas les points du parcours : les virages ajoutés par
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
   puis télécharge dans le SDK Manager les appareils de la gamme **fēnix 7** (7, 7S, 7X, et les versions Pro) :
   l'export compile le champ pour chacun.
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

## Pour chaque course

1. Sur le site : « Télécharger ▾ › Parcours pour ma Garmin », section **Champ Trail Planner** : copie le code.
2. Appli Connect IQ du téléphone › Trail Planner › **Réglages** : colle le code, enregistre.
3. Sur la montre : réglages de l'activité Trail › Écrans de données : ajoute le champ (seul pour la version
   complète, ou dans un écran à 2 champs pour la version compacte).

## À vérifier sur la montre

Le champ tourne sur le simulateur et sur une Fenix 7X Pro (installé en bêta depuis le store). Reste à vérifier :
que les réglages de l'appli Connect IQ acceptent un code de 500 à 1 000 caractères, l'alerte à 300 m et la
lisibilité en course.

## Publication sur le store

`manifest.xml` porte l'identifiant de la **version publique** et le réglage « Code du plan » est vide par défaut.
Pour une version bêta de test, remettre l'identifiant bêta (en commentaire dans `manifest.xml`). Textes de la fiche
du store : `STORE.md`.
