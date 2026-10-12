package fr.trailplanner.engine;

import java.time.LocalDate;
import java.util.Optional;

/** D'où vient l'historique d'entraînement (Strava aujourd'hui). */
public interface TrainingSource {

    /**
     * Séances depuis {@code since}, ou vide si la source n'est pas disponible (pas connectée…).
     *
     * @throws RuntimeException si la source est connectée mais injoignable
     */
    Optional<TrainingHistory> history(LocalDate since, boolean includeHikes);
}
