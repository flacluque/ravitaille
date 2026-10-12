package fr.trailplanner.strava;

import org.springframework.http.HttpStatus;

/** Échec d'un échange avec Strava, avec le statut à renvoyer au front et un message pour le coureur. */
public class StravaException extends RuntimeException {

    private final HttpStatus status;

    public StravaException(HttpStatus status, String message) {
        this(status, message, null);
    }

    public StravaException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }

    static StravaException notConfigured(String problem) {
        return new StravaException(HttpStatus.SERVICE_UNAVAILABLE, problem
                + " Crée une application sur strava.com/settings/api, renseigne trailplanner.strava.client-id et "
                + "client-secret dans config/application.properties (voir le README), puis redémarre l'API.");
    }

    static StravaException notConnected() {
        return new StravaException(HttpStatus.UNAUTHORIZED, "Connecte ton compte Strava pour importer tes activités.");
    }
}
