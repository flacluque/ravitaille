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
     * @param timeout un modèle local met de quelques dizaines de secondes à quelques minutes
     */
    public record Ollama(
            @DefaultValue("http://localhost:11434") String baseUrl,
            @DefaultValue("qwen2.5vl:7b") String model,
            @DefaultValue("5m") Duration timeout) {}
}
