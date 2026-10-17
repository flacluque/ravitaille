package fr.trailplanner.extract;

/** trailplanner.extraction.provider=none : la saisie se fait à la main. */
public class DisabledDocumentReader implements DocumentReader {

    static final String MESSAGE = "La lecture automatique n'est pas activée sur ce site : saisis le roadbook à la main.";

    @Override
    public String read(Request request) {
        throw ExtractionException.unavailable(MESSAGE);
    }

    @Override
    public Status status() {
        return new Status(false, "none", null, false, MESSAGE);
    }
}
