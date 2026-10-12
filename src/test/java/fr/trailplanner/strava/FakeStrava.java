package fr.trailplanner.strava;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Faux Strava : jetons OAuth et liste d'activités, avec les requêtes reçues. */
final class FakeStrava implements AutoCloseable {

    /** "POST /oauth/token grant_type=…", "GET /api/v3/athlete/activities?…" */
    final List<String> requests = new CopyOnWriteArrayList<>();
    final List<String> authorizations = new CopyOnWriteArrayList<>();
    private final HttpServer server;
    volatile int tokenStatus = 200;
    volatile String tokenBody = """
            {"access_token":"acces-1","refresh_token":"rafraichi-1","expires_at":4102444800,
             "athlete":{"firstname":"Flavien","lastname":"L."}}""";
    volatile int activitiesStatus = 200;
    /** Pages d'activités renvoyées dans l'ordre ; au-delà, une page vide. */
    volatile List<String> pages = List.of("[]");

    FakeStrava() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/oauth/token", ex -> {
            requests.add("POST /oauth/token " + body(ex));
            respond(ex, tokenStatus, tokenBody);
        });
        server.createContext("/oauth/deauthorize", ex -> {
            requests.add("POST /oauth/deauthorize " + body(ex));
            respond(ex, 200, "{}");
        });
        server.createContext("/api/v3/athlete/activities", ex -> {
            String query = ex.getRequestURI().getQuery();
            requests.add("GET /api/v3/athlete/activities?" + query);
            authorizations.add(ex.getRequestHeaders().getFirst("Authorization"));
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?:^|&)page=(\\d+)").matcher(query);
            int page = m.find() ? Integer.parseInt(m.group(1)) : 1;
            respond(ex, activitiesStatus, page <= pages.size() ? pages.get(page - 1) : "[]");
        });
        server.start();
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private static String body(HttpExchange ex) throws IOException {
        return new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void respond(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
