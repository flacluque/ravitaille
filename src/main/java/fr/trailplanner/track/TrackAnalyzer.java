package fr.trailplanner.track;

import fr.trailplanner.gpx.TrackPoint;

import java.util.List;

/**
 * Calcule distance et dénivelé d'un tracé.
 *
 * <h2>Pourquoi un seuil (hystérésis) sur le dénivelé ?</h2>
 * Les altitudes GPS/baro oscillent de quelques dizaines de cm à chaque point. Additionner
 * toutes ces micro-variations gonfle fortement le D+ (sur le Bogomiles : ~4 500 m bruts
 * contre ~3 650 m annoncés par la montre). On ne comptabilise donc une montée (ou une descente)
 * qu'une fois qu'elle dépasse un seuil depuis le dernier point de référence.
 * 3 m donne des valeurs proches de Strava/Garmin ; à ajuster si besoin.
 */
public class TrackAnalyzer {

    public static final double DEFAULT_ELEVATION_THRESHOLD_M = 3.0;
    private static final double EARTH_RADIUS_M = 6_371_000.0;

    private final double thresholdM;

    public TrackAnalyzer() {
        this(DEFAULT_ELEVATION_THRESHOLD_M);
    }

    public TrackAnalyzer(double thresholdM) {
        if (thresholdM < 0) {
            throw new IllegalArgumentException("Le seuil de dénivelé doit être positif");
        }
        this.thresholdM = thresholdM;
    }

    public TrackProfile analyze(List<TrackPoint> points) {
        int n = points.size();
        if (n < 2) {
            throw new IllegalArgumentException("Il faut au moins 2 points pour analyser un tracé");
        }
        double[] lat = new double[n], lon = new double[n], ele = new double[n];
        double[] dist = new double[n], gain = new double[n], loss = new double[n];

        // Altitudes manquantes : on reprend la dernière connue (ou la première connue au début)
        double firstKnown = points.stream().filter(TrackPoint::hasElevation)
                .mapToDouble(TrackPoint::elevation).findFirst().orElse(0.0);
        double lastEle = firstKnown;

        double refEle = firstKnown;   // altitude de référence pour l'hystérésis
        double cumGain = 0, cumLoss = 0;

        for (int i = 0; i < n; i++) {
            TrackPoint p = points.get(i);
            lat[i] = p.lat();
            lon[i] = p.lon();
            ele[i] = p.hasElevation() ? p.elevation() : lastEle;
            lastEle = ele[i];

            if (i > 0) {
                dist[i] = dist[i - 1] + haversine(lat[i - 1], lon[i - 1], lat[i], lon[i]);
            }

            double delta = ele[i] - refEle;
            if (delta >= thresholdM && delta > 0) {
                cumGain += delta;
                refEle = ele[i];
            } else if (-delta >= thresholdM && delta < 0) {
                cumLoss += -delta;
                refEle = ele[i];
            }
            gain[i] = cumGain;
            loss[i] = cumLoss;
        }
        return new TrackProfile(lat, lon, ele, dist, gain, loss);
    }

    /** Distance orthodromique entre deux points, en mètres. */
    public static double haversine(double lat1, double lon1, double lat2, double lon2) {
        double phi1 = Math.toRadians(lat1), phi2 = Math.toRadians(lat2);
        double dPhi = phi2 - phi1;
        double dLambda = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
                + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
    }
}
