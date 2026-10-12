package fr.trailplanner.api;

import fr.trailplanner.engine.RacePlan;
import fr.trailplanner.engine.TrainingHistory;
import fr.trailplanner.engine.TrainingSource;
import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.model.TrainingSession;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class PlanningServiceTest {

    private static final Clock TODAY = Clock.fixed(Instant.parse("2026-10-12T08:00:00Z"), ZoneId.of("Europe/Paris"));
    private static final ReferencePerformance CATHARES = new ReferencePerformance("Cathares", 60, 3200,
            Duration.ofHours(8).plusMinutes(48), LocalDate.of(2026, 4, 12), ReferencePerformance.Kind.RACE);

    /** Source factice : retient la demande, renvoie une préparation régulière. */
    private static final class FakeSource implements TrainingSource {
        LocalDate since;
        Boolean hikes;
        RuntimeException failure;

        @Override
        public Optional<TrainingHistory> history(LocalDate since, boolean includeHikes) {
            this.since = since;
            this.hikes = includeHikes;
            if (failure != null) {
                throw failure;
            }
            List<TrainingSession> sessions = new ArrayList<>();
            for (LocalDate d = since; d.isBefore(LocalDate.of(2026, 10, 12)); d = d.plusDays(2)) {
                sessions.add(new TrainingSession(d, 12, 300, "TrailRun"));
            }
            return Optional.of(new TrainingHistory(since, sessions));
        }
    }

    private PlanRequest request(PlanRequest.TrainingOptions training) {
        PlanningService.Sample sample = new PlanningService().loadSample("bogomiles");
        return new PlanRequest(sample.race(), List.of(CATHARES), null, null, null, training);
    }

    @Test
    void demandeLHistoriqueDepuisLeBlocDeLaPlusAncienneReference() {
        FakeSource source = new FakeSource();
        PlanningService service = new PlanningService(source, TODAY);

        List<RacePlan> plans = service.plan(request(new PlanRequest.TrainingOptions(true, true)), null);

        assertEquals(LocalDate.of(2026, 4, 12).minusDays(7).minusWeeks(12), source.since);
        assertTrue(source.hikes);
        assertEquals(3, plans.size());
        assertTrue(plans.get(1).training().active());
    }

    @Test
    void sansOptionNiSourceOnSePasseDeLHistorique() {
        FakeSource source = new FakeSource();
        assertNull(new PlanningService(source, TODAY).plan(request(null), null).get(0).training());
        assertNull(new PlanningService(source, TODAY).plan(request(new PlanRequest.TrainingOptions(false, false)), null)
                .get(0).training());
        assertNull(source.since, "Strava n'est pas interrogé");
        assertNull(new PlanningService(null, TODAY).plan(request(new PlanRequest.TrainingOptions(true, false)), null)
                .get(0).training());
    }

    @Test
    void stravaInjoignableLePlanSeFaitQuandMeme() {
        FakeSource source = new FakeSource();
        source.failure = new IllegalStateException("Strava ne répond pas");

        RacePlan plan = new PlanningService(source, TODAY).plan(request(new PlanRequest.TrainingOptions(true, false)), null).get(1);

        assertNull(plan.training());
        assertTrue(plan.warnings().get(0).startsWith("Historique Strava indisponible (Strava ne répond pas)"), plan.warnings().toString());
    }
}
