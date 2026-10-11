package fr.trailplanner.extract;

import java.util.List;

/** trailplanner.extraction.provider=none : la saisie se fait à la main. */
public class DisabledRoadbookExtractor implements RoadbookExtractor {

    static final String MESSAGE = "Lecture automatique désactivée (trailplanner.extraction.provider=none).";

    @Override
    public ExtractedRoadbook extract(List<byte[]> pages) {
        throw ExtractionException.unavailable(MESSAGE);
    }

    @Override
    public Status status() {
        return new Status(false, "none", null, false, MESSAGE);
    }
}
