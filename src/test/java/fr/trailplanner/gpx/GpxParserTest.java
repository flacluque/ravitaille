package fr.trailplanner.gpx;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class GpxParserTest {

    private final GpxParser parser = new GpxParser();

    private static ByteArrayInputStream gpx(String body) {
        String xml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">%s</gpx>""".formatted(body);
        return new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void litLesPointsDeTraceEtLeNom() {
        var parsed = parser.parse(gpx("""
                <trk><name>Ma trace</name><trkseg>
                  <trkpt lat="43.0" lon="2.0"><ele>100.5</ele></trkpt>
                  <trkpt lat="43.001" lon="2.0"><ele>110</ele></trkpt>
                </trkseg></trk>"""));

        assertEquals("Ma trace", parsed.name());
        assertEquals(2, parsed.points().size());
        assertEquals(100.5, parsed.points().get(0).elevation(), 1e-9);
        assertEquals(43.001, parsed.points().get(1).lat(), 1e-9);
    }

    @Test
    void litLesWaypointsNommesSansPrendreLeurNomPourCeluiDeLaTrace() {
        var parsed = parser.parse(gpx("""
                <wpt lat="43.0005" lon="2.0"><name>RAV Greffeil</name></wpt>
                <wpt lat="43.0008" lon="2.0"></wpt>
                <trk><name>Ma trace</name><trkseg>
                  <trkpt lat="43.0" lon="2.0"><ele>100</ele></trkpt>
                  <trkpt lat="43.001" lon="2.0"><ele>110</ele></trkpt>
                </trkseg></trk>"""));

        assertEquals("Ma trace", parsed.name());
        assertEquals(1, parsed.waypoints().size());
        assertEquals("RAV Greffeil", parsed.waypoints().get(0).name());
        assertEquals(43.0005, parsed.waypoints().get(0).lat(), 1e-9);
        assertEquals(2, parsed.points().size());
    }

    @Test
    void altitudeAbsenteDonneNaN() {
        var parsed = parser.parse(gpx("""
                <trk><trkseg>
                  <trkpt lat="43.0" lon="2.0"></trkpt>
                  <trkpt lat="43.001" lon="2.0"><ele>110</ele></trkpt>
                </trkseg></trk>"""));

        assertFalse(parsed.points().get(0).hasElevation());
        assertTrue(parsed.points().get(1).hasElevation());
    }

    @Test
    void utiliseLesPointsDeRouteSiPasDeTrace() {
        var parsed = parser.parse(gpx("""
                <rte><rtept lat="43.0" lon="2.0"/><rtept lat="43.1" lon="2.0"/><rtept lat="43.2" lon="2.0"/></rte>"""));

        assertEquals(3, parsed.points().size());
    }

    @Test
    void rejetteUnFichierSansTrace() {
        assertThrows(GpxParser.GpxParseException.class, () -> parser.parse(gpx("<trk><trkseg/></trk>")));
    }

    @Test
    void rejetteUnXmlInvalide() {
        var in = new ByteArrayInputStream("pas du xml".getBytes(StandardCharsets.UTF_8));
        assertThrows(GpxParser.GpxParseException.class, () -> parser.parse(in));
    }
}
