package fr.trailplanner.extract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class OllamaRoadbookExtractorTest {

    private static final String MODEL = "qwen2.5vl:7b";
    private final ObjectMapper mapper = new ObjectMapper();
    private FakeOllama ollama;
    private OllamaRoadbookExtractor extractor;

    @BeforeEach
    void start() throws IOException {
        ollama = new FakeOllama();
        extractor = new OllamaRoadbookExtractor(new ExtractionProperties.Ollama(ollama.url(), MODEL, Duration.ofSeconds(10), 32768));
    }

    @AfterEach
    void stop() {
        ollama.close();
    }

    @Test
    void envoieLesPagesAuModeleAvecLeSchemaEtLitSaReponse() throws Exception {
        String roadbook = """
                {"name":"Raid des Troubadours 2026","startTime":"09:00","checkpoints":[
                  {"code":"1P","name":"Départ","km":0,"gainM":0,"aid":"NONE"},
                  {"code":"3","name":"Molières","km":20,"gainM":772,"lossM":590,"cutoffIn":"12h30","aid":"LIGHT"}],
                 "warnings":["Le logo annonce 85 km, le tableau 88 km."]}""";
        ollama.chatBody = mapper.writeValueAsString(mapper.createObjectNode()
                .put("done", true).set("message", mapper.createObjectNode().put("role", "assistant").put("content", roadbook)));

        ExtractedRoadbook result = extractor.extract(new RoadbookDocument(List.of(new byte[]{1, 2, 3}, new byte[]{4}),
                List.of("Lieu KM Barrière horaire\nLe Rozier 25,5 12h15", ""), List.of()));

        assertEquals("Raid des Troubadours 2026", result.name());
        assertEquals(2, result.checkpoints().size());
        assertEquals("12h30", result.checkpoints().get(1).cutoffIn());
        assertEquals(List.of("Le logo annonce 85 km, le tableau 88 km."), result.warnings());

        JsonNode sent = mapper.readTree(ollama.chatRequests.get(0));
        assertEquals(MODEL, sent.path("model").asText());
        assertFalse(sent.path("stream").asBoolean(true));
        assertEquals("object", sent.path("format").path("type").asText());
        // Tous les champs d'un point sont exigés (null si absent) : sinon le modèle saute le D+ et le D-.
        JsonNode point = sent.path("format").path("properties").path("checkpoints").path("items");
        List<String> required = new java.util.ArrayList<>();
        point.path("required").forEach(f -> required.add(f.asText()));
        List<String> fields = new java.util.ArrayList<>();
        point.path("properties").fieldNames().forEachRemaining(fields::add);
        assertEquals(fields, required);
        assertEquals(32768, sent.path("options").path("num_ctx").asInt());
        JsonNode user = sent.path("messages").get(1);
        assertEquals("user", user.path("role").asText());
        assertEquals("AQID", user.path("images").get(0).asText());   // base64 de {1, 2, 3}
        assertEquals(2, user.path("images").size());
        String content = user.path("content").asText();
        assertTrue(content.contains("--- Image 1 ---\nLieu KM Barrière horaire\nLe Rozier 25,5 12h15"), content);
        assertTrue(content.contains("--- Image 2 ---"), content);
    }

    @Test
    void sansTexteLeMessageSeLimiteALaConsigne() throws Exception {
        ollama.chatBody = "{\"message\":{\"content\":\"{\\\"name\\\":\\\"x\\\",\\\"checkpoints\\\":[],\\\"warnings\\\":[]}\"}}";
        extractor.extract(RoadbookDocument.ofImages(List.of(new byte[]{1})));

        JsonNode user = mapper.readTree(ollama.chatRequests.get(0)).path("messages").get(1);
        assertEquals(RoadbookPrompt.USER, user.path("content").asText());
    }

    @Test
    void unModeleAbsentDonneLaCommandePourLInstaller() {
        ollama.chatStatus = 404;
        ollama.chatBody = "{\"error\":\"model 'qwen2.5vl:7b' not found\"}";

        ExtractionException e = assertThrows(ExtractionException.class, () -> extractor.extract(RoadbookDocument.ofImages(List.of(new byte[]{1}))));
        assertTrue(e.isUnavailable());
        assertTrue(e.getMessage().contains("ollama pull qwen2.5vl:7b"), e.getMessage());
    }

    @Test
    void uneReponseQuiNEstPasDuJsonEstSignalee() throws Exception {
        ollama.chatBody = mapper.writeValueAsString(mapper.createObjectNode()
                .set("message", mapper.createObjectNode().put("content", "Voici le roadbook : ...")));

        ExtractionException e = assertThrows(ExtractionException.class, () -> extractor.extract(RoadbookDocument.ofImages(List.of(new byte[]{1}))));
        assertFalse(e.isUnavailable());
    }

    @Test
    void ollamaArreteEstExpliqueAuCoureur() throws IOException {
        int closedPort;
        try (ServerSocket s = new ServerSocket(0)) {
            closedPort = s.getLocalPort();
        }
        OllamaRoadbookExtractor off = new OllamaRoadbookExtractor(
                new ExtractionProperties.Ollama("http://127.0.0.1:" + closedPort, MODEL, Duration.ofSeconds(5), 32768));

        ExtractionException e = assertThrows(ExtractionException.class, () -> off.extract(RoadbookDocument.ofImages(List.of(new byte[]{1}))));
        assertTrue(e.isUnavailable());
        assertTrue(e.getMessage().contains("lance l'application Ollama"), e.getMessage());

        RoadbookExtractor.Status status = off.status();
        assertTrue(status.enabled());
        assertFalse(status.ready());
    }

    @Test
    void leStatutVerifieQueLeModeleEstInstalle() {
        ollama.tagsBody = "{\"models\":[{\"name\":\"llama3.2:latest\"}]}";
        RoadbookExtractor.Status absent = extractor.status();
        assertFalse(absent.ready());
        assertTrue(absent.message().contains("ollama pull " + MODEL));

        ollama.tagsBody = "{\"models\":[{\"name\":\"llama3.2:latest\"},{\"name\":\"qwen2.5vl:7b\"}]}";
        assertTrue(extractor.status().ready());
    }
}
