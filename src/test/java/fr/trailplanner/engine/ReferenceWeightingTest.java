package fr.trailplanner.engine;

import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.model.ReferencePerformance.Kind;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ReferenceWeightingTest {

    private static final LocalDate RACE = LocalDate.of(2026, 10, 23);

    private static ReferencePerformance ref(String label, double km, double gain, int minutes, LocalDate date, Kind kind) {
        return new ReferencePerformance(label, km, gain, Duration.ofMinutes(minutes), date, kind);
    }

    @Test
    void uneSeuleReferencePeseTout() {
        var w = ReferenceWeighting.weigh(List.of(ref("60 km", 60, 3200, 528, LocalDate.of(2025, 4, 1), Kind.RACE)), 122, RACE);
        assertEquals(1, w.get(0).weight(), 1e-12);
    }

    @Test
    void lePoidsEstDiviseParDeuxTousLesSixMois() {
        assertEquals(1, ReferenceWeighting.recency(RACE, RACE), 1e-12);
        assertEquals(0.5, ReferenceWeighting.recency(RACE.minusDays(180), RACE), 1e-12);
        assertEquals(0.25, ReferenceWeighting.recency(RACE.minusDays(360), RACE), 1e-12);
        assertEquals(1, ReferenceWeighting.recency(null, RACE), "sans date : pas de pénalité");
        assertEquals(1, ReferenceWeighting.recency(RACE.plusDays(10), RACE), "après la course : traitée comme récente");
    }

    @Test
    void uneReferenceRecenteCompteDavantage() {
        var w = ReferenceWeighting.weigh(List.of(
                ref("ancienne", 60, 3200, 528, RACE.minusDays(360), Kind.RACE),
                ref("récente", 60, 3200, 500, RACE.minusDays(30), Kind.RACE)), 92, RACE);

        assertEquals(1, w.get(0).weight() + w.get(1).weight(), 1e-12);
        assertEquals(0.25 / (0.25 + Math.pow(0.5, 30 / 180.0)), w.get(0).weight(), 1e-12);
        assertTrue(w.get(1).weight() > 0.75);
    }

    @Test
    void uneDistanceEloigneeCompteMoins() {
        var w = ReferenceWeighting.weigh(List.of(
                ref("même effort", 92, 0, 528, null, Kind.RACE),
                ref("deux fois plus court", 46, 0, 240, null, Kind.RACE)), 92, null);

        assertEquals(1, w.get(0).distanceFactor(), 1e-12);
        assertEquals(1 / (1 + Math.log(2)), w.get(1).distanceFactor(), 1e-12);   // ≈ 0,59
    }

    @Test
    void unEntrainementEstConvertiEnTempsDeCourseEtPeseMoins() {
        var w = ReferenceWeighting.weigh(List.of(
                ref("course", 30, 1500, 240, null, Kind.RACE),
                ref("sortie longue", 30, 1500, 240, null, Kind.TRAINING)), 45, null);

        assertEquals(240, w.get(0).raceMinutes(), 1e-9);
        assertEquals(216, w.get(1).raceMinutes(), 1e-9);   // 10 % plus rapide en course
        assertEquals(ReferenceWeighting.TRAINING_WEIGHT, w.get(1).weight() / w.get(0).weight(), 1e-12);
    }

    @Test
    void refuseSansReference() {
        assertThrows(IllegalArgumentException.class, () -> ReferenceWeighting.weigh(List.of(), 92, RACE));
    }
}
