package fr.trailplanner.web;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** L'appli entière, comme en ligne : code d'invitation et lien d'avis. */
@SpringBootTest(properties = {
        "trailplanner.secret=test",
        "trailplanner.access-code=Bogomiles",
        "trailplanner.feedback-url=https://forms.example/avis",
        "trailplanner.extraction.provider=none"})
@AutoConfigureMockMvc
class AccessTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void lApiDemandeLeCodeDInvitation() throws Exception {
        mvc.perform(get("/api/app"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessRequired").value(true))
                .andExpect(jsonPath("$.accessGranted").value(false))
                .andExpect(jsonPath("$.feedbackUrl").value("https://forms.example/avis"));
        mvc.perform(get("/api/demo/bogomiles/course"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Code d'invitation requis."));

        mvc.perform(post("/api/app/access").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"faux\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Ce n'est pas le bon code."));

        Cookie pass = mvc.perform(post("/api/app/access").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\" bogomiles \"}"))
                .andExpect(status().isNoContent())
                .andExpect(cookie().httpOnly(AccessGuard.COOKIE, true))
                .andReturn().getResponse().getCookie(AccessGuard.COOKIE);

        mvc.perform(get("/api/app").cookie(pass)).andExpect(jsonPath("$.accessGranted").value(true));
        mvc.perform(get("/api/demo/bogomiles/course").cookie(pass)).andExpect(status().isOk());
        mvc.perform(get("/api/demo/bogomiles/course").cookie(new Cookie(AccessGuard.COOKIE, "bricole")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void leRetourDeStravaNeDemandePasLeCode() throws Exception {
        mvc.perform(get("/api/strava/callback").param("state", "inconnu")).andExpect(status().isBadRequest());
    }
}
