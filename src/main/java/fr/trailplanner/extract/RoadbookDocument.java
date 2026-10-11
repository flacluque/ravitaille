package fr.trailplanner.extract;

import java.util.List;

/**
 * Roadbook prêt à être lu par une IA.
 *
 * @param images une image JPEG par page retenue, dans l'ordre
 * @param texts  texte de chaque page retenue quand le PDF en contient (sinon vide) : les nombres y sont
 *               exacts, sans erreur de lecture d'image
 * @param notes  remarques pour le coureur (pages retenues dans un long PDF...)
 */
public record RoadbookDocument(List<byte[]> images, List<String> texts, List<String> notes) {

    public RoadbookDocument {
        images = List.copyOf(images);
        texts = List.copyOf(texts);
        notes = List.copyOf(notes);
    }

    public static RoadbookDocument ofImages(List<byte[]> images) {
        return new RoadbookDocument(images, List.of(), List.of());
    }
}
