package fr.trailplanner.extract;

import java.util.List;
import java.util.Objects;

/**
 * Liste de matériel lue par une IA dans un règlement (image ou PDF), pour pré-remplir la checklist du
 * coureur. À relire : c'est une proposition.
 *
 * @param race     la course dont la liste a été retenue (utile quand le document en couvre plusieurs)
 * @param warnings points à vérifier signalés par l'IA
 */
public record ExtractedGear(String race, List<Item> items, List<String> warnings) {

    public ExtractedGear {
        items = items == null ? List.of() : items.stream().filter(Objects::nonNull).toList();
        warnings = warnings == null ? List.of() : warnings.stream().filter(Objects::nonNull).toList();
    }

    /**
     * @param name   libellé tel qu'écrit, quantités comprises ("2 lampes frontales avec piles de rechange")
     * @param status MANDATORY (obligatoire) ou RECOMMENDED (recommandé, conseillé)
     */
    public record Item(String name, String status) {}
}
