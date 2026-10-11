package fr.trailplanner.track;

import java.util.ArrayList;
import java.util.List;

/**
 * Profil cumulé d'un tracé : pour chaque point, distance, D+ et D- depuis le départ.
 * Les tableaux sont indexés comme les points du GPX.
 */
public final class TrackProfile {

    private final double[] lat;
    private final double[] lon;
    private final double[] elevation;   // altitude brute (m)
    private final double[] distanceM;   // distance cumulée (m)
    private final double[] gainM;       // D+ cumulé (m), après filtrage du bruit
    private final double[] lossM;       // D- cumulé (m), après filtrage du bruit

    TrackProfile(double[] lat, double[] lon, double[] elevation,
                 double[] distanceM, double[] gainM, double[] lossM) {
        this.lat = lat;
        this.lon = lon;
        this.elevation = elevation;
        this.distanceM = distanceM;
        this.gainM = gainM;
        this.lossM = lossM;
    }

    public int size() {
        return distanceM.length;
    }

    public double totalDistanceKm() {
        return distanceM[size() - 1] / 1000.0;
    }

    public double totalGainM() {
        return gainM[size() - 1];
    }

    public double totalLossM() {
        return lossM[size() - 1];
    }

    /** Statistiques cumulées au kilomètre donné (interpolation linéaire entre deux points). */
    public ProfilePoint at(double km) {
        double target = Math.max(0, Math.min(km * 1000.0, distanceM[size() - 1]));
        int i = indexAtOrAfter(target);
        if (i == 0) {
            return point(0);
        }
        double d0 = distanceM[i - 1], d1 = distanceM[i];
        double t = d1 == d0 ? 0 : (target - d0) / (d1 - d0);
        return new ProfilePoint(
                target / 1000.0,
                lerp(elevation[i - 1], elevation[i], t),
                lerp(gainM[i - 1], gainM[i], t),
                lerp(lossM[i - 1], lossM[i], t),
                lerp(lat[i - 1], lat[i], t),
                lerp(lon[i - 1], lon[i], t));
    }

    /** Profil rééchantillonné à pas fixe, pratique pour tracer le profil altimétrique côté front. */
    public List<ProfilePoint> sample(double stepKm) {
        List<ProfilePoint> out = new ArrayList<>();
        double total = totalDistanceKm();
        for (double km = 0; km < total; km += stepKm) {
            out.add(at(km));
        }
        out.add(at(total));
        return out;
    }

    private ProfilePoint point(int i) {
        return new ProfilePoint(distanceM[i] / 1000.0, elevation[i], gainM[i], lossM[i], lat[i], lon[i]);
    }

    private int indexAtOrAfter(double targetM) {
        int lo = 0, hi = size() - 1;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (distanceM[mid] < targetM) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    private static double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }

    public record ProfilePoint(double km, double elevationM, double cumulativeGainM,
                               double cumulativeLossM, double lat, double lon) {}
}
