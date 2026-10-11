package fr.trailplanner.engine;

import fr.trailplanner.api.PlanningService;
import fr.trailplanner.engine.CheckpointEta.CutoffStatus;
import fr.trailplanner.model.AidLevel;
import fr.trailplanner.model.Checkpoint;
import fr.trailplanner.model.NightWindow;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.model.Scenario;
import fr.trailplanner.report.TextReport;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RacePlannerTest {

    private static final LocalDateTime START = LocalDateTime.of(2026, 10, 23, 11, 0);
    private static final List<ReferencePerformance> REFS = List.of(
            new ReferencePerformance("60 km", 60, 3200, Duration.ofHours(8).plusMinutes(48)));
    private static final Scenario SANS_ARRET = new Scenario("test", 1.0, 1.07, 1.10, 0, 0);

    private final RacePlanner planner = new RacePlanner();

    private static Checkpoint cp(String code, double km, double gain, AidLevel aid,
                                 LocalDateTime in, LocalDateTime out) {
        return new Checkpoint(code, "CP " + code, km, gain, 0.0, in, out, aid);
    }

    /** Une course identique à la référence, coupée en deux par un ravito. */
    private static RaceDefinition courseDeReference(LocalDateTime cutoffMilieu) {
        return new RaceDefinition("Test", START, null, List.of(
                cp("D", 0, 0, AidLevel.NONE, null, null),
                cp("R", 30, 1600, AidLevel.FULL, cutoffMilieu, null),
                cp("A", 60, 3200, AidLevel.NONE, null, null)));
    }

    @Test
    void sansNuitNiArretOnRetrouveLeTempsDeReference() {
        RacePlan plan = planner.plan(courseDeReference(null), null, REFS, SANS_ARRET, null, ElevationSource.ROADBOOK);

        assertEquals(528, plan.totalDuration().toMinutes(), 1);
        assertEquals(92, plan.totalEffortKm(), 0.01);
    }

    @Test
    void lesArretsAuxRavitosSAjoutent() {
        Scenario avecArrets = new Scenario("arrêts", 1.0, 1.07, 1.0, 5, 20);
        RacePlan plan = planner.plan(courseDeReference(null), null, REFS, avecArrets, null, ElevationSource.ROADBOOK);

        assertEquals(528 + 20, plan.totalDuration().toMinutes(), 1);
        assertEquals(Duration.ofMinutes(20), plan.checkpoints().get(1).stop());
        assertEquals(Duration.ZERO, plan.checkpoints().get(2).stop(), "pas d'arrêt à l'arrivée");
    }

    @Test
    void laFormeDuJourJoueSurToutLeTemps() {
        Scenario enForme = new Scenario("forme", 0.9, 1.07, 1.0, 0, 0);
        RacePlan plan = planner.plan(courseDeReference(null), null, REFS, enForme, null, ElevationSource.ROADBOOK);
        assertEquals(528 * 0.9, plan.totalDuration().toMinutes(), 1);
    }

    @Test
    void laNuitRalentit() {
        NightWindow toujoursNuit = new NightWindow(LocalTime.of(0, 0), LocalTime.of(23, 59, 59));
        RacePlan jour = planner.plan(courseDeReference(null), null, REFS, SANS_ARRET, null, ElevationSource.ROADBOOK);
        RacePlan nuit = planner.plan(courseDeReference(null), null, REFS, SANS_ARRET, toujoursNuit, ElevationSource.ROADBOOK);

        assertEquals(jour.totalDuration().toMinutes() * 1.10, nuit.totalDuration().toMinutes(), 2);
    }

    @Test
    void laPremiereMoitieVaPlusViteQueLaSeconde() {
        RacePlan plan = planner.plan(courseDeReference(null), null, REFS, SANS_ARRET, null, ElevationSource.ROADBOOK);
        Duration premiere = plan.checkpoints().get(1).legDuration();
        Duration seconde = plan.checkpoints().get(2).legDuration();
        assertTrue(seconde.compareTo(premiere) > 0, "fatigue : la 2e moitié est plus lente");
    }

    @Test
    void statutDesBarrieresHoraires() {
        // Passage prévu au ravito vers 15h0x
        RacePlan large = planner.plan(courseDeReference(START.plusHours(8)), null, REFS, SANS_ARRET, null, ElevationSource.ROADBOOK);
        RacePlan serre = planner.plan(courseDeReference(START.plusHours(4).plusMinutes(40)), null, REFS, SANS_ARRET, null, ElevationSource.ROADBOOK);
        RacePlan rate = planner.plan(courseDeReference(START.plusHours(3)), null, REFS, SANS_ARRET, null, ElevationSource.ROADBOOK);

        assertEquals(CutoffStatus.OK, large.checkpoints().get(1).status());
        assertEquals(CutoffStatus.TIGHT, serre.checkpoints().get(1).status());
        assertEquals(CutoffStatus.MISSED, rate.checkpoints().get(1).status());
        assertFalse(rate.warnings().isEmpty());
    }

    @Test
    void nightWindowQuiPasseMinuit() {
        NightWindow n = new NightWindow(LocalTime.of(19, 0), LocalTime.of(7, 45));
        assertTrue(n.isNight(START.withHour(23)));
        assertTrue(n.isNight(START.withHour(3)));
        assertFalse(n.isNight(START.withHour(12)));
        assertFalse(n.isNight(START.withHour(7).withMinute(45)));
    }

    @Test
    void raidDesBogomiles() {
        PlanningService.Sample sample = new PlanningService().loadSample("bogomiles");
        NightWindow night = new NightWindow(LocalTime.of(19, 0), LocalTime.of(7, 45));

        List<RacePlan> plans = new RacePlanner().planAll(sample.race(), sample.track().profile(), REFS,
                night, ElevationSource.AUTO);
        System.out.println(TextReport.render(plans));

        RacePlan realiste = plans.get(1);
        assertEquals(ElevationSource.ROADBOOK, realiste.elevationSource());
        assertEquals(103, realiste.totalDistanceKm(), 0.01);
        assertEquals(10, realiste.checkpoints().size());

        // Heures de passage strictement croissantes
        for (int i = 1; i < realiste.checkpoints().size(); i++) {
            assertTrue(realiste.checkpoints().get(i).arrival().isAfter(realiste.checkpoints().get(i - 1).departure()));
        }
        // Les scénarios sont ordonnés
        assertTrue(plans.get(0).totalDuration().compareTo(plans.get(1).totalDuration()) < 0);
        assertTrue(plans.get(1).totalDuration().compareTo(plans.get(2).totalDuration()) < 0);
        // L'optimiste est devant à chaque point, le prudent derrière
        for (int i = 1; i < realiste.checkpoints().size(); i++) {
            assertTrue(plans.get(0).checkpoints().get(i).arrival().isBefore(realiste.checkpoints().get(i).arrival()));
            assertTrue(plans.get(2).checkpoints().get(i).arrival().isAfter(realiste.checkpoints().get(i).arrival()));
        }
        // Aucune barrière ratée, même en prudent
        plans.forEach(p -> assertTrue(p.checkpoints().stream().noneMatch(e -> e.status() == CutoffStatus.MISSED)));

        // Même calcul à partir de la trace GPX (parcours de l'an dernier, un peu plus court)
        RacePlan surTrace = new RacePlanner().plan(sample.race(), sample.track().profile(), REFS,
                Scenario.REALISTE, night, ElevationSource.TRACK);
        System.out.println(TextReport.render(surTrace));
        assertTrue(surTrace.totalDuration().compareTo(realiste.totalDuration()) < 0);
    }

    @Test
    void uneReferenceRecentePlusRapideAvanceLArrivee() {
        RaceDefinition race = courseDeReference(null);
        var ancienne = new ReferencePerformance("60 km l'an dernier", 60, 3200, Duration.ofMinutes(528),
                START.toLocalDate().minusDays(365), ReferencePerformance.Kind.RACE);
        var recente = new ReferencePerformance("30 km le mois dernier", 30, 1600, Duration.ofMinutes(230),
                START.toLocalDate().minusDays(30), ReferencePerformance.Kind.RACE);

        RacePlan seule = planner.plan(race, null, List.of(ancienne), SANS_ARRET, null, ElevationSource.ROADBOOK);
        RacePlan deux = planner.plan(race, null, List.of(ancienne, recente), SANS_ARRET, null, ElevationSource.ROADBOOK);

        // Le 30 km récent, plus rapide à effort égal, tire l'arrivée vers l'avant.
        assertTrue(deux.finish().isBefore(seule.finish()));
        assertEquals(2, deux.references().size());
        ReferenceInsight vieille = deux.references().get(0), neuve = deux.references().get(1);
        assertTrue(neuve.weight() > vieille.weight());
        assertEquals(1, vieille.weight() + neuve.weight(), 0.002);
        // Chaque référence seule encadre le plan combiné.
        assertEquals(seule.finish(), vieille.predictedFinish());
        assertTrue(neuve.predictedFinish().isBefore(deux.finish()));
        assertTrue(deux.finish().isBefore(vieille.predictedFinish()));
    }

    @Test
    void avecUneSeuleReferenceSaPredictionEstLePlan() {
        RacePlan plan = planner.plan(courseDeReference(null), null, REFS, SANS_ARRET, null, ElevationSource.ROADBOOK);

        assertEquals(1, plan.references().size());
        assertEquals(1, plan.references().get(0).weight());
        assertEquals(plan.finish(), plan.references().get(0).predictedFinish());
    }
}
