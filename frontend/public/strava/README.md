# Marques Strava officielles

Strava demande d'utiliser ses fichiers tels quels (https://developers.strava.com/guidelines/). Télécharge le pack
officiel depuis cette page et place ici, sous ces noms :

| Fichier attendu                    | Fichier du pack Strava                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| `connect-with-strava-orange.svg`   | bouton « Connect with Strava », orange (`btn_strava_connectwith_orange`) |
| `connect-with-strava-white.svg`    | bouton « Connect with Strava », blanc (`btn_strava_connectwith_light`)   |
| `powered-by-strava-orange.svg`     | logo « Powered by Strava », horizontal, orange (`api_logo_pwrdBy_strava_horiz_orange`) |
| `powered-by-strava-white.svg`      | logo « Powered by Strava », horizontal, blanc, pour le thème sombre (`api_logo_pwrdBy_strava_horiz_white`) |

Les noms du pack peuvent varier d'une version à l'autre : prends le fichier qui correspond à la description. Si un
fichier manque, l'appli affiche à sa place un texte sobre (`components/StravaBrand.tsx`), qui ne suffit pas pour la
validation de Strava.
