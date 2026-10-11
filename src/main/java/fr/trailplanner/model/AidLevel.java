package fr.trailplanner.model;

/** Type de point de passage, qui détermine le temps d'arrêt prévu. */
public enum AidLevel {
    /** Simple point de passage (pas de ravito) : pas d'arrêt. */
    NONE,
    /** Ravito classique (boissons, solides froids, éventuellement boisson chaude) : arrêt court. */
    LIGHT,
    /** Gros ravito / base de vie (repas chaud, sac de délestage...) : arrêt long. */
    FULL
}
