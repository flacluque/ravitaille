package fr.trailplanner.engine;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * Prévision de passage à un point du roadbook.
 *
 * @param marginIn         barrière d'entrée - heure d'arrivée (null si pas de barrière)
 * @param marginOut        barrière de sortie - heure de départ du ravito (null si pas de barrière)
 * @param legNightDuration part du tronçon courue de nuit (on boit moins la nuit : plan d'hydratation)
 */
public record CheckpointEta(
        String code,
        String name,
        double km,
        double cumulativeGainM,
        double legDistanceKm,
        double legGainM,
        double legLossM,
        Duration legDuration,
        double legPaceMinPerKm,
        LocalDateTime arrival,
        Duration elapsed,
        Duration stop,
        LocalDateTime departure,
        LocalDateTime cutoffIn,
        LocalDateTime cutoffOut,
        Duration marginIn,
        Duration marginOut,
        CutoffStatus status,
        Duration legNightDuration) {

    public enum CutoffStatus {
        /** Pas de barrière horaire sur ce point. */
        NONE,
        /** Plus d'1 h de marge. */
        OK,
        /** Moins d'1 h de marge : à surveiller. */
        TIGHT,
        /** Barrière dépassée. */
        MISSED
    }
}
