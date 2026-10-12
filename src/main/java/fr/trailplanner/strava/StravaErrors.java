package fr.trailplanner.strava;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Erreurs de l'import Strava, avec un message pour le coureur. */
@RestControllerAdvice(assignableTypes = StravaController.class)
public class StravaErrors {

    @ExceptionHandler(StravaException.class)
    public ProblemDetail failed(StravaException e) {
        return ProblemDetail.forStatusAndDetail(e.status(), e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail badRequest(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
