package fr.trailplanner.extract;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Erreurs des lectures par IA (roadbook, matériel), avec un message pour le coureur. */
@RestControllerAdvice(assignableTypes = {RoadbookController.class, GearController.class})
public class ExtractionErrors {

    /** 503 si l'IA est injoignable ou pas prête, 502 si elle a répondu n'importe quoi. */
    @ExceptionHandler(ExtractionException.class)
    public ProblemDetail extractionFailed(ExtractionException e) {
        HttpStatus status = e.isUnavailable() ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
        return ProblemDetail.forStatusAndDetail(status, e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail badRequest(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
