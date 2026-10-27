package fr.trailplanner.web;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

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
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return registration;
    }

    /** L'appli mobile appelle l'API depuis sa propre origine (voir {@link AppCorsFilter}), avant le garde. */
    @Bean
    FilterRegistrationBean<AppCorsFilter> appCorsRegistration(AppProperties props) {
        FilterRegistrationBean<AppCorsFilter> registration = new FilterRegistrationBean<>(new AppCorsFilter(props.appOriginList()));
        registration.addUrlPatterns("/api/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 5);
        return registration;
    }

    /** En-têtes de l'appli : connexion Strava chiffrée, et code d'accès signé (à la place des cookies du site). */
    public static final String APP_STRAVA_HEADER = "X-Ravitaille-Strava";
    public static final String APP_ACCESS_HEADER = "X-Ravitaille-Access";
}
