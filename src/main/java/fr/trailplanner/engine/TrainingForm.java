package fr.trailplanner.engine;

import fr.trailplanner.model.ReferencePerformance;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Correction de forme : compare le bloc de préparation de chaque référence à celui de la course.
 * <p>
 * <b>Fondement.</b> Tanda (2011) prédit l'allure marathon à partir du volume hebdomadaire des 8 semaines
 * de préparation ; Vickers et Vertosick (2016) trouvent que temps passés et kilométrage hebdomadaire sont
 * les deux meilleurs prédicteurs ; Knechtle et al. (2015) que le volume compte encore plus sur 100 km.
 * Chez Tanda, l'élasticité du temps au volume va de 0,06 à 0,13 au niveau amateur : on retient
 * {@value #DEFAULT_ELASTICITY} (+10 % de volume ≈ −1 % de temps).
 * <p>
 * <b>Correction.</b> Temps d'une référence × (volume de son bloc / volume du bloc de la course)^α, limitée
 * à ±{@value #MAX_ADJUSTMENT} : les coefficients viennent d'études sur route, ce sont des ordres de grandeur.
 * <p>
 * <b>Calibration personnelle.</b> Avec au moins {@value #MIN_PERSONAL_RACES} courses de référence dont on
 * connaît la préparation, α est ajusté sur les résultats du coureur (régression du temps, à effort égal, sur
 * le volume), en restant proche de {@value #DEFAULT_ELASTICITY} tant que les volumes varient peu.
 */
public final class TrainingForm {

    static final double DEFAULT_ELASTICITY = 0.10;
    static final double MAX_ADJUSTMENT = 0.08;
    static final int MIN_PERSONAL_RACES = 3;
    /** Poids de l'a priori : il faut que les ln(volume) des courses varient d'autant pour égaler la valeur par défaut. */
    static final double PRIOR_STRENGTH = 0.5;
    static final double MAX_ELASTICITY = 0.25;
    /** En ultra, une sortie longue d'au moins 40 % de l'effort de la course (Leadville : la plus longue sortie compte). */
    static final double MIN_LONG_RUN_SHARE = 0.40;
    /** Pénalité du scénario prudent quand la sortie longue manque. */
    static final double LOW_SPECIFICITY_PENALTY = 1.02;
    /** Le volume des 4 dernières semaines tombé sous la moitié du bloc : risque de désentraînement. */
    static final double DETRAINING_RATIO = 0.5;
    /** Le graphique montre aussi les 4 semaines d'avant le bloc. */
    static final int CHART_EXTRA_WEEKS = 4;

    private TrainingForm() {}

    /**
     * @param factors           correction de chaque référence (même ordre), 1 si on ne peut pas comparer
     * @param referenceBlocks   bloc de chaque référence, null sans date
     * @param elasticity        α retenu
     * @param personalRaces     courses ayant servi à la calibration personnelle (0 = valeur par défaut)
     * @param lowSpecificity    la plus longue sortie fait moins de 40 % de l'effort de la course
     */
    public record Analysis(TrainingHistory.PrepBlock target, List<TrainingHistory.PrepBlock> referenceBlocks,
                           List<Double> factors, double elasticity, int personalRaces, boolean lowSpecificity,
                           List<TrainingHistory.Week> weeks, List<String> notes) {

        /** La forme du moment est mesurable : la correction s'applique. */
        public boolean active() {
            return target.usable();
        }
    }

    public static Analysis analyze(TrainingHistory history, List<ReferencePerformance> references,
                                   LocalDate raceDate, LocalDate today, double raceEffortKm, double fatigueExponent) {
        return analyze(history, references, raceDate, today, raceEffortKm, fatigueExponent, TrainingHistory.BLOCK_WEEKS);
    }

    /** @param weeks durée des blocs de préparation (la même pour la course et les références, pour comparer) */
    public static Analysis analyze(TrainingHistory history, List<ReferencePerformance> references,
                                   LocalDate raceDate, LocalDate today, double raceEffortKm, double fatigueExponent,
                                   int weeks) {
        TrainingHistory.PrepBlock target = history.blockBefore(raceDate, today, weeks);
        List<TrainingHistory.PrepBlock> blocks = new ArrayList<>();
        for (ReferencePerformance ref : references) {
            blocks.add(ref.date() == null ? null : history.blockBefore(ref.date(), today, weeks));
        }

        int[] personal = {0};
        double alpha = target.usable() ? elasticity(references, blocks, fatigueExponent, personal) : DEFAULT_ELASTICITY;
        List<Double> factors = new ArrayList<>();
        for (TrainingHistory.PrepBlock block : blocks) {
            factors.add(target.usable() ? factor(block, target, alpha) : 1.0);
        }

        List<String> notes = new ArrayList<>();
        boolean lowSpecificity = false;
        if (!target.usable()) {
            notes.add(target.complete()
                    ? "Moins de " + (int) TrainingHistory.MIN_WEEKLY_EFFORT_KM + " km-effort par semaine sur Strava ces "
                    + weeks + " dernières semaines : ta forme n'est pas prise en compte."
                    : "L'historique Strava ne couvre pas tes " + weeks
                    + " semaines de préparation : ta forme n'est pas prise en compte.");
        } else {
            long unmeasured = factors.stream().filter(f -> f == 1.0).count();
            if (unmeasured > 0 && blocks.stream().anyMatch(b -> b == null || !b.usable())) {
                notes.add(unmeasured == 1
                        ? "Une référence n'a pas de préparation connue sur Strava (date absente ou plus ancienne) : elle n'est pas corrigée."
                        : unmeasured + " références n'ont pas de préparation connue sur Strava : elles ne sont pas corrigées.");
            }
            if (raceEffortKm > 0 && target.longestEffortKm() < MIN_LONG_RUN_SHARE * raceEffortKm) {
                lowSpecificity = true;
                notes.add(String.format(Locale.FRANCE,
                        "Ta plus longue sortie (%.0f km-effort) fait %.0f %% de l'effort de la course : en ultra, une sortie "
                                + "d'au moins %.0f %% aide à tenir la distance. Le scénario prudent compte 2 %% de plus.",
                        target.longestEffortKm(), 100 * target.longestEffortKm() / raceEffortKm, 100 * MIN_LONG_RUN_SHARE));
            }
            long daysToRace = ChronoUnit.DAYS.between(today, raceDate);
            // Affûtage : les 2 dernières semaines allégées ne comptent pas comme une baisse de forme.
            LocalDate tomorrow = today.plusDays(1);
            LocalDate recentEnd = daysToRace <= 21 && raceDate.minusWeeks(2).isBefore(tomorrow) ? raceDate.minusWeeks(2) : tomorrow;
            double recent = history.weeklyEffort(recentEnd.minusWeeks(4), recentEnd);
            if (recent < DETRAINING_RATIO * target.weeklyEffortKm()) {
                notes.add(String.format(Locale.FRANCE,
                        "Ces 4 dernières semaines : %.0f km-effort par semaine, moins de la moitié de ta préparation "
                                + "(%.0f). Après 3 à 4 semaines de coupure, la forme baisse : le plan suppose celle de ta préparation.",
                        recent, target.weeklyEffortKm()));
            }
            if (daysToRace > 21) {
                notes.add("Ta course est dans " + (daysToRace / 7) + " semaines : la prédiction suivra la fin de ta préparation.");
            }
        }
        LocalDate chartEnd = target.end();
        return new Analysis(target, blocks, List.copyOf(factors), round3(alpha), personal[0], lowSpecificity,
                history.weeks(chartEnd, weeks + CHART_EXTRA_WEEKS), List.copyOf(notes));
    }

    static double factor(TrainingHistory.PrepBlock reference, TrainingHistory.PrepBlock target, double alpha) {
        if (reference == null || !reference.usable() || !target.usable()) {
            return 1;
        }
        double f = Math.pow(reference.weeklyEffortKm() / target.weeklyEffortKm(), alpha);
        return Math.max(1 - MAX_ADJUSTMENT, Math.min(1 + MAX_ADJUSTMENT, f));
    }

    /**
     * α ajusté sur les courses du coureur : à effort égal (loi de Riegel), ln T = c − α·ln V.
     * Estimation par moindres carrés, rapprochée de la valeur par défaut selon la dispersion des volumes.
     */
    static double elasticity(List<ReferencePerformance> references, List<TrainingHistory.PrepBlock> blocks,
                             double fatigueExponent, int[] used) {
        List<double[]> points = new ArrayList<>();
        for (int i = 0; i < references.size(); i++) {
            ReferencePerformance ref = references.get(i);
            TrainingHistory.PrepBlock block = blocks.get(i);
            if (ref.kind() != ReferencePerformance.Kind.RACE || block == null || !block.usable()) {
                continue;
            }
            double effort = EffortModel.effortKm(ref.distanceKm(), ref.elevationGainM());
            double y = Math.log(ref.duration().toSeconds() / 60.0) - fatigueExponent * Math.log(effort);
            points.add(new double[]{Math.log(block.weeklyEffortKm()), y});
        }
        if (points.size() < MIN_PERSONAL_RACES) {
            return DEFAULT_ELASTICITY;
        }
        double mx = points.stream().mapToDouble(p -> p[0]).average().orElse(0);
        double my = points.stream().mapToDouble(p -> p[1]).average().orElse(0);
        double sxx = 0, sxy = 0;
        for (double[] p : points) {
            sxx += (p[0] - mx) * (p[0] - mx);
            sxy += (p[0] - mx) * (p[1] - my);
        }
        used[0] = points.size();
        double estimate = sxx > 0 ? -sxy / sxx : DEFAULT_ELASTICITY;
        double shrunk = (estimate * sxx + DEFAULT_ELASTICITY * PRIOR_STRENGTH) / (sxx + PRIOR_STRENGTH);
        return Math.max(0, Math.min(MAX_ELASTICITY, shrunk));
    }

    private static double round3(double v) {
        return Math.round(v * 1000) / 1000.0;
    }
}
