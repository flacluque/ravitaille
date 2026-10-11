package fr.trailplanner.api;

import fr.trailplanner.engine.CourseBuilder;
import fr.trailplanner.engine.ElevationSource;
import fr.trailplanner.engine.RacePlan;
import fr.trailplanner.gpx.GpxParser;
import fr.trailplanner.model.NightWindow;
import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.report.TextReport;
import fr.trailplanner.track.TrackProfile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.LocalTime;
import java.util.List;

@RestController
@RequestMapping("/api")
public class PlanController {

    private final PlanningService service;

    public PlanController(PlanningService service) {
        this.service = service;
    }

    /** Analyse d'une trace GPX : distance, D+/D-, profil. */
    @PostMapping(path = "/tracks/analyze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TrackSummary analyze(@RequestPart("gpx") MultipartFile gpx,
                                @RequestParam(defaultValue = "0.1") double stepKm) throws IOException {
        try (InputStream in = gpx.getInputStream()) {
            PlanningService.LoadedTrack track = service.loadTrack(in);
            return TrackSummary.of(track.name(), track.profile(), stepKm);
        }
    }

    /** Plan de course : roadbook + références (JSON) et trace GPX optionnelle. */
    @PostMapping(path = "/plans", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<RacePlan> plan(@RequestPart("request") PlanRequest request,
                               @RequestPart(value = "gpx", required = false) MultipartFile gpx) throws IOException {
        TrackProfile track = null;
        if (gpx != null && !gpx.isEmpty()) {
            try (InputStream in = gpx.getInputStream()) {
                track = service.loadTrack(in).profile();
            }
        }
        return service.plan(request, track);
    }

    /** Même chose sans GPX, en JSON pur (le D+ officiel du roadbook suffit). */
    @PostMapping(path = "/plans", consumes = MediaType.APPLICATION_JSON_VALUE)
    public List<RacePlan> planJson(@RequestBody PlanRequest request) {
        return service.plan(request, null);
    }

    /**
     * Démo sur le Raid des Bogomiles embarqué. Exemple :
     * GET /api/demo/bogomiles?refKm=60&refGain=3200&refTime=PT8H48M
     */
    @GetMapping("/demo/{id}")
    public List<RacePlan> demo(@PathVariable String id,
                               @RequestParam(defaultValue = "60") double refKm,
                               @RequestParam(defaultValue = "3200") double refGain,
                               @RequestParam(defaultValue = "PT8H48M") Duration refTime,
                               @RequestParam(defaultValue = "AUTO") ElevationSource source) {
        PlanningService.Sample sample = service.loadSample(id);
        PlanRequest request = demoRequest(sample, refKm, refGain, refTime, source);
        return service.plan(request, sample.track() == null ? null : sample.track().profile());
    }

    /** Version texte imprimable de la démo. */
    @GetMapping(path = "/demo/{id}/report", produces = MediaType.TEXT_PLAIN_VALUE)
    public String demoReport(@PathVariable String id,
                             @RequestParam(defaultValue = "60") double refKm,
                             @RequestParam(defaultValue = "3200") double refGain,
                             @RequestParam(defaultValue = "PT8H48M") Duration refTime,
                             @RequestParam(defaultValue = "AUTO") ElevationSource source) {
        return TextReport.render(demo(id, refKm, refGain, refTime, source));
    }

    /** Roadbook vs trace GPX, point par point : pour vérifier que la trace colle au parcours officiel. */
    @GetMapping("/demo/{id}/check")
    public List<CheckpointComparison> check(@PathVariable String id) {
        PlanningService.Sample sample = service.loadSample(id);
        if (sample.track() == null) {
            throw new IllegalArgumentException("Pas de trace GPX pour " + id);
        }
        TrackProfile track = sample.track().profile();
        return sample.race().checkpoints().stream().map(cp -> {
            TrackProfile.ProfilePoint p = CourseBuilder.onTrack(sample.race(), track, cp);
            return new CheckpointComparison(cp.code(), cp.name(), cp.km(), cp.gainM(),
                    Math.round(p.km() * 10) / 10.0, Math.round(p.cumulativeGainM()), Math.round(p.elevationM()));
        }).toList();
    }

    public record CheckpointComparison(String code, String name, double roadbookKm, Double roadbookGainM,
                                       double trackKm, double trackGainM, double trackElevationM) {}

    private static PlanRequest demoRequest(PlanningService.Sample sample, double refKm, double refGain,
                                           Duration refTime, ElevationSource source) {
        return new PlanRequest(sample.race(),
                List.of(new ReferencePerformance("Référence", refKm, refGain, refTime)),
                new NightWindow(LocalTime.of(19, 0), LocalTime.of(7, 45)),
                source, null);
    }

    @ExceptionHandler({IllegalArgumentException.class, GpxParser.GpxParseException.class})
    public ProblemDetail badRequest(RuntimeException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
