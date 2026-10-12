package fr.trailplanner.strava;

/**
 * @param configured identifiant et secret de l'application Strava renseignés
 * @param connected  compte Strava autorisé (jetons enregistrés)
 * @param athlete    nom de l'athlète connecté, null sinon
 */
public record StravaStatus(boolean configured, boolean connected, String athlete) {}
