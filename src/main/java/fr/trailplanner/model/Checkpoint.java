package fr.trailplanner.model;

import com.fasterxml.jackson.annotation.JsonCreator;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

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
 * @param aid        type d'arrêt (temps passé au ravito). Déduit des services s'il manque.
 * @param services   ce qu'on trouve sur place. Déduits du type d'arrêt s'ils manquent (anciens roadbooks).
 */
public record Checkpoint(
        String code,
        String name,
        double km,
        Double gainM,
        Double lossM,
        LocalDateTime cutoffIn,
        LocalDateTime cutoffOut,
        AidLevel aid,
        Set<Service> services) {

    @JsonCreator
    public Checkpoint {
        if (km < 0) {
            throw new IllegalArgumentException("Kilométrage négatif pour " + name);
        }
        if (aid == null) {
            aid = services == null ? AidLevel.NONE : Service.aidFor(services);
        }
        // EnumSet : ordre stable (celui de l'enum) dans le JSON, quel que soit l'ordre de saisie.
        services = Collections.unmodifiableSet(services == null ? Service.defaultsFor(aid)
                : services.isEmpty() ? EnumSet.noneOf(Service.class) : EnumSet.copyOf(services));
    }

    /** Sans services détaillés : ils se déduisent du type d'arrêt. */
    public Checkpoint(String code, String name, double km, Double gainM, Double lossM,
                      LocalDateTime cutoffIn, LocalDateTime cutoffOut, AidLevel aid) {
        this(code, name, km, gainM, lossM, cutoffIn, cutoffOut, aid, null);
    }

    /** Vrai si l'on peut remplir ses flasques à ce point. */
    public boolean hasWater() {
        return services.contains(Service.WATER) || services.contains(Service.DRINKS);
    }
}
