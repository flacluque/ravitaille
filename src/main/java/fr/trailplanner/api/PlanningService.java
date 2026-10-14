package fr.trailplanner.api;

import fr.trailplanner.engine.TrainingHistory;
import fr.trailplanner.engine.TrainingSource;
import fr.trailplanner.model.ReferencePerformance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;

import fr.trailplanner.engine.RacePlan;
import fr.trailplanner.engine.RacePlanner;
import fr.trailplanner.gpx.GpxParser;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.track.TrackAnalyzer;
import fr.trailplanner.track.TrackProfile;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;

/** Orchestration : GPX → profil → plans de course. */
@Service
public class PlanningService {

    private static final Logger log = LoggerFactory.getLogger(PlanningService.class);

    private final GpxParser parser = new GpxParser();
    private final TrackAnalyzer analyzer = new TrackAnalyzer();
    private final RacePlanner planner = new RacePlanner();
    private final Clock clock;

    @Autowired
    public PlanningService() {
        this(Clock.systemDefaultZone());
    }

    PlanningService(Clock clock) {
        this.clock = clock;
    }

    public record LoadedTrack(String name, TrackProfile profile) {}

    public LoadedTrack loadTrack(InputStream gpx) {
        GpxParser.ParsedGpx parsed = parser.parse(gpx);
        return new LoadedTrack(parsed.name(), analyzer.analyze(parsed.points()));
    }

    /** Plans sans historique d'entraînement. */
    public List<RacePlan> plan(PlanRequest request, TrackProfile track) {
        return plan(request, track, null);
    }

    /** Plans, avec la forme du coureur si {@code training} donne son historique (Strava). */
    public List<RacePlan> plan(PlanRequest request, TrackProfile track, TrainingSource training) {
        if (request.race() == null) {
            throw new IllegalArgumentException("La course (race) est obligatoire");
        }
        LocalDate today = LocalDate.now(clock);
        List<String> warnings = new ArrayList<>();
        TrainingHistory history = history(request, training, today, warnings);
        int weeks = request.training() == null ? TrainingHistory.BLOCK_WEEKS : request.training().weeksOrDefault();
        return request.scenariosOrDefault().stream()
                .map(s -> planner.plan(request.race(), track, request.references(), s,
                        request.night(), request.elevationSource(), history, today, weeks))
                .map(p -> warnings.isEmpty() ? p : withWarnings(p, warnings))
                .toList();
    }

    /**
     * Historique d'entraînement couvrant le bloc de préparation de la course et de chaque référence.
     * Si Strava ne répond pas, le plan se fait sans, avec un avertissement.
     */
    private TrainingHistory history(PlanRequest request, TrainingSource training, LocalDate today,
                                    List<String> warnings) {
        PlanRequest.TrainingOptions options = request.training();
        if (options == null || !options.strava() || training == null
                || request.references() == null || request.references().isEmpty()) {
            return null;
        }
        LocalDate raceDate = request.race().start().toLocalDate();
        LocalDate oldest = raceDate.isBefore(today) ? raceDate : today;
        for (ReferencePerformance ref : request.references()) {
            if (ref.date() != null && ref.date().isBefore(oldest)) {
                oldest = ref.date();
            }
        }
        // Début du bloc de la plus ancienne date : semaine de course + durée de la préparation.
        LocalDate since = oldest.minusDays(7).minusWeeks(options.weeksOrDefault());
        try {
            return training.history(since, options.includeHikes()).orElse(null);
        } catch (RuntimeException e) {
            log.warn("Historique d'entraînement indisponible : {}", e.getMessage());
            warnings.add("Historique Strava indisponible (" + e.getMessage() + ") : ta forme n'est pas prise en compte.");
            return null;
        }
    }

    private static RacePlan withWarnings(RacePlan p, List<String> extra) {
        List<String> all = new ArrayList<>(extra);
        all.addAll(p.warnings());
        return new RacePlan(p.raceName(), p.scenario(), p.elevationSource(), p.totalDistanceKm(), p.totalGainM(),
                p.totalEffortKm(), p.start(), p.finish(), p.totalDuration(), p.totalStops(), p.nightDuration(),
                p.checkpoints(), List.copyOf(all), p.references(), p.training());
    }

    /** Charge une course d'exemple embarquée (src/main/resources/samples/&lt;id&gt;/). */
    public Sample loadSample(String id) {
        String base = "/samples/" + id + "/";
        try (InputStream roadbook = getClass().getResourceAsStream(base + "roadbook.json");
             InputStream gpx = getClass().getResourceAsStream(base + "trace.gpx")) {
            if (roadbook == null) {
                throw new IllegalArgumentException("Exemple inconnu : " + id);
            }
            RaceDefinition race = JsonSupport.mapper().readValue(roadbook, RaceDefinition.class);
            LoadedTrack track = gpx == null ? null : loadTrack(gpx);
            return new Sample(race, track);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public record Sample(RaceDefinition race, LoadedTrack track) {}
}
