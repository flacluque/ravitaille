package fr.trailplanner.web;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Path;

@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class WebConfig {

    @Bean
    CookieCipher cookieCipher(AppProperties props) {
        return CookieCipher.fromSecret(props.secret(), Path.of(System.getProperty("user.home"), ".trail-planner", "secret.key"));
    }

    @Bean
    AccessGuard accessGuard(AppProperties props, CookieCipher cipher) {
        return new AccessGuard(props, cipher);
    }

    /** Le garde est déclaré ici plutôt que repéré automatiquement, pour l'inscrire une seule fois. */
    @Bean
    FilterRegistrationBean<AccessGuard> accessGuardRegistration(AccessGuard guard) {
        FilterRegistrationBean<AccessGuard> registration = new FilterRegistrationBean<>(guard);
        registration.addUrlPatterns("/api/*");
        return registration;
    }
}
