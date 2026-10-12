package fr.trailplanner.strava;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.nio.file.Path;

/**
 * Accès à Strava (application.properties, ou config/application.properties hors git pour le secret) :
 * <pre>
 * trailplanner.strava.client-id=12345
 * trailplanner.strava.client-secret=…
 * </pre>
 * L'identifiant et le secret viennent de l'application API créée sur https://www.strava.com/settings/api.
 *
 * @param baseUrl   adresse de Strava (changée dans les tests)
 * @param tokenFile où garder les jetons ; par défaut ~/.trail-planner/strava.json
 */
@ConfigurationProperties("trailplanner.strava")
public record StravaProperties(
        @DefaultValue("") String clientId,
        @DefaultValue("") String clientSecret,
        @DefaultValue("https://www.strava.com") String baseUrl,
        @DefaultValue("") String tokenFile) {

    /** Une valeur recopiée garde facilement des espaces en fin de ligne ou des guillemets : on les retire. */
    public StravaProperties {
        clientId = clean(clientId);
        clientSecret = clean(clientSecret);
    }

    public boolean configured() {
        return problem() == null;
    }

    /** Ce qui empêche la connexion à Strava, pour l'expliquer au coureur ; null si tout est en place. */
    public String problem() {
        if (clientId.isEmpty() && clientSecret.isEmpty()) {
            return "Strava n'est pas configuré.";
        }
        if (!clientId.matches("\\d+")) {
            return "trailplanner.strava.client-id doit être le nombre « Client ID » (ID client) affiché sur "
                    + "strava.com/settings/api, par exemple 123456 : ni le secret, ni un jeton d'accès.";
        }
        if (clientSecret.isEmpty()) {
            return "trailplanner.strava.client-secret manque : recopie le « Client Secret » de strava.com/settings/api.";
        }
        return null;
    }

    private static String clean(String value) {
        String v = value == null ? "" : value.strip();
        if (v.length() >= 2 && (v.startsWith("\"") && v.endsWith("\"") || v.startsWith("'") && v.endsWith("'"))) {
            v = v.substring(1, v.length() - 1).strip();
        }
        return v;
    }

    public Path tokenPath() {
        return tokenFile.isBlank()
                ? Path.of(System.getProperty("user.home"), ".trail-planner", "strava.json")
                : Path.of(tokenFile);
    }
}
