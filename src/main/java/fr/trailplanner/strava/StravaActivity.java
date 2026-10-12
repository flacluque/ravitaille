package fr.trailplanner.strava;

import java.time.Duration;
import java.time.LocalDate;

/**
 * Une sortie de course à pied ou de trail, prête à devenir une référence.
 *
 * @param sportType   "Run" (course à pied) ou "TrailRun" (trail)
 * @param elapsedTime temps écoulé, arrêts compris : c'est lui qui sert de référence
 * @param movingTime  temps en mouvement, pour information
 * @param race        marquée « Course » dans le type de sortie de Strava
 */
public record StravaActivity(
        long id,
        String name,
        LocalDate date,
        String sportType,
        double distanceKm,
        double elevationGainM,
        Duration elapsedTime,
        Duration movingTime,
        boolean race) {}
