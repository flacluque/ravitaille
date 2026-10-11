package fr.trailplanner.api;

import fr.trailplanner.track.TrackProfile;

import java.util.List;

/** Résumé d'une trace GPX + profil rééchantillonné (pour la carte et le profil altimétrique). */
public record TrackSummary(
        String name,
        int pointCount,
        double distanceKm,
        double gainM,
        double lossM,
        double minElevationM,
        double maxElevationM,
        List<TrackProfile.ProfilePoint> profile) {

    public static TrackSummary of(String name, TrackProfile track, double stepKm) {
        if (!(stepKm >= 0.01)) {
            throw new IllegalArgumentException("Pas de rééchantillonnage trop petit (minimum 0,01 km) : " + stepKm);
        }
        List<TrackProfile.ProfilePoint> profile = track.sample(stepKm);
        double min = profile.stream().mapToDouble(TrackProfile.ProfilePoint::elevationM).min().orElse(0);
        double max = profile.stream().mapToDouble(TrackProfile.ProfilePoint::elevationM).max().orElse(0);
        return new TrackSummary(name, track.size(),
                Math.round(track.totalDistanceKm() * 100) / 100.0,
                Math.round(track.totalGainM()), Math.round(track.totalLossM()),
                Math.round(min), Math.round(max), profile);
    }
}
