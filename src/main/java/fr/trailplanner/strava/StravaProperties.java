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

    public boolean configured() {
        return !clientId.isBlank() && !clientSecret.isBlank();
    }

    public Path tokenPath() {
        return tokenFile.isBlank()
                ? Path.of(System.getProperty("user.home"), ".trail-planner", "strava.json")
                : Path.of(tokenFile);
    }
}
