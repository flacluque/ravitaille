package fr.trailplanner.strava;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fr.trailplanner.api.JsonSupport;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;

/** Appels HTTP à Strava : jetons OAuth et API v3. */
public class StravaClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    private final ObjectMapper mapper = JsonSupport.mapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final String baseUrl;
    private final String clientId;
    private final String clientSecret;

    public StravaClient(StravaProperties props) {
        this.baseUrl = props.baseUrl().replaceAll("/+$", "");
        this.clientId = props.clientId();
        this.clientSecret = props.clientSecret();
    }

    /** Page d'autorisation de Strava, sur laquelle on envoie le navigateur. */
    public String authorizeUrl(String redirectUri, String state) {
        return baseUrl + "/oauth/authorize?" + form(Map.of(
                "client_id", clientId,
                "response_type", "code",
                "redirect_uri", redirectUri,
                "approval_prompt", "auto",
                "scope", "activity:read_all",
                "state", state));
    }

    /** Code reçu au retour de Strava → jetons (et nom de l'athlète). */
    public StravaToken exchange(String code) {
        JsonNode json = postForm("/oauth/token", Map.of(
                "client_id", clientId, "client_secret", clientSecret, "code", code, "grant_type", "authorization_code"));
        JsonNode athlete = json.path("athlete");
        String name = (athlete.path("firstname").asText("") + " " + athlete.path("lastname").asText("")).trim();
        return token(json, name.isEmpty() ? null : name);
    }

    public StravaToken refresh(StravaToken current) {
        JsonNode json = postForm("/oauth/token", Map.of(
                "client_id", clientId, "client_secret", clientSecret,
                "refresh_token", current.refreshToken(), "grant_type", "refresh_token"));
        return token(json, current.athlete());
    }

    /** Révoque l'accès chez Strava. */
    public void deauthorize(String accessToken) {
        postForm("/oauth/deauthorize", Map.of("access_token", accessToken));
    }

    /** Une page d'activités (les plus récentes d'abord), depuis {@code after} (secondes depuis 1970). */
    public JsonNode activities(String accessToken, long after, int page, int perPage) {
        URI uri = URI.create(baseUrl + "/api/v3/athlete/activities?" + form(Map.of(
                "after", String.valueOf(after), "page", String.valueOf(page), "per_page", String.valueOf(perPage))));
        return send(HttpRequest.newBuilder(uri).timeout(TIMEOUT)
                .header("Authorization", "Bearer " + accessToken).GET().build());
    }

    private StravaToken token(JsonNode json, String athlete) {
        String access = json.path("access_token").asText(null);
        String refresh = json.path("refresh_token").asText(null);
        if (access == null || refresh == null) {
            throw new StravaException(HttpStatus.BAD_GATEWAY, "Réponse inattendue de Strava à la connexion.");
        }
        return new StravaToken(access, refresh, json.path("expires_at").asLong(), athlete);
    }

    private JsonNode postForm(String path, Map<String, String> params) {
        return send(HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(TIMEOUT)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form(params))).build());
    }

    private JsonNode send(HttpRequest request) {
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new StravaException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Strava ne répond pas : vérifie ta connexion internet, puis réessaie.", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new StravaException(HttpStatus.SERVICE_UNAVAILABLE, "Requête à Strava interrompue.", e);
        }
        int status = response.statusCode();
        if (status == 401 || status == 403) {
            throw new StravaException(HttpStatus.UNAUTHORIZED,
                    "Strava a refusé l'accès : reconnecte ton compte Strava.");
        }
        if (status == 429) {
            throw new StravaException(HttpStatus.TOO_MANY_REQUESTS,
                    "Trop de requêtes envoyées à Strava : réessaie dans un quart d'heure.");
        }
        if (status >= 400) {
            throw new StravaException(HttpStatus.BAD_GATEWAY, "Strava a répondu une erreur (HTTP " + status + ").");
        }
        try {
            return mapper.readTree(response.body());
        } catch (IOException e) {
            throw new StravaException(HttpStatus.BAD_GATEWAY, "Réponse illisible de Strava.", e);
        }
    }

    private static String form(Map<String, String> params) {
        return params.entrySet().stream()
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "="
                        + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
    }
}
