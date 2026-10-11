package fr.trailplanner.track;

import fr.trailplanner.gpx.GpxParser;
import fr.trailplanner.gpx.TrackPoint;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TrackAnalyzerTest {

    @Test
    void haversineUnDegreDeLatitudeFaitEnviron111Km() {
        double d = TrackAnalyzer.haversine(43.0, 2.0, 44.0, 2.0);
        assertEquals(111_195, d, 50);
    }

    @Test
    void leBruitAltimetriqueNeGonflePasLeDenivele() {
        // 1 000 points à plat avec un bruit de ±0,5 m (500 « montées » de 1 m), puis une vraie montée de 100 m
        List<TrackPoint> pts = new ArrayList<>();
        for (int i = 0; i < 1000; i++) {
            pts.add(new TrackPoint(43 + i * 1e-5, 2.0, 100 + (i % 2 == 0 ? 0.5 : -0.5)));
        }
        for (int i = 0; i <= 100; i++) {
            pts.add(new TrackPoint(43.01 + i * 1e-5, 2.0, 100 + i));
        }

        TrackProfile filtered = new TrackAnalyzer(3).analyze(pts);
        TrackProfile raw = new TrackAnalyzer(0).analyze(pts);

        assertEquals(99, filtered.totalGainM(), 3);   // ~100 m réels
        assertTrue(raw.totalGainM() > 500, "sans filtre, le bruit ajoute ~500 m fictifs");
    }

    @Test
    void interpolationAuKilometre() {
        List<TrackPoint> pts = List.of(
                new TrackPoint(43.0, 2.0, 100),
                new TrackPoint(43.0 + 1 / 111.195, 2.0, 200));   // ~1 km plus au nord, +100 m
        TrackProfile p = new TrackAnalyzer().analyze(pts);

        TrackProfile.ProfilePoint mid = p.at(0.5);
        assertEquals(150, mid.elevationM(), 1);
        assertEquals(1.0, p.totalDistanceKm(), 0.01);
    }

    @Test
    void traceDuRaidDesBogomiles() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/samples/bogomiles/trace.gpx")) {
            var parsed = new GpxParser().parse(in);
            TrackProfile p = new TrackAnalyzer().analyze(parsed.points());

            assertEquals(42_417, p.size());
            assertEquals(101.5, p.totalDistanceKm(), 0.5);
            // La montre annonce 3 650 m D+ ; le roadbook 2026 en annonce 4 000 (parcours modifié)
            assertTrue(p.totalGainM() > 3_500 && p.totalGainM() < 4_000, "D+ = " + p.totalGainM());
            // Boucle Carcassonne → Carcassonne : D+ et D- proches
            assertEquals(p.totalGainM(), p.totalLossM(), 100);
        }
    }
}
