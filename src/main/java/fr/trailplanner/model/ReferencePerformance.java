package fr.trailplanner.model;

import com.fasterxml.jackson.annotation.JsonCreator;

import java.time.Duration;
import java.time.LocalDate;

/**
 * Une performance déjà réalisée par le coureur, qui sert à calibrer le modèle : une course, ou une
 * sortie d'entraînement chronométrée. Le temps inclut les arrêts.
 *
 * @param date date de la performance (null si inconnue) : les plus récentes comptent plus, elles
 *             reflètent la forme actuelle
 * @param kind course ou entraînement (null = course)
 */
public record ReferencePerformance(
        String label,
        double distanceKm,
        double elevationGainM,
        Duration duration,
        LocalDate date,
        Kind kind) {

    public enum Kind {
        /** Course officielle : effort maximal. */
        RACE,
        /** Sortie d'entraînement : rarement courue à fond, on la convertit en temps de course. */
        TRAINING
    }

    @JsonCreator
    public ReferencePerformance {
        if (distanceKm <= 0 || elevationGainM < 0 || duration == null || duration.isNegative() || duration.isZero()) {
            throw new IllegalArgumentException("Performance de référence invalide : " + label);
        }
        if (kind == null) {
            kind = Kind.RACE;
        }
    }

    /** Course sans date (compatibilité : une seule référence, sans pondération). */
    public ReferencePerformance(String label, double distanceKm, double elevationGainM, Duration duration) {
        this(label, distanceKm, elevationGainM, duration, null, Kind.RACE);
    }
}
