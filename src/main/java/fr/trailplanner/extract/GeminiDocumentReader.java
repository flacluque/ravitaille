package fr.trailplanner.extract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import fr.trailplanner.api.JsonSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Iterator;
import java.util.Map;

/**
 * Lecture de documents par Gemini (API de Google) : sert une fois l'appli en ligne, là où il n'y a
 * pas d'Ollama. Même demande qu'à Ollama : consignes, texte, pages en images, réponse JSON imposée.
 */
public class GeminiDocumentReader implements DocumentReader {

    private static final Logger log = LoggerFactory.getLogger(GeminiDocumentReader.class);

    private final ObjectMapper mapper = JsonSupport.mapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ExtractionProperties.Gemini config;
    private final String baseUrl;

    static final int ATTEMPTS_PER_MODEL = 2;
    private final Duration retryDelay;

    public GeminiDocumentReader(ExtractionProperties.Gemini config) {
        this(config, Duration.ofSeconds(3));
    }

    GeminiDocumentReader(ExtractionProperties.Gemini config, Duration retryDelay) {
        this.config = config;
        this.baseUrl = config.baseUrl().replaceAll("/+$", "");
        this.retryDelay = retryDelay;
    }

    @Override
    public Status status() {
        return config.apiKey().isEmpty()
                ? new Status(true, "gemini", config.model(), false,
                        "Clé Gemini manquante : renseigne TRAILPLANNER_EXTRACTION_GEMINI_API_KEY (clé gratuite sur aistudio.google.com).")
                : new Status(true, "gemini", config.model(), true, null);
    }

    @Override
    public String read(Request request) {
        if (config.apiKey().isEmpty()) {
            throw ExtractionException.unavailable(status().message());
        }
        JsonNode response = send(generateRequest(request));
        StringBuilder text = new StringBuilder();
        for (JsonNode part : response.path("candidates").path(0).path("content").path("parts")) {
            text.append(part.path("text").asText(""));
        }
        String content = text.toString();
        log.debug("Réponse de {} : {}", config.model(), content);
        try {
            if (content.isBlank()) {
                throw new IOException("réponse vide (" + response.path("candidates").path(0).path("finishReason").asText("?") + ")");
            }
            mapper.readTree(content);
        } catch (IOException e) {
            throw ExtractionException.badAnswer("Gemini a répondu dans un format inattendu. Réessaie.", e);
        }
        return content;
    }

    ObjectNode generateRequest(Request request) {
        ObjectNode body = mapper.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", request.system());
        ObjectNode content = body.putArray("contents").addObject().put("role", "user");
        ArrayNode parts = content.putArray("parts");
        parts.addObject().put("text", request.user());
        request.images().forEach(img -> parts.addObject().putObject("inlineData")
                .put("mimeType", "image/jpeg")
                .put("data", Base64.getEncoder().encodeToString(img)));
        ObjectNode generation = body.putObject("generationConfig");
        generation.put("temperature", 0);
        generation.put("responseMimeType", "application/json");
        try {
            generation.set("responseSchema", toGeminiSchema(mapper.readTree(request.schema())));
        } catch (IOException e) {
            throw new IllegalArgumentException("Schéma JSON invalide", e);
        }
        return body;
    }

