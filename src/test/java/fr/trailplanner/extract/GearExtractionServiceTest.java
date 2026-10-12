package fr.trailplanner.extract;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class GearExtractionServiceTest {

    @Test
    void nettoieLesLibellesEtFusionneLesDoublons() {
        ExtractedGear raw = new ExtractedGear(" RAID DES TROUBADOURS ", Arrays.asList(
                new ExtractedGear.Item("*  1 sifflet", "MANDATORY"),
                new ExtractedGear.Item("1 Sifflet", "RECOMMENDED"),
                new ExtractedGear.Item("Bâtons", "recommended"),
                new ExtractedGear.Item("1 couverture   de survie", "O"),
                new ExtractedGear.Item(" ", "MANDATORY"),
                null), List.of(" ", "Case illisible ligne 4"));

        ExtractedGear clean = GearExtractionService.normalize(raw);

        assertEquals("RAID DES TROUBADOURS", clean.race());
        assertEquals(List.of(
                new ExtractedGear.Item("1 sifflet", "MANDATORY"),
                new ExtractedGear.Item("Bâtons", "RECOMMENDED"),
                new ExtractedGear.Item("1 couverture de survie", "MANDATORY")), clean.items());
        assertEquals(List.of("Case illisible ligne 4"), clean.warnings());
    }

    @Test
    void unDoublonRecommandeNeRetrogradePasUnObligatoire() {
        ExtractedGear clean = GearExtractionService.normalize(new ExtractedGear(null, List.of(
                new ExtractedGear.Item("Gants", "RECOMMENDED"),
                new ExtractedGear.Item("gants", "MANDATORY")), List.of()));
        assertEquals(List.of(new ExtractedGear.Item("gants", "MANDATORY")), clean.items());
    }

    @Test
    void previentQuandRienNAEteReconnu() {
        ExtractedGear clean = GearExtractionService.normalize(new ExtractedGear(null, null, null));
        assertTrue(clean.items().isEmpty());
        assertEquals(1, clean.warnings().size());
    }
}
