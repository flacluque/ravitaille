package fr.trailplanner.model;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Une course telle que décrite par son roadbook.
 * Le premier point est le départ (km 0), le dernier l'arrivée.
 */
public record RaceDefinition(
        String name,
        LocalDateTime start,
        Duration maxDuration,
        List<Checkpoint> checkpoints) {

    public RaceDefinition {
        if (checkpoints == null || checkpoints.size() < 2) {
            throw new IllegalArgumentException("Il faut au moins un départ et une arrivée");
        }
        checkpoints = List.copyOf(checkpoints);
        for (int i = 1; i < checkpoints.size(); i++) {
            if (checkpoints.get(i).km() <= checkpoints.get(i - 1).km()) {
                throw new IllegalArgumentException("Les points doivent être triés par kilométrage croissant ("
                        + checkpoints.get(i).name() + ")");
            }
        }
    }

    public Checkpoint finish() {
        return checkpoints.get(checkpoints.size() - 1);
    }

    /** Vrai si tous les points (hors départ) ont un D+ officiel renseigné. */
    public boolean hasOfficialElevation() {
        return checkpoints.stream().skip(1).allMatch(c -> c.gainM() != null);
    }
}