    /**
     * Gemini attend un schéma « OpenAPI » : types en majuscules, {@code nullable} au lieu de
     * {@code ["string", "null"]}, et pas d'{@code additionalProperties}.
     */
    static JsonNode toGeminiSchema(JsonNode schema) {
        ObjectNode out = JsonSupport.mapper().createObjectNode();
        Iterator<Map.Entry<String, JsonNode>> fields = schema.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> f = fields.next();
            JsonNode v = f.getValue();
            switch (f.getKey()) {
                case "type" -> {
                    if (v.isArray()) {
                        for (JsonNode t : v) {
                            if ("null".equals(t.asText())) {
                                out.put("nullable", true);
                            } else {
                                out.put("type", t.asText().toUpperCase());
                            }
                        }
                    } else {
                        out.put("type", v.asText().toUpperCase());
                    }
                }
                case "properties" -> {
                    ObjectNode props = out.putObject("properties");
                    v.fields().forEachRemaining(p -> props.set(p.getKey(), toGeminiSchema(p.getValue())));
                }
                case "items" -> out.set("items", toGeminiSchema(v));
                case "required", "enum", "description" -> out.set(f.getKey(), v);
                default -> { } // additionalProperties, $schema… : ignorés
            }
        }
        return out;
    }

    /** Erreur passagère d'un modèle (surcharge, quota) : on peut retenter, ou passer au modèle suivant. */
    private static final class Busy extends RuntimeException {
        final boolean retrySameModel;

        Busy(String message, boolean retrySameModel) {
            super(message, null, false, false);
            this.retrySameModel = retrySameModel;
        }
    }

    /**
     * Gemini gratuit est souvent surchargé (HTTP 503) : on retente le modèle après une courte pause,
     * puis on passe aux modèles de secours (chacun a son propre quota gratuit).
     */
    private JsonNode send(JsonNode body) {
        byte[] bytes;
        try {
            bytes = mapper.writeValueAsBytes(body);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        Busy last = null;
        for (String model : config.models()) {
            for (int attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
                try {
                    return send(bytes, model);
                } catch (Busy e) {
                    last = e;
                    log.warn("Gemini {} indisponible (essai {}) : {}", model, attempt, e.getMessage());
                    if (!e.retrySameModel) {
                        break;
                    }
                    if (attempt < ATTEMPTS_PER_MODEL) {
                        pause(retryDelay.multipliedBy(attempt));
                    }
                }
            }
        }
        throw ExtractionException.unavailable(last != null && last.getMessage().startsWith("quota")
                ? "Quota gratuit de Gemini atteint pour le moment : réessaie dans une minute, ou demain."
                : "Gemini est surchargé en ce moment (c'est fréquent avec la version gratuite) : réessaie dans une minute.");
    }

    private void pause(Duration delay) {
        try {
            Thread.sleep(delay.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ExtractionException.unavailable("Lecture interrompue", e);
        }
    }

    private JsonNode send(byte[] body, String model) {
        String path = "/v1beta/models/" + URLEncoder.encode(model, StandardCharsets.UTF_8) + ":generateContent";
        HttpResponse<String> response;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                    .timeout(config.timeout())
                    .header("Content-Type", "application/json")
                    .header("x-goog-api-key", config.apiKey())
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new Busy("pas de réponse à temps", false);
        } catch (IOException e) {
            throw ExtractionException.unavailable("Gemini est injoignable : " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ExtractionException.unavailable("Lecture interrompue", e);
        }
        int status = response.statusCode();
        if (status == 429) {
            throw new Busy("quota : " + message(response.body()), false);
        }
        if (status >= 500) {
            throw new Busy("HTTP " + status + " : " + message(response.body()), true);
        }
        if (status == 404) {
            // Modèle retiré ou renommé par Google : on essaie le suivant.
            throw new Busy("modèle inconnu", false);
        }
        if (status == 400 || status == 401 || status == 403) {
            String detail = message(response.body());
            log.warn("Gemini a refusé la demande (HTTP {}) : {}", status, detail);
            throw status == 400 && !detail.contains("API key")
                    ? ExtractionException.badAnswer("Gemini a refusé la demande : " + detail, null)
                    : ExtractionException.unavailable("Clé Gemini refusée : vérifie TRAILPLANNER_EXTRACTION_GEMINI_API_KEY.");
        }
        if (status >= 400) {
            throw ExtractionException.badAnswer("Gemini a refusé la demande : " + message(response.body()), null);
        }
        try {
            return mapper.readTree(response.body());
        } catch (IOException e) {
            throw ExtractionException.badAnswer("Réponse illisible de Gemini.", e);
        }
    }

    private String message(String body) {
        try {
            return mapper.readTree(body).path("error").path("message").asText("HTTP");
        } catch (IOException e) {
            return "réponse illisible";
        }
    }
}
