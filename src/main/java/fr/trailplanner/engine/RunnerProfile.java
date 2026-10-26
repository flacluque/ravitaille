package fr.trailplanner.engine;

import com.fasterxml.jackson.annotation.JsonCreator;
import fr.trailplanner.model.Scenario;

import java.time.LocalDate;
import java.util.List;
import java.util.function.DoubleUnaryOperator;

/**
 * Profil personnel du coureur, mesuré sur ses sorties (voir {@link RunnerCalibration}) : son coût selon la pente,
 * comparé au coût standard de {@link TerrainEffort}, et sa fatigue au fil de la course.
 * <p>
 * Le profil est calculé une fois, gardé par le navigateur et renvoyé avec chaque demande de plan : il est donc
 * vérifié à la réception.
 *
 * @param slope           rapport au coût standard selon la pente (1 = comme le modèle standard), trié par pente
 * @param fatigueExponent exposant de fatigue du scénario réaliste pour ce coureur (1,07 pour le modèle standard)
 * @param activities      nombre de sorties mesurées
 * @param km              distance mesurée (km)
 * @param longActivities  sorties de plus de 2 h, celles qui renseignent sur la fatigue
 * @param from            date de la plus ancienne sortie mesurée
 * @param to              date de la plus récente
 */
public record RunnerProfile(List<SlopePoint> slope, double fatigueExponent, int activities, double km,
                            int longActivities, LocalDate from, LocalDate to) {

    /**
     * @param grade pente moyenne de la tranche (m/m, négative en descente)
     * @param ratio coût du coureur / coût standard à cette pente (0,8 = 20 % plus rapide que le modèle standard)
     * @param km    distance mesurée dans cette tranche
     */
    public record SlopePoint(double grade, double ratio, double km) {}

    static final double MIN_RATIO = 0.4;
    static final double MAX_RATIO = 2.5;
    static final double MIN_FATIGUE = 1.02;
    static final double MAX_FATIGUE = 1.25;

    @JsonCreator
    public RunnerProfile {
        slope = slope == null ? List.of() : List.copyOf(slope);
        if (slope.size() > 30) {
            throw new IllegalArgumentException("Profil du coureur illisible : trop de tranches de pente");
        }
        for (int i = 0; i < slope.size(); i++) {
            SlopePoint p = slope.get(i);
            if (!(p.grade() >= -1 && p.grade() <= 1) || !(p.ratio() >= MIN_RATIO && p.ratio() <= MAX_RATIO)
                    || (i > 0 && p.grade() <= slope.get(i - 1).grade())) {
                throw new IllegalArgumentException("Profil du coureur illisible : recalcule-le depuis Strava");
            }
        }
        if (!(fatigueExponent >= MIN_FATIGUE && fatigueExponent <= MAX_FATIGUE)) {
            throw new IllegalArgumentException("Profil du coureur illisible : fatigue hors plage");
        }
    }

    /** Rapport au coût standard à une pente : interpolé entre les tranches mesurées, constant au-delà. */
    public double ratioAt(double grade) {
        if (slope.isEmpty()) {
            return 1;
        }
        if (grade <= slope.get(0).grade()) {
            return slope.get(0).ratio();
        }
        for (int i = 1; i < slope.size(); i++) {
            SlopePoint a = slope.get(i - 1), b = slope.get(i);
            if (grade <= b.grade()) {
                double t = (grade - a.grade()) / (b.grade() - a.grade());
                return a.ratio() + t * (b.ratio() - a.ratio());
            }
        }
        return slope.get(slope.size() - 1).ratio();
    }

    /** Coefficient de temps du coureur (1 = plat) pour une pente g. */
    public double factorAt(double grade) {
        return TerrainEffort.factor(grade) * ratioAt(grade);
    }

    /** Coefficient de pente à utiliser pour l'effort : le sien, ou le standard sans profil. */
    public static DoubleUnaryOperator factor(RunnerProfile profile) {
        return profile == null ? TerrainEffort::factor : profile::factorAt;
    }

    /** Écart de son exposant de fatigue à celui du modèle standard, appliqué aux trois scénarios. */
    public double fatigueShift() {
        return fatigueExponent - Scenario.REALISTE.fatigueExponent();
    }
}
