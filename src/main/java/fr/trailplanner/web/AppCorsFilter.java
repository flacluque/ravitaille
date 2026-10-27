package fr.trailplanner.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Set;

/**
 * Autorise l'appli mobile (Capacitor) à appeler l'API depuis sa propre origine ({@code capacitor://localhost}…).
 * <p>
 * Seules les origines de l'appli reçoivent les en-têtes CORS ; les autres requêtes passent sans rien changer, sans
 * refus : le site appelle l'API depuis sa propre adresse (vue différemment selon les proxys de Vite ou de Render), et
 * c'est le navigateur qui empêche un autre site de lire les réponses. Placé avant le garde du code d'invitation, pour
 * que la vérification préalable passe et que ses refus restent lisibles par l'appli.
 */
public class AppCorsFilter extends OncePerRequestFilter {

    private static final String ALLOWED_HEADERS = String.join(", ",
            List.of("Content-Type", WebConfig.APP_STRAVA_HEADER, WebConfig.APP_ACCESS_HEADER));
    private static final String EXPOSED_HEADERS = WebConfig.APP_STRAVA_HEADER + ", " + WebConfig.APP_ACCESS_HEADER;

    private final Set<String> origins;

    public AppCorsFilter(List<String> origins) {
        this.origins = Set.copyOf(origins);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String origin = request.getHeader("Origin");
        if (origin == null || !origins.contains(origin)) {
            chain.doFilter(request, response);
            return;
        }
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.addHeader("Vary", "Origin");
        response.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
        if ("OPTIONS".equalsIgnoreCase(request.getMethod()) && request.getHeader("Access-Control-Request-Method") != null) {
            response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
            response.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
            response.setHeader("Access-Control-Max-Age", "3600");
            response.setStatus(HttpServletResponse.SC_OK);
            return;
        }
        chain.doFilter(request, response);
    }
}
