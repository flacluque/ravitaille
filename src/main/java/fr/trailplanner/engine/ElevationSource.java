package fr.trailplanner.engine;

/** D'où viennent la distance et le dénivelé de chaque tronçon. */
public enum ElevationSource {
    /** Roadbook si tous les D+ sont renseignés, sinon trace GPX. */
    AUTO,
    /** Chiffres officiels du roadbook (version à jour du parcours). */
    ROADBOOK,
    /** Mesuré sur la trace GPX. */
    TRACK
}
