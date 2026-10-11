package fr.trailplanner.engine;

import fr.trailplanner.model.Checkpoint;

/**
 * Tronçon entre deux points du roadbook.
 *
 * @param from       point de départ du tronçon
 * @param to         point d'arrivée du tronçon
 * @param distanceKm distance du tronçon
 * @param gainM      D+ du tronçon
 * @param lossM      D- du tronçon
 */
public record Leg(Checkpoint from, Checkpoint to, double distanceKm, double gainM, double lossM) {

    /** Kilomètre-effort du tronçon : distance + D+/100 (convention ITRA). */
    public double effortKm() {
        return EffortModel.effortKm(distanceKm, gainM);
    }
}
