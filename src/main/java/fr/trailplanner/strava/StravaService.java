package fr.trailplanner.strava;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/** Connexion du compte Strava et import des sorties de course à pied et de trail. */
public class StravaService {

    /** Sports gardés : « Course à pied » et « Trail ». */
    static final Set<String> RUNNING = Set.of("Run", "TrailRun");
    /** Type de sortie « Course » pour une activité de course à pied. */
    static final int RACE_WORKOUT = 1;
    static final int PER_PAGE = 200;
    /** 10 pages de 200 : de quoi couvrir des années d'entraînement sans épuiser le quota de Strava. */
    static final int MAX_PAGES = 10;

    /** L'appli tourne en local : on ne renvoie le navigateur que vers une adresse locale. */
    private static final Pattern LOCAL_ORIGIN = Pattern.compile("^http://(localhost|127\\.0\\.0\\.1)(:\\d{1,5})?$");
    private static final int MAX_PENDING = 20;

    private final StravaProperties props;
    private final StravaClient client;
    private final StravaTokenStore store;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    /** Connexions en cours : state → adresse de l'appli à laquelle revenir. */
    private final Map<String, String> pending = new LinkedHashMap<>();

    public StravaService(StravaProperties props, StravaClient client, StravaTokenStore store, Clock clock) {
        this.props = props;
        this.client = client;
        this.store = store;
        this.clock = clock;
    }

    public StravaStatus status() {
        Optional<StravaToken> token = props.configured() ? store.load() : Optional.empty();
        String problem = props.configured() ? null : props.problem();
        return new StravaStatus(props.configured(), token.isPresent(), token.map(StravaToken::athlete).orElse(null), problem);
    }

    /** Adresse de la page d'autorisation de Strava ; {@code origin} est l'adresse de l'appli (ex. http://localhost:5173). */
    public String authorize(String origin) {
        if (!props.configured()) {
            throw StravaException.notConfigured(props.problem());
        }
        String base = origin == null ? "" : origin.replaceAll("/+$", "");
        if (!LOCAL_ORIGIN.matcher(base).matches()) {
            throw new IllegalArgumentException("Adresse de l'appli non locale : " + origin);
        }
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        synchronized (pending) {
            if (pending.size() >= MAX_PENDING) {
                pending.remove(pending.keySet().iterator().next());
            }
            pending.put(state, base);
        }
        return client.authorizeUrl(base + "/api/strava/callback", state);
    }

    /**
     * Retour de Strava après l'autorisation. Renvoie l'adresse de l'appli où envoyer le navigateur,
     * avec le résultat : {@code ?strava=connected}, {@code denied} ou {@code error}.
     */
    public String callback(String state, String code, String error, String scope) {
        String origin;
        synchronized (pending) {
            origin = state == null ? null : pending.remove(state);
        }
        if (origin == null) {
            throw new IllegalArgumentException("Connexion Strava inconnue ou expirée : relance-la depuis l'appli.");
        }
        if (error != null || code == null) {
            return origin + "/?strava=denied";
        }
        if (scope == null || !scope.contains("activity:read")) {
            return origin + "/?strava=scope";
        }
        try {
            store.save(client.exchange(code));
            return origin + "/?strava=connected";
        } catch (StravaException e) {
            return origin + "/?strava=error";
        }
    }

    /** Sorties de course à pied et de trail depuis {@code since}, les plus récentes d'abord. */
    public List<StravaActivity> activities(LocalDate since) {
        String access = accessToken();
        long after = since.atStartOfDay(ZoneOffset.UTC).toEpochSecond();
        List<StravaActivity> result = new ArrayList<>();
        for (int page = 1; page <= MAX_PAGES; page++) {
            int current = page;
            JsonNode items = call(() -> client.activities(access, after, current, PER_PAGE));
            for (JsonNode item : items) {
                toActivity(item).ifPresent(result::add);
            }
            if (items.size() < PER_PAGE) {
                break;
            }
        }
        result.sort(Comparator.comparing(StravaActivity::date).reversed());
        return result;
    }

    /** Révoque l'accès chez Strava (au mieux) et oublie les jetons. */
    public void disconnect() {
        Optional<StravaToken> token = store.load();
        store.delete();
        token.ifPresent(t -> {
            try {
                client.deauthorize(t.accessToken());
            } catch (StravaException ignored) {
                // Jeton déjà révoqué ou Strava injoignable : les jetons sont oubliés de toute façon.
            }
        });
    }

    static Optional<StravaActivity> toActivity(JsonNode a) {
        String sport = a.path("sport_type").asText(a.path("type").asText(""));
        if (!RUNNING.contains(sport)) {
            return Optional.empty();
        }
        String start = a.path("start_date_local").asText("");
        if (start.length() < 10 || a.path("elapsed_time").asLong() <= 0 || a.path("distance").asDouble() <= 0) {
            return Optional.empty();
        }
        return Optional.of(new StravaActivity(
                a.path("id").asLong(),
                a.path("name").asText("").trim(),
                // start_date_local est l'heure locale, malgré le « Z » final : seul le jour compte.
                LocalDate.parse(start.substring(0, 10)),
                sport,
                Math.round(a.path("distance").asDouble() / 10) / 100.0,
                Math.round(a.path("total_elevation_gain").asDouble()),
                Duration.ofSeconds(a.path("elapsed_time").asLong()),
                Duration.ofSeconds(a.path("moving_time").asLong()),
                a.path("workout_type").asInt(-1) == RACE_WORKOUT));
    }

    private String accessToken() {
        if (!props.configured()) {
            throw StravaException.notConfigured(props.problem());
        }
        StravaToken token = store.load().orElseThrow(StravaException::notConnected);
        if (token.expiresSoon(clock.instant())) {
            token = call(() -> client.refresh(store.load().orElseThrow(StravaException::notConnected)));
            store.save(token);
        }
        return token.accessToken();
    }

    /** Un refus de Strava veut dire que l'accès a été révoqué : on oublie les jetons, il faudra se reconnecter. */
    private <T> T call(java.util.function.Supplier<T> request) {
        try {
            return request.get();
        } catch (StravaException e) {
            if (e.status() == HttpStatus.UNAUTHORIZED) {
                store.delete();
            }
            throw e;
        }
    }
}
