package fr.trailplanner.engine;

import fr.trailplanner.model.Checkpoint;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.track.TrackProfile;

import java.util.ArrayList;
import java.util.List;

/**
 * Construit les tronçons entre ravitos, à partir du roadbook et/ou de la trace GPX.
 * <p>
 * La trace GPX fait rarement exactement la distance officielle (parcours modifié d'une année
 * sur l'autre, précision GPS...). Chaque ravito est placé sur la trace par {@link Placement} : à la main, sur le
 * waypoint du GPX qui porte son nom, ou au km du roadbook mis à l'échelle de la trace.
 */
public final class CourseBuilder {

    private CourseBuilder() {}

    public static ElevationSource resolve(ElevationSource requested, RaceDefinition race, TrackProfile track) {
        return switch (requested == null ? ElevationSource.AUTO : requested) {
            case ROADBOOK -> {
                if (!race.hasOfficialElevation()) {
                    throw new IllegalArgumentException("Le roadbook ne renseigne pas le D+ de tous les points");
                }
                yield ElevationSource.ROADBOOK;
            }
            case TRACK -> {
                if (track == null) {
                    throw new IllegalArgumentException("Aucune trace GPX fournie");
                }
                yield ElevationSource.TRACK;
            }
            case AUTO -> {
                if (race.hasOfficialElevation()) {
                    yield ElevationSource.ROADBOOK;
                }
                if (track == null) {
                    throw new IllegalArgumentException("Ni D+ officiel ni trace GPX : impossible d'estimer le dénivelé");
                }
                yield ElevationSource.TRACK;
            }
        };
    }

    public static List<Leg> legs(RaceDefinition race, TrackProfile track, ElevationSource source) {
        List<Checkpoint> cps = race.checkpoints();
        List<Leg> legs = new ArrayList<>();
        // Roadbook sans D- : on suppose autant de descente que de montée sur chaque tronçon, comme pour les références.
        boolean lossKnown = cps.stream().anyMatch(c -> c.lossM() != null && c.lossM() > 0);
        List<Placement> places = track == null ? null : Placement.of(race, track);
        // Km officiel de chaque point : celui du roadbook, ou sa position sur la trace ramenée à l'échelle officielle
        // quand le coureur l'a déplacé (le km du roadbook était faux).
        double scale = track == null ? 1 : track.totalDistanceKm() / race.finish().km();
        for (int i = 1; i < cps.size(); i++) {
            Checkpoint from = cps.get(i - 1), to = cps.get(i);
            if (source == ElevationSource.ROADBOOK) {
                double distance = places == null ? to.km() - from.km()
                        : (places.get(i).trackKm() - places.get(i - 1).trackKm()) / scale;
                double gain = Math.max(0, to.gainM() - nz(from.gainM()));
                double loss = Math.max(0, nz(to.lossM()) - nz(from.lossM()));
                if (track == null) {
                    // D- affiché tel que donné (0 si inconnu) ; pour le calcul, autant de descente que de montée.
                    legs.add(new Leg(from, to, distance, gain, loss,
                            TerrainEffort.ofTotals(distance, gain, lossKnown ? loss : gain)));
                } else {
                    // Chiffres officiels pour la distance et le D+, forme des descentes lue sur la trace.
                    TrackProfile.ProfilePoint p0 = track.at(places.get(i - 1).trackKm());
                    TrackProfile.ProfilePoint p1 = track.at(places.get(i).trackKm());
                    double onTrackKmEffort = EffortModel.effortKm(p1.km() - p0.km(), p1.cumulativeGainM() - p0.cumulativeGainM());
                    double descent = TerrainEffort.ofTrack(track, p0.km(), p1.km()) - onTrackKmEffort;
                    double terrain = Math.max(0.5 * distance, EffortModel.effortKm(distance, gain) + descent);
                    // D- absent du roadbook : celui de la trace.
                    double legLoss = lossKnown ? loss : p1.cumulativeLossM() - p0.cumulativeLossM();
                    legs.add(new Leg(from, to, distance, gain, legLoss, terrain));
                }
            } else {
                TrackProfile.ProfilePoint p0 = track.at(places.get(i - 1).trackKm());
                TrackProfile.ProfilePoint p1 = track.at(places.get(i).trackKm());
                legs.add(new Leg(from, to, p1.km() - p0.km(),
                        p1.cumulativeGainM() - p0.cumulativeGainM(),
                        p1.cumulativeLossM() - p0.cumulativeLossM(),
                        TerrainEffort.ofTrack(track, p0.km(), p1.km())));
            }
        }
        boolean assumeLoss = source == ElevationSource.ROADBOOK && track == null && !lossKnown;
        return normalized(legs, assumeLoss);
    }

    /**
     * L'effort total de la course se mesure comme celui des références, à partir de ses totaux (distance, D+, D-) :
     * une pente mesurée finement a toujours des passages plus raides que sa moyenne, et la course paraîtrait plus dure
     * qu'une référence au profil identique. Le profil fin ne sert qu'à répartir cet effort entre les tronçons.
     */
    static List<Leg> normalized(List<Leg> legs, boolean lossEqualsGain) {
        double distance = 0, gain = 0, loss = 0, fine = 0;
        for (Leg leg : legs) {
            distance += leg.distanceKm();
            gain += leg.gainM();
            loss += leg.lossM();
            fine += leg.terrainEffortKm();
        }
        if (fine <= 0) {
            return legs;
        }
        double scale = TerrainEffort.ofTotals(distance, gain, lossEqualsGain ? gain : loss) / fine;
        return legs.stream()
                .map(l -> new Leg(l.from(), l.to(), l.distanceKm(), l.gainM(), l.lossM(), l.terrainEffortKm() * scale))
                .toList();
    }

    private static double nz(Double v) {
        return v == null ? 0 : v;
    }
}
