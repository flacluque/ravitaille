package fr.trailplanner.extract;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * Configuration de l'IA de lecture des roadbooks (application.properties) :
 * <pre>
 * trailplanner.extraction.provider=ollama        # gemini une fois en ligne, none pour désactiver
 * trailplanner.extraction.ollama.base-url=http://localhost:11434
 * trailplanner.extraction.ollama.model=qwen2.5vl:7b
 * trailplanner.extraction.gemini.api-key=…        # variable TRAILPLANNER_EXTRACTION_GEMINI_API_KEY
 * </pre>
 */
@ConfigurationProperties("trailplanner.extraction")
public record ExtractionProperties(
        @DefaultValue("none") Provider provider,
        @DefaultValue Ollama ollama,
        @DefaultValue Gemini gemini) {

    public enum Provider { NONE, OLLAMA, GEMINI }

    /**
     * @param timeout       un modèle local met de quelques dizaines de secondes à quelques minutes
     * @param contextTokens contexte du modèle. Celui d'Ollama par défaut est bien trop court : une page
     *                      de roadbook occupe à elle seule quelques milliers de tokens, et la réponse
     *                      serait tronquée. 32k tient largement dans 16 Go de mémoire avec un modèle 7B.
     */
    public record Ollama(
            @DefaultValue("http://localhost:11434") String baseUrl,
            @DefaultValue("qwen2.5vl:7b") String model,
            @DefaultValue("5m") Duration timeout,
            @DefaultValue("32768") int contextTokens) {}

    /**
     * Gemini, l'IA de Google : une clé gratuite (https://aistudio.google.com/apikey) suffit pour quelques
     * dizaines de lectures par jour. Les documents envoyés sortent alors de la machine.
     *
     * @param model          modèle à vision ; l'alias « flash-latest » suit la dernière version rapide
     * @param fallbackModels modèles essayés quand le premier est surchargé ou à court de quota gratuit
     */
    public record Gemini(
            @DefaultValue("") String apiKey,
            @DefaultValue("gemini-flash-latest") String model,
            @DefaultValue({"gemini-2.5-flash", "gemini-flash-lite-latest"}) java.util.List<String> fallbackModels,
            @DefaultValue("https://generativelanguage.googleapis.com") String baseUrl,
            @DefaultValue("2m") Duration timeout) {

        public Gemini {
            apiKey = apiKey == null ? "" : apiKey.strip();
            fallbackModels = fallbackModels == null ? java.util.List.of() : java.util.List.copyOf(fallbackModels);
        }

        /** Le modèle choisi, puis ses secours, sans doublon. */
        public java.util.List<String> models() {
            java.util.LinkedHashSet<String> all = new java.util.LinkedHashSet<>();
            all.add(model.strip());
            fallbackModels.stream().map(String::strip).filter(m -> !m.isEmpty()).forEach(all::add);
            return java.util.List.copyOf(all);
        }
    }
}
