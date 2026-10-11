package fr.trailplanner.model;

import java.util.EnumSet;
import java.util.Set;

/**
 * Ce qu'on trouve à un point du roadbook. Sert au plan de nutrition (où remplir ses flasques, où
 * manger) et au type d'arrêt quand le roadbook ne le précise pas.
 */
public enum Service {
    /** Eau plate : de quoi remplir ses flasques. */
    WATER,
    /** Autres boissons : sucrées, gazeuses, isotoniques, chaudes (thé, soupe...). */
    DRINKS,
    /** Solide froid : fruits, biscuits, fromage, pain... */
    COLD_FOOD,
    /** Solide chaud, repas. */
    HOT_FOOD,
    /** Sac de délestage (affaires de rechange déposées à l'avance). */
    DROP_BAG,
    /** Assistance personnelle autorisée (un proche peut ravitailler le coureur). */
    ASSISTANCE;

    /** Services implicites d'un type d'arrêt, pour les roadbooks qui ne les détaillent pas. */
    public static Set<Service> defaultsFor(AidLevel aid) {
        return switch (aid) {
            case NONE -> EnumSet.noneOf(Service.class);
            case LIGHT -> EnumSet.of(WATER, DRINKS, COLD_FOOD);
            case FULL -> EnumSet.of(WATER, DRINKS, COLD_FOOD, HOT_FOOD);
        };
    }

    /** Type d'arrêt déduit des services : repas chaud ou sac de délestage = gros arrêt. */
    public static AidLevel aidFor(Set<Service> services) {
        if (services.contains(HOT_FOOD) || services.contains(DROP_BAG)) {
            return AidLevel.FULL;
        }
        if (services.contains(WATER) || services.contains(DRINKS) || services.contains(COLD_FOOD)) {
            return AidLevel.LIGHT;
        }
        return AidLevel.NONE;
    }
}
