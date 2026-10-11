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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

    private static final String REQUEST_SANS_TRACE = """
            {
              "race": {
                "name": "Trail sans trace",
                "start": "2026-10-23T08:00",
                "checkpoints": [
                  { "code": "D", "name": "Départ", "km": 0, "gainM": 0 },
                  { "code": "R", "name": "Ravito", "km": 20, "gainM": 900, "aid": "LIGHT", "cutoffIn": "2026-10-23T12:30" },
                  { "code": "A", "name": "Arrivée", "km": 40, "gainM": 1800 }
                ]
              },
              "references": [ { "label": "Réf", "distanceKm": 60, "elevationGainM": 3200, "duration": "PT8H48M" } ],
              "night": { "nightStart": "19:00", "nightEnd": "07:45" }
            }
            """;

    @Test
    void unPlanCompletSansTraceSAppuieSurLeRoadbook() throws Exception {
        MockMultipartFile request = new MockMultipartFile("request", "", "application/json", REQUEST_SANS_TRACE.getBytes());

        mvc.perform(multipart("/api/plans/full").file(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.course.track").doesNotExist())
                .andExpect(jsonPath("$.plans.length()").value(3))
                .andExpect(jsonPath("$.plans[1].elevationSource").value("ROADBOOK"))
                .andExpect(jsonPath("$.plans[1].checkpoints[1].status").value("OK"));
    }

    @Test
    void unPlanCompletAvecTraceRenvoieAussiLaCarte() throws Exception {
        MockMultipartFile request = new MockMultipartFile("request", "", "application/json",
                ("{\"race\":" + new String(resource("/samples/bogomiles/roadbook.json"))
                        + ",\"references\":[{\"label\":\"Réf\",\"distanceKm\":60,\"elevationGainM\":3200,\"duration\":\"PT8H48M\"}]"
                        + ",\"elevationSource\":\"TRACK\"}").getBytes());
        MockMultipartFile gpx = new MockMultipartFile("gpx", "trace.gpx", "application/gpx+xml",
                resource("/samples/bogomiles/trace.gpx"));

        mvc.perform(multipart("/api/plans/full").file(request).file(gpx).param("stepKm", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.course.markers.length()").value(10))
                .andExpect(jsonPath("$.plans[0].elevationSource").value("TRACK"))
                .andExpect(jsonPath("$.plans[0].totalDistanceKm", closeTo(101.5, 0.1)));
    }

    @Test
    void unRoadbookMalTrieRemonteUnMessageClair() throws Exception {
        String malTrie = REQUEST_SANS_TRACE.replace("\"km\": 20", "\"km\": 50");
        MockMultipartFile request = new MockMultipartFile("request", "", "application/json", malTrie.getBytes());

        mvc.perform(multipart("/api/plans/full").file(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("triés par kilométrage")));
    }

    @Test
    void laDemoAccepteDesReferencesDateesEtDesEntrainements() throws Exception {
        String body = """
                {"elevationSource": "AUTO", "references": [
                  {"label": "60 km avril", "distanceKm": 60, "elevationGainM": 3200, "duration": "PT8H48M",
                   "date": "2026-04-12", "kind": "RACE"},
                  {"label": "Sortie longue", "distanceKm": 32, "elevationGainM": 1600, "duration": "PT4H30M",
                   "date": "2026-09-20", "kind": "TRAINING"},
                  {"label": "Sans date", "distanceKm": 42, "elevationGainM": 2000, "duration": "PT6H"}]}
                """;
        mvc.perform(post("/api/demo/bogomiles").contentType("application/json").content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[1].references.length()").value(3))
                .andExpect(jsonPath("$[1].references[1].kind").value("TRAINING"))
                .andExpect(jsonPath("$[1].references[1].date").value("2026-09-20"))
                .andExpect(jsonPath("$[1].references[2].kind").value("RACE"))
                .andExpect(jsonPath("$[1].references[0].predictedFinish").exists());
    }

    @Test
    void uneReferenceInvalideRemonteUnMessageClair() throws Exception {
        String body = """
                {"references": [{"label": "Erreur", "distanceKm": 0, "elevationGainM": 0, "duration": "PT1H"}]}
                """;
        mvc.perform(post("/api/demo/bogomiles").contentType("application/json").content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Performance de référence invalide : Erreur"));
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
