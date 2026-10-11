package fr.trailplanner.extract;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.io.InputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(GearController.class)
@Import({GearExtractionService.class, ExtractionErrors.class})
class GearControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockBean
    private DocumentReader reader;

    @Test
    void litLeMaterielDeLaCourseDemandee() throws Exception {
        when(reader.read(any())).thenReturn("""
                {"race": "RAID DES TROUBADOURS", "items": [
                  {"name": "* 1 sifflet", "status": "MANDATORY"},
                  {"name": "1,5 l d'eau", "status": "MANDATORY"}], "warnings": []}""");

        mvc.perform(multipart("/api/gear/extract").file(image()).param("raceName", "Raid des Troubadours 2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.race").value("RAID DES TROUBADOURS"))
                .andExpect(jsonPath("$.items[0].name").value("1 sifflet"))
                .andExpect(jsonPath("$.items.length()").value(2));

        ArgumentCaptor<DocumentReader.Request> sent = ArgumentCaptor.forClass(DocumentReader.Request.class);
        verify(reader).read(sent.capture());
        assertEquals(GearPrompt.SYSTEM, sent.getValue().system());
        assertEquals(GearPrompt.SCHEMA, sent.getValue().schema());
        assertTrue(sent.getValue().user().contains("« Raid des Troubadours 2026 »"), sent.getValue().user());
        assertEquals(1, sent.getValue().images().size());
    }

    @Test
    void uneIaIndisponibleRenvoie503() throws Exception {
        when(reader.read(any())).thenThrow(ExtractionException.unavailable("Ollama ne répond pas"));

        mvc.perform(multipart("/api/gear/extract").file(image()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("Ollama ne répond pas"));
    }

    @Test
    void uneReponseDUneAutreFormeRenvoie502() throws Exception {
        when(reader.read(any())).thenReturn("{\"items\": \"aucun\"}");

        mvc.perform(multipart("/api/gear/extract").file(image()))
                .andExpect(status().isBadGateway());
    }

    private MockMultipartFile image() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/reglements/materiel-grand-raid-cathares-2026.jpg")) {
            return new MockMultipartFile("file", "materiel.jpg", "image/jpeg", in.readAllBytes());
        }
    }
}
