package fr.trailplanner.engine;

import fr.trailplanner.gpx.TrackPoint;
import fr.trailplanner.gpx.Waypoint;
import fr.trailplanner.model.AidLevel;
import fr.trailplanner.model.Checkpoint;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.track.TrackAnalyzer;
import fr.trailplanner.track.TrackProfile;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PlacementTest {

    /** Trace plein nord de 20 km (un point tous les 100 m), plate. */
    private static final double KM_LAT = 1 / 111.195;
    private static final TrackProfile TRACK = line(20);

    private static TrackProfile line(double km) {
        List<TrackPoint> pts = new ArrayList<>();
        for (int i = 0; i <= km * 10; i++) {
            pts.add(new TrackPoint(43 + i * 0.1 * KM_LAT, 2.0, 100));
        }
        return new TrackAnalyzer().analyze(pts);
    }

    private static Checkpoint cp(String name, double km, Double trackKm) {
        return new Checkpoint(name, name, km, null, null, null, null, AidLevel.LIGHT, null, trackKm);
    }

    /** Roadbook annoncé à 25 km pour une trace de 20 km : échelle 0,8. */
    private static RaceDefinition race(Checkpoint... middle) {
        List<Checkpoint> cps = new ArrayList<>();
        cps.add(cp("Départ", 0, null));
        cps.addAll(List.of(middle));
        cps.add(cp("Arrivée", 25, null));
        return new RaceDefinition("Test", LocalDateTime.of(2026, 10, 24, 7, 0), null, cps);
    }

    /** Waypoint à km de la trace, décalé de quelques mètres. */
    private static Waypoint wp(String name, double km) {
        return new Waypoint(name, 43 + km * KM_LAT, 2.0005);
    }

    @Test
    void sansWaypointLeKmDuRoadbookEstMisALEchelle() {
        List<Placement> p = Placement.of(race(cp("Greffeil", 10, null)), TRACK);
        assertEquals(Placement.Source.ROADBOOK, p.get(1).source());
        assertEquals(8, p.get(1).trackKm(), 1e-3);
        assertEquals(0, p.get(0).trackKm());
        assertEquals(20, p.get(2).trackKm(), 1e-3);
    }

    @Test
    void leWaypointAuNomDuRavitoPasseAvantLeRoadbook() {
        TrackProfile track = TRACK.withWaypoints(List.of(wp("RAV Caunette", 4), wp("Ravito Greffeil", 11)));
        List<Placement> p = Placement.of(race(cp("Caunette-sur-Lauquet", 5, null), cp("Greffeil (village)", 10, null)), track);
        assertEquals(Placement.Source.WAYPOINT, p.get(1).source());
        assertEquals(4, p.get(1).trackKm(), 0.05);
        assertEquals(Placement.Source.WAYPOINT, p.get(2).source());
        assertEquals(11, p.get(2).trackKm(), 0.05);
        assertEquals("Ravito Greffeil", p.get(2).waypoint().name());
        assertEquals(8, p.get(2).roadbookTrackKm(), 1e-3);
    }

    @Test
    void laPositionPlaceeALaMainPasseAvantTout() {
        TrackProfile track = TRACK.withWaypoints(List.of(wp("Greffeil", 11)));
        List<Placement> p = Placement.of(race(cp("Greffeil", 10, 12.5)), track);
        assertEquals(Placement.Source.MANUAL, p.get(1).source());
        assertEquals(12.5, p.get(1).trackKm(), 1e-9);
        // Le waypoint reste connu, pour comparer.
        assertEquals(11, p.get(1).waypoint().trackKm(), 0.05);
    }

    @Test
    void unePositionHorsDOrdreEstEcartee() {
        // Le waypoint de Greffeil tombe avant Caunette : on garde le km du roadbook.
        TrackProfile track = TRACK.withWaypoints(List.of(wp("Greffeil", 2)));
        List<Placement> p = Placement.of(race(cp("Caunette", 5, null), cp("Greffeil", 10, null)), track);
        assertEquals(Placement.Source.ROADBOOK, p.get(2).source());
        assertEquals(8, p.get(2).trackKm(), 1e-3);
        // Pareil pour une position à la main au-delà de l'arrivée.
        List<Placement> q = Placement.of(race(cp("Caunette", 5, 30.0)), TRACK);
        assertEquals(Placement.Source.ROADBOOK, q.get(1).source());
    }

    @Test
    void unWaypointLoinDeLaTraceNeComptePas() {
        TrackProfile track = TRACK.withWaypoints(List.of(new Waypoint("Greffeil", 43 + 11 * KM_LAT, 2.01)));
        assertEquals(Placement.Source.ROADBOOK, Placement.of(race(cp("Greffeil", 10, null)), track).get(1).source());
    }

    @Test
    void lesMotsGeneriquesNeSuffisentPasAReconnaitreUnLieu() {
        assertEquals(List.of("cavayere"), Placement.words("Ravito du Lac de Cavayère"));
        assertEquals(List.of("molieres", "alberte", "ladern", "lauquet"),
                Placement.words("Molières-sur-l'Alberte (Hameau) Ladern sur Lauquet"));
        // « Ladern sur Lauquet » ne se confond pas avec Caunette-sur-Lauquet : il faut le premier mot propre.
        TrackProfile track = TRACK.withWaypoints(List.of(wp("Ladern sur Lauquet", 9)));
        assertNull(Placement.match(cp("Caunette-sur-Lauquet", 5, null), track, 4));
        assertNotNull(Placement.match(cp("Ladern-sur-Lauquet", 10, null), track, 8));
    }

    @Test
    void uneBouclePrendLePassageLePlusProcheDuRoadbook() {
        // Aller-retour : 10 km au nord puis retour ; le waypoint à 3 km est croisé deux fois (km 3 et km 17).
        List<TrackPoint> pts = new ArrayList<>();
        for (int i = 0; i <= 100; i++) pts.add(new TrackPoint(43 + i * 0.1 * KM_LAT, 2.0, 100));
        for (int i = 99; i >= 0; i--) pts.add(new TrackPoint(43 + i * 0.1 * KM_LAT, 2.0001, 100));
        TrackProfile track = new TrackAnalyzer().analyze(pts).withWaypoints(List.of(wp("Greffeil", 3)));
        RaceDefinition race = new RaceDefinition("Boucle", LocalDateTime.of(2026, 10, 24, 7, 0), null,
                List.of(cp("Départ", 0, null), cp("Greffeil", 16, null), cp("Arrivée", 20, null)));
        Placement p = Placement.of(race, track).get(1);
        assertEquals(Placement.Source.WAYPOINT, p.source());
        assertEquals(17, p.trackKm(), 0.1);
    }

    @Test
    void lePlanSuitLaPositionCorrigeeDuRavito() {
        // Roadbook faux (Greffeil annoncé à 10 km), ravito déplacé à 15 km de la trace (18,75 km officiels).
        Checkpoint start = new Checkpoint("D", "Départ", 0, 0.0, 0.0, null, null, AidLevel.NONE);
        Checkpoint finish = new Checkpoint("A", "Arrivée", 25, 0.0, 0.0, null, null, AidLevel.NONE);
        Checkpoint moved = new Checkpoint("G", "Greffeil", 10, 0.0, 0.0, null, null, AidLevel.LIGHT, null, 15.0);
        RaceDefinition race = new RaceDefinition("Test", LocalDateTime.of(2026, 10, 24, 7, 0), null, List.of(start, moved, finish));
        List<Leg> legs = CourseBuilder.legs(race, TRACK, ElevationSource.ROADBOOK);
        assertEquals(18.75, legs.get(0).distanceKm(), 1e-3);
        assertEquals(6.25, legs.get(1).distanceKm(), 1e-3);
        List<Leg> onTrack = CourseBuilder.legs(race, TRACK, ElevationSource.TRACK);
        assertEquals(15, onTrack.get(0).distanceKm(), 0.01);
    }
}
