package fr.trailplanner.extract;

import java.util.List;

/**
 * Une IA capable de lire un document (images de ses pages, et leur texte quand il y en a) et de répondre
 * en JSON selon un schéma : roadbook, règlement... L'implémentation se choisit par configuration
 * (trailplanner.extraction.provider) : changer d'IA ne touche ni au front ni au reste du backend.
 */
public interface DocumentReader {

    /**
     * @return la réponse JSON du modèle, conforme au schéma de la demande
     * @throws ExtractionException si l'IA est injoignable ou ne répond pas un JSON
     */
    String read(Request request);

    /** État de l'IA, pour que le front explique quoi faire si elle n'est pas prête. */
    Status status();

    /**
     * @param system consignes de lecture
     * @param user   demande, avec le texte des pages quand le document en contient
     * @param schema schéma JSON imposé à la réponse
     * @param images pages du document en images (JPEG), dans l'ordre
     */
    record Request(String system, String user, String schema, List<byte[]> images) {

        public Request {
            images = List.copyOf(images);
        }
    }

    /**
     * @param ready   vrai si on peut lancer une lecture maintenant
     * @param message explication pour le coureur quand ready est faux (ex. "lance l'application Ollama")
     */
    record Status(boolean enabled, String provider, String model, boolean ready, String message) {}
}
