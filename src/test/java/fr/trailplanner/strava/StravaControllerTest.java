package fr.trailplanner.strava;

import fr.trailplanner.web.CookieCipher;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(StravaController.class)
@Import({StravaErrors.class, StravaControllerTest.Beans.class})
class StravaControllerTest {

    @TestConfiguration
    static class Beans {
        @Bean
        StravaCookies stravaCookies() {
            return new StravaCookies(new CookieCipher("test"));
        }
    }

    private static final StravaToken TOKEN = new StravaToken("acces", "rafraichi", 4102444800L, 777, "Flavien L.");

    @Autowired
    private MockMvc mvc;

    @Autowired
    private StravaCookies cookies;

    @MockBean
    private StravaService strava;

    @Test
    void redirigeVersStravaPuisGardeLesJetonsDansUnCookieChiffre() throws Exception {
        when(strava.authorize("http://localhost:5173", "http://localhost")).thenReturn("https://www.strava.com/oauth/authorize?state=s");
        mvc.perform(get("/api/strava/authorize").param("origin", "http://localhost:5173"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "https://www.strava.com/oauth/authorize?state=s"));

        when(strava.callback(eq("s"), eq("c"), eq(null), eq("activity:read_all"), any())).thenAnswer(call -> {
            call.<StravaSession>getArgument(4).update(TOKEN);
            return "http://localhost:5173/?strava=connected";
        });
        MvcResult result = mvc.perform(get("/api/strava/callback").param("state", "s").param("code", "c").param("scope", "activity:read_all"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "http://localhost:5173/?strava=connected"))
                .andReturn();

        String setCookie = result.getResponse().getHeader("Set-Cookie");
        assertTrue(setCookie.startsWith(StravaCookies.NAME + "="), setCookie);
        assertTrue(setCookie.contains("HttpOnly") && setCookie.contains("SameSite=Lax") && setCookie.contains("Path=/api"), setCookie);
        assertFalse(setCookie.contains("acces"), "jetons illisibles dans le cookie");

        // Le cookie renvoyé par le navigateur redonne la connexion.
        Cookie cookie = result.getResponse().getCookie(StravaCookies.NAME);
        when(strava.status(any())).thenAnswer(call -> new StravaStatus(true,
                call.<StravaSession>getArgument(0).token().isPresent(), call.<StravaSession>getArgument(0).token().map(StravaToken::athlete).orElse(null)));
        mvc.perform(get("/api/strava/status").cookie(cookie)).andExpect(jsonPath("$.athlete").value("Flavien L."));
        mvc.perform(get("/api/strava/status")).andExpect(jsonPath("$.connected").value(false));
        mvc.perform(get("/api/strava/status").cookie(new Cookie(StravaCookies.NAME, "falsifie")))
                .andExpect(jsonPath("$.connected").value(false));
    }

    @Test
    void lAppliMobileGardeLaConnexionHorsCookie() throws Exception {
        when(strava.authorize(eq("app"), any())).thenReturn("https://www.strava.com/oauth/authorize?state=a");
        mvc.perform(get("/api/strava/authorize").param("origin", "app")).andExpect(status().isFound());

        when(strava.callback(eq("a"), eq("c"), eq(null), eq("activity:read_all"), any())).thenAnswer(call -> {
            call.<StravaSession>getArgument(4).update(TOKEN);
            return StravaService.APP_ORIGIN + "/?strava=connected";
        });
        MvcResult result = mvc.perform(get("/api/strava/callback").param("state", "a").param("code", "c").param("scope", "activity:read_all"))
                .andExpect(status().isFound())
                .andExpect(header().doesNotExist("Set-Cookie"))
                .andReturn();
        String location = result.getResponse().getHeader("Location");
        assertTrue(location.startsWith("ravitime://strava?strava=connected&session="), location);
        assertFalse(location.contains("acces"), "jetons illisibles dans le lien");

        // L'appli renvoie la connexion dans l'en-tête ; une connexion oubliée lui revient vide.
        String sealed = java.net.URLDecoder.decode(location.substring(location.indexOf("session=") + 8), java.nio.charset.StandardCharsets.UTF_8);
        when(strava.status(any())).thenAnswer(call -> new StravaStatus(true,
                call.<StravaSession>getArgument(0).token().isPresent(), call.<StravaSession>getArgument(0).token().map(StravaToken::athlete).orElse(null)));
        mvc.perform(get("/api/strava/status").header("X-Ravitime-Strava", sealed)).andExpect(jsonPath("$.athlete").value("Flavien L."));
        doAnswer(call -> {
            call.<StravaSession>getArgument(0).clear();
            return null;
        }).when(strava).disconnect(any());
        mvc.perform(delete("/api/strava/connection").header("X-Ravitime-Strava", sealed))
                .andExpect(status().isNoContent())
                .andExpect(header().string("X-Ravitime-Strava", ""))
                .andExpect(header().doesNotExist("Set-Cookie"));
    }

    @Test
    void listeLesActivitesEnJson() throws Exception {
        when(strava.activities(any(), eq(LocalDate.of(2025, 1, 1)))).thenReturn(List.of(new StravaActivity(
                7, "Trail des Cathares", LocalDate.of(2026, 4, 12), "TrailRun", 60.4, 3210,
                Duration.ofMinutes(528), Duration.ofMinutes(500), true)));

        mvc.perform(get("/api/strava/activities").param("after", "2025-01-01"))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("Set-Cookie"))
                .andExpect(jsonPath("$[0].name").value("Trail des Cathares"))
                .andExpect(jsonPath("$[0].date").value("2026-04-12"))
                .andExpect(jsonPath("$[0].elapsedTime").value("PT8H48M"))
                .andExpect(jsonPath("$[0].race").value(true));
    }

    @Test
    void transformeLesErreursEnMessages() throws Exception {
        when(strava.activities(any(), eq(LocalDate.of(2025, 1, 1)))).thenThrow(StravaException.notConnected());
        mvc.perform(get("/api/strava/activities").param("after", "2025-01-01"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Connecte ton compte Strava pour importer tes activités."));

        when(strava.authorize(eq("https://pirate.example"), any())).thenThrow(new IllegalArgumentException("Adresse inconnue"));
        mvc.perform(get("/api/strava/authorize").param("origin", "https://pirate.example"))
                .andExpect(status().isBadRequest());

        when(strava.activities(any(), eq(LocalDate.of(2024, 1, 1))))
                .thenThrow(new StravaException(HttpStatus.TOO_MANY_REQUESTS, "Trop de requêtes"));
        mvc.perform(get("/api/strava/activities").param("after", "2024-01-01"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void deconnecteEtEffaceLeCookie() throws Exception {
        doAnswer(call -> {
            call.<StravaSession>getArgument(0).clear();
            return null;
        }).when(strava).disconnect(any());
        Cookie cookie = new Cookie(StravaCookies.NAME, new CookieCipher("test").encrypt(
                "{\"accessToken\":\"a\",\"refreshToken\":\"r\",\"expiresAt\":1,\"athleteId\":1,\"athlete\":null}"));

        mvc.perform(delete("/api/strava/connection").cookie(cookie))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));
    }
}
