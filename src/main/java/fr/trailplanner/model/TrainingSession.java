package fr.trailplanner.model;

import java.time.LocalDate;

/**
 * Une séance d'entraînement (sortie Strava), réduite à ce qui sert à mesurer le volume.
 *
 * @param sport "Run", "TrailRun" ou "Hike"
 */
public record TrainingSession(LocalDate date, double distanceKm, double gainM, String sport) {

    /** Kilomètres-effort : 100 m de D+ comptent comme 1 km, comme pour la course. */
    public double effortKm() {
        return distanceKm + gainM / 100.0;
    }
}
