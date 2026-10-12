package fr.trailplanner.api;

import com.fasterxml.jackson.annotation.JsonCreator;
import fr.trailplanner.engine.ElevationSource;
import fr.trailplanner.model.NightWindow;
import fr.trailplanner.model.RaceDefinition;
import fr.trailplanner.model.ReferencePerformance;
import fr.trailplanner.model.Scenario;

import java.util.List;

/**
 * Corps de la demande de plan.
 *
 * @param race            la course (roadbook)
 * @param references      une ou plusieurs courses de référence du coureur
 * @param night           plage nocturne (optionnelle)
 * @param elevationSource AUTO (défaut), ROADBOOK ou TRACK
 * @param scenarios       scénarios personnalisés (optionnel ; sinon optimiste / réaliste / prudent)
 * @param training        tenir compte de l'entraînement (historique Strava) ; null pour s'en passer
 */
public record PlanRequest(
        RaceDefinition race,
        List<ReferencePerformance> references,
        NightWindow night,
        ElevationSource elevationSource,
        List<Scenario> scenarios,
        TrainingOptions training) {

    @JsonCreator
    public PlanRequest {
    }

    public PlanRequest(RaceDefinition race, List<ReferencePerformance> references, NightWindow night,
                       ElevationSource elevationSource, List<Scenario> scenarios) {
        this(race, references, night, elevationSource, scenarios, null);
    }

    /**
     * @param strava       corriger la forme d'après l'historique Strava
     * @param includeHikes compter les randonnées dans le volume
     */
    public record TrainingOptions(boolean strava, boolean includeHikes) {}

    public List<Scenario> scenariosOrDefault() {
        return scenarios == null || scenarios.isEmpty() ? Scenario.defaults() : scenarios;
    }
}
