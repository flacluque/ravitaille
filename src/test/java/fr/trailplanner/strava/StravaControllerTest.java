package fr.trailplanner.strava;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(StravaController.class)
@Import(StravaErrors.class)
class StravaControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockBean
    private StravaService strava;

    @Test
    void redirigeVersStravaPuisVersLAppli() throws Exception {
        when(strava.authorize("http://localhost:5173")).thenReturn("https://www.strava.com/oauth/authorize?state=s");
        mvc.perform(get("/api/strava/authorize").param("origin", "http://localhost:5173"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "https://www.strava.com/oauth/authorize?state=s"));

        when(strava.callback("s", "c", null, "activity:read_all")).thenReturn("http://localhost:5173/?strava=connected");
        mvc.perform(get("/api/strava/callback").param("state", "s").param("code", "c").param("scope", "activity:read_all"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "http://localhost:5173/?strava=connected"));
    }

    @Test
    void listeLesActivitesEnJson() throws Exception {
        when(strava.activities(LocalDate.of(2025, 1, 1))).thenReturn(List.of(new StravaActivity(
                7, "Trail des Cathares", LocalDate.of(2026, 4, 12), "TrailRun", 60.4, 3210,
                Duration.ofMinutes(528), Duration.ofMinutes(500), true)));

        mvc.perform(get("/api/strava/activities").param("after", "2025-01-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Trail des Cathares"))
                .andExpect(jsonPath("$[0].date").value("2026-04-12"))
                .andExpect(jsonPath("$[0].elapsedTime").value("PT8H48M"))
                .andExpect(jsonPath("$[0].race").value(true));
    }

    @Test
    void transformeLesErreursEnMessages() throws Exception {
        when(strava.activities(LocalDate.of(2025, 1, 1))).thenThrow(StravaException.notConnected());
        mvc.perform(get("/api/strava/activities").param("after", "2025-01-01"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Connecte ton compte Strava pour importer tes activités."));

        when(strava.authorize("https://pirate.example")).thenThrow(new IllegalArgumentException("Adresse de l'appli non locale"));
        mvc.perform(get("/api/strava/authorize").param("origin", "https://pirate.example"))
                .andExpect(status().isBadRequest());

        when(strava.activities(LocalDate.of(2024, 1, 1)))
                .thenThrow(new StravaException(HttpStatus.TOO_MANY_REQUESTS, "Trop de requêtes"));
        mvc.perform(get("/api/strava/activities").param("after", "2024-01-01"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void deconnecte() throws Exception {
        mvc.perform(delete("/api/strava/connection")).andExpect(status().isNoContent());
        verify(strava).disconnect();
    }
}
