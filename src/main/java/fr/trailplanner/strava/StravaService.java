package fr.trailplanner.strava;

import com.fasterxml.jackson.databind.JsonNode;
import fr.trailplanner.engine.RunnerCalibration;
import fr.trailplanner.engine.RunnerProfile;
import fr.trailplanner.engine.TrainingHistory;
import fr.trailplanner.engine.TrainingSource;
import fr.trailplanner.model.TrainingSession;
import org.springframework.http.HttpStatus;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
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

/**
 * Connexion d'un compte Strava, import des sorties comme références, et historique d'entraînement.
 * Les jetons de chaque coureur sont dans sa {@link StravaSession} (cookie de son navigateur).
 */
public class StravaService {

    /** Sports gardés : « Course à pied » et « Trail ». */
    static final Set<String> RUNNING = Set.of("Run", "TrailRun");
    /** Avec la randonnée, en option pour le volume d'entraînement (reconnaissances, sorties avec D+). */
    static final Set<String> RUNNING_AND_HIKING = Set.of("Run", "TrailRun", "Hike");
    /** Un calcul de plan relit l'historique : on le garde un moment pour ménager le quota de Strava. */
    static final Duration CACHE_TTL = Duration.ofMinutes(10);
    /** Historiques gardés en mémoire (un par coureur). */
    static final int CACHE_SIZE = 50;
    /** Type de sortie « Course » pour une activité de course à pied. */
    static final int RACE_WORKOUT = 1;
    static final int PER_PAGE = 200;
    /** 10 pages de 200 : de quoi couvrir des années d'entraînement sans épuiser le quota de Strava. */
    static final int MAX_PAGES = 10;
    /** Profil du coureur : sorties lues (une requête chacune, le quota de Strava est de 100 par quart d'heure). */
    static final int PROFILE_ACTIVITIES = 15;
    static final Duration PROFILE_MIN_DURATION = Duration.ofHours(1);
    static final double PROFILE_MIN_GAIN_M = 200;

    /**
     * Origine de l'appli mobile : au retour de Strava, on la rouvre par son lien ({@code ravitime://strava?…}) au lieu
     * d'une adresse web.
     */
    public static final String APP_ORIGIN = "app:";

    /** En local, l'appli peut être servie par Vite sur un autre port que l'API. */
    private static final Pattern LOCAL_ORIGIN = Pattern.compile("^http://(localhost|127\\.0\\.0\\.1)(:\\d{1,5})?$");
    private static final int MAX_PENDING = 200;

