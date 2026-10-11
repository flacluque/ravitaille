package fr.trailplanner.engine;

import fr.trailplanner.engine.CheckpointEta.CutoffStatus;
import fr.trailplanner.model.Checkpoint;
import fr.trailplanner.model.NightWindow;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.model.Scenario;
import fr.trailplanner.track.TrackProfile;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Calcule les heures de passage à chaque point du roadbook.
 * <p>
 * L'effort de chaque tronçon est découpé en petits pas (0,05 km-effort) : à chaque pas, on
 * avance l'horloge selon le modèle d'effort, en appliquant le facteur de nuit si l'horloge
 * est dans la plage nocturne, et le facteur de forme du scénario. Aux ravitos, on ajoute le temps d'arrêt du scénario.
 */
public class RacePlanner {

    static final double STEP_EFFORT_KM = 0.05;
    static final Duration TIGHT_MARGIN = Duration.ofHours(1);

    public RacePlan plan(RaceDefinition race,
                         TrackProfile track,
                         List<ReferencePerformance> references,
                         Scenario scenario,
                         NightWindow night,
                         ElevationSource requestedSource) {

        ElevationSource source = CourseBuilder.resolve(requestedSource, race, track);
        List<Leg> legs = CourseBuilder.legs(race, track, source);
        double raceEffort = legs.stream().mapToDouble(Leg::effortKm).sum();
        List<ReferenceWeighting.Weighted> weighted =
                ReferenceWeighting.weigh(references, raceEffort, race.start().toLocalDate());

        RacePlan plan = simulate(race, legs, source, EffortModel.calibrateWeighted(weighted, scenario.fatigueExponent()),
                scenario, night, List.of());

        // Ce que prédit chaque référence seule : même course, même scénario, poids 100 %.
        List<ReferenceInsight> insights = new ArrayList<>();
        for (ReferenceWeighting.Weighted w : weighted) {
            ReferenceWeighting.Weighted alone = new ReferenceWeighting.Weighted(w.reference(), w.effortKm(),
                    w.raceMinutes(), 1, w.recencyFactor(), w.distanceFactor());
            RacePlan solo = simulate(race, legs, source,
                    EffortModel.calibrateWeighted(List.of(alone), scenario.fatigueExponent()), scenario, night, List.of());
            ReferencePerformance ref = w.reference();
            insights.add(new ReferenceInsight(ref.label(), ref.date(), ref.kind(), ref.distanceKm(), ref.elevationGainM(),
                    ref.duration(), round3(w.weight()), round3(w.recencyFactor()), round3(w.distanceFactor()),
                    solo.finish(), solo.totalDuration()));
        }
        return new RacePlan(plan.raceName(), plan.scenario(), plan.elevationSource(), plan.totalDistanceKm(),
                plan.totalGainM(), plan.totalEffortKm(), plan.start(), plan.finish(), plan.totalDuration(),
                plan.totalStops(), plan.nightDuration(), plan.checkpoints(), plan.warnings(), List.copyOf(insights));
    }

