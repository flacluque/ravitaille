package fr.trailplanner.extract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import fr.trailplanner.api.JsonSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Base64;

/**
 * Lecture du roadbook par un modèle de vision servi en local par Ollama (https://ollama.com) :
 * gratuit, hors ligne, rien ne sort de la machine.
 */
public class OllamaRoadbookExtractor implements RoadbookExtractor {

    private static final Logger log = LoggerFactory.getLogger(OllamaRoadbookExtractor.class);

    private final ObjectMapper mapper = JsonSupport.mapper();
    private final HttpClient http;
    private final String baseUrl;
    private final String model;
    private final Duration timeout;
    private final int contextTokens;

    public OllamaRoadbookExtractor(ExtractionProperties.Ollama config) {
        this.baseUrl = config.baseUrl().replaceAll("/+$", "");
        this.model = config.model();
        this.timeout = config.timeout();
        this.contextTokens = config.contextTokens();
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Override
    public ExtractedRoadbook extract(RoadbookDocument document) {
        JsonNode response = post("/api/chat", chatRequest(document), timeout);
        String content = response.path("message").path("content").asText("");
        // Réponse brute du modèle : logging.level.fr.trailplanner.extract=DEBUG pour comprendre une lecture ratée.
        log.debug("Réponse de {} : {}", model, content);
        try {
            return mapper.readValue(content, ExtractedRoadbook.class);
        } catch (IOException e) {
            throw ExtractionException.badAnswer(
                    "Le modèle " + model + " a répondu dans un format inattendu. Réessaie, ou essaie un autre modèle.", e);
        }
    }

    ObjectNode chatRequest(RoadbookDocument document) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.put("stream", false);
        try {
            body.set("format", mapper.readTree(RoadbookPrompt.SCHEMA));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        ObjectNode options = body.putObject("options");
        options.put("temperature", 0);
        options.put("num_ctx", contextTokens);

        ArrayNode messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", RoadbookPrompt.SYSTEM);
        ObjectNode user = messages.addObject().put("role", "user").put("content", RoadbookPrompt.user(document.texts()));
        ArrayNode images = user.putArray("images");
        document.images().forEach(p -> images.add(Base64.getEncoder().encodeToString(p)));
        return body;
    }

    @Override
    public Status status() {
        JsonNode tags;
        try {
            tags = get("/api/tags");
        } catch (ExtractionException e) {
            return new Status(true, "ollama", model, false, e.getMessage());
        }
        boolean installed = false;
        for (JsonNode m : tags.path("models")) {
            String name = m.path("name").asText();
            if (name.equals(model) || name.equals(model + ":latest")) {
                installed = true;
            }
        }
        return installed
                ? new Status(true, "ollama", model, true, null)
                : new Status(true, "ollama", model, false,
                        "Le modèle " + model + " n'est pas installé : lance « ollama pull " + model + " » dans un terminal.");
    }

    private JsonNode get(String path) {
        return send(HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(Duration.ofSeconds(5)).GET().build());
    }

    private JsonNode post(String path, JsonNode body, Duration requestTimeout) {
        try {
            return send(HttpRequest.newBuilder(URI.create(baseUrl + path))
                    .timeout(requestTimeout)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(mapper.writeValueAsBytes(body)))
                    .build());
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private JsonNode send(HttpRequest request) {
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpConnectTimeoutException | ConnectException e) {
            throw ExtractionException.unavailable(
                    "Ollama ne répond pas sur " + baseUrl + " : lance l'application Ollama, puis réessaie.", e);
        } catch (HttpTimeoutException e) {
            throw ExtractionException.unavailable(
                    "Le modèle " + model + " n'a pas répondu à temps (" + timeout.toMinutes() + " min).", e);
        } catch (IOException e) {
            throw ExtractionException.unavailable("Erreur de communication avec Ollama : " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ExtractionException.unavailable("Lecture interrompue", e);
        }

        JsonNode json;
        try {
            json = mapper.readTree(response.body());
        } catch (IOException e) {
            throw ExtractionException.badAnswer("Réponse illisible d'Ollama (HTTP " + response.statusCode() + ")", e);
        }
        if (response.statusCode() == 404) {
            throw ExtractionException.unavailable(
                    "Le modèle " + model + " n'est pas installé : lance « ollama pull " + model + " » dans un terminal.");
        }
        if (response.statusCode() >= 400) {
            throw ExtractionException.badAnswer(
                    "Ollama a refusé la demande : " + json.path("error").asText("HTTP " + response.statusCode()), null);
        }
        return json;
    }
}
