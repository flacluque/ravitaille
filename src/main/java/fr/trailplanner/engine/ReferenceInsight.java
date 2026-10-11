package fr.trailplanner.engine;

import fr.trailplanner.model.ReferencePerformance;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Ce que dit une référence à elle seule, pour que le coureur voie sa progression (ou une référence
 * qui détonne) et le poids qu'elle a dans le plan.
 *
 * @param weight          poids normalisé dans le plan (0 à 1)
 * @param predictedFinish arrivée prédite avec cette seule référence, dans le même scénario
 */
public record ReferenceInsight(
        String label,
        LocalDate date,
        ReferencePerformance.Kind kind,
        double distanceKm,
        double elevationGainM,
        Duration duration,
        double weight,
        double recencyFactor,
        double distanceFactor,
        LocalDateTime predictedFinish,
        Duration predictedDuration) {
}
