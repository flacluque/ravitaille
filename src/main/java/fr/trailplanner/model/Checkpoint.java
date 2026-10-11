package fr.trailplanner.model;

import java.time.LocalDateTime;

/**
 * Point du roadbook (départ, ravito, point de passage, arrivée).
 *
 * @param code       code du roadbook (ex. "5", "1D")
 * @param name       nom du lieu
 * @param km         kilométrage officiel depuis le départ
 * @param gainM      D+ cumulé officiel (null si inconnu : on prendra celui du GPX)
 * @param lossM      D- cumulé officiel (null si inconnu)
 * @param cutoffIn   barrière horaire à l'entrée (null si aucune)
 * @param cutoffOut  barrière horaire à la sortie (null si aucune)
 * @param aid        type de ravito
 */
public record Checkpoint(
        String code,
        String name,
        double km,
        Double gainM,
        Double lossM,
        LocalDateTime cutoffIn,
        LocalDateTime cutoffOut,
        AidLevel aid) {

    public Checkpoint {
        if (km < 0) {
            throw new IllegalArgumentException("Kilométrage négatif pour " + name);
        }
        if (aid == null) {
            aid = AidLevel.NONE;
        }
    }
}
