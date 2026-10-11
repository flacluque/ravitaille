package fr.trailplanner.extract;

/** Échec de lecture d'un roadbook, avec un message destiné au coureur. */
public class ExtractionException extends RuntimeException {

    /** Vrai si l'IA est injoignable ou pas prête (503), faux si elle a répondu n'importe quoi (502). */
    private final boolean unavailable;

    public ExtractionException(String message, boolean unavailable, Throwable cause) {
        super(message, cause);
        this.unavailable = unavailable;
    }

    public static ExtractionException unavailable(String message) {
        return new ExtractionException(message, true, null);
    }

    public static ExtractionException unavailable(String message, Throwable cause) {
        return new ExtractionException(message, true, cause);
    }

    public static ExtractionException badAnswer(String message, Throwable cause) {
        return new ExtractionException(message, false, cause);
    }

    public boolean isUnavailable() {
        return unavailable;
    }
}
