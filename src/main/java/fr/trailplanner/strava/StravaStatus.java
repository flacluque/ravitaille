package fr.trailplanner.strava;

/**
 * @param configured identifiant et secret de l'application Strava renseignés
 * @param connected  compte Strava autorisé (jetons enregistrés)
 * @param athlete    nom de l'athlète connecté, null sinon
 * @param problem    ce qui cloche dans la configuration, null si rien
 */
public record StravaStatus(boolean configured, boolean connected, String athlete, String problem) {

    public StravaStatus(boolean configured, boolean connected, String athlete) {
        this(configured, connected, athlete, null);
    }
}
