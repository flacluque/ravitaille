package fr.trailplanner.engine;

import fr.trailplanner.model.ReferencePerformance;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Poids de chaque performance de référence dans la calibration du modèle.
 * <p>
 * Le coureur progresse (ou régresse) entre ses références et sa course : une seule vieille référence
 * ne dit pas sa forme du jour. On combine donc plusieurs références, chacune avec un poids :
 * <ul>
 *   <li><b>Récence</b> : le poids est divisé par deux tous les {@value #HALF_LIFE_DAYS} jours écoulés
 *       entre la référence et la course. Une course d'il y a un an compte quatre fois moins qu'une
 *       course de la veille. Sans date, pas de pénalité.</li>
 *   <li><b>Distance</b> : extrapoler d'un 20 km vers un 100 km est moins fiable que d'un 80 km. Le poids
 *       vaut 1 / (1 + |ln(effort course / effort référence)|) : ×0,6 pour un effort deux fois plus court
 *       ou plus long, ×0,4 pour un effort cinq fois plus court.</li>
 *   <li><b>Entraînement</b> : une sortie d'entraînement est rarement courue à fond. Son temps est
 *       converti en temps de course (×{@value #TRAINING_TIME_FACTOR}, soit 10 % plus rapide), et elle
 *       compte un peu moins qu'une course (×{@value #TRAINING_WEIGHT}), cette conversion restant approximative.</li>
 * </ul>
 * Les poids sont normalisés (somme = 1).
 */
public final class ReferenceWeighting {

    static final double HALF_LIFE_DAYS = 180;
    static final double TRAINING_TIME_FACTOR = 0.90;
    static final double TRAINING_WEIGHT = 0.6;

    private ReferenceWeighting() {}

    /**
     * Une référence avec ce qu'en retient le modèle.
     *
     * @param effortKm        kilomètres-effort de la référence
     * @param raceMinutes     temps retenu, converti en temps de course pour un entraînement
     * @param weight          poids normalisé (somme = 1 sur toutes les références)
     * @param recencyFactor   part du poids due à l'ancienneté (1 = récente ou sans date)
     * @param distanceFactor  part du poids due à l'écart de distance avec la course (1 = même effort)
     */
    public record Weighted(ReferencePerformance reference, double effortKm, double raceMinutes, double weight,
                           double recencyFactor, double distanceFactor) {}

    /**
     * @param targetEffortKm effort de la course à planifier ; NaN pour ignorer l'écart de distance
     * @param raceDate       date de la course ; null pour ignorer l'ancienneté
     */
    public static List<Weighted> weigh(List<ReferencePerformance> references, double targetEffortKm, LocalDate raceDate) {
        if (references == null || references.isEmpty()) {
            throw new IllegalArgumentException("Au moins une performance de référence est nécessaire");
        }
        List<Weighted> raw = new ArrayList<>();
        double total = 0;
        for (ReferencePerformance ref : references) {
            double effort = EffortModel.effortKm(ref.distanceKm(), ref.elevationGainM());
            boolean training = ref.kind() == ReferencePerformance.Kind.TRAINING;
            double minutes = ref.duration().toSeconds() / 60.0 * (training ? TRAINING_TIME_FACTOR : 1);
            double recency = recency(ref.date(), raceDate);
            double distance = Double.isNaN(targetEffortKm) ? 1 : 1 / (1 + Math.abs(Math.log(targetEffortKm / effort)));
            double weight = recency * distance * (training ? TRAINING_WEIGHT : 1);
            total += weight;
            raw.add(new Weighted(ref, effort, minutes, weight, recency, distance));
        }
        double sum = total;
        return raw.stream()
                .map(w -> new Weighted(w.reference(), w.effortKm(), w.raceMinutes(), w.weight() / sum,
                        w.recencyFactor(), w.distanceFactor()))
                .toList();
    }

    static double recency(LocalDate date, LocalDate raceDate) {
        if (date == null || raceDate == null) {
            return 1;
        }
        long days = Math.max(0, ChronoUnit.DAYS.between(date, raceDate));
        return Math.pow(0.5, days / HALF_LIFE_DAYS);
    }
}
