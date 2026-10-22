package fr.trailplanner.engine;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TerrainEffortTest {

    @Test
    void lesCoefficientsSuiventLaPente() {
        assertEquals(1.0, TerrainEffort.factor(0), 1e-9);
        assertEquals(2.0, TerrainEffort.factor(0.10), 1e-9, "montée à 10 % : règle ITRA, 100 m de D+ = 1 km");
        assertEquals(0.7, TerrainEffort.factor(-0.10), 1e-9, "descente douce : plus rapide que le plat");
        assertEquals(0.9, TerrainEffort.factor(-0.20), 1e-9);
        assertEquals(1.1, TerrainEffort.factor(-0.30), 1e-9, "descente raide : plus lente que le plat");
        assertEquals(1.3, TerrainEffort.factor(-0.40), 1e-9);
    }

    @Test
    void enMonteeOnRetrouveLeKilometreEffort() {
        // 5 km pour 400 m de D+, sans descente : 5 + 4 = 9, comme le km-effort ITRA.
        assertEquals(EffortModel.effortKm(5, 400), TerrainEffort.ofTotals(5, 400, 0), 1e-9);
        assertEquals(10, TerrainEffort.ofTotals(10, 0, 0), 1e-9, "plat");
    }

    @Test
    void lesDescentesRaidesCoutentPlusQueLesDouces() {
        // Même distance et même D+ ; la descente est raide (concentrée) ou douce (étalée).
        double raide = TerrainEffort.ofTotals(2, 0, 600);   // −30 %
        double douce = TerrainEffort.ofTotals(6, 0, 600);   // −10 %
        assertEquals(2 * 1.1, raide, 1e-9);
        assertEquals(6 * 0.7, douce, 1e-9);
        assertTrue(raide / 2 > douce / 6, "par km, la descente raide est plus lente");
    }

    @Test
    void uneReferenceSupposeAutantDeDescenteQueDeMontee() {
        assertEquals(TerrainEffort.ofTotals(60, 3200, 3200), TerrainEffort.ofReference(60, 3200), 1e-9);
        assertTrue(TerrainEffort.ofReference(60, 3200) < EffortModel.effortKm(60, 3200),
                "pentes moyennes de 10 % : les descentes rendent un peu du temps des montées");
    }
}
