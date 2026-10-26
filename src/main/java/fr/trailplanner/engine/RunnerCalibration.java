package fr.trailplanner.engine;

import fr.trailplanner.model.Scenario;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * Mesure le profil personnel d'un coureur ({@link RunnerProfile}) sur ses sorties enregistrées, point par point
 * (flux Strava : temps, distance, altitude, en mouvement ou non).
 *
 * <h2>Méthode</h2>
 * Chaque sortie est découpée en bouts de {@value #SEGMENT_M} m. Pour chaque bout, on compare le temps passé en
 * mouvement à ce que donne le modèle standard : {@code t = rythme de la sortie × E^β × coût standard de la pente},
 * où E est l'effort déjà fait depuis le départ (la fatigue du modèle de Riegel, β = exposant − 1). On estime ensemble,
 * par moindres carrés sur les logarithmes :
 * <ul>
 *   <li>un rythme propre à chaque sortie (une sortie tranquille ne dit rien de ton rythme de course) ;</li>
 *   <li>un rapport au coût standard par tranche de pente, le plat valant 1 ;</li>
 *   <li>β, sur les seules sorties de plus de {@value #LONG_HOURS} h.</li>
 * </ul>
 * Peu de mesures, peu d'écart : chaque tranche de pente ne s'éloigne du standard qu'en proportion des kilomètres
 * mesurés ({@value #SLOPE_SHRINK_KM} km pour la moitié du chemin), et la fatigue en proportion des sorties longues
 * ({@value #FATIGUE_SHRINK} sorties pour la moitié). En montée, le coût ne peut pas baisser quand la pente augmente.
 */
public final class RunnerCalibration {

    /** Une sortie enregistrée : un point par seconde ou presque. */
    public record Activity(LocalDate date, boolean race, double[] timeS, double[] distanceM, double[] altitudeM,
                           boolean[] moving) {}

    static final double SEGMENT_M = 100;
    /** Limites des tranches de pente ; la tranche du plat va de −2 à +2 %. */
    static final double[] EDGES = {-1, -0.3, -0.2, -0.15, -0.1, -0.06, -0.02, 0.02, 0.06, 0.1, 0.15, 0.2, 0.3, 1};
    static final int FLAT = 6;
    static final double SLOPE_SHRINK_KM = 5;
    static final double FATIGUE_SHRINK = 4;
    static final double LONG_HOURS = 2;
    /** En dessous, pas de profil : trop peu de mesures. */
    static final double MIN_KM = 20;
    /** Bouts gardés : allure entre 2 et 30 min/km, au moins 80 % du temps en mouvement. */
    static final double MIN_PACE_S_PER_M = 0.12;
    static final double MAX_PACE_S_PER_M = 1.8;
    static final double MIN_MOVING_SHARE = 0.8;
    static final double RACE_WEIGHT = 2;

    private record Segment(int activity, double km, double grade, double seconds, double lnEffort, double weight,
                           int bucket) {}

    private RunnerCalibration() {}

    public static Optional<RunnerProfile> calibrate(List<Activity> activities) {
        List<Segment> segments = new ArrayList<>();
        boolean[] longActivity = new boolean[activities.size()];
        LocalDate from = null, to = null;
        int used = 0;
        for (int a = 0; a < activities.size(); a++) {
            Activity act = activities.get(a);
            int before = segments.size();
            double movingS = segments(act, a, segments);
            if (segments.size() == before) {
                continue;
            }
            used++;
            longActivity[a] = movingS >= LONG_HOURS * 3600;
            if (act.date() != null) {
                from = from == null || act.date().isBefore(from) ? act.date() : from;
                to = to == null || act.date().isAfter(to) ? act.date() : to;
            }
        }
        double totalKm = segments.stream().mapToDouble(Segment::km).sum();
        if (totalKm < MIN_KM) {
            return Optional.empty();
        }
        int buckets = EDGES.length - 1;
        double[] lnRatio = new double[buckets];
        double[] alpha = new double[activities.size()];
        double beta = Scenario.REALISTE.fatigueExponent() - 1;
        boolean anyLong = segments.stream().anyMatch(s -> longActivity[s.activity()]);
        for (int iteration = 0; iteration < 8; iteration++) {
            // Rythme de chaque sortie
            double[] num = new double[activities.size()], den = new double[activities.size()];
            for (Segment s : segments) {
                num[s.activity()] += s.weight() * (lnY(s) - beta * s.lnEffort() - lnRatio[s.bucket()]);
                den[s.activity()] += s.weight();
            }
            for (int a = 0; a < alpha.length; a++) {
                alpha[a] = den[a] > 0 ? num[a] / den[a] : 0;
            }
            // Rapport au standard par tranche, le plat valant 1
            double[] bn = new double[buckets], bd = new double[buckets];
            for (Segment s : segments) {
                bn[s.bucket()] += s.weight() * (lnY(s) - alpha[s.activity()] - beta * s.lnEffort());
                bd[s.bucket()] += s.weight();
            }
            double flat = bd[FLAT] > 0 ? bn[FLAT] / bd[FLAT] : 0;
            for (int b = 0; b < buckets; b++) {
                lnRatio[b] = bd[b] > 0 ? bn[b] / bd[b] - flat : 0;
            }
            // Fatigue : pente de ln(allure) contre ln(effort fait), dans chaque sortie longue
            if (anyLong) {
                double[] meanLnE = new double[activities.size()], wSum = new double[activities.size()];
                for (Segment s : segments) {
                    meanLnE[s.activity()] += s.weight() * s.lnEffort();
                    wSum[s.activity()] += s.weight();
                }
                double sxy = 0, sxx = 0;
                for (Segment s : segments) {
                    if (!longActivity[s.activity()]) {
                        continue;
                    }
                    double x = s.lnEffort() - meanLnE[s.activity()] / wSum[s.activity()];
                    double y = lnY(s) - alpha[s.activity()] - lnRatio[s.bucket()];
                    sxy += s.weight() * x * y;
                    sxx += s.weight() * x * x;
                }
                if (sxx > 0) {
                    beta = sxy / sxx;
                }
            }
        }

        // Tranches : rapprochées du standard selon les km mesurés ; en montée, coût croissant avec la pente
        double[] km = new double[buckets], gradeSum = new double[buckets];
        for (Segment s : segments) {
            km[s.bucket()] += s.km();
            gradeSum[s.bucket()] += s.km() * s.grade();
        }
        List<RunnerProfile.SlopePoint> points = new ArrayList<>();
        double previousClimbFactor = 0;
        for (int b = 0; b < buckets; b++) {
            if (km[b] < 0.5) {
                continue;
            }
            double grade = gradeSum[b] / km[b];
            double ratio = Math.exp(lnRatio[b] * km[b] / (km[b] + SLOPE_SHRINK_KM));
            if (grade > 0) {
                double factor = Math.max(TerrainEffort.factor(grade) * ratio, previousClimbFactor);
                ratio = factor / TerrainEffort.factor(grade);
                previousClimbFactor = factor;
            }
            ratio = clamp(ratio, RunnerProfile.MIN_RATIO, RunnerProfile.MAX_RATIO);
            RunnerProfile.SlopePoint point = new RunnerProfile.SlopePoint(round3(grade), round3(ratio), Math.round(km[b] * 10) / 10.0);
            RunnerProfile.SlopePoint last = points.isEmpty() ? null : points.get(points.size() - 1);
            if (last != null && point.grade() <= last.grade()) {
                // Deux tranches à la même pente moyenne (pente juste à la limite) : on les fusionne.
                double total = last.km() + point.km();
                point = new RunnerProfile.SlopePoint(last.grade(),
                        round3((last.ratio() * last.km() + point.ratio() * point.km()) / total), Math.round(total * 10) / 10.0);
                points.set(points.size() - 1, point);
            } else {
                points.add(point);
            }
        }
        int longCount = 0;
        for (int a = 0; a < longActivity.length; a++) {
            if (longActivity[a]) {
                longCount++;
            }
        }
        double standard = Scenario.REALISTE.fatigueExponent();
        double measured = 1 + beta;
        double fatigue = clamp(standard + (measured - standard) * longCount / (longCount + FATIGUE_SHRINK),
                RunnerProfile.MIN_FATIGUE, RunnerProfile.MAX_FATIGUE);
        return Optional.of(new RunnerProfile(points, round3(fatigue), used, Math.round(totalKm * 10) / 10.0, longCount,
                from, to));
    }

    /** ln(temps par km-effort standard) du bout. */
    private static double lnY(Segment s) {
        return Math.log(s.seconds() / (s.km() * TerrainEffort.factor(s.grade())));
    }

    /** Découpe une sortie en bouts de 100 m ; renvoie son temps en mouvement (s). */
    private static double segments(Activity act, int index, List<Segment> out) {
        double[] t = act.timeS(), d = act.distanceM(), alt = act.altitudeM();
        boolean[] moving = act.moving();
        int n = Math.min(Math.min(t.length, d.length), alt.length);
        if (n < 10) {
            return 0;
        }
        double weight = act.race() ? RACE_WEIGHT : 1;
        double movingTotal = 0;
        double effort = 0;
        int start = 0;
        double segStartD = d[0];
        double segMoving = 0, segElapsed = 0;
        for (int i = 1; i < n; i++) {
            double dt = t[i] - t[i - 1];
            if (dt < 0 || dt > 600) {
                // Trou dans l'enregistrement : on recommence un bout
                start = i;
                segStartD = d[i];
                segMoving = segElapsed = 0;
                continue;
            }
            boolean isMoving = moving == null || moving.length <= i || moving[i];
            segElapsed += dt;
            if (isMoving) {
                segMoving += dt;
                movingTotal += dt;
            }
            double covered = d[i] - segStartD;
            if (covered >= SEGMENT_M) {
                double km = covered / 1000;
                double grade = (alt[i] - alt[start]) / covered;
                effort += km * TerrainEffort.factor(clamp(grade, -0.6, 0.6));
                double pace = segMoving / covered;
                boolean keep = Math.abs(grade) <= 0.6 && segMoving > 0 && pace >= MIN_PACE_S_PER_M
                        && pace <= MAX_PACE_S_PER_M && segMoving >= MIN_MOVING_SHARE * segElapsed && effort >= 1;
                if (keep) {
                    out.add(new Segment(index, km, grade, segMoving, Math.log(effort), weight * km, bucket(grade)));
                }
                start = i;
                segStartD = d[i];
                segMoving = segElapsed = 0;
            }
        }
        return movingTotal;
    }

    static int bucket(double grade) {
        int i = Arrays.binarySearch(EDGES, grade);
        int b = i >= 0 ? i : -i - 2;
        return (int) clamp(b, 0, EDGES.length - 2);
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static double round3(double v) {
        return Math.round(v * 1000) / 1000.0;
    }
}
