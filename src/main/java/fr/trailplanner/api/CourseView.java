package fr.trailplanner.api;

import fr.trailplanner.engine.CourseBuilder;
import fr.trailplanner.model.AidLevel;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.track.TrackProfile;

import java.util.List;

/**
 * Tout ce qu'il faut au front pour dessiner la course : roadbook, trace (carte + profil)
 * et position de chaque point du roadbook sur la trace.
 *
 * @param track   null si la course n'a pas de trace GPX
 * @param markers vide si la course n'a pas de trace GPX
 */
public record CourseView(RaceDefinition race, TrackSummary track, List<Marker> markers) {

    /**
     * Point du roadbook placé sur la trace.
     *
     * @param km      kilométrage officiel (roadbook)
     * @param trackKm kilométrage sur la trace (après mise à l'échelle), abscisse du profil
     */
    public record Marker(String code, String name, double km, double trackKm,
                         double lat, double lon, double elevationM, AidLevel aid) {}

    public static CourseView of(RaceDefinition race, TrackProfile track, String trackName, double stepKm) {
        if (track == null) {
            return new CourseView(race, null, List.of());
        }
        List<Marker> markers = race.checkpoints().stream().map(cp -> {
            TrackProfile.ProfilePoint p = CourseBuilder.onTrack(race, track, cp);
            return new Marker(cp.code(), cp.name(), cp.km(), Math.round(p.km() * 100) / 100.0,
                    p.lat(), p.lon(), Math.round(p.elevationM()), cp.aid());
        }).toList();
        return new CourseView(race, TrackSummary.of(trackName, track, stepKm), markers);
    }
}
