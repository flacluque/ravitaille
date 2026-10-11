package fr.trailplanner.engine;

import fr.trailplanner.model.Scenario;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Plan de course complet pour un scénario.
 *
 * @param references ce que prédit chaque référence seule, et son poids dans ce plan
 */
public record RacePlan(
        String raceName,
        Scenario scenario,
        ElevationSource elevationSource,
        double totalDistanceKm,
        double totalGainM,
        double totalEffortKm,
        LocalDateTime start,
        LocalDateTime finish,
        Duration totalDuration,
        Duration totalStops,
        Duration nightDuration,
        List<CheckpointEta> checkpoints,
        List<String> warnings,
        List<ReferenceInsight> references) {
}
