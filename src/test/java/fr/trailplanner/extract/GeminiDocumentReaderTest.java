package fr.trailplanner.extract;

import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpServer;
import fr.trailplanner.api.JsonSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class GeminiDocumentReaderTest {

    private HttpServer server;
    private final List<String> paths = new ArrayList<>();
    private final List<String> keys = new ArrayList<>();
    private final List<String> bodies = new ArrayList<>();
    private volatile int status = 200;
    private volatile String answer = "{}";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            paths.add(ex.getRequestURI().getPath());
            keys.add(ex.getRequestHeaders().getFirst("x-goog-api-key"));
            bodies.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] bytes = answer.getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(bytes);
            }
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private GeminiDocumentReader reader(String key) {
        return new GeminiDocumentReader(new ExtractionProperties.Gemini(key, "gemini-flash-latest",
                "http://127.0.0.1:" + server.getAddress().getPort(), Duration.ofSeconds(5)));
    }

    private static final DocumentReader.Request REQUEST = new DocumentReader.Request(
            "Lis le roadbook.", "Page 1 : …", RoadbookPrompt.SCHEMA, List.of(new byte[]{1, 2, 3}));

    @Test
    void envoieConsignesImagesEtSchemaPuisRenvoieLeJson() throws IOException {
        answer = """
                {"candidates":[{"content":{"parts":[{"text":"{\\"name\\": \\"Bogo"},{"text":"miles\\"}"}]}}]}""";

        String json = reader("cle").read(REQUEST);

        assertEquals("{\"name\": \"Bogomiles\"}", json);
        assertEquals("/v1beta/models/gemini-flash-latest:generateContent", paths.get(0));
        assertEquals("cle", keys.get(0));
        JsonNode sent = JsonSupport.mapper().readTree(bodies.get(0));
        assertEquals("Lis le roadbook.", sent.at("/systemInstruction/parts/0/text").asText());
        assertEquals("Page 1 : …", sent.at("/contents/0/parts/0/text").asText());
        assertEquals("AQID", sent.at("/contents/0/parts/1/inlineData/data").asText());
        assertEquals("application/json", sent.at("/generationConfig/responseMimeType").asText());
        JsonNode schema = sent.at("/generationConfig/responseSchema");
        assertEquals("OBJECT", schema.path("type").asText());
        assertEquals("STRING", schema.at("/properties/name/type").asText());
        assertTrue(schema.at("/properties/name/nullable").asBoolean());
        assertEquals("NUMBER", schema.at("/properties/checkpoints/items/properties/km/type").asText());
        assertEquals("FULL", schema.at("/properties/checkpoints/items/properties/aid/enum/2").asText());
        assertFalse(bodies.get(0).contains("additionalProperties"));
    }

    @Test
    void expliqueQuoiFaireSansCleOuQuotaEpuise() {
        GeminiDocumentReader none = reader("");
        assertFalse(none.status().ready());
        assertTrue(none.status().message().contains("TRAILPLANNER_EXTRACTION_GEMINI_API_KEY"));
        assertTrue(assertThrows(ExtractionException.class, () -> none.read(REQUEST)).isUnavailable());
        assertTrue(paths.isEmpty());

        assertTrue(reader("cle").status().ready());
        status = 429;
        answer = "{\"error\":{\"message\":\"Resource exhausted\"}}";
        ExtractionException e = assertThrows(ExtractionException.class, () -> reader("cle").read(REQUEST));
        assertTrue(e.isUnavailable());
        assertTrue(e.getMessage().startsWith("Quota gratuit"));

        status = 400;
        answer = "{\"error\":{\"message\":\"API key not valid. Please pass a valid API key.\"}}";
        assertTrue(assertThrows(ExtractionException.class, () -> reader("cle").read(REQUEST)).getMessage().startsWith("Clé Gemini refusée"));
    }

    @Test
    void refuseUneReponseQuiNEstPasDuJson() {
        answer = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Voici le roadbook\"}]}}]}";
        assertFalse(assertThrows(ExtractionException.class, () -> reader("cle").read(REQUEST)).isUnavailable());
        answer = "{\"candidates\":[{\"finishReason\":\"SAFETY\"}]}";
        assertFalse(assertThrows(ExtractionException.class, () -> reader("cle").read(REQUEST)).isUnavailable());
    }
}
