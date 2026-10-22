package fr.trailplanner.engine;

import fr.trailplanner.track.TrackProfile;

/**
 * Effort « terrain » (v0.6) : chaque bout de parcours compte pour sa distance × un coefficient selon sa pente.
 * <ul>
 *   <li><b>Montée</b> de pente g : 1 + 10 g, soit la règle ITRA (100 m de D+ ≈ 1 km à plat) sur laquelle
 *       les références sont calibrées.</li>
 *   <li><b>Descente</b> : plus rapide que le plat quand elle est douce (0,7 à −10 %), puis de plus en plus
 *       freinée (0,9 à −20 %, 1,1 à −30 %, 1,3 à −40 %). Le coût énergétique de la course est le plus bas
 *       entre −10 et −20 % (Minetti et al., 2002) ; au-delà, en trail, ce sont la technique et le freinage qui
 *       limitent. Ces seuils sont un choix de départ, à calibrer plus tard sur les sorties du coureur.</li>
 * </ul>
 * Sans profil (référence, roadbook sans trace), on suppose une pente moyenne : la distance se partage entre
 * montée et descente au prorata du D+ et du D-. Pour une référence, dont on ne connaît que le D+, on suppose
 * autant de D- que de D+ (boucle), avec la montée et la descente à pente moyenne.
 */
public final class TerrainEffort {

    /** Longueur des bouts de trace sur lesquels on mesure la pente (km). */
    static final double SEGMENT_KM = 0.1;

    private TerrainEffort() {}

    /** Coefficient de temps (1 = plat) pour une pente g (m/m, négative en descente). */
    public static double factor(double grade) {
        if (grade >= 0) {
            return 1 + 10 * grade;
        }
        double down = -grade;
        return down <= 0.10 ? 1 - 3 * down : 0.7 + 2 * (down - 0.10);
    }

    /**
     * Effort d'un bout de parcours dont on connaît distance, D+ et D- : montée et descente à pente moyenne,
     * la distance partagée au prorata du D+ et du D-.
     */
    public static double ofTotals(double distanceKm, double gainM, double lossM) {
        double gain = Math.max(0, gainM);
        double loss = Math.max(0, lossM);
        if (distanceKm <= 0) {
            return gain / 100.0;
        }
        if (gain + loss <= 0) {
            return distanceKm;
        }
        double upKm = distanceKm * gain / (gain + loss);
        double downKm = distanceKm - upKm;
        double up = upKm > 0 ? upKm * factor(gain / (upKm * 1000)) : gain / 100.0;
        double down = downKm > 0 ? downKm * factor(-loss / (downKm * 1000)) : 0;
        return up + down;
    }

    /** Effort d'une référence : seul le D+ est connu, on suppose autant de D- (boucle). */
    public static double ofReference(double distanceKm, double gainM) {
        return ofTotals(distanceKm, gainM, gainM);
    }

    /** Effort de la trace entre deux km, mesuré par bouts de {@value #SEGMENT_KM} km (D+ et D- filtrés). */
    public static double ofTrack(TrackProfile track, double fromKm, double toKm) {
        double effort = 0;
        TrackProfile.ProfilePoint prev = track.at(fromKm);
        for (double km = fromKm; km < toKm - 1e-9; km += SEGMENT_KM) {
            TrackProfile.ProfilePoint next = track.at(Math.min(toKm, km + SEGMENT_KM));
            effort += ofTotals(next.km() - prev.km(), next.cumulativeGainM() - prev.cumulativeGainM(),
                    next.cumulativeLossM() - prev.cumulativeLossM());
            prev = next;
        }
        return effort;
    }
}
