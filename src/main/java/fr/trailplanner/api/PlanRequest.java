package fr.trailplanner.api;

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
 */
public record PlanRequest(
        RaceDefinition race,
        List<ReferencePerformance> references,
        NightWindow night,
        ElevationSource elevationSource,
        List<Scenario> scenarios) {

    public List<Scenario> scenariosOrDefault() {
        return scenarios == null || scenarios.isEmpty() ? Scenario.defaults() : scenarios;
    }
}
