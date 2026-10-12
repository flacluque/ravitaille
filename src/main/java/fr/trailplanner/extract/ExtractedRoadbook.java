package fr.trailplanner.extract;

import java.util.List;
import java.util.Objects;

/**
 * Roadbook lu par une IA dans une image ou un PDF, pour pré-remplir l'éditeur du front.
 * Ce n'est qu'une proposition : le coureur relit et corrige avant tout calcul.
 * <p>
 * Les barrières restent au format du roadbook papier ("12h30") : le front en déduit le jour,
 * comme pour une saisie à la main.
 *
 * @param startDate "2026-10-23", null si la date complète n'est pas lisible
 * @param startTime "09:00", null si absente
 * @param warnings  points à vérifier signalés par l'IA (valeur illisible, incohérence...)
 */
public record ExtractedRoadbook(
        String name,
        String startDate,
        String startTime,
        List<Point> checkpoints,
        List<String> warnings) {

    public ExtractedRoadbook {
        // Un modèle peut glisser des null dans ses listes : on les ignore plutôt que d'échouer.
        checkpoints = checkpoints == null ? List.of() : checkpoints.stream().filter(Objects::nonNull).toList();
        warnings = warnings == null ? List.of() : warnings.stream().filter(Objects::nonNull).toList();
    }

    /**
     * @param gainM     D+ cumulé depuis le départ (null si absent)
     * @param lossM     D- cumulé depuis le départ (null si absent)
     * @param cutoffIn  barrière à l'entrée, "12h30"
     * @param cutoffOut barrière à la sortie du ravito, "12h30"
     * @param aid       NONE, LIGHT ou FULL (cf. fr.trailplanner.model.AidLevel)
     * @param services  ce qu'on trouve sur place (cf. fr.trailplanner.model.Service)
     */
    public record Point(String code, String name, Double km, Double gainM, Double lossM,
                        String cutoffIn, String cutoffOut, String aid, List<String> services) {

        public Point {
            services = services == null ? List.of() : services.stream().filter(Objects::nonNull).toList();
        }
    }
}
