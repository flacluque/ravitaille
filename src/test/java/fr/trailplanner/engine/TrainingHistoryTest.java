package fr.trailplanner.engine;

import fr.trailplanner.model.TrainingSession;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TrainingHistoryTest {

    static final LocalDate RACE = LocalDate.of(2026, 10, 23);

    /** {@code perWeek} sorties de {@code km} km et {@code gain} m chaque semaine, sur {@code weeks} semaines avant {@code end}. */
    static List<TrainingSession> regular(LocalDate end, int weeks, int perWeek, double km, double gain) {
        List<TrainingSession> sessions = new ArrayList<>();
        for (int w = 1; w <= weeks; w++) {
            for (int s = 0; s < perWeek; s++) {
                sessions.add(new TrainingSession(end.minusWeeks(w).plusDays(s), km, gain, "TrailRun"));
            }
        }
        return sessions;
    }

    @Test
    void resumeLesDouzeSemainesAvantLaSemaineDeCourse() {
        LocalDate blockEnd = RACE.minusDays(7);
        List<TrainingSession> sessions = new ArrayList<>(regular(blockEnd, 12, 3, 15, 500));
        sessions.add(new TrainingSession(blockEnd.minusDays(20), 40, 2000, "TrailRun")); // sortie longue
        sessions.add(new TrainingSession(RACE.minusDays(3), 10, 100, "Run"));           // semaine de course : exclue
        sessions.add(new TrainingSession(blockEnd.minusWeeks(13), 30, 1000, "Run"));     // avant le bloc : exclue
        TrainingHistory history = new TrainingHistory(RACE.minusYears(1), sessions);

        TrainingHistory.PrepBlock block = history.blockBefore(RACE, RACE.plusDays(30));

        assertEquals(blockEnd.minusWeeks(12), block.start());
        assertEquals(blockEnd, block.end());
        assertTrue(block.complete());
        assertEquals(37, block.sessions());
        // 36 × (15 + 5) + (40 + 20) = 780 km-effort sur 12 semaines
        assertEquals(65.0, block.weeklyEffortKm());
        assertEquals(60.0, block.longestEffortKm());
        assertEquals(12, block.activeWeeks());
        assertTrue(block.usable());
    }

    @Test
    void refuseUneDureeHorsDeDixASeizeSemaines() {
        TrainingHistory history = new TrainingHistory(RACE.minusYears(1), List.of());
        assertEquals(10, history.blockBefore(RACE, RACE, 10).blockWeeks());
        assertEquals(16, history.blockBefore(RACE, RACE, 16).blockWeeks());
        assertThrows(IllegalArgumentException.class, () -> history.blockBefore(RACE, RACE, 9));
        assertThrows(IllegalArgumentException.class, () -> history.blockBefore(RACE, RACE, 17));
    }

    @Test
    void sArreteAujourdhuiPourUneCourseAVenir() {
        LocalDate today = RACE.minusWeeks(5);
        TrainingHistory history = new TrainingHistory(RACE.minusYears(1), regular(today.plusDays(1), 12, 2, 10, 0));

        TrainingHistory.PrepBlock block = history.blockBefore(RACE, today);

        assertEquals(today.plusDays(1), block.end());
        assertEquals(20.0, block.weeklyEffortKm());
    }

    @Test
    void signaleUnHistoriqueIncompletOuTropMaigre() {
        TrainingHistory recent = new TrainingHistory(RACE.minusWeeks(4), regular(RACE.minusDays(7), 3, 3, 10, 0));
        assertFalse(recent.blockBefore(RACE, RACE).complete());
        assertFalse(recent.blockBefore(RACE, RACE).usable());

        TrainingHistory light = new TrainingHistory(RACE.minusYears(1), regular(RACE.minusDays(7), 12, 1, 4, 0));
        assertTrue(light.blockBefore(RACE, RACE).complete());
        assertFalse(light.blockBefore(RACE, RACE).usable(), "4 km-effort par semaine : pas de préparation mesurable");
    }

    @Test
    void decoupeLesSemainesPourLeGraphique() {
        LocalDate end = RACE.minusDays(7);
        TrainingHistory history = new TrainingHistory(RACE.minusYears(1), List.of(
                new TrainingSession(end.minusDays(1), 10, 300, "Run"),
                new TrainingSession(end.minusDays(2), 5, 0, "Hike"),
                new TrainingSession(end.minusDays(10), 20, 1000, "TrailRun")));

        List<TrainingHistory.Week> weeks = history.weeks(end, 16);

        assertEquals(16, weeks.size());
        assertEquals(end.minusWeeks(16), weeks.get(0).start());
        assertEquals(new TrainingHistory.Week(end.minusWeeks(1), 18.0, 15.0, 300, 2), weeks.get(15));
        assertEquals(30.0, weeks.get(14).effortKm());
        assertEquals(7.0 * 48 / 21, history.weeklyEffort(end.minusDays(21), end), 1e-9);
    }
}
