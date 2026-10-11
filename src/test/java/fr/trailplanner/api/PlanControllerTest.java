package fr.trailplanner.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.io.InputStream;

import static org.hamcrest.Matchers.closeTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PlanController.class)
@Import(PlanningService.class)
class PlanControllerTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void laCourseDeDemoPlaceLesRavitosSurLaTrace() throws Exception {
        mvc.perform(get("/api/demo/bogomiles/course").param("stepKm", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.race.name").value("Raid des Bogomiles 2026"))
                .andExpect(jsonPath("$.track.distanceKm", closeTo(101.5, 0.1)))
                .andExpect(jsonPath("$.track.profile.length()").value(103))
                .andExpect(jsonPath("$.markers.length()").value(10))
                .andExpect(jsonPath("$.markers[0].trackKm").value(0.0))
                .andExpect(jsonPath("$.markers[9].trackKm", closeTo(101.5, 0.1)))
                .andExpect(jsonPath("$.markers[2].lat", closeTo(43.1, 0.2)));
    }

    @Test
    void uneCourseEnvoyeeAvecSaTraceEstDessinee() throws Exception {
        MockMultipartFile race = new MockMultipartFile("race", "roadbook.json", "application/json",
                resource("/samples/bogomiles/roadbook.json"));
        MockMultipartFile gpx = new MockMultipartFile("gpx", "trace.gpx", "application/gpx+xml",
                resource("/samples/bogomiles/trace.gpx"));

        mvc.perform(multipart("/api/courses").file(race).file(gpx).param("stepKm", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.track.gainM", closeTo(3770, 30)))
                .andExpect(jsonPath("$.markers.length()").value(10));
    }

    @Test
    void uneCourseSansTraceRenvoieLeRoadbookSeul() throws Exception {
        MockMultipartFile race = new MockMultipartFile("race", "roadbook.json", "application/json",
                resource("/samples/bogomiles/roadbook.json"));

        mvc.perform(multipart("/api/courses").file(race))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.race.checkpoints.length()").value(10))
                .andExpect(jsonPath("$.track").doesNotExist())
                .andExpect(jsonPath("$.markers.length()").value(0));
    }

    @Test
    void unPasDeProfilNulEstRefuse() throws Exception {
        mvc.perform(get("/api/demo/bogomiles/course").param("stepKm", "0"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unExempleInconnuEstRefuse() throws Exception {
        mvc.perform(get("/api/demo/inconnu/course"))
                .andExpect(status().isBadRequest());
    }

    private static byte[] resource(String path) throws Exception {
        try (InputStream in = PlanControllerTest.class.getResourceAsStream(path)) {
            return in.readAllBytes();
        }
    }
}
