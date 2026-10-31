package fr.trailplanner.strava;

import fr.trailplanner.engine.RunnerProfile;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

/** Connexion à Strava et import des activités (voir docs/v0.3-conception.md). */
@RestController
@RequestMapping("/api/strava")
public class StravaController {

    private final StravaService strava;
    private final StravaCookies cookies;
    /** Lien qui rouvre l'appli mobile après Strava ({@code ravitaille://strava?…}). */
    private final String appScheme;

    public StravaController(StravaService strava, StravaCookies cookies,
                            @Value("${trailplanner.app-scheme:ravitaille}") String appScheme) {
        this.strava = strava;
        this.cookies = cookies;
        this.appScheme = appScheme;
    }

    @GetMapping("/status")
    public StravaStatus status(HttpServletRequest request) {
        return strava.status(cookies.read(request));
    }

    /** Le navigateur y est envoyé par « Connecter Strava » : redirection vers la page d'autorisation. */
    @GetMapping("/authorize")
    public ResponseEntity<Void> authorize(@RequestParam String origin) {
        String server = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        return redirect(strava.authorize(origin, server));
    }

    /** Retour de Strava (redirect_uri) : les jetons vont dans le cookie, puis retour à l'appli. */
    @GetMapping("/callback")
    public ResponseEntity<Void> callback(@RequestParam(required = false) String state,
                                         @RequestParam(required = false) String code,
                                         @RequestParam(required = false) String error,
                                         @RequestParam(required = false) String scope,
                                         HttpServletRequest request, HttpServletResponse response) {
        StravaSession session = StravaSession.none();
        String back = strava.callback(state, code, error, scope, session);
        if (back.startsWith(StravaService.APP_ORIGIN + "/")) {
            // Appli mobile : pas de cookie ; la connexion chiffrée repart avec le lien qui rouvre l'appli, qui la garde.
            String query = back.substring(StravaService.APP_ORIGIN.length() + 1);
            String sealed = cookies.sealed(session);
            return redirect(appScheme + "://strava" + query
                    + (sealed.isEmpty() ? "" : "&session=" + URLEncoder.encode(sealed, StandardCharsets.UTF_8)));
        }
        cookies.save(session, request, response);
        return redirect(back);
    }

    @GetMapping("/activities")
    public List<StravaActivity> activities(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate after,
            HttpServletRequest request, HttpServletResponse response) {
        StravaSession session = cookies.read(request);
        try {
            return strava.activities(session, after != null ? after : LocalDate.now().minusYears(2));
        } finally {
            cookies.save(session, request, response);
        }
    }

    /** Profil personnel (pente et fatigue) mesuré sur les sorties Strava du coureur. */
    @GetMapping("/profile")
    public MeasuredProfile profile(HttpServletRequest request, HttpServletResponse response) {
        StravaSession session = cookies.read(request);
        try {
            return strava.profile(session);
        } finally {
            cookies.save(session, request, response);
        }
    }

    /** Retour de course : une activité comparée au plan, et la fatigue mesurée dessus. */
    @PostMapping("/activities/{id}/review")
    public RaceReview review(@PathVariable long id, @RequestBody(required = false) ReviewRequest body,
                             HttpServletRequest request, HttpServletResponse response) {
        StravaSession session = cookies.read(request);
        try {
            return strava.review(session, id, body == null ? null : body.runner());
        } finally {
            cookies.save(session, request, response);
        }
    }

    /** @param runner profil du coureur (coût de la pente), null pour le coureur moyen */
    public record ReviewRequest(RunnerProfile runner) {}

    @DeleteMapping("/connection")
    public ResponseEntity<Void> disconnect(HttpServletRequest request, HttpServletResponse response) {
        StravaSession session = cookies.read(request);
        strava.disconnect(session);
        cookies.save(session, request, response);
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<Void> redirect(String url) {
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, URI.create(url).toString()).build();
    }
}
