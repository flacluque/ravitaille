package fr.trailplanner.strava;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
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

    @TempDir
    Path dir;
    private FakeStrava fake;
    private StravaTokenStore store;
    private StravaService service;

    @BeforeEach
    void setUp() throws IOException {
        fake = new FakeStrava();
        StravaProperties props = new StravaProperties("4242", "secret", fake.url(), dir.resolve("strava.json").toString());
        store = new StravaTokenStore(props.tokenPath());
        service = new StravaService(props, new StravaClient(props), store, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @AfterEach
    void tearDown() {
        fake.close();
    }

    @Test
    void neFaitRienSansApplicationStrava() {
        StravaProperties none = new StravaProperties("", "", fake.url(), dir.resolve("x.json").toString());
        StravaService off = new StravaService(none, new StravaClient(none), new StravaTokenStore(none.tokenPath()), Clock.systemUTC());

        assertEquals(new StravaStatus(false, false, null, "Strava n'est pas configuré."), off.status());
        StravaException e = assertThrows(StravaException.class, () -> off.authorize("http://localhost:5173"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, e.status());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,
                assertThrows(StravaException.class, () -> off.activities(LocalDate.of(2025, 1, 1))).status());
    }

    @Test
    void nettoieEtVerifieLIdentifiantDeLApplication() {
        StravaProperties copied = new StravaProperties(" 123456   ", "\"secret\" ", fake.url(), "");
        assertTrue(copied.configured());
        assertEquals("123456", copied.clientId());
        assertEquals("secret", copied.clientSecret());
        String url = new StravaClient(copied).authorizeUrl("http://localhost:5173/api/strava/callback", "s");
        assertTrue(url.matches(".*[?&]client_id=123456(&.*|$)"), url);

        StravaProperties wrong = new StravaProperties("a1b2c3d4e5f6", "secret", fake.url(), "");
        assertFalse(wrong.configured());
        assertTrue(wrong.problem().contains("Client ID"), wrong.problem());
        StravaService service = new StravaService(wrong, new StravaClient(wrong), store, Clock.systemUTC());
        assertEquals(wrong.problem(), service.status().problem());
        StravaException e = assertThrows(StravaException.class, () -> service.authorize("http://localhost:5173"));
        assertTrue(e.getMessage().startsWith(wrong.problem()));

        assertTrue(new StravaProperties("123456", "", fake.url(), "").problem().contains("client-secret"));
    }

    @Test
    void connecteLeCompteEtGardeLesJetons() throws IOException {
        assertEquals(new StravaStatus(true, false, null), service.status());

        URI authorize = URI.create(service.authorize("http://localhost:5173/"));
        String query = authorize.getQuery();
        assertTrue(authorize.toString().startsWith(fake.url() + "/oauth/authorize?"), authorize.toString());
        assertTrue(query.contains("client_id=4242"));
        assertTrue(query.contains("redirect_uri=http://localhost:5173/api/strava/callback"), query);
        assertTrue(query.contains("scope=activity:read_all"));
        String state = query.replaceAll(".*state=([^&]+).*", "$1");

        String back = service.callback(state, "le-code", null, "read,activity:read_all");

        assertEquals("http://localhost:5173/?strava=connected", back);
        assertTrue(fake.requests.get(0).contains("code=le-code"));
        assertTrue(fake.requests.get(0).contains("grant_type=authorization_code"));
        assertTrue(fake.requests.get(0).contains("client_secret=secret"));
        assertEquals(new StravaStatus(true, true, "Flavien L."), service.status());
        if (!System.getProperty("os.name").startsWith("Windows")) {
            assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(
                    Files.getPosixFilePermissions(dir.resolve("strava.json"))));
        }
    }

    @Test
    void refuseUnRetourInconnuOuUneAdresseNonLocale() {
        assertThrows(IllegalArgumentException.class, () -> service.authorize("https://exemple.com"));
        assertThrows(IllegalArgumentException.class, () -> service.authorize("http://localhost.exemple.com"));
        assertThrows(IllegalArgumentException.class, () -> service.callback("inconnu", "code", null, "activity:read_all"));

        // Un state ne sert qu'une fois.
        String state = URI.create(service.authorize("http://127.0.0.1:4173")).getQuery().replaceAll(".*state=([^&]+).*", "$1");
        assertEquals("http://127.0.0.1:4173/?strava=connected", service.callback(state, "c", null, "activity:read_all"));
        assertThrows(IllegalArgumentException.class, () -> service.callback(state, "c", null, "activity:read_all"));
    }

    @Test
    void signaleUnRefusOuUnDroitManquant() {
        assertEquals("http://localhost:5173/?strava=denied", service.callback(state(), null, "access_denied", null));
        assertEquals("http://localhost:5173/?strava=scope", service.callback(state(), "c", null, "read"));
        fake.tokenStatus = 400;
        assertEquals("http://localhost:5173/?strava=error", service.callback(state(), "c", null, "activity:read_all"));
        assertFalse(service.status().connected());
    }

    @Test
    void importeLesSortiesDeCourseAPiedEtDeTrail() {
        store.save(new StravaToken("acces-1", "rafraichi-1", NOW.getEpochSecond() + 3600, "Flavien L."));
        fake.pages = List.of("""
                [{"id": 1, "name": "Trail des Cathares ", "sport_type": "TrailRun", "start_date_local": "2026-04-12T07:30:00Z",
                  "distance": 60412.3, "total_elevation_gain": 3210.4, "elapsed_time": 31680, "moving_time": 29000, "workout_type": 1},
                 {"id": 2, "name": "Vélo", "sport_type": "Ride", "start_date_local": "2026-05-01T09:00:00Z",
                  "distance": 80000, "total_elevation_gain": 900, "elapsed_time": 10000, "moving_time": 9000},
                 {"id": 3, "name": "Sortie longue", "type": "Run", "start_date_local": "2026-06-20T06:00:00Z",
                  "distance": 25000, "total_elevation_gain": 800, "elapsed_time": 9000, "moving_time": 8400, "workout_type": null}]""");

        List<StravaActivity> activities = service.activities(LocalDate.of(2025, 10, 12));

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
        store.save(new StravaToken("acces-1", "rafraichi-1", NOW.getEpochSecond() + 3600, null));
        String full = IntStream.range(0, StravaService.PER_PAGE)
                .mapToObj(i -> run(i, "2026-03-01"))
                .collect(Collectors.joining(",", "[", "]"));
        fake.pages = List.of(full, "[" + run(999, "2025-12-01") + "]");

        assertEquals(StravaService.PER_PAGE + 1, service.activities(LocalDate.of(2025, 1, 1)).size());
        assertEquals(2, fake.requests.size());
    }

    @Test
    void renouvelleLeJetonExpire() {
        store.save(new StravaToken("vieux", "rafraichi-0", NOW.getEpochSecond() - 10, "Flavien L."));
        fake.tokenBody = """
                {"access_token":"acces-2","refresh_token":"rafraichi-2","expires_at":4102444800}""";

        service.activities(LocalDate.of(2026, 1, 1));

        assertTrue(fake.requests.get(0).contains("grant_type=refresh_token"));
        assertTrue(fake.requests.get(0).contains("refresh_token=rafraichi-0"));
        assertEquals("Bearer acces-2", fake.authorizations.get(0));
        assertEquals(new StravaToken("acces-2", "rafraichi-2", 4102444800L, "Flavien L."), store.load().orElseThrow());
    }

    @Test
    void oublieLesJetonsQuandStravaRefuseLAcces() {
        store.save(new StravaToken("revoque", "r", NOW.getEpochSecond() + 3600, null));
        fake.activitiesStatus = 401;

        StravaException e = assertThrows(StravaException.class, () -> service.activities(LocalDate.of(2026, 1, 1)));

        assertEquals(HttpStatus.UNAUTHORIZED, e.status());
        assertFalse(service.status().connected());
        assertEquals(HttpStatus.UNAUTHORIZED,
                assertThrows(StravaException.class, () -> service.activities(LocalDate.of(2026, 1, 1))).status());
    }

    @Test
    void signaleLaLimiteDeRequetes() {
        store.save(new StravaToken("a", "r", NOW.getEpochSecond() + 3600, null));
        fake.activitiesStatus = 429;

        assertEquals(HttpStatus.TOO_MANY_REQUESTS,
                assertThrows(StravaException.class, () -> service.activities(LocalDate.of(2026, 1, 1))).status());
        assertTrue(service.status().connected());
    }

    @Test
    void deconnecteEtRevoqueLAcces() {
        store.save(new StravaToken("acces-1", "r", NOW.getEpochSecond() + 3600, null));

        service.disconnect();

        assertFalse(service.status().connected());
        assertTrue(fake.requests.get(0).startsWith("POST /oauth/deauthorize access_token=acces-1"));
    }

    private String state() {
        return URI.create(service.authorize("http://localhost:5173")).getQuery().replaceAll(".*state=([^&]+).*", "$1");
    }

    private static String run(int id, String date) {
        return """
                {"id": %d, "name": "Footing", "sport_type": "Run", "start_date_local": "%sT18:00:00Z",
                 "distance": 10000, "total_elevation_gain": 100, "elapsed_time": 3600, "moving_time": 3500}""".formatted(id, date);
    }

    @Test
    void fournitLHistoriqueDEntrainementAvecOuSansRandonnees() {
        store.save(new StravaToken("acces-1", "r", NOW.getEpochSecond() + 3600, null));
        fake.pages = List.of("""
                [{"id": 1, "name": "Trail", "sport_type": "TrailRun", "start_date_local": "2026-09-01T07:00:00Z",
                  "distance": 20000, "total_elevation_gain": 1000, "elapsed_time": 9000, "moving_time": 8000},
                 {"id": 2, "name": "Rando", "sport_type": "Hike", "start_date_local": "2026-09-02T07:00:00Z",
                  "distance": 12000, "total_elevation_gain": 900, "elapsed_time": 14000, "moving_time": 12000},
                 {"id": 3, "name": "Vélo", "sport_type": "Ride", "start_date_local": "2026-09-03T07:00:00Z",
                  "distance": 60000, "total_elevation_gain": 900, "elapsed_time": 9000, "moving_time": 8000}]""");

        var withHikes = service.history(LocalDate.of(2026, 1, 1), true).orElseThrow();
        var runsOnly = service.history(LocalDate.of(2026, 1, 1), false).orElseThrow();

        assertEquals(List.of("Hike", "TrailRun"), withHikes.sessions().stream().map(s -> s.sport()).toList());
        assertEquals(30.0, withHikes.sessions().get(1).effortKm());
        assertEquals(1, runsOnly.sessions().size());
        assertEquals(LocalDate.of(2026, 1, 1), runsOnly.since());
        assertEquals(1, fake.requests.size(), "la seconde lecture vient du cache");

        service.history(LocalDate.of(2025, 1, 1), false);
        assertEquals(2, fake.requests.size(), "plus ancien que le cache : nouvelle lecture");
    }

    @Test
    void pasDHistoriqueSansCompteConnecte() {
        assertTrue(service.history(LocalDate.of(2026, 1, 1), true).isEmpty());
        assertTrue(fake.requests.isEmpty());
    }
}
