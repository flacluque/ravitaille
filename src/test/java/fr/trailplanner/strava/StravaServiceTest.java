package fr.trailplanner.strava;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;

class StravaServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-12T08:00:00Z");
    private static final String SERVER = "https://trail-planner.onrender.com";

    private FakeStrava fake;
    private StravaService service;

    @BeforeEach
    void setUp() throws IOException {
        fake = new FakeStrava();
        StravaProperties props = new StravaProperties("4242", "secret", fake.url());
        service = new StravaService(props, new StravaClient(props), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @AfterEach
    void tearDown() {
        fake.close();
    }

    private static StravaSession connected(String access, long athleteId) {
        return StravaSession.of(new StravaToken(access, "r-" + access, NOW.getEpochSecond() + 3600, athleteId, null));
    }

    @Test
    void neFaitRienSansApplicationStrava() {
        StravaProperties none = new StravaProperties("", "", fake.url());
        StravaService off = new StravaService(none, new StravaClient(none), Clock.systemUTC());

        assertEquals(new StravaStatus(false, false, null, "Strava n'est pas configuré."), off.status(connected("a", 1)));
        StravaException e = assertThrows(StravaException.class, () -> off.authorize("http://localhost:5173", SERVER));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, e.status());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, assertThrows(StravaException.class,
                () -> off.activities(connected("a", 1), LocalDate.of(2025, 1, 1))).status());
    }

    @Test
    void nettoieEtVerifieLIdentifiantDeLApplication() {
        StravaProperties copied = new StravaProperties(" 123456   ", "\"secret\" ", fake.url());
        assertTrue(copied.configured());
        assertEquals("123456", copied.clientId());
        assertEquals("secret", copied.clientSecret());
        String url = new StravaClient(copied).authorizeUrl("http://localhost:5173/api/strava/callback", "s");
        assertTrue(url.matches(".*[?&]client_id=123456(&.*|$)"), url);

        StravaProperties wrong = new StravaProperties("a1b2c3d4e5f6", "secret", fake.url());
        assertFalse(wrong.configured());
        assertTrue(wrong.problem().contains("Client ID"), wrong.problem());
        StravaService service = new StravaService(wrong, new StravaClient(wrong), Clock.systemUTC());
        assertEquals(wrong.problem(), service.status(StravaSession.none()).problem());
        StravaException e = assertThrows(StravaException.class, () -> service.authorize("http://localhost:5173", SERVER));
        assertTrue(e.getMessage().startsWith(wrong.problem()));

        assertTrue(new StravaProperties("123456", "", fake.url()).problem().contains("client-secret"));
    }

    @Test
    void connecteLeCompteDansLaSessionDuNavigateur() {
        StravaSession session = StravaSession.none();
        assertEquals(new StravaStatus(true, false, null), service.status(session));
        fake.tokenBody = """
                {"access_token":"acces-1","refresh_token":"rafraichi-1","expires_at":4102444800,
                 "athlete":{"id":777,"firstname":"Flavien","lastname":"L."}}""";

        URI authorize = URI.create(service.authorize("http://localhost:5173/", SERVER));
        String query = authorize.getQuery();
        assertTrue(authorize.toString().startsWith(fake.url() + "/oauth/authorize?"), authorize.toString());
        assertTrue(query.contains("client_id=4242"));
        assertTrue(query.contains("redirect_uri=http://localhost:5173/api/strava/callback"), query);
        assertTrue(query.contains("scope=activity:read_all"));
        String state = query.replaceAll(".*state=([^&]+).*", "$1");

        String back = service.callback(state, "le-code", null, "read,activity:read_all", session);

        assertEquals("http://localhost:5173/?strava=connected", back);
        assertTrue(fake.requests.get(0).contains("code=le-code"));
        assertTrue(fake.requests.get(0).contains("grant_type=authorization_code"));
        assertTrue(fake.requests.get(0).contains("client_secret=secret"));
        assertTrue(session.changed());
        assertEquals(new StravaToken("acces-1", "rafraichi-1", 4102444800L, 777, "Flavien L."), session.token().orElseThrow());
        assertEquals(new StravaStatus(true, true, "Flavien L."), service.status(session));
        assertFalse(service.status(StravaSession.none()).connected(), "les autres navigateurs ne sont pas connectés");
    }

    @Test
    void accepteLAdresseDuServeurEnLigneEtRefuseLesAutres() {
        String url = service.authorize(SERVER + "/", SERVER);
        assertTrue(URI.create(url).getQuery().contains("redirect_uri=" + SERVER + "/api/strava/callback"), url);

        assertThrows(IllegalArgumentException.class, () -> service.authorize("https://exemple.com", SERVER));
        assertThrows(IllegalArgumentException.class, () -> service.authorize("http://localhost.exemple.com", SERVER));
        assertThrows(IllegalArgumentException.class, () -> service.authorize("http://trail-planner.onrender.com", SERVER));
        assertThrows(IllegalArgumentException.class,
                () -> service.callback("inconnu", "code", null, "activity:read_all", StravaSession.none()));

        // Un state ne sert qu'une fois.
        String state = URI.create(service.authorize("http://127.0.0.1:4173", SERVER)).getQuery().replaceAll(".*state=([^&]+).*", "$1");
        assertEquals("http://127.0.0.1:4173/?strava=connected", service.callback(state, "c", null, "activity:read_all", StravaSession.none()));
        assertThrows(IllegalArgumentException.class,
                () -> service.callback(state, "c", null, "activity:read_all", StravaSession.none()));
    }

    @Test
    void signaleUnRefusOuUnDroitManquant() {
        StravaSession session = StravaSession.none();
        assertEquals("http://localhost:5173/?strava=denied", service.callback(state(), null, "access_denied", null, session));
        assertEquals("http://localhost:5173/?strava=scope", service.callback(state(), "c", null, "read", session));
        fake.tokenStatus = 400;
        assertEquals("http://localhost:5173/?strava=error", service.callback(state(), "c", null, "activity:read_all", session));
        assertFalse(service.status(session).connected());
        assertFalse(session.changed());
    }

    @Test
    void importeLesSortiesDeCourseAPiedEtDeTrail() {
        fake.pages = List.of("""
                [{"id": 1, "name": "Trail des Cathares ", "sport_type": "TrailRun", "start_date_local": "2026-04-12T07:30:00Z",
                  "distance": 60412.3, "total_elevation_gain": 3210.4, "elapsed_time": 31680, "moving_time": 29000, "workout_type": 1},
                 {"id": 2, "name": "Vélo", "sport_type": "Ride", "start_date_local": "2026-05-01T09:00:00Z",
                  "distance": 80000, "total_elevation_gain": 900, "elapsed_time": 10000, "moving_time": 9000},
                 {"id": 3, "name": "Sortie longue", "type": "Run", "start_date_local": "2026-06-20T06:00:00Z",
                  "distance": 25000, "total_elevation_gain": 800, "elapsed_time": 9000, "moving_time": 8400, "workout_type": null}]""");

        List<StravaActivity> activities = service.activities(connected("acces-1", 1), LocalDate.of(2025, 10, 12));

        assertEquals(List.of(3L, 1L), activities.stream().map(StravaActivity::id).toList());
        StravaActivity cathares = activities.get(1);
        assertEquals("Trail des Cathares", cathares.name());
        assertEquals(LocalDate.of(2026, 4, 12), cathares.date());
        assertEquals(60.41, cathares.distanceKm());
        assertEquals(3210, cathares.elevationGainM());
        assertEquals(Duration.ofHours(8).plusMinutes(48), cathares.elapsedTime());
        assertTrue(cathares.race());
        assertFalse(activities.get(0).race());
        assertEquals("Run", activities.get(0).sportType());

        String request = fake.requests.get(0);
        assertTrue(request.contains("after=" + LocalDate.of(2025, 10, 12).atStartOfDay(ZoneOffset.UTC).toEpochSecond()), request);
        assertTrue(request.contains("per_page=200"));
        assertEquals("Bearer acces-1", fake.authorizations.get(0));
    }

    @Test
    void parcourtLesPagesJusquALaDerniere() {
        String full = IntStream.range(0, StravaService.PER_PAGE)
                .mapToObj(i -> run(i, "2026-03-01"))
                .collect(Collectors.joining(",", "[", "]"));
        fake.pages = List.of(full, "[" + run(999, "2025-12-01") + "]");

        assertEquals(StravaService.PER_PAGE + 1, service.activities(connected("acces-1", 1), LocalDate.of(2025, 1, 1)).size());
        assertEquals(2, fake.requests.size());
    }

    @Test
    void renouvelleLeJetonExpireDansLaSession() {
        StravaSession session = StravaSession.of(new StravaToken("vieux", "rafraichi-0", NOW.getEpochSecond() - 10, 777, "Flavien L."));
        fake.tokenBody = """
                {"access_token":"acces-2","refresh_token":"rafraichi-2","expires_at":4102444800}""";

        service.activities(session, LocalDate.of(2026, 1, 1));

        assertTrue(fake.requests.get(0).contains("grant_type=refresh_token"));
        assertTrue(fake.requests.get(0).contains("refresh_token=rafraichi-0"));
        assertEquals("Bearer acces-2", fake.authorizations.get(0));
        assertTrue(session.changed());
        assertEquals(new StravaToken("acces-2", "rafraichi-2", 4102444800L, 777, "Flavien L."), session.token().orElseThrow());
    }

    @Test
    void oublieLesJetonsQuandStravaRefuseLAcces() {
        StravaSession session = connected("revoque", 1);
        fake.activitiesStatus = 401;

        StravaException e = assertThrows(StravaException.class, () -> service.activities(session, LocalDate.of(2026, 1, 1)));

        assertEquals(HttpStatus.UNAUTHORIZED, e.status());
        assertFalse(service.status(session).connected());
        assertTrue(session.changed());
    }

    @Test
    void signaleLaLimiteDeRequetes() {
        StravaSession session = connected("a", 1);
        fake.activitiesStatus = 429;

        assertEquals(HttpStatus.TOO_MANY_REQUESTS,
                assertThrows(StravaException.class, () -> service.activities(session, LocalDate.of(2026, 1, 1))).status());
        assertTrue(service.status(session).connected());
        assertFalse(session.changed());
    }

    @Test
    void deconnecteEtRevoqueLAcces() {
        StravaSession session = connected("acces-1", 1);

        service.disconnect(session);

        assertFalse(service.status(session).connected());
        assertTrue(session.changed());
        assertTrue(fake.requests.get(0).startsWith("POST /oauth/deauthorize access_token=acces-1"));
    }

    private String state() {
        return URI.create(service.authorize("http://localhost:5173", SERVER)).getQuery().replaceAll(".*state=([^&]+).*", "$1");
    }

    /** Flux d'une sortie de 30 km qui alterne montées et descentes à 10 %, à 10 km/h d'effort, un point toutes les 5 s. */
    private static String streams() {
        StringBuilder time = new StringBuilder(), dist = new StringBuilder(), alt = new StringBuilder(), moving = new StringBuilder();
        double t = 0, d = 0, a = 300;
        while (d < 30000) {
            String sep = time.isEmpty() ? "" : ",";
            time.append(sep).append(t);
            dist.append(sep).append(Math.round(d * 10) / 10.0);
            alt.append(sep).append(Math.round(a * 10) / 10.0);
            moving.append(sep).append("true");
            double grade = ((int) (d / 1000)) % 2 == 0 ? 0.1 : -0.1;
            double speed = 10 / 3.6 / fr.trailplanner.engine.TerrainEffort.factor(grade);
            t += 5;
            d += speed * 5;
            a += grade * speed * 5;
        }
        return "{\"time\":{\"data\":[%s]},\"distance\":{\"data\":[%s]},\"altitude\":{\"data\":[%s]},\"moving\":{\"data\":[%s]}}"
                .formatted(time, dist, alt, moving);
    }

    @Test
    void mesureLeProfilDuCoureurSurSesSortiesQuiSyPretent() {
        fake.pages = List.of("""
                [{"id": 1, "name": "Trail", "sport_type": "TrailRun", "start_date_local": "2026-09-01T07:00:00Z",
                  "distance": 30000, "total_elevation_gain": 1500, "elapsed_time": 11000, "moving_time": 10800},
                 {"id": 2, "name": "Footing", "sport_type": "Run", "start_date_local": "2026-09-02T18:00:00Z",
                  "distance": 8000, "total_elevation_gain": 50, "elapsed_time": 2900, "moving_time": 2800},
                 {"id": 3, "name": "Vélo", "sport_type": "Ride", "start_date_local": "2026-09-03T07:00:00Z",
                  "distance": 60000, "total_elevation_gain": 900, "elapsed_time": 9000, "moving_time": 8000}]""");
        fake.streams = streams();

        var profile = service.profile(connected("acces-1", 1));

        assertEquals(1, profile.activities());
        assertEquals(LocalDate.of(2026, 9, 1), profile.from());
        assertFalse(profile.slope().isEmpty());
        // Une seule sortie lue en détail : ni le footing (trop court, trop plat) ni le vélo.
        assertEquals(1, fake.requests.stream().filter(r -> r.startsWith("GET /api/v3/activities/")).count());
        assertTrue(fake.requests.stream().anyMatch(r -> r.startsWith("GET /api/v3/activities/1/streams?")
                && r.contains("time,distance,altitude,moving")));
    }

    @Test
    void retourDeCourseLitLActiviteEtMesureLaFatigue() {
        fake.streams = streams();

        RaceReview review = service.review(connected("acces-1", 1), 77, null);

        assertEquals(77, review.activityId());
        assertTrue(fake.requests.stream().anyMatch(r -> r.startsWith("GET /api/v3/activities/77/streams?")));
        assertEquals(30, review.distanceKm(), 0.1);
        // Un point tous les 100 m : km, minutes écoulées, minutes en mouvement.
        assertEquals(301, review.points().size(), 2);
        double[] last = review.points().get(review.points().size() - 1);
        assertEquals(review.movingMinutes(), last[2], 0.2);
        // 3 h de course à allure régulière (selon la pente standard) : pas de fatigue mesurée.
        assertEquals(1.0, review.fatigueExponent(), 0.02);
    }

    @Test
    void sansSortieQuiSyPretePasDeProfil() {
        fake.pages = List.of("[" + run(2, "2026-09-02") + "]");
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> service.profile(connected("acces-1", 1)));
        assertTrue(e.getMessage().startsWith("Pas encore de sortie"));
    }

    private static String run(int id, String date) {
        return """
                {"id": %d, "name": "Footing", "sport_type": "Run", "start_date_local": "%sT18:00:00Z",
                 "distance": 10000, "total_elevation_gain": 100, "elapsed_time": 3600, "moving_time": 3500}""".formatted(id, date);
    }

    @Test
    void fournitLHistoriqueDEntrainementAvecOuSansRandonnees() {
        fake.pages = List.of("""
                [{"id": 1, "name": "Trail", "sport_type": "TrailRun", "start_date_local": "2026-09-01T07:00:00Z",
                  "distance": 20000, "total_elevation_gain": 1000, "elapsed_time": 9000, "moving_time": 8000},
                 {"id": 2, "name": "Rando", "sport_type": "Hike", "start_date_local": "2026-09-02T07:00:00Z",
                  "distance": 12000, "total_elevation_gain": 900, "elapsed_time": 14000, "moving_time": 12000},
                 {"id": 3, "name": "Vélo", "sport_type": "Ride", "start_date_local": "2026-09-03T07:00:00Z",
                  "distance": 60000, "total_elevation_gain": 900, "elapsed_time": 9000, "moving_time": 8000}]""");
        var source = service.source(connected("acces-1", 1));

        var withHikes = source.history(LocalDate.of(2026, 1, 1), true).orElseThrow();
        var runsOnly = source.history(LocalDate.of(2026, 1, 1), false).orElseThrow();

        assertEquals(List.of("Hike", "TrailRun"), withHikes.sessions().stream().map(s -> s.sport()).toList());
        assertEquals(30.0, withHikes.sessions().get(1).effortKm());
        assertEquals(1, runsOnly.sessions().size());
        assertEquals(LocalDate.of(2026, 1, 1), runsOnly.since());
        assertEquals(1, fake.requests.size(), "la seconde lecture vient du cache");

        source.history(LocalDate.of(2025, 1, 1), false);
        assertEquals(2, fake.requests.size(), "plus ancien que le cache : nouvelle lecture");
    }

    @Test
    void chaqueCoureurASonPropreHistorique() {
        fake.pages = List.of("[" + run(1, "2026-09-01") + "]");
        service.source(connected("alice", 1)).history(LocalDate.of(2026, 1, 1), false);
        service.source(connected("bob", 2)).history(LocalDate.of(2026, 1, 1), false);
        service.source(connected("alice-bis", 1)).history(LocalDate.of(2026, 1, 1), false);

        assertEquals(List.of("Bearer alice", "Bearer bob"), fake.authorizations, "le même athlète relit son cache");
    }

    @Test
    void pasDHistoriqueSansCompteConnecte() {
        assertTrue(service.source(StravaSession.none()).history(LocalDate.of(2026, 1, 1), true).isEmpty());
        assertTrue(fake.requests.isEmpty());
    }
}
