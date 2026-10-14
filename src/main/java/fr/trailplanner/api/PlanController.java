package fr.trailplanner.api;

import fr.trailplanner.engine.CourseBuilder;
import fr.trailplanner.engine.ElevationSource;
import fr.trailplanner.engine.RacePlan;
import fr.trailplanner.gpx.GpxParser;
import fr.trailplanner.model.NightWindow;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.report.TextReport;
import fr.trailplanner.strava.StravaCookies;
import fr.trailplanner.strava.StravaService;
import fr.trailplanner.strava.StravaSession;
import fr.trailplanner.track.TrackProfile;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
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
    private final StravaService strava;
    private final StravaCookies cookies;

    public PlanController(PlanningService service, StravaService strava, StravaCookies cookies) {
        this.service = service;
        this.strava = strava;
        this.cookies = cookies;
    }

    /** Plans avec l'historique Strava du coureur qui fait la requête (cookie), réécrit s'il a été renouvelé. */
    private List<RacePlan> plans(PlanRequest request, TrackProfile track, HttpServletRequest http, HttpServletResponse response) {
        StravaSession session = cookies.read(http);
        try {
            return service.plan(request, track, strava.source(session));
        } finally {
            cookies.save(session, http, response);
        }
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

    /** Course à dessiner (carte, profil, ravitos) : roadbook (JSON) et trace GPX optionnelle. */
    @PostMapping(path = "/courses", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CourseView course(@RequestPart("race") RaceDefinition race,
                             @RequestPart(value = "gpx", required = false) MultipartFile gpx,
                             @RequestParam(defaultValue = "0.1") double stepKm) throws IOException {
        if (gpx == null || gpx.isEmpty()) {
            return CourseView.of(race, null, null, stepKm);
        }
        try (InputStream in = gpx.getInputStream()) {
            PlanningService.LoadedTrack track = service.loadTrack(in);
            return CourseView.of(race, track.profile(), track.name(), stepKm);
        }
    }

    /** Plan de course : roadbook + références (JSON) et trace GPX optionnelle. */
    @PostMapping(path = "/plans", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<RacePlan> plan(@RequestPart("request") PlanRequest request,
                               @RequestPart(value = "gpx", required = false) MultipartFile gpx,
                               HttpServletRequest http, HttpServletResponse response) throws IOException {
        TrackProfile track = null;
        if (gpx != null && !gpx.isEmpty()) {
            try (InputStream in = gpx.getInputStream()) {
                track = service.loadTrack(in).profile();
            }
        }
        return plans(request, track, http, response);
    }

    /**
     * Plans de course et course à dessiner (carte, profil) d'un coup : c'est ce qu'utilise le front
     * pour une course chargée par le coureur, avec ou sans trace GPX.
     */
    @PostMapping(path = "/plans/full", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public PlanView planFull(@RequestPart("request") PlanRequest request,
                             @RequestPart(value = "gpx", required = false) MultipartFile gpx,
                             @RequestParam(defaultValue = "0.1") double stepKm,
                             HttpServletRequest http, HttpServletResponse response) throws IOException {
        if (request.race() == null) {
            throw new IllegalArgumentException("La course (race) est obligatoire");
        }
        if (gpx == null || gpx.isEmpty()) {
            return new PlanView(CourseView.of(request.race(), null, null, stepKm), plans(request, null, http, response));
        }
        try (InputStream in = gpx.getInputStream()) {
            PlanningService.LoadedTrack track = service.loadTrack(in);
            return new PlanView(CourseView.of(request.race(), track.profile(), track.name(), stepKm),
                    plans(request, track.profile(), http, response));
        }
    }

    /** Même chose sans GPX, en JSON pur (le D+ officiel du roadbook suffit). */
    @PostMapping(path = "/plans", consumes = MediaType.APPLICATION_JSON_VALUE)
    public List<RacePlan> planJson(@RequestBody PlanRequest request, HttpServletRequest http,
                                   HttpServletResponse response) {
        return plans(request, null, http, response);
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

    /**
     * Démo avec plusieurs références (datées, course ou entraînement) : c'est ce qu'utilise le front.
     * Corps : { "references": [...], "elevationSource": "AUTO" }.
     */
    @PostMapping(path = "/demo/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public List<RacePlan> demoPlans(@PathVariable String id, @RequestBody DemoRequest body,
                                    HttpServletRequest http, HttpServletResponse response) {
        PlanningService.Sample sample = service.loadSample(id);
        PlanRequest request = new PlanRequest(sample.race(), body.references(), DEMO_NIGHT, body.elevationSource(), null,
                body.training());
        return plans(request, sample.track() == null ? null : sample.track().profile(), http, response);
    }

    public record DemoRequest(List<ReferencePerformance> references, ElevationSource elevationSource,
                              PlanRequest.TrainingOptions training) {}

    /** Version texte imprimable de la démo. */
    @GetMapping(path = "/demo/{id}/report", produces = MediaType.TEXT_PLAIN_VALUE)
    public String demoReport(@PathVariable String id,
                             @RequestParam(defaultValue = "60") double refKm,
                             @RequestParam(defaultValue = "3200") double refGain,
                             @RequestParam(defaultValue = "PT8H48M") Duration refTime,
                             @RequestParam(defaultValue = "AUTO") ElevationSource source) {
        return TextReport.render(demo(id, refKm, refGain, refTime, source));
    }

    /** Course d'exemple à dessiner : roadbook, trace et position des ravitos sur la trace. */
    @GetMapping("/demo/{id}/course")
    public CourseView demoCourse(@PathVariable String id, @RequestParam(defaultValue = "0.1") double stepKm) {
        PlanningService.Sample sample = service.loadSample(id);
        return sample.track() == null
                ? CourseView.of(sample.race(), null, null, stepKm)
                : CourseView.of(sample.race(), sample.track().profile(), sample.track().name(), stepKm);
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

    /** Fin octobre à Carcassonne : coucher ~18h40, lever ~8h15 (marge frontale comprise). */
    private static final NightWindow DEMO_NIGHT = new NightWindow(LocalTime.of(19, 0), LocalTime.of(7, 45));

    private static PlanRequest demoRequest(PlanningService.Sample sample, double refKm, double refGain,
                                           Duration refTime, ElevationSource source) {
        return new PlanRequest(sample.race(),
                List.of(new ReferencePerformance("Référence", refKm, refGain, refTime)),
                DEMO_NIGHT,
                source, null);
    }

    @ExceptionHandler({IllegalArgumentException.class, GpxParser.GpxParseException.class})
    public ProblemDetail badRequest(RuntimeException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    /**
     * JSON illisible, ou refusé par la validation d'un record (points non triés, référence invalide...) :
     * Jackson enveloppe alors l'IllegalArgumentException, dont on remonte le message au coureur.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail unreadable(HttpMessageNotReadableException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof IllegalArgumentException) {
                return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, t.getMessage());
            }
        }
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Requête illisible : vérifie le format du roadbook");
    }
}