    private final StravaProperties props;
    private final StravaClient client;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    /** Connexions en cours : state → adresse de l'appli à laquelle revenir. */
    private final Map<String, String> pending = new LinkedHashMap<>();
    /** Dernières activités lues (tous sports gardés) d'un coureur, depuis {@code since}, lues à {@code at}. */
    private record Cached(LocalDate since, Instant at, List<StravaActivity> activities) {}
    private final Map<String, Cached> cache = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
            return size() > CACHE_SIZE;
        }
    };

    public StravaService(StravaProperties props, StravaClient client, Clock clock) {
        this.props = props;
        this.client = client;
        this.clock = clock;
    }

    public StravaStatus status(StravaSession session) {
        Optional<StravaToken> token = props.configured() ? session.token() : Optional.empty();
        String problem = props.configured() ? null : props.problem();
        return new StravaStatus(props.configured(), token.isPresent(), token.map(StravaToken::athlete).orElse(null), problem);
    }

    /**
     * Adresse de la page d'autorisation de Strava. {@code origin} est l'adresse de l'appli, où revenir
     * ensuite : une adresse locale, ou celle du serveur lui-même ({@code serverOrigin}) une fois en ligne.
     */
    public String authorize(String origin, String serverOrigin) {
        if (!props.configured()) {
            throw StravaException.notConfigured(props.problem());
        }
        String base = "app".equals(origin) ? APP_ORIGIN : trim(origin);
        if (!base.equals(APP_ORIGIN) && !LOCAL_ORIGIN.matcher(base).matches() && !base.equals(trim(serverOrigin))) {
            throw new IllegalArgumentException("Adresse de l'appli inconnue : " + origin);
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
        // Strava revient toujours sur l'API : sur le serveur lui-même pour l'appli mobile, qui est rouverte ensuite.
        String api = base.equals(APP_ORIGIN) ? trim(serverOrigin) : base;
        return client.authorizeUrl(api + "/api/strava/callback", state);
    }

    private static String trim(String origin) {
        return origin == null ? "" : origin.replaceAll("/+$", "");
    }

    /**
     * Retour de Strava après l'autorisation : les jetons vont dans {@code session}. Renvoie l'adresse de
     * l'appli où envoyer le navigateur, avec le résultat : {@code ?strava=connected}, {@code denied} ou {@code error}.
     */
    public String callback(String state, String code, String error, String scope, StravaSession session) {
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
            session.update(client.exchange(code));
            return origin + "/?strava=connected";
        } catch (StravaException e) {
            return origin + "/?strava=error";
        }
    }

    /** Sorties de course à pied et de trail depuis {@code since}, les plus récentes d'abord. */
    public List<StravaActivity> activities(StravaSession session, LocalDate since) {
        return fetch(session, since, RUNNING);
    }

    /** Historique d'entraînement du coureur de {@code session} (vide s'il n'a pas connecté Strava). */
    public TrainingSource source(StravaSession session) {
        return (since, includeHikes) -> history(session, since, includeHikes);
    }

    Optional<TrainingHistory> history(StravaSession session, LocalDate since, boolean includeHikes) {
        Optional<StravaToken> token = session.token();
        if (!props.configured() || token.isEmpty()) {
            return Optional.empty();
        }
        String key = key(token.get());
        Instant now = clock.instant();
        Cached cached;
        synchronized (cache) {
            cached = cache.get(key);
        }
        if (cached == null || cached.since().isAfter(since) || cached.at().plus(CACHE_TTL).isBefore(now)) {
            cached = new Cached(since, now, fetch(session, since, RUNNING_AND_HIKING));
            synchronized (cache) {
                cache.put(key, cached);
            }
        }
        List<TrainingSession> sessions = cached.activities().stream()
                .filter(a -> !a.date().isBefore(since))
                .filter(a -> includeHikes || RUNNING.contains(a.sportType()))
                .map(a -> new TrainingSession(a.date(), a.distanceKm(), a.elevationGainM(), a.sportType()))
                .toList();
        return Optional.of(new TrainingHistory(since, sessions));
    }

    private static String key(StravaToken token) {
        return token.athleteId() > 0 ? "athlete:" + token.athleteId() : "token:" + token.refreshToken();
    }

    private List<StravaActivity> fetch(StravaSession session, LocalDate since, Set<String> sports) {
        String access = accessToken(session);
        long after = since.atStartOfDay(ZoneOffset.UTC).toEpochSecond();
        List<StravaActivity> result = new ArrayList<>();
        for (int page = 1; page <= MAX_PAGES; page++) {
            int current = page;
            JsonNode items = call(session, () -> client.activities(access, after, current, PER_PAGE));
            for (JsonNode item : items) {
                toActivity(item, sports).ifPresent(result::add);
            }
            if (items.size() < PER_PAGE) {
                break;
            }
        }
        result.sort(Comparator.comparing(StravaActivity::date).reversed());
        return result;
    }

    /**
     * Profil personnel du coureur (pente et fatigue, voir {@link RunnerCalibration}), mesuré sur ses sorties de course à
     * pied et de trail de l'année : les {@value #PROFILE_ACTIVITIES} plus parlantes (du dénivelé, de la durée, les
     * courses d'abord), une requête Strava chacune.
     */
    public MeasuredProfile profile(StravaSession session) {
        LocalDate since = LocalDate.now(clock).minusYears(1);
        List<StravaActivity> chosen = fetch(session, since, RUNNING).stream()
                .filter(a -> a.movingTime().compareTo(PROFILE_MIN_DURATION) >= 0)
                .filter(a -> a.race() || a.elevationGainM() >= PROFILE_MIN_GAIN_M)
                .sorted(Comparator.comparingDouble(StravaService::profileScore).reversed())
                .limit(PROFILE_ACTIVITIES)
                .toList();
        if (chosen.isEmpty()) {
            throw new IllegalArgumentException("Pas encore de sortie qui s'y prête sur Strava cette année : il faut des "
                    + "sorties d'au moins 1 h avec du dénivelé (" + Math.round(PROFILE_MIN_GAIN_M) + " m de D+ ou plus).");
        }
        String access = accessToken(session);
        List<RunnerCalibration.Activity> activities = new ArrayList<>();
        List<Long> sources = new ArrayList<>();
        for (StravaActivity a : chosen) {
            JsonNode streams = call(session, () -> client.streams(access, a.id()));
            toStreams(streams, a).ifPresent(activity -> {
                activities.add(activity);
                sources.add(a.id());
            });
        }
        RunnerProfile profile = RunnerCalibration.calibrate(activities).orElseThrow(() -> new IllegalArgumentException(
                "Pas assez de mesures dans tes sorties Strava (GPS et altitude) pour calculer ton profil."));
        return new MeasuredProfile(profile, List.copyOf(sources));
    }

    /**
     * Retour de course : l'activité lue point par point (temps tous les 100 m) et la fatigue mesurée dessus, à coût de
     * pente donné par le profil du coureur s'il en a un.
     */
    public RaceReview review(StravaSession session, long activityId, RunnerProfile runner) {
        String access = accessToken(session);
        JsonNode streams = call(session, () -> client.streams(access, activityId));
        RunnerCalibration.Activity race = toStreams(streams, null, true).orElseThrow(() -> new IllegalArgumentException(
                "Cette activité n'a pas d'enregistrement exploitable (distance, temps et altitude)."));
        Double fatigue = RunnerCalibration.raceFatigue(race, RunnerProfile.factor(runner)).orElse(null);
        double[] t = race.timeS(), d = race.distanceM();
        boolean[] moving = race.moving();
        List<double[]> points = new ArrayList<>();
        points.add(new double[] {0, 0, 0});
        double movingS = 0;
        double next = 100;
        for (int i = 1; i < t.length; i++) {
            double dt = t[i] - t[i - 1];
            if (dt > 0 && (moving == null || moving[i])) {
                movingS += dt;
            }
            if (d[i] >= next) {
                points.add(new double[] {round2(d[i] / 1000), round2((t[i] - t[0]) / 60), round2(movingS / 60)});
                while (next <= d[i]) {
                    next += 100;
                }
            }
        }
        int last = t.length - 1;
        // L'arrivée, au-delà du dernier multiple de 100 m
        if (d[last] / 1000 > points.get(points.size() - 1)[0]) {
            points.add(new double[] {round2(d[last] / 1000), round2((t[last] - t[0]) / 60), round2(movingS / 60)});
        }
        return new RaceReview(activityId, fatigue, round2(d[last] / 1000), round2((t[last] - t[0]) / 60),
                round2(movingS / 60), points);
    }

    private static double round2(double v) {
        return Math.round(v * 100) / 100.0;
    }

    /** Les courses et les sorties longues et vallonnées en disent le plus. */
    static double profileScore(StravaActivity a) {
        return (a.race() ? 2 : 1) * (a.distanceKm() + a.elevationGainM() / 100.0);
    }

    static Optional<RunnerCalibration.Activity> toStreams(JsonNode json, StravaActivity a) {
        return toStreams(json, a.date(), a.race());
    }

    static Optional<RunnerCalibration.Activity> toStreams(JsonNode json, LocalDate date, boolean race) {
        double[] time = numbers(json.path("time").path("data"));
        double[] distance = numbers(json.path("distance").path("data"));
        double[] altitude = numbers(json.path("altitude").path("data"));
        JsonNode movingData = json.path("moving").path("data");
        if (time.length < 10 || distance.length != time.length || altitude.length != time.length) {
            return Optional.empty();
        }
        boolean[] moving = null;
        if (movingData.isArray() && movingData.size() == time.length) {
            moving = new boolean[time.length];
            for (int i = 0; i < moving.length; i++) {
                moving[i] = movingData.get(i).asBoolean(true);
            }
        }
        return Optional.of(new RunnerCalibration.Activity(date, race, time, distance, altitude, moving));
    }

    private static double[] numbers(JsonNode data) {
        if (!data.isArray()) {
            return new double[0];
        }
        double[] out = new double[data.size()];
        for (int i = 0; i < out.length; i++) {
            out[i] = data.get(i).asDouble();
        }
        return out;
    }

    /** Révoque l'accès chez Strava (au mieux) et oublie les jetons. */
    public void disconnect(StravaSession session) {
        Optional<StravaToken> token = session.token();
        session.clear();
        token.ifPresent(t -> {
            synchronized (cache) {
                cache.remove(key(t));
            }
            try {
                client.deauthorize(t.accessToken());
            } catch (StravaException ignored) {
                // Jeton déjà révoqué ou Strava injoignable : les jetons sont oubliés de toute façon.
            }
        });
    }

    static Optional<StravaActivity> toActivity(JsonNode a, Set<String> sports) {
        String sport = a.path("sport_type").asText(a.path("type").asText(""));
        if (!sports.contains(sport)) {
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

    private String accessToken(StravaSession session) {
        if (!props.configured()) {
            throw StravaException.notConfigured(props.problem());
        }
        StravaToken token = session.token().orElseThrow(StravaException::notConnected);
        if (token.expiresSoon(clock.instant())) {
            StravaToken current = token;
            token = call(session, () -> client.refresh(current));
            session.update(token);
        }
        return token.accessToken();
    }

    /** Un refus de Strava veut dire que l'accès a été révoqué : on oublie les jetons, il faudra se reconnecter. */
    private <T> T call(StravaSession session, java.util.function.Supplier<T> request) {
        try {
            return request.get();
        } catch (StravaException e) {
            if (e.status() == HttpStatus.UNAUTHORIZED) {
                session.clear();
            }
            throw e;
        }
    }
}
