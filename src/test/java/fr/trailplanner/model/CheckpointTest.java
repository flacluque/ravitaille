package fr.trailplanner.model;

import fr.trailplanner.api.JsonSupport;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.Set;

import static fr.trailplanner.model.Service.*;
import static org.junit.jupiter.api.Assertions.*;

class CheckpointTest {

    private static Checkpoint cp(AidLevel aid, Set<Service> services) {
        return new Checkpoint("3", "Molières", 20, 772.0, 590.0, null, null, aid, services);
    }

    @Test
    void sansServicesOnLesDeduitDuTypeDArret() {
        assertEquals(Set.of(), cp(AidLevel.NONE, null).services());
        assertEquals(EnumSet.of(WATER, DRINKS, COLD_FOOD), cp(AidLevel.LIGHT, null).services());
        assertEquals(EnumSet.of(WATER, DRINKS, COLD_FOOD, HOT_FOOD), cp(AidLevel.FULL, null).services());
    }

    @Test
    void sansTypeDArretOnLeDeduitDesServices() {
        assertEquals(AidLevel.NONE, cp(null, Set.of(ASSISTANCE)).aid());
        assertEquals(AidLevel.LIGHT, cp(null, Set.of(WATER)).aid());
        assertEquals(AidLevel.FULL, cp(null, Set.of(WATER, HOT_FOOD)).aid());
        assertEquals(AidLevel.FULL, cp(null, Set.of(DROP_BAG)).aid());
        assertEquals(AidLevel.NONE, cp(null, null).aid());
    }

    @Test
    void lesDeuxSaisisSontGardesTelsQuels() {
        // Un simple point d'eau où l'organisation prévoit quand même un arrêt long : on respecte le roadbook.
        Checkpoint c = cp(AidLevel.FULL, Set.of(WATER));
        assertEquals(AidLevel.FULL, c.aid());
        assertEquals(Set.of(WATER), c.services());
    }

    @Test
    void onPeutRemplirSesFlasquesAvecDeLEauOuDesBoissons() {
        assertTrue(cp(null, Set.of(WATER)).hasWater());
        assertTrue(cp(null, Set.of(DRINKS)).hasWater());
        assertFalse(cp(null, Set.of(COLD_FOOD, ASSISTANCE)).hasWater());
    }

    @Test
    void leJsonGardeUnOrdreStableEtAccepteLesAnciensRoadbooks() throws Exception {
        var mapper = JsonSupport.mapper();
        Checkpoint lu = mapper.readValue("""
                {"code":"3","name":"Molières","km":20,"services":["ASSISTANCE","WATER","COLD_FOOD"]}""", Checkpoint.class);
        assertEquals(AidLevel.LIGHT, lu.aid());
        assertTrue(mapper.writeValueAsString(lu).contains("\"services\":[\"WATER\",\"COLD_FOOD\",\"ASSISTANCE\"]"));

        Checkpoint ancien = mapper.readValue("""
                {"code":"5","name":"Arques","km":52,"aid":"FULL"}""", Checkpoint.class);
        assertEquals(EnumSet.of(WATER, DRINKS, COLD_FOOD, HOT_FOOD), ancien.services());
    }
}
