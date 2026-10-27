package fr.trailplanner.strava;

import com.fasterxml.jackson.databind.ObjectMapper;
import fr.trailplanner.api.JsonSupport;
import fr.trailplanner.web.CookieCipher;
import fr.trailplanner.web.WebConfig;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;

import java.io.IOException;
import java.time.Duration;

/**
 * Jetons Strava gardés chez le coureur, dans un cookie chiffré (illisible par le navigateur et par
 * les autres sites) : chacun voit ses propres activités, le serveur ne garde aucun compte.
 * <p>
 * L'appli mobile ne garde pas les cookies : elle conserve le même texte chiffré et l'envoie dans l'en-tête
 * {@value WebConfig#APP_STRAVA_HEADER} ; la réponse lui renvoie, dans le même en-tête, la connexion renouvelée.
 */
public class StravaCookies {

    static final String NAME = "tp_strava";
    /** Le jeton de rafraîchissement ne périme pas : on garde la connexion six mois. */
    static final Duration MAX_AGE = Duration.ofDays(180);

    private final ObjectMapper mapper = JsonSupport.mapper();
    private final CookieCipher cipher;

    public StravaCookies(CookieCipher cipher) {
        this.cipher = cipher;
    }

    public StravaSession read(HttpServletRequest request) {
        String header = request.getHeader(WebConfig.APP_STRAVA_HEADER);
        if (header != null && !header.isBlank()) {
            return cipher.decrypt(header).map(this::parse).orElseGet(StravaSession::none);
        }
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie c : cookies) {
                if (NAME.equals(c.getName())) {
                    return cipher.decrypt(c.getValue()).map(this::parse).orElseGet(StravaSession::none);
                }
            }
        }
        return StravaSession.none();
    }

    /** Réécrit (ou efface) le cookie si la connexion a changé pendant la requête. */
    public void save(StravaSession session, HttpServletRequest request, HttpServletResponse response) {
        if (!session.changed()) {
            return;
        }
        String value = sealed(session);
        if (request.getHeader(WebConfig.APP_STRAVA_HEADER) != null) {
            // Appli mobile : la connexion renouvelée (ou vide si elle est oubliée) repart dans l'en-tête.
            response.setHeader(WebConfig.APP_STRAVA_HEADER, value);
            return;
        }
        ResponseCookie cookie = ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(request.isSecure())
                .sameSite("Lax")
                .path("/api")
                .maxAge(value.isEmpty() ? Duration.ZERO : MAX_AGE)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    /** La connexion chiffrée, telle que la garde le cookie (vide sans connexion). */
    public String sealed(StravaSession session) {
        return session.token().map(this::seal).orElse("");
    }

    private StravaSession parse(String json) {
        try {
            return StravaSession.of(mapper.readValue(json, StravaToken.class));
        } catch (IOException e) {
            return StravaSession.none();
        }
    }

    private String seal(StravaToken token) {
        try {
            return cipher.encrypt(mapper.writeValueAsString(token));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
