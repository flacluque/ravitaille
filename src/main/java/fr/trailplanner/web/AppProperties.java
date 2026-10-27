package fr.trailplanner.web;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Réglages de l'appli en ligne (application.properties ou variables d'environnement TRAILPLANNER_…) :
 *
 * @param secret      clé qui chiffre les cookies (connexion Strava, accès) ; vide en local : une clé est
 *                    créée dans ~/.trail-planner/secret.key. En ligne : une longue valeur aléatoire.
 * @param accessCode  code d'invitation demandé une fois aux visiteurs ; vide : site ouvert
 * @param feedbackUrl lien du bouton « Donner mon avis » (formulaire, mailto:…) ; vide : pas de bouton
 * @param appOrigins  origines de l'appli mobile autorisées à appeler l'API (CORS), séparées par des virgules :
 *                    {@code capacitor://localhost} sur iPhone, {@code https://localhost} sur Android
 */
@ConfigurationProperties("trailplanner")
public record AppProperties(
        @DefaultValue("") String secret,
        @DefaultValue("") String accessCode,
        @DefaultValue("") String feedbackUrl,
        @DefaultValue("capacitor://localhost,https://localhost") String appOrigins) {

    public AppProperties {
        secret = secret == null ? "" : secret.strip();
        accessCode = accessCode == null ? "" : accessCode.strip();
        feedbackUrl = feedbackUrl == null ? "" : feedbackUrl.strip();
        appOrigins = appOrigins == null ? "" : appOrigins.strip();
    }

    /** Origines de l'appli mobile, une par élément. */
    public java.util.List<String> appOriginList() {
        return java.util.Arrays.stream(appOrigins.split(",")).map(String::strip).filter(s -> !s.isEmpty()).toList();
    }
}
