package fr.trailplanner.api;

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

    private final GpxParser parser = new GpxParser();
    private final TrackAnalyzer analyzer = new TrackAnalyzer();
    private final RacePlanner planner = new RacePlanner();

    public record LoadedTrack(String name, TrackProfile profile) {}

    public LoadedTrack loadTrack(InputStream gpx) {
        GpxParser.ParsedGpx parsed = parser.parse(gpx);
        return new LoadedTrack(parsed.name(), analyzer.analyze(parsed.points()));
    }

    public List<RacePlan> plan(PlanRequest request, TrackProfile track) {
        if (request.race() == null) {
            throw new IllegalArgumentException("La course (race) est obligatoire");
        }
        return request.scenariosOrDefault().stream()
                .map(s -> planner.plan(request.race(), track, request.references(), s,
                        request.night(), request.elevationSource()))
                .toList();
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