    private RacePlan simulate(RaceDefinition race, List<Leg> legs, ElevationSource source, EffortModel model,
                              Scenario scenario, NightWindow night, List<ReferenceInsight> insights) {
        List<String> warnings = new ArrayList<>();

        LocalDateTime clock = race.start();
        double effort = 0;
        double cumulativeGain = 0;
        double cumulativeKm = 0;
        double nightSeconds = 0;
        double stopSeconds = 0;

        List<CheckpointEta> etas = new ArrayList<>();
        Checkpoint startCp = race.checkpoints().get(0);
        etas.add(new CheckpointEta(startCp.code(), startCp.name(), 0, 0, 0, 0, 0,
                Duration.ZERO, 0, clock, Duration.ZERO, Duration.ZERO, clock,
                startCp.cutoffIn(), startCp.cutoffOut(), null, null, CutoffStatus.NONE, Duration.ZERO));

        for (int i = 0; i < legs.size(); i++) {
            Leg leg = legs.get(i);
            Checkpoint cp = leg.to();
            boolean isFinish = i == legs.size() - 1;

            // --- Course sur le tronçon, pas à pas ---
            LocalDateTime legStart = clock;
            double legNightSeconds = 0;
            double legEffort = leg.effortKm();
            int steps = Math.max(1, (int) Math.ceil(legEffort / STEP_EFFORT_KM));
            double stepEffort = legEffort / steps;
            double clockSeconds = 0;
            for (int s = 0; s < steps; s++) {
                double minutes = model.minutesBetween(effort, effort + stepEffort) * scenario.paceFactor();
                LocalDateTime now = legStart.plusSeconds((long) clockSeconds);
                if (night != null && night.isNight(now)) {
                    minutes *= scenario.nightFactor();
                    nightSeconds += minutes * 60;
                    legNightSeconds += minutes * 60;
                }
                clockSeconds += minutes * 60;
                effort += stepEffort;
            }
            LocalDateTime arrival = legStart.plusSeconds(Math.round(clockSeconds));
            cumulativeKm += leg.distanceKm();
            cumulativeGain += leg.gainM();

            // --- Arrêt au ravito ---
            Duration stop = isFinish ? Duration.ZERO
                    : Duration.ofSeconds(Math.round(scenario.stopMinutes(cp.aid()) * 60));
            stopSeconds += stop.toSeconds();
            LocalDateTime departure = arrival.plus(stop);

            // --- Barrières horaires ---
            Duration marginIn = cp.cutoffIn() == null ? null : Duration.between(arrival, cp.cutoffIn());
            Duration marginOut = cp.cutoffOut() == null ? null : Duration.between(departure, cp.cutoffOut());
            CutoffStatus status = status(marginIn, marginOut);
            if (status == CutoffStatus.MISSED) {
                warnings.add("Barrière horaire dépassée à " + cp.name() + " (scénario " + scenario.name() + ")");
            } else if (status == CutoffStatus.TIGHT) {
                warnings.add("Marge de moins d'1 h sur la barrière de " + cp.name());
            }

            Duration legDuration = Duration.between(legStart, arrival);
            double pace = leg.distanceKm() > 0 ? legDuration.toSeconds() / 60.0 / leg.distanceKm() : 0;

            etas.add(new CheckpointEta(cp.code(), cp.name(), round1(cumulativeKm), Math.round(cumulativeGain),
                    round1(leg.distanceKm()), Math.round(leg.gainM()), Math.round(leg.lossM()),
                    legDuration, round1(pace), arrival, Duration.between(race.start(), arrival), stop, departure,
                    cp.cutoffIn(), cp.cutoffOut(), marginIn, marginOut, status,
                    Duration.ofSeconds(Math.round(legNightSeconds))));

            clock = departure;
        }

        LocalDateTime finish = etas.get(etas.size() - 1).arrival();
        Duration total = Duration.between(race.start(), finish);
        if (race.maxDuration() != null && total.compareTo(race.maxDuration()) > 0) {
            warnings.add("Temps total supérieur au temps maximum autorisé (" + race.maxDuration().toHours() + " h)");
        }

        double totalEffort = legs.stream().mapToDouble(Leg::effortKm).sum();
        return new RacePlan(race.name(), scenario, source, round1(cumulativeKm), Math.round(cumulativeGain),
                round1(totalEffort), race.start(), finish, total,
                Duration.ofSeconds((long) stopSeconds), Duration.ofSeconds((long) nightSeconds),
                List.copyOf(etas), List.copyOf(warnings), insights);
    }

    /** Raccourci : les trois scénarios par défaut. */
    public List<RacePlan> planAll(RaceDefinition race, TrackProfile track, List<ReferencePerformance> references,
                                  NightWindow night, ElevationSource source) {
        return Scenario.defaults().stream()
                .map(s -> plan(race, track, references, s, night, source))
                .toList();
    }

    private static double round3(double v) {
        return Math.round(v * 1000) / 1000.0;
    }

    static CutoffStatus status(Duration marginIn, Duration marginOut) {
        Duration min = null;
        for (Duration m : new Duration[]{marginIn, marginOut}) {
            if (m != null && (min == null || m.compareTo(min) < 0)) {
                min = m;
            }
        }
        if (min == null) {
            return CutoffStatus.NONE;
        }
        if (min.isNegative()) {
            return CutoffStatus.MISSED;
        }
        return min.compareTo(TIGHT_MARGIN) < 0 ? CutoffStatus.TIGHT : CutoffStatus.OK;
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }
}
