package fr.trailplanner.model;

import java.util.List;

/**
 * Hypothèses de calcul.
 *
 * @param name             libellé du scénario
 * @param paceFactor       forme du jour : multiplicateur global d'allure (0.96 = 4 % plus rapide que la référence)
 * @param fatigueExponent  exposant de la loi de Riegel T = a * E^b (b > 1 : on ralentit quand ça s'allonge)
 * @param nightFactor      multiplicateur d'allure de nuit (1.10 = 10 % plus lent)
 * @param lightStopMinutes arrêt sur un ravito classique
 * @param fullStopMinutes  arrêt sur un gros ravito / base de vie
 */
public record Scenario(
        String name,
        double paceFactor,
        double fatigueExponent,
        double nightFactor,
        double lightStopMinutes,
        double fullStopMinutes) {

    public Scenario {
        if (paceFactor <= 0.5 || paceFactor > 2.0) {
            throw new IllegalArgumentException("Facteur d'allure hors plage raisonnable ]0.5 ; 2.0]");
        }
        if (fatigueExponent < 1.0 || fatigueExponent > 1.3) {
            throw new IllegalArgumentException("Exposant de fatigue hors plage raisonnable [1.0 ; 1.3]");
        }
        if (nightFactor < 1.0) {
            throw new IllegalArgumentException("Le facteur de nuit doit être >= 1");
        }
    }

    // Les scénarios jouent à la fois sur la forme du jour (toute la course) et sur la fatigue
    // (surtout la fin) : l'optimiste est donc devant à chaque point, pas seulement à l'arrivée.
    public static final Scenario OPTIMISTE = new Scenario("Optimiste", 0.96, 1.06, 1.05, 2, 8);
    public static final Scenario REALISTE = new Scenario("Réaliste", 1.00, 1.07, 1.10, 4, 15);
    public static final Scenario PRUDENT = new Scenario("Prudent", 1.05, 1.08, 1.15, 6, 25);

    public static List<Scenario> defaults() {
        return List.of(OPTIMISTE, REALISTE, PRUDENT);
    }

    public double stopMinutes(AidLevel aid) {
        return switch (aid) {
            case NONE -> 0;
            case LIGHT -> lightStopMinutes;
            case FULL -> fullStopMinutes;
        };
    }
}
