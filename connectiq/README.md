# Champ de données Connect IQ « Trail Planner »

Champ pour montre Garmin (Fenix 7 pour l'instant) : le **prochain ravito de ton plan**, la distance pour y arriver,
l'**heure d'arrivée estimée** et ton **écart au plan**. À 300 m d'un ravito, la montre vibre et affiche une alerte
« RAVITO DANS 300 M ». Il ne lit pas les points du parcours : les virages ajoutés par
Garmin Connect ne le gênent pas, et il marche même sans parcours chargé.

## Le calcul

Le site génère un **code du plan** (`TP1;…`, voir `frontend/src/lib/ciq.ts`, qui sert de référence testée) :
l'heure du départ, le km-effort cumulé à chaque km de la trace, et pour chaque ravito son km et ses heures
d'arrivée et de départ prévues.

Avec la distance et le temps écoulé donnés par la montre :

- **prochain ravito** : le premier dont le km est au-delà de ta position ;
- **écart au plan** = ton temps écoulé − le temps prévu au même km. Entre deux ravitos, le temps prévu suit le
  terrain (km-effort : 1 km + 1 par 100 m de D+), pas une allure régulière. Au ravito, l'arrêt prévu ne compte pas
  comme du retard ;
- **arrivée estimée** = heure prévue au ravito + écart.

## Compiler et installer (sur ton ordinateur)

1. Installe le **SDK Connect IQ** avec le *SDK Manager* (developer.garmin.com/connect-iq/sdk, compte Garmin),
   puis télécharge dans le SDK Manager l'appareil **fēnix 7**.
2. Installe **Visual Studio Code** et l'extension **Monkey C** (Garmin). `Ctrl/Cmd+Shift+P` →
   « Monkey C: Generate a Developer Key » (une seule fois).
3. Ouvre le dossier `connectiq/`, puis « Monkey C: Build for Device » → `fenix7`. Pour essayer d'abord :
   « Monkey C: Run » lance le **simulateur** (Fichier › Paramètres de l'app pour coller un code, et
   Simulation › Données d'activité pour faire avancer la course).
4. Sur la montre, deux façons :
   - **store Connect IQ en bêta** (sans câble) : « Monkey C: Export Project » produit un `.iq` à déposer sur
     apps.garmin.com/developer en **application bêta** ; elle s'installe ensuite depuis l'appli Connect IQ du
     téléphone, visible de toi seul ;
   - **câble** : copier le `.prg` dans `GARMIN/Apps` de la montre.

## Pour chaque course

1. Sur le site : « Télécharger ▾ › Parcours pour ma Garmin », section **Champ Trail Planner** : copie le code.
2. Appli Connect IQ du téléphone › Trail Planner › **Réglages** : colle le code, enregistre.
3. Sur la montre : réglages de l'activité Trail › Écrans de données : ajoute le champ (seul pour la version
   complète, ou dans un écran à 2 champs pour la version compacte).

## À vérifier sur la montre

Le champ compile et tourne sur le simulateur Fenix 7 (code du plan, prochain ravito, écart au plan). Reste à
vérifier sur la montre : l'alerte à 300 m, que les réglages de l'appli Connect IQ acceptent un code de 500 à
1 000 caractères, et la lisibilité en course sur l'écran 260 × 260.
