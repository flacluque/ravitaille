package fr.trailplanner.engine;

import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.model.ReferencePerformance.Kind;
import fr.trailplanner.model.TrainingSession;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static fr.trailplanner.engine.TrainingHistoryTest.regular;
import static org.junit.jupiter.api.Assertions.*;

class TrainingFormTest {

    static final LocalDate RACE = LocalDate.of(2026, 10, 23);
    static final LocalDate TODAY = RACE.minusDays(11);
    static final LocalDate CATHARES = LocalDate.of(2026, 4, 12);
    static final double TROUBADOURS_EFFORT = 122;

    static ReferencePerformance race(LocalDate date, double km, double gain, long minutes) {
        return new ReferencePerformance("Course du " + date, km, gain, Duration.ofMinutes(minutes), date, Kind.RACE);
    }

    /** Préparation des Cathares à 40 km-effort par semaine, celle des Troubadours à 55. */
    static TrainingHistory catharesThenTroubadours() {
        List<TrainingSession> sessions = new ArrayList<>(regular(CATHARES.minusDays(7), 12, 4, 10, 0));
        sessions.addAll(regular(TODAY.plusDays(1), 12, 5, 11, 0));
        sessions.add(new TrainingSession(TODAY.minusWeeks(3), 45, 600, "TrailRun")); // sortie longue de 51 km-effort
        return new TrainingHistory(LocalDate.of(2025, 9, 1), sessions);
    }

    @Test
    void corrigeUneReferencePrepareeAvecMoinsDeVolume() {
        TrainingHistory history = catharesThenTroubadours();
        List<ReferencePerformance> refs = List.of(race(CATHARES, 60, 3200, 528));

        TrainingForm.Analysis a = TrainingForm.analyze(history, refs, RACE, TODAY, TROUBADOURS_EFFORT, 1.07);

        assertTrue(a.active());
        assertEquals(40.0, a.referenceBlocks().get(0).weeklyEffortKm());
        // volume de la course : 12 × 5 × 11 + 51 = 711 → 59,25 par semaine
        assertEquals(59.3, a.target().weeklyEffortKm());
        assertEquals(Math.pow(40.0 / 59.3, 0.10), a.factors().get(0), 1e-9);
        assertEquals(0.10, a.elasticity());
        assertEquals(0, a.personalRaces());
        assertEquals(16, a.weeks().size());
    }

    @Test
    void limiteLaCorrection() {
        TrainingHistory.PrepBlock small = block(10);
        TrainingHistory.PrepBlock huge = block(1000);
        assertEquals(0.92, TrainingForm.factor(small, huge, 0.10), 1e-12);
        assertEquals(1.08, TrainingForm.factor(huge, small, 0.10), 1e-12);
        assertEquals(1, TrainingForm.factor(null, huge, 0.10));
        assertEquals(1, TrainingForm.factor(block(2), huge, 0.10), "préparation non mesurable : pas de correction");
    }

    @Test
    void neCorrigeRienSansPreparationMesurable() {
        TrainingHistory empty = new TrainingHistory(LocalDate.of(2025, 1, 1), List.of());
        List<ReferencePerformance> refs = List.of(race(CATHARES, 60, 3200, 528));

        TrainingForm.Analysis a = TrainingForm.analyze(empty, refs, RACE, TODAY, TROUBADOURS_EFFORT, 1.07);

        assertFalse(a.active());
        assertEquals(List.of(1.0), a.factors());
        assertTrue(a.notes().get(0).contains("n'est pas prise en compte"), a.notes().toString());
    }

    @Test
    void signaleUneSortieLongueTropCourte() {
        TrainingHistory history = new TrainingHistory(LocalDate.of(2025, 1, 1), regular(TODAY.plusDays(1), 12, 4, 12, 300));
        TrainingForm.Analysis a = TrainingForm.analyze(history, List.of(race(CATHARES, 60, 3200, 528)),
                RACE, TODAY, TROUBADOURS_EFFORT, 1.07);

        assertTrue(a.lowSpecificity());
        assertTrue(a.notes().stream().anyMatch(n -> n.contains("plus longue sortie (15 km-effort)")), a.notes().toString());
    }

