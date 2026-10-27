package fr.trailplanner.web;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
    void lAppliMobileGardeLeCodeDansUnEnTete() throws Exception {
        String signed = mvc.perform(post("/api/app/access").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"Bogomiles\"}"))
                .andExpect(status().isNoContent())
                .andReturn().getResponse().getHeader("X-Ravitaille-Access");
        mvc.perform(get("/api/demo/bogomiles/course").header("X-Ravitaille-Access", signed)).andExpect(status().isOk());
        mvc.perform(get("/api/demo/bogomiles/course").header("X-Ravitaille-Access", "bricole")).andExpect(status().isUnauthorized());
    }

    @Test
    void lAppliMobilePeutAppelerLApi() throws Exception {
        // Vérification préalable du navigateur de l'appli : acceptée sans code, en-têtes de l'appli autorisés.
        mvc.perform(options("/api/demo/bogomiles/course")
                        .header("Origin", "capacitor://localhost")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "X-Ravitaille-Access"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "capacitor://localhost"));
        // Le refus reste lisible par l'appli, qui voit aussi les en-têtes de connexion.
        mvc.perform(get("/api/demo/bogomiles/course").header("Origin", "capacitor://localhost"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Access-Control-Allow-Origin", "capacitor://localhost"))
                .andExpect(header().string("Access-Control-Expose-Headers", org.hamcrest.Matchers.containsString("X-Ravitaille-Strava")));
        // Un autre site ne reçoit pas d'autorisation (le navigateur l'empêche alors de lire la réponse).
        mvc.perform(get("/api/app").header("Origin", "https://pirate.example"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        // Le site lui-même, derrière un proxy qui change l'adresse vue par le serveur, n'est jamais refusé.
        mvc.perform(post("/api/app/access").header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"Bogomiles\"}"))
                .andExpect(status().isNoContent());
    }

    @Test
    void leRetourDeStravaNeDemandePasLeCode() throws Exception {
        mvc.perform(get("/api/strava/callback").param("state", "inconnu")).andExpect(status().isBadRequest());
    }
}
