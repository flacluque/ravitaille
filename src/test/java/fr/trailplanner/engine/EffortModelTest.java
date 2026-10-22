package fr.trailplanner.engine;

import fr.trailplanner.model.ReferencePerformance;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class EffortModelTest {

    private static final ReferencePerformance REF_60K =
            new ReferencePerformance("60 km", 60, 3200, Duration.ofHours(8).plusMinutes(48));

    @Test
    void kilometreEffort() {
        assertEquals(92, EffortModel.effortKm(60, 3200), 1e-9);
    }

    /** Effort de la référence selon la pente (autant de D- que de D+, pente moyenne). */
    private static final double E_60K = TerrainEffort.ofReference(60, 3200);

    @Test
    void laCalibrationRetrouveLeTempsDeReference() {
        EffortModel m = EffortModel.calibrate(List.of(REF_60K), 1.07);
        assertEquals(528, m.minutesAt(E_60K), 1e-6);
    }

    @Test
    void lAllureSeDegradeAvecLaDistance() {
        EffortModel m = EffortModel.calibrate(List.of(REF_60K), 1.07);
        assertTrue(m.paceAt(120) > m.paceAt(30));
        // Allure moyenne plus lente sur une course plus longue
        assertTrue(m.minutesAt(143) / 143 > 528.0 / 92);
    }

    @Test
    void sansFatigueLeTempsEstProportionnel() {
        EffortModel m = EffortModel.calibrate(List.of(REF_60K), 1.0);
        assertEquals(528.0 * 2, m.minutesAt(2 * E_60K), 1e-6);
    }

    @Test
    void plusieursReferencesSontMoyennees() {
        var rapide = new ReferencePerformance("rapide", 60, 3200, Duration.ofHours(8));
        var lente = new ReferencePerformance("lente", 60, 3200, Duration.ofHours(10));
        EffortModel m = EffortModel.calibrate(List.of(rapide, lente), 1.07);
        assertEquals(540, m.minutesAt(E_60K), 1e-6);
    }

    @Test
    void refuseSansReference() {
        assertThrows(IllegalArgumentException.class, () -> EffortModel.calibrate(List.of(), 1.07));
    }
}
