package fr.trailplanner.gpx;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Lecture d'un fichier GPX en streaming (StAX) : tient sans souci des traces de plusieurs Mo.
 * <p>
 * Lit les points de trace ({@code trkpt}) et, à défaut, les points de route ({@code rtept}),
 * ce qui couvre les exports Strava, Garmin, Suunto, Visorando, etc. Lit aussi les points nommés ({@code wpt}),
 * où l'organisation place souvent ses ravitos.
 */
public class GpxParser {

    public record ParsedGpx(String name, List<TrackPoint> points, List<Waypoint> waypoints) {

        public ParsedGpx(String name, List<TrackPoint> points) {
            this(name, points, List.of());
        }
    }

    public ParsedGpx parse(InputStream in) {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        // Sécurité : pas de DTD ni d'entités externes (XXE)
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);

        List<TrackPoint> trackPoints = new ArrayList<>();
        List<TrackPoint> routePoints = new ArrayList<>();
        List<Waypoint> waypoints = new ArrayList<>();
        String name = null;

        try {
            XMLStreamReader r = factory.createXMLStreamReader(in);
            String currentPoint = null; // "trkpt", "rtept" ou "wpt"
            double lat = 0, lon = 0, ele = Double.NaN;
            String pointName = null;

            while (r.hasNext()) {
                int event = r.next();
                if (event == XMLStreamConstants.START_ELEMENT) {
                    String tag = r.getLocalName();
                    switch (tag) {
                        case "trkpt", "rtept", "wpt" -> {
                            currentPoint = tag;
                            lat = Double.parseDouble(r.getAttributeValue(null, "lat"));
                            lon = Double.parseDouble(r.getAttributeValue(null, "lon"));
                            ele = Double.NaN;
                            pointName = null;
                        }
                        case "ele" -> {
                            if (currentPoint != null) {
                                String text = r.getElementText().trim();
                                if (!text.isEmpty()) {
                                    ele = Double.parseDouble(text);
                                }
                            }
                        }
                        case "name" -> {
                            // Premier <name> rencontré hors d'un point : nom de la trace
                            if (currentPoint == null) {
                                if (name == null) {
                                    name = r.getElementText().trim();
                                }
                            } else if (currentPoint.equals("wpt")) {
                                pointName = r.getElementText().trim();
                            }
                        }
                        default -> { /* ignoré */ }
                    }
                } else if (event == XMLStreamConstants.END_ELEMENT) {
                    String tag = r.getLocalName();
                    if (tag.equals(currentPoint)) {
                        if (tag.equals("wpt")) {
                            if (pointName != null && !pointName.isEmpty()) {
                                waypoints.add(new Waypoint(pointName, lat, lon));
                            }
                        } else if (tag.equals("trkpt")) {
                            trackPoints.add(new TrackPoint(lat, lon, ele));
                        } else {
                            routePoints.add(new TrackPoint(lat, lon, ele));
                        }
                        currentPoint = null;
                    }
                }
            }
            r.close();
        } catch (XMLStreamException | NumberFormatException e) {
            throw new GpxParseException("Fichier GPX illisible : " + e.getMessage(), e);
        }

        List<TrackPoint> points = trackPoints.isEmpty() ? routePoints : trackPoints;
        if (points.size() < 2) {
            throw new GpxParseException("Le fichier GPX ne contient pas de tracé exploitable (moins de 2 points)", null);
        }
        return new ParsedGpx(name, List.copyOf(points), List.copyOf(waypoints));
    }

    public static class GpxParseException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public GpxParseException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
