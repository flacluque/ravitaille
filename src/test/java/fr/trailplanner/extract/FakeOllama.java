package fr.trailplanner.extract;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Faux serveur Ollama : répond ce qu'on lui dit et garde les requêtes reçues. */
final class FakeOllama implements AutoCloseable {

    final List<String> chatRequests = new ArrayList<>();
    private final HttpServer server;
    volatile int chatStatus = 200;
    volatile String chatBody = "{}";
    volatile String tagsBody = "{\"models\":[]}";

    FakeOllama() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/chat", ex -> {
            chatRequests.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(ex, chatStatus, chatBody);
        });
        server.createContext("/api/tags", ex -> respond(ex, 200, tagsBody));
        server.start();
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private static void respond(com.sun.net.httpserver.HttpExchange ex, int status, String body) throws IOException {
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
