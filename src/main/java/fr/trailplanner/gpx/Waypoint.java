package fr.trailplanner.gpx;

/**
 * Point nommé du fichier GPX ({@code wpt}) : souvent les ravitos, quand l'organisation les a mis dans la trace.
 *
 * @param name nom du point (« Ravito Greffeil »)
 * @param lat  latitude en degrés
 * @param lon  longitude en degrés
 */
public record Waypoint(String name, double lat, double lon) {}
