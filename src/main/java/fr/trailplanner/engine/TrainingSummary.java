package fr.trailplanner.engine;

import java.util.List;

/**
 * Ce que le plan retient de la préparation du coureur, pour l'affichage.
 *
 * @param active         la forme est prise en compte dans le plan
 * @param target         bloc de préparation de la course (12 semaines)
 * @param weeks          les 16 dernières semaines, pour le graphique
 * @param elasticity     sensibilité du temps au volume (0,10 = +10 % de volume, −1 % de temps)
 * @param personalRaces  courses ayant servi à ajuster cette sensibilité (0 = valeur par défaut)
 * @param lowSpecificity sortie longue trop courte pour la course
 * @param notes          explications et alertes
 */
public record TrainingSummary(boolean active, TrainingHistory.PrepBlock target, List<TrainingHistory.Week> weeks,
                              double elasticity, int personalRaces, boolean lowSpecificity, List<String> notes) {

    static TrainingSummary of(TrainingForm.Analysis a) {
        return new TrainingSummary(a.active(), a.target(), a.weeks(), a.elasticity(), a.personalRaces(),
                a.lowSpecificity(), a.notes());
    }
}
