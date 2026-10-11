package fr.trailplanner.extract;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.io.InputStream;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RoadbookController.class)
@Import(RoadbookExtractionService.class)
class RoadbookControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockBean
    private RoadbookExtractor extractor;

    @Test
    void litUneImageEtRenvoieLeRoadbookNormalise() throws Exception {
        when(extractor.extract(anyList())).thenReturn(new ExtractedRoadbook("Raid", null, "9h00", List.of(
                new ExtractedRoadbook.Point("3", "Molières", 20.0, 772.0, 590.0, "Vend 23 12h30", null, "LIGHT")), List.of()));

        mvc.perform(multipart("/api/roadbooks/extract").file(image()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.startTime").value("09:00"))
                .andExpect(jsonPath("$.checkpoints[0].cutoffIn").value("12h30"));
    }

    @Test
    void uneIaIndisponibleRenvoie503AvecLExplication() throws Exception {
        when(extractor.extract(anyList())).thenThrow(ExtractionException.unavailable("Ollama ne répond pas"));

        mvc.perform(multipart("/api/roadbooks/extract").file(image()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("Ollama ne répond pas"));
    }

    @Test
    void unFichierQuiNEstPasUnRoadbookRenvoie400() throws Exception {
        mvc.perform(multipart("/api/roadbooks/extract")
                        .file(new MockMultipartFile("file", "trace.gpx", "application/gpx+xml", "<gpx/>".getBytes())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void exposeLEtatDeLIa() throws Exception {
        when(extractor.status()).thenReturn(new RoadbookExtractor.Status(true, "ollama", "qwen2.5vl:7b", false, "lance Ollama"));

        mvc.perform(get("/api/roadbooks/extractor"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(false))
                .andExpect(jsonPath("$.message").value("lance Ollama"));
    }

    private MockMultipartFile image() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/roadbooks/troubadours-2026.jpg")) {
            return new MockMultipartFile("file", "troubadours.jpg", "image/jpeg", in.readAllBytes());
        }
    }
}
