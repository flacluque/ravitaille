package fr.trailplanner.strava;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
@EnableConfigurationProperties(StravaProperties.class)
public class StravaConfig {

    @Bean
    StravaService stravaService(StravaProperties props) {
        return new StravaService(props, new StravaClient(props), new StravaTokenStore(props.tokenPath()), Clock.systemUTC());
    }
}
