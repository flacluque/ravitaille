package fr.trailplanner.strava;

import java.util.List;

/**
 * Retour de course : une activité Strava lue point par point, pour la comparer au plan ravito par ravito et mesurer
 * la fatigue du coureur en course.
 *
 * @param fatigueExponent fatigue mesurée sur cette course (exposant de Riegel), null pour une sortie de moins de 2 h
 * @param distanceKm      distance enregistrée par la montre
 * @param elapsedMinutes  temps total, arrêts compris
 * @param movingMinutes   temps en mouvement
 * @param points          tous les 100 m : km, minutes écoulées depuis le départ, minutes en mouvement
 */
public record RaceReview(long activityId, Double fatigueExponent, double distanceKm, double elapsedMinutes,
                         double movingMinutes, List<double[]> points) {}
