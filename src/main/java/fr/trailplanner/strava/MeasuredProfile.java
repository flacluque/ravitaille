package fr.trailplanner.strava;

import fr.trailplanner.engine.RunnerProfile;

import java.util.List;

/**
 * Profil de coureur mesuré sur Strava, avec les activités dont il vient : le navigateur les garde pour effacer le
 * profil si l'une d'elles est supprimée sur Strava (politique API de Strava : une suppression se reflète sous 48 h, et
 * les données dérivées s'effacent avec l'accès).
 *
 * @param profile le profil (pente et fatigue), seule donnée dérivée gardée
 * @param sources identifiants Strava des activités mesurées
 */
public record MeasuredProfile(RunnerProfile profile, List<Long> sources) {}
