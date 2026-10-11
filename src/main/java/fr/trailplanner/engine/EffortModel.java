package fr.trailplanner.engine;

import fr.trailplanner.model.ReferencePerformance;

import java.util.List;

/**
 * Modèle d'effort : kilomètre-effort + loi de fatigue de type Riegel.
 *
 * <h2>Principe</h2>
 * <ul>
 *   <li>Kilomètre-effort (ITRA) : E = distance (km) + D+ (m) / 100.
 *       100 m de montée « coûtent » autant qu'un kilomètre à plat.</li>
 *   <li>Loi de Riegel appliquée à l'effort : le temps pour atteindre l'effort cumulé E vaut
 *       T(E) = a × E^b. Avec b &gt; 1, l'allure se dégrade naturellement au fil de la course,
 *       ce qui modélise la fatigue sans paramètre supplémentaire.</li>
 *   <li>Le coefficient a est calibré sur les performances de référence du coureur :
 *       a = T_ref / E_ref^b, moyenne pondérée si plusieurs références (voir {@link ReferenceWeighting}).</li>
 * </ul>
 * Les temps sont exprimés en minutes.
 */
public final class EffortModel {

    private final double a;
    private final double b;

    private EffortModel(double a, double b) {
        this.a = a;
        this.b = b;
    }

    public static double effortKm(double distanceKm, double gainM) {
        return distanceKm + gainM / 100.0;
    }

    /** Calibration à poids égaux (références de course, sans date ni course cible). */
    public static EffortModel calibrate(List<ReferencePerformance> references, double exponent) {
        return calibrateWeighted(ReferenceWeighting.weigh(references, Double.NaN, null), exponent);
    }

    /** a = Σ poids × T_ref / E_ref^b, avec les poids de {@link ReferenceWeighting}. */
    public static EffortModel calibrateWeighted(List<ReferenceWeighting.Weighted> references, double exponent) {
        double a = 0;
        for (ReferenceWeighting.Weighted ref : references) {
            a += ref.weight() * ref.raceMinutes() / Math.pow(ref.effortKm(), exponent);
        }
        return new EffortModel(a, exponent);
    }

    /** Temps (min) pour atteindre l'effort cumulé donné, sans arrêts ni nuit. */
    public double minutesAt(double cumulativeEffortKm) {
        return cumulativeEffortKm <= 0 ? 0 : a * Math.pow(cumulativeEffortKm, b);
    }

    /** Temps (min) pour passer de l'effort cumulé e0 à e1. */
    public double minutesBetween(double e0, double e1) {
        return minutesAt(e1) - minutesAt(e0);
    }

    /** Allure instantanée (min par km-effort) à l'effort cumulé donné. */
    public double paceAt(double cumulativeEffortKm) {
        return a * b * Math.pow(Math.max(cumulativeEffortKm, 1e-6), b - 1);
    }

    public double coefficient() {
        return a;
    }

    public double exponent() {
        return b;
    }
}
