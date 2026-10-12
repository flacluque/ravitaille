package fr.trailplanner.strava;

import java.time.Instant;

/**
 * Jetons OAuth de Strava. Le jeton d'accès vit 6 h ; le jeton de rafraîchissement en donne un nouveau.
 *
 * @param expiresAt fin de validité du jeton d'accès, en secondes depuis 1970
 * @param athlete   prénom et nom de l'athlète connecté, pour l'affichage
 */
public record StravaToken(String accessToken, String refreshToken, long expiresAt, String athlete) {

    /** Expiré, ou sur le point de l'être : mieux vaut le renouveler avant la requête. */
    boolean expiresSoon(Instant now) {
        return now.getEpochSecond() >= expiresAt - 60;
    }
}
