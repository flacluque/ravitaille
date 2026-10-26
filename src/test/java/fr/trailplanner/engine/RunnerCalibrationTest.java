package fr.trailplanner.engine;

import fr.trailplanner.model.AidLevel;
import fr.trailplanner.model.Checkpoint;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.model.Scenario;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class RunnerCalibrationTest {

    /** Le coureur simulé : 20 % plus rapide que le standard en montée, 20 % plus lent en descente, fatigue 1,12. */
    private static double trueRatio(double grade) {
        return grade > 0.02 ? 0.8 : grade < -0.02 ? 1.2 : 1;
    }

    private static final double TRUE_EXPONENT = 1.12;
    private static final double[] GRADES = {0, 0.05, 0.12, 0.2, 0.08, -0.04, -0.1, -0.18, -0.07, 0.0, 0.15, -0.13};

    /** Une sortie de `km` km, un point par seconde, sur un relief qui alterne les pentes tous les 500 m. */
    private static RunnerCalibration.Activity activity(double km, double paceSecPerEffortKm) {
        List<double[]> pts = new ArrayList<>();
        double t = 0, d = 0, alt = 500, effort = 0;
        pts.add(new double[] {t, d, alt});
        int segments = (int) (km * 10);
        for (int s = 0; s < segments; s++) {
            double grade = GRADES[(s / 5) % GRADES.length];
            double segEffort = 0.1 * TerrainEffort.factor(grade);
            effort += segEffort;
            // Temps du bout : allure × fatigue de Riegel (dérivée de E^b) × coût réel de la pente
            double seconds = paceSecPerEffortKm * TRUE_EXPONENT * Math.pow(Math.max(effort, 0.1), TRUE_EXPONENT - 1)
                    * segEffort * trueRatio(grade);
            int steps = (int) Math.round(seconds);
            for (int k = 1; k <= steps; k++) {
                pts.add(new double[] {t + k, d + 100.0 * k / steps, alt + grade * 100.0 * k / steps});
            }
            t += steps;
            d += 100;
            alt += grade * 100;
        }
        int n = pts.size();
        double[] time = new double[n], dist = new double[n], altitude = new double[n];
        boolean[] moving = new boolean[n];
        for (int i = 0; i < n; i++) {
            time[i] = pts.get(i)[0];
            dist[i] = pts.get(i)[1];
            altitude[i] = pts.get(i)[2];
            moving[i] = true;
        }
        return new RunnerCalibration.Activity(LocalDate.of(2026, 9, 1), false, time, dist, altitude, moving);
    }

    @Test
    void retrouveLeCoutDeLaPenteEtLaFatigueDuCoureur() {
        List<RunnerCalibration.Activity> runs = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            runs.add(activity(25 + i, 330 + 10 * i));
        }
        RunnerProfile p = RunnerCalibration.calibrate(runs).orElseThrow();
        assertEquals(12, p.activities());
        assertEquals(12, p.longActivities());
        // Beaucoup de km par tranche : la mesure est proche de la vérité.
        assertEquals(0.8, p.ratioAt(0.12), 0.05);
        assertEquals(0.8, p.ratioAt(0.2), 0.05);
        assertEquals(1.2, p.ratioAt(-0.1), 0.05);
        assertEquals(1.0, p.ratioAt(0.0), 0.01);
        // La fatigue de l'entraînement n'est pas gardée : celle du coureur moyen, en attendant ses courses.
        assertEquals(1.07, p.fatigueExponent(), 1e-9);
    }

    @Test
    void mesureLaFatigueDUneCourseACoutDePenteDonne() {
        RunnerCalibration.Activity race = activity(60, 340);
        RunnerProfile runner = new RunnerProfile(List.of(new RunnerProfile.SlopePoint(-0.03, 1.2, 50),
                new RunnerProfile.SlopePoint(0, 1, 50), new RunnerProfile.SlopePoint(0.03, 0.8, 50)), 1.07, 5, 150, 0, null, null);
        // Avec le vrai coût de la pente du coureur, on retrouve sa fatigue.
        assertEquals(TRUE_EXPONENT, RunnerCalibration.raceFatigue(race, RunnerProfile.factor(runner)).orElseThrow(), 0.01);
        // Trop court pour parler de fatigue.
        assertTrue(RunnerCalibration.raceFatigue(activity(12, 300), RunnerProfile.factor(null)).isEmpty());
    }

    @Test
    void peuDeMesuresRestentProchesDuStandard() {
        RunnerProfile p = RunnerCalibration.calibrate(List.of(activity(22, 360))).orElseThrow();
        // Une seule sortie : chaque tranche n'a que quelques km, l'écart mesuré est réduit de moitié ou plus.
        assertTrue(p.ratioAt(0.12) > 0.85 && p.ratioAt(0.12) < 1, "montée : " + p.ratioAt(0.12));
        assertTrue(p.fatigueExponent() < 1.085, "fatigue : " + p.fatigueExponent());
        assertEquals(Optional.empty(), RunnerCalibration.calibrate(List.of(activity(8, 360))));
    }

    @Test
    void laMonteeNeCoutePasMoinsQuandElleSeRaidit() {
        RunnerProfile p = RunnerCalibration.calibrate(List.of(activity(40, 340), activity(40, 350))).orElseThrow();
        double previous = 0;
        for (RunnerProfile.SlopePoint s : p.slope()) {
            if (s.grade() > 0) {
                assertTrue(p.factorAt(s.grade()) >= previous - 1e-9);
                previous = p.factorAt(s.grade());
            }
        }
    }

    @Test
    void unProfilRecuEstVerifie() {
        assertThrows(IllegalArgumentException.class, () -> new RunnerProfile(
                List.of(new RunnerProfile.SlopePoint(0.1, 9, 3)), 1.07, 1, 30, 1, null, null));
        assertThrows(IllegalArgumentException.class, () -> new RunnerProfile(List.of(), 1.6, 1, 30, 1, null, null));
        assertThrows(IllegalArgumentException.class, () -> new RunnerProfile(List.of(
                new RunnerProfile.SlopePoint(0.1, 1, 3), new RunnerProfile.SlopePoint(0.05, 1, 3)), 1.07, 1, 30, 1, null, null));
    }

    @Test
    void leProfilChangeLeRythmeEntreMontéesEtDescentes() {
        // Course : une montée de 10 km à 10 %, puis une descente de 10 km à −10 %.
        Checkpoint start = new Checkpoint("D", "Départ", 0, 0.0, 0.0, null, null, AidLevel.NONE);
        Checkpoint top = new Checkpoint("S", "Sommet", 10, 1000.0, 0.0, null, null, AidLevel.NONE);
        Checkpoint finish = new Checkpoint("A", "Arrivée", 20, 1000.0, 1000.0, null, null, AidLevel.NONE);
        RaceDefinition race = new RaceDefinition("Col", LocalDateTime.of(2026, 10, 24, 8, 0), null, List.of(start, top, finish));
        List<ReferencePerformance> refs = List.of(new ReferencePerformance("Réf", 20, 1000, Duration.ofHours(3)));
        RunnerProfile climber = new RunnerProfile(List.of(new RunnerProfile.SlopePoint(-0.1, 1.3, 20),
                new RunnerProfile.SlopePoint(0, 1, 20), new RunnerProfile.SlopePoint(0.1, 0.8, 20)), 1.07, 5, 100, 3, null, null);
        RacePlanner planner = new RacePlanner();
        RacePlan standard = planner.plan(race, null, refs, Scenario.REALISTE, null, ElevationSource.ROADBOOK);
        RacePlan personal = planner.plan(race, null, refs, Scenario.REALISTE, null, ElevationSource.ROADBOOK,
                null, null, TrainingHistory.BLOCK_WEEKS, climber);
        // Il arrive plus tôt au sommet que le coureur standard ; la référence (même profil) cale le total.
        assertTrue(personal.checkpoints().get(1).arrival().isBefore(standard.checkpoints().get(1).arrival()));
        assertEquals(standard.totalDuration().toMinutes(), personal.totalDuration().toMinutes(), 2);
        assertSame(climber, personal.runner());
        assertNull(standard.runner());
    }

    @Test
    void laFatiguePersonnelleDecaleLesTroisScenarios() {
        RunnerProfile tired = new RunnerProfile(List.of(), 1.15, 5, 100, 4, null, null);
        assertEquals(0.08, tired.fatigueShift(), 1e-9);
        Checkpoint start = new Checkpoint("D", "Départ", 0, 0.0, 0.0, null, null, AidLevel.NONE);
        Checkpoint finish = new Checkpoint("A", "Arrivée", 80, 4000.0, 4000.0, null, null, AidLevel.NONE);
        RaceDefinition race = new RaceDefinition("Long", LocalDateTime.of(2026, 10, 24, 6, 0), null, List.of(start, finish));
        List<ReferencePerformance> refs = List.of(new ReferencePerformance("Réf", 30, 1500, Duration.ofHours(4)));
        RacePlanner planner = new RacePlanner();
        RacePlan standard = planner.plan(race, null, refs, Scenario.REALISTE, null, ElevationSource.ROADBOOK);
        RacePlan personal = planner.plan(race, null, refs, Scenario.REALISTE, null, ElevationSource.ROADBOOK,
                null, null, TrainingHistory.BLOCK_WEEKS, tired);
        // Plus fatigable : plus lent sur une course bien plus longue que sa référence.
        assertTrue(personal.totalDuration().compareTo(standard.totalDuration()) > 0);
        assertEquals(1.15, personal.scenario().fatigueExponent(), 1e-9);
    }
}
