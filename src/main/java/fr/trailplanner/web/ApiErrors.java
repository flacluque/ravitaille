package fr.trailplanner.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Requêtes refusées par Spring lui-même (partie manquante, type de contenu refusé, paramètre illisible…) : sans
 * cela, la réponse n'a pas de message et le coureur ne voit qu'une phrase générale. La raison est donnée dans la
 * réponse et écrite dans les journaux du serveur, pour qu'on puisse la retrouver.
 * <p>
 * En dernier : les messages propres à chaque contrôleur (PlanController, StravaErrors…) passent avant.
 */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE)
public class ApiErrors extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                             HttpStatusCode status, WebRequest request) {
        String path = request instanceof ServletWebRequest web ? web.getRequest().getRequestURI() : request.getDescription(false);
        log.warn("Requête refusée ({}) sur {} : {}", status.value(), path, ex.getMessage());
        ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, status, request);
        if (response != null && response.getBody() instanceof ProblemDetail problem) {
            String reason = problem.getDetail();
            problem.setDetail("Requête refusée par le serveur (erreur " + status.value() + ")"
                    + (reason == null || reason.isBlank() ? "" : " : " + reason));
        }
        return response;
    }
}
