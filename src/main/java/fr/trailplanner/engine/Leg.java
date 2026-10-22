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
 * @param terrainEffortKm effort selon la pente, montées et descentes (voir {@link TerrainEffort}) : c'est lui qui
 *                   règle le temps du tronçon
 */
public record Leg(Checkpoint from, Checkpoint to, double distanceKm, double gainM, double lossM, double terrainEffortKm) {

    /** Tronçon sans profil : montée et descente à pente moyenne. */
    public Leg(Checkpoint from, Checkpoint to, double distanceKm, double gainM, double lossM) {
        this(from, to, distanceKm, gainM, lossM, TerrainEffort.ofTotals(distanceKm, gainM, lossM));
    }

    /** Kilomètre-effort du tronçon : distance + D+/100 (convention ITRA), pour comparer les distances. */
    public double effortKm() {
        return EffortModel.effortKm(distanceKm, gainM);
    }
}
