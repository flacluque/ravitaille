package fr.trailplanner.strava;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;

/** Connexion à Strava et import des activités (voir docs/v0.3-conception.md). */
@RestController
@RequestMapping("/api/strava")
public class StravaController {

    private final StravaService strava;

    public StravaController(StravaService strava) {
        this.strava = strava;
    }

    @GetMapping("/status")
    public StravaStatus status() {
        return strava.status();
    }

    /** Le navigateur y est envoyé par « Connecter Strava » : redirection vers la page d'autorisation. */
    @GetMapping("/authorize")
    public ResponseEntity<Void> authorize(@RequestParam String origin) {
        return redirect(strava.authorize(origin));
    }

    /** Retour de Strava (redirect_uri), puis retour à l'appli. */
    @GetMapping("/callback")
    public ResponseEntity<Void> callback(@RequestParam(required = false) String state,
                                         @RequestParam(required = false) String code,
                                         @RequestParam(required = false) String error,
                                         @RequestParam(required = false) String scope) {
        return redirect(strava.callback(state, code, error, scope));
    }

    @GetMapping("/activities")
    public List<StravaActivity> activities(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate after) {
        return strava.activities(after != null ? after : LocalDate.now().minusYears(2));
    }

    @DeleteMapping("/connection")
    public ResponseEntity<Void> disconnect() {
        strava.disconnect();
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<Void> redirect(String url) {
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, URI.create(url).toString()).build();
    }
}