    @Test
    void signaleUnVolumeEffondre() {
        // 12 semaines de préparation, puis 4 semaines presque sans courir avant aujourd'hui (course dans 2 mois).
        LocalDate today = RACE.minusWeeks(8);
        List<TrainingSession> sessions = new ArrayList<>(regular(today.minusWeeks(4), 8, 4, 12, 0));
        sessions.add(new TrainingSession(today.minusDays(3), 8, 0, "Run"));
        TrainingHistory history = new TrainingHistory(LocalDate.of(2025, 1, 1), sessions);

        TrainingForm.Analysis a = TrainingForm.analyze(history, List.of(race(CATHARES, 60, 3200, 528)),
                RACE, today, TROUBADOURS_EFFORT, 1.07);

        assertTrue(a.notes().stream().anyMatch(n -> n.startsWith("Ces 4 dernières semaines")), a.notes().toString());
        assertTrue(a.notes().stream().anyMatch(n -> n.contains("dans 8 semaines")), a.notes().toString());
    }

    @Test
    void neConfondPasLAffutageAvecUnArret() {
        // Préparation régulière, puis affûtage à 40 % les 2 dernières semaines : pas d'alerte.
        LocalDate today = RACE.minusDays(2);
        List<TrainingSession> sessions = new ArrayList<>(regular(RACE.minusWeeks(2), 14, 4, 12, 0));
        sessions.addAll(regular(today.plusDays(1), 2, 2, 8, 0));
        TrainingHistory history = new TrainingHistory(LocalDate.of(2025, 1, 1), sessions);

        TrainingForm.Analysis a = TrainingForm.analyze(history, List.of(race(CATHARES, 60, 3200, 528)),
                RACE, today, 50, 1.07);

        assertTrue(a.notes().stream().noneMatch(n -> n.startsWith("Ces 4 dernières semaines")), a.notes().toString());
    }

    @Test
    void ajusteLaSensibiliteSurLesCoursesDuCoureur() {
        // Trois courses au même effort : plus de volume, nettement plus rapide (α réel ≈ 0,2).
        LocalDate d1 = LocalDate.of(2025, 4, 1), d2 = LocalDate.of(2025, 9, 1), d3 = LocalDate.of(2026, 4, 1);
        List<TrainingSession> sessions = new ArrayList<>();
        sessions.addAll(regular(d1.minusDays(7), 12, 3, 10, 0));  // 30 / semaine
        sessions.addAll(regular(d2.minusDays(7), 12, 3, 20, 0));  // 60
        sessions.addAll(regular(d3.minusDays(7), 12, 3, 40, 0));  // 120
        sessions.addAll(regular(TODAY.plusDays(1), 12, 3, 20, 0));
        TrainingHistory history = new TrainingHistory(LocalDate.of(2024, 9, 1), sessions);
        long t1 = 600;
        List<ReferencePerformance> refs = List.of(
                race(d1, 80, 3000, t1),
                race(d2, 80, 3000, Math.round(t1 * Math.pow(2, -0.2))),
                race(d3, 80, 3000, Math.round(t1 * Math.pow(4, -0.2))));

        TrainingForm.Analysis a = TrainingForm.analyze(history, refs, RACE, TODAY, TROUBADOURS_EFFORT, 1.07);

        assertEquals(3, a.personalRaces());
        // ln(volume) varie de 1,39 : l'estimation 0,2 l'emporte largement sur la valeur par défaut 0,1.
        double sxx = 2 * Math.pow(Math.log(2), 2);
        assertEquals((0.2 * sxx + 0.1 * 0.5) / (sxx + 0.5), a.elasticity(), 0.003);
        assertEquals(1.0, a.factors().get(1), 1e-9, "même volume que la course : pas de correction");
        assertTrue(a.factors().get(0) < 1 && a.factors().get(2) > 1);
    }

    private static TrainingHistory.PrepBlock block(double weekly) {
        return new TrainingHistory.PrepBlock(RACE.minusWeeks(13), RACE.minusWeeks(1), true, weekly, weekly, 0, 20, 30, 12);
    }
}
