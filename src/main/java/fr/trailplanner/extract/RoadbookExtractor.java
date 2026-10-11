package fr.trailplanner.extract;

/**
 * Une IA capable de lire un roadbook. L'implémentation se choisit par configuration
 * (trailplanner.extraction.provider) : changer d'IA ne touche ni au front ni au reste du backend.
 */
public interface RoadbookExtractor {

    /**
     * @param document pages du roadbook en images, et leur texte quand le PDF en contient
     * @throws ExtractionException si l'IA est injoignable ou répond quelque chose d'inexploitable
     */
    ExtractedRoadbook extract(RoadbookDocument document);

    /** État de l'IA, pour que le front explique quoi faire si elle n'est pas prête. */
    Status status();

    /**
     * @param ready   vrai si on peut lancer une lecture maintenant
     * @param message explication pour le coureur quand ready est faux (ex. "lance l'application Ollama")
     */
    record Status(boolean enabled, String provider, String model, boolean ready, String message) {}
}
