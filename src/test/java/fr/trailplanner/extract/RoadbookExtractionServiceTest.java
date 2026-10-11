package fr.trailplanner.extract;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RoadbookExtractionServiceTest {

    @ParameterizedTest
    @CsvSource(nullValues = "null", value = {
            "12h30, 12h30",
            "12:30, 12h30",
            "9h, 09h00",
            "Vend 23 12h30, 12h30",
            "Sam 24 02h00, 02h00",
            "25h00, null",
            "'', null",
            "null, null",
    })
    void normaliseLesHeures(String input, String expected) {
        assertEquals(expected, RoadbookExtractionService.clock(input));
    }

    @Test
    void remetAuPropreLaReponseDuModele() {
        ExtractedRoadbook raw = new ExtractedRoadbook(" Raid ", "23/10/2026", "9h", Arrays.asList(
                new ExtractedRoadbook.Point("1P", " Départ ", 0.0, 0.0, 0.0, "", null, "none"),
                null,
                new ExtractedRoadbook.Point(" 3 ", "Molières", 20.0, 772.0, null, "Vend 23 12h30", "n/a", "ravito")),
                Arrays.asList("  À vérifier  ", " ", null));

        ExtractedRoadbook clean = RoadbookExtractionService.normalize(raw);

        assertEquals("Raid", clean.name());
        assertNull(clean.startDate(), "date hors format ISO : le coureur la saisira");
        assertEquals("09:00", clean.startTime());
        assertEquals(2, clean.checkpoints().size());
        assertEquals(new ExtractedRoadbook.Point("1P", "Départ", 0.0, 0.0, 0.0, null, null, "NONE"), clean.checkpoints().get(0));
        assertEquals(new ExtractedRoadbook.Point("3", "Molières", 20.0, 772.0, null, "12h30", null, "NONE"), clean.checkpoints().get(1));
        assertEquals(List.of("À vérifier"), clean.warnings());
    }

    @Test
    void sansDPlusAuxPointsOnConseilleLaTraceGpx() {
        // Roadbook type livret : distances et barrières, mais le dénivelé n'existe que dans le dessin du profil.
        ExtractedRoadbook clean = RoadbookExtractionService.normalize(new ExtractedRoadbook("Malène", null, "06:40", List.of(
                new ExtractedRoadbook.Point("1", "Départ La Malène", 0.0, null, null, null, null, "NONE"),
                new ExtractedRoadbook.Point("2", "La Caxe", 10.0, null, null, null, null, "LIGHT")), List.of()));

        assertEquals(0.0, clean.checkpoints().get(0).gainM(), "D+ nul au départ, même non écrit");
        assertEquals(1, clean.warnings().size());
        assertTrue(clean.warnings().get(0).contains("ajoute la trace GPX"), clean.warnings().get(0));
    }

    @Test
    void previentQuandRienNAEteReconnu() {
        ExtractedRoadbook clean = RoadbookExtractionService.normalize(new ExtractedRoadbook(null, null, null, null, null));
        assertEquals(1, clean.warnings().size());
    }
}
