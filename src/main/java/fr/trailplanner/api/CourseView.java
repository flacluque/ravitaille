package fr.trailplanner.api;

import fr.trailplanner.engine.Placement;
import fr.trailplanner.model.AidLevel;
import fr.trailplanner.model.Checkpoint;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.track.TrackProfile;

import java.util.ArrayList;
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
     * @param km              kilométrage officiel (roadbook)
     * @param trackKm         kilométrage sur la trace, abscisse du profil
     * @param placement       d'où vient la position : MANUAL (placée par le coureur), WAYPOINT (point nommé du GPX)
     *                        ou ROADBOOK (km du roadbook mis à l'échelle de la trace)
     * @param roadbookTrackKm position que donnerait le km du roadbook
     * @param waypointName    waypoint du GPX reconnu pour ce point (null sinon), même s'il n'est pas retenu
     * @param waypointKm      km de la trace au plus près de ce waypoint (null sans waypoint)
     */
    public record Marker(String code, String name, double km, double trackKm,
                         double lat, double lon, double elevationM, AidLevel aid,
                         Placement.Source placement, double roadbookTrackKm, String waypointName, Double waypointKm) {}

    public static CourseView of(RaceDefinition race, TrackProfile track, String trackName, double stepKm) {
        if (track == null) {
            return new CourseView(race, null, List.of());
        }
        List<Placement> places = Placement.of(race, track);
        List<Marker> markers = new ArrayList<>();
        for (int i = 0; i < places.size(); i++) {
            Checkpoint cp = race.checkpoints().get(i);
            Placement place = places.get(i);
            TrackProfile.ProfilePoint p = track.at(place.trackKm());
            Placement.WaypointMatch wp = place.waypoint();
            markers.add(new Marker(cp.code(), cp.name(), cp.km(), round2(p.km()),
                    p.lat(), p.lon(), Math.round(p.elevationM()), cp.aid(),
                    place.source(), round2(place.roadbookTrackKm()), wp == null ? null : wp.name(),
                    wp == null ? null : wp.trackKm()));
        }
        return new CourseView(race, TrackSummary.of(trackName, track, stepKm), markers);
    }

    private static double round2(double km) {
        return Math.round(km * 100) / 100.0;
    }
}
