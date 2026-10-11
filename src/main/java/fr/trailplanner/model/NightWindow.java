package fr.trailplanner.model;

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * Plage nocturne (frontale) pendant laquelle l'allure est ralentie.
 * Exemple fin octobre à Carcassonne : coucher ~18h40, lever ~8h15.
 */
public record NightWindow(LocalTime nightStart, LocalTime nightEnd) {

    public boolean isNight(LocalDateTime t) {
        LocalTime time = t.toLocalTime();
        if (nightStart.isAfter(nightEnd)) {          // passe minuit (cas habituel)
            return !time.isBefore(nightStart) || time.isBefore(nightEnd);
        }
        return !time.isBefore(nightStart) && time.isBefore(nightEnd);
    }
}
