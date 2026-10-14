package fr.trailplanner.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;

/**
 * Code d'invitation : tant que le navigateur ne l'a pas donné, l'API répond 401 (sauf {@code /api/app},
 * qui permet de le saisir). Le code accepté est retenu dans un cookie signé ; changer le code
 * (trailplanner.access-code) redemande le nouveau à tout le monde.
 */
public class AccessGuard extends OncePerRequestFilter {

    static final String COOKIE = "tp_access";
    static final Duration MAX_AGE = Duration.ofDays(365);

    private final AppProperties props;
    private final CookieCipher cipher;

    public AccessGuard(AppProperties props, CookieCipher cipher) {
        this.props = props;
        this.cipher = cipher;
    }

    public boolean required() {
        return !props.accessCode().isEmpty();
    }

    public boolean granted(HttpServletRequest request) {
        if (!required()) {
            return true;
        }
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie c : cookies) {
                if (COOKIE.equals(c.getName()) && cipher.verify("access:" + props.accessCode(), c.getValue())) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Vrai si le code est le bon : le cookie est alors posé. Majuscules et espaces autour ne comptent pas. */
    public boolean grant(String code, HttpServletRequest request, HttpServletResponse response) {
        String given = code == null ? "" : code.strip().toLowerCase();
        boolean ok = required() && MessageDigest.isEqual(
                given.getBytes(StandardCharsets.UTF_8), props.accessCode().toLowerCase().getBytes(StandardCharsets.UTF_8));
        if (ok) {
            ResponseCookie cookie = ResponseCookie.from(COOKIE, cipher.sign("access:" + props.accessCode()))
                    .httpOnly(true).secure(request.isSecure()).sameSite("Lax").path("/").maxAge(MAX_AGE).build();
            response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        }
        return ok;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return !path.startsWith("/api/") || path.equals("/api/app") || path.startsWith("/api/app/")
                // Retour de Strava : protégé par son « state », et le cookie peut manquer au retour d'un autre site.
                || path.equals("/api/strava/callback");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (granted(request)) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/problem+json;charset=UTF-8");
        response.getWriter().write("{\"status\":401,\"title\":\"Unauthorized\",\"detail\":\"Code d'invitation requis.\"}");
    }
}
