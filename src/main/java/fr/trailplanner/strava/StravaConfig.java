package fr.trailplanner.strava;

import fr.trailplanner.web.CookieCipher;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
@EnableConfigurationProperties(StravaProperties.class)
public class StravaConfig {

    @Bean
    StravaService stravaService(StravaProperties props) {
        return new StravaService(props, new StravaClient(props), Clock.systemUTC());
    }

    @Bean
    StravaCookies stravaCookies(CookieCipher cipher) {
        return new StravaCookies(cipher);
    }
}
