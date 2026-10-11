package fr.trailplanner.extract;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Choix de l'IA de lecture : ajouter un fournisseur = une implémentation + une ligne ici. */
@Configuration
@EnableConfigurationProperties(ExtractionProperties.class)
public class ExtractionConfig {

    @Bean
    RoadbookExtractor roadbookExtractor(ExtractionProperties props) {
        return switch (props.provider()) {
            case NONE -> new DisabledRoadbookExtractor();
            case OLLAMA -> new OllamaRoadbookExtractor(props.ollama());
        };
    }
}
