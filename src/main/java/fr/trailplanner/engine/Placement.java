package fr.trailplanner.engine;

import fr.trailplanner.gpx.Waypoint;
import fr.trailplanner.model.Checkpoint;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.track.TrackProfile;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.OptionalDouble;
import java.util.Set;

/**
 * Position d'un point du roadbook sur la trace GPX. Par ordre de priorité :
 * <ol>
 *   <li>{@link Source#MANUAL} : placée par le coureur sur la carte ;</li>
 *   <li>{@link Source#WAYPOINT} : un point nommé du GPX porte le nom du ravito (« RAV Greffeil ») et la trace passe
 *       à moins de {@value #WAYPOINT_MAX_DISTANCE_M} m ;</li>
 *   <li>{@link Source#ROADBOOK} : le km du roadbook ramené à la longueur de la trace
 *       (km_trace = km_roadbook × longueur trace / longueur officielle).</li>
 * </ol>
 * Les points restent dans l'ordre du roadbook : une position qui passerait avant le point précédent est écartée
 * au profit de la suivante. Le départ et l'arrivée sont toujours aux deux bouts de la trace.
 *
 * @param trackKm         position retenue (km sur la trace)
 * @param source          d'où vient cette position
 * @param roadbookTrackKm position déduite du km du roadbook, pour comparer
 * @param waypoint        waypoint du GPX au nom du point, même s'il n'est pas retenu (null sinon)
 */
public record Placement(double trackKm, Source source, double roadbookTrackKm, WaypointMatch waypoint) {

    public enum Source { ROADBOOK, WAYPOINT, MANUAL }

    /** Waypoint du GPX reconnu pour un point, et l'endroit où la trace passe au plus près. */
    public record WaypointMatch(String name, double trackKm) {}

    static final double WAYPOINT_MAX_DISTANCE_M = 300;
    /** Écart minimal entre deux points sur la trace (km). */
    static final double MIN_GAP_KM = 0.05;

    /** Mots qui ne désignent pas un lieu en propre : « Ravito du lac de Cavayère » se reconnaît à « cavayere ». */
    private static final Set<String> GENERIC = Set.of(
            "ravito", "ravitaillement", "rav", "ravi", "ravit", "aid", "station", "poste", "point", "pointage",
            "controle", "check", "checkpoint", "liquide", "solide", "complet", "eau", "base", "vie", "des", "les",
            "sur", "sous", "aux", "the", "village", "hameau", "mairie", "depart", "arrivee", "start", "finish",
            "col", "lac", "pic", "mont", "refuge", "chateau", "pont", "plateau", "camp", "militaire", "pas", "port",
            "bois", "foret", "croix", "gite", "ferme", "chapelle", "eglise", "parking", "salle", "gymnase", "stade");

    public static List<Placement> of(RaceDefinition race, TrackProfile track) {
        List<Checkpoint> cps = race.checkpoints();
        double total = track.totalDistanceKm();
        double scale = total / race.finish().km();
        int last = cps.size() - 1;
        List<Placement> out = new ArrayList<>();
        out.add(new Placement(0, Source.ROADBOOK, 0, null));
        double previous = 0;
        for (int i = 1; i < last; i++) {
            Checkpoint cp = cps.get(i);
            double roadbook = clamp(cp.km() * scale, 0, total);
            WaypointMatch match = match(cp, track, roadbook);
            // Place laissée aux points suivants avant l'arrivée.
            double max = total - (last - i) * MIN_GAP_KM;
            double min = previous + MIN_GAP_KM;
            Placement placed;
            if (cp.trackKm() != null && cp.trackKm() >= min && cp.trackKm() <= max) {
                placed = new Placement(cp.trackKm(), Source.MANUAL, roadbook, match);
            } else if (match != null && match.trackKm() >= min && match.trackKm() <= max) {
                placed = new Placement(match.trackKm(), Source.WAYPOINT, roadbook, match);
            } else {
                placed = new Placement(clamp(roadbook, min, max), Source.ROADBOOK, roadbook, match);
            }
            out.add(placed);
            previous = placed.trackKm();
        }
        out.add(new Placement(total, Source.ROADBOOK, total, null));
        return out;
    }

    /**
     * Waypoint du GPX dont le nom contient le premier mot propre du point (« Molières-sur-l'Alberte » →
     * « molieres »), le plus ressemblant, puis le plus près du km du roadbook.
     */
    static WaypointMatch match(Checkpoint cp, TrackProfile track, double expectedKm) {
        List<String> words = words(cp.name());
        if (words.isEmpty() || track.waypoints().isEmpty()) {
            return null;
        }
        String key = words.get(0);
        WaypointMatch best = null;
        int bestScore = 0;
        double bestGap = Double.POSITIVE_INFINITY;
        for (Waypoint wp : track.waypoints()) {
            List<String> wpWords = words(wp.name());
            if (!wpWords.contains(key)) {
                continue;
            }
            OptionalDouble km = track.kmNear(wp.lat(), wp.lon(), WAYPOINT_MAX_DISTANCE_M, expectedKm);
            if (km.isEmpty()) {
                continue;
            }
            int score = (int) words.stream().filter(wpWords::contains).count();
            double gap = Math.abs(km.getAsDouble() - expectedKm);
            if (score > bestScore || (score == bestScore && gap < bestGap)) {
                best = new WaypointMatch(wp.name(), Math.round(km.getAsDouble() * 100) / 100.0);
                bestScore = score;
                bestGap = gap;
            }
        }
        return best;
    }

    /** Mots propres d'un nom, sans accents ni majuscules. */
    static List<String> words(String name) {
        if (name == null) {
            return List.of();
        }
        String plain = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase();
        return Arrays.stream(plain.split("[^a-z0-9]+"))
                .filter(w -> w.length() >= 3 && !GENERIC.contains(w))
                .toList();
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
