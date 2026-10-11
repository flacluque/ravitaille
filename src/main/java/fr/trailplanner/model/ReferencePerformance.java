package fr.trailplanner.model;

import java.time.Duration;

/**
 * Une course de référence déjà réalisée par le coureur, qui sert à calibrer le modèle.
 * Le temps inclut les arrêts aux ravitos de cette course.
 */
public record ReferencePerformance(
        String label,
        double distanceKm,
        double elevationGainM,
        Duration duration) {

    public ReferencePerformance {
        if (distanceKm <= 0 || elevationGainM < 0 || duration == null || duration.isNegative() || duration.isZero()) {
            throw new IllegalArgumentException("Performance de référence invalide : " + label);
        }
    }
}
