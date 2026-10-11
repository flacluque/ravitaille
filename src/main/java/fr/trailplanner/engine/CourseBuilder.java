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
 * sur l'autre, précision GPS...). Pour placer un ravito sur la trace, on applique donc
 * un facteur d'échelle : km_trace = km_roadbook × (longueur trace / longueur officielle).
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
        for (int i = 1; i < cps.size(); i++) {
            Checkpoint from = cps.get(i - 1), to = cps.get(i);
            if (source == ElevationSource.ROADBOOK) {
                double gain = to.gainM() - nz(from.gainM());
                double loss = to.lossM() == null ? 0 : to.lossM() - nz(from.lossM());
                legs.add(new Leg(from, to, to.km() - from.km(), Math.max(0, gain), Math.max(0, loss)));
            } else {
                TrackProfile.ProfilePoint p0 = onTrack(race, track, from);
                TrackProfile.ProfilePoint p1 = onTrack(race, track, to);
                legs.add(new Leg(from, to, p1.km() - p0.km(),
                        p1.cumulativeGainM() - p0.cumulativeGainM(),
                        p1.cumulativeLossM() - p0.cumulativeLossM()));
            }
        }
        return legs;
    }

    /** Position estimée d'un point du roadbook sur la trace. */
    public static TrackProfile.ProfilePoint onTrack(RaceDefinition race, TrackProfile track, Checkpoint cp) {
        double scale = track.totalDistanceKm() / race.finish().km();
        return track.at(cp.km() * scale);
    }

    private static double nz(Double v) {
        return v == null ? 0 : v;
    }
}
