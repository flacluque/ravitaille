package fr.trailplanner.strava;

import java.util.Optional;

/**
 * Connexion Strava du navigateur qui fait la requête : les jetons voyagent dans un cookie chiffré
 * (voir {@link StravaCookies}), rien n'est gardé sur le serveur. Le service peut les renouveler ou
 * les oublier ; le contrôleur réécrit alors le cookie.
 */
public final class StravaSession {

    private StravaToken token;
    private boolean changed;

    private StravaSession(StravaToken token) {
        this.token = token;
    }

    public static StravaSession of(StravaToken token) {
        return new StravaSession(token);
    }

    public static StravaSession none() {
        return new StravaSession(null);
    }

    public Optional<StravaToken> token() {
        return Optional.ofNullable(token);
    }

    /** Les jetons ont changé (connexion, renouvellement, oubli) : le cookie est à réécrire. */
    public boolean changed() {
        return changed;
    }

    void update(StravaToken token) {
        this.token = token;
        this.changed = true;
    }

    void clear() {
        if (token != null) {
            token = null;
            changed = true;
        }
    }
}
