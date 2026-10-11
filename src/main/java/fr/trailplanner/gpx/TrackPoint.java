package fr.trailplanner.gpx;

/**
 * Un point du tracé GPX.
 *
 * @param lat       latitude en degrés
 * @param lon       longitude en degrés
 * @param elevation altitude en mètres, {@code Double.NaN} si absente du fichier
 */
public record TrackPoint(double lat, double lon, double elevation) {

    public boolean hasElevation() {
        return !Double.isNaN(elevation);
    }
}
