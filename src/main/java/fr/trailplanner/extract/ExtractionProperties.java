package fr.trailplanner.extract;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * Configuration de l'IA de lecture des roadbooks (application.properties) :
 * <pre>
 * trailplanner.extraction.provider=ollama        # ou none pour désactiver
 * trailplanner.extraction.ollama.base-url=http://localhost:11434
 * trailplanner.extraction.ollama.model=qwen2.5vl:7b
 * </pre>
 */
@ConfigurationProperties("trailplanner.extraction")
public record ExtractionProperties(
        @DefaultValue("none") Provider provider,
        @DefaultValue Ollama ollama) {

    public enum Provider { NONE, OLLAMA }

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
}
