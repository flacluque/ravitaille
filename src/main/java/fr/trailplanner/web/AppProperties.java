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
 */
@ConfigurationProperties("trailplanner")
public record AppProperties(
        @DefaultValue("") String secret,
        @DefaultValue("") String accessCode,
        @DefaultValue("") String feedbackUrl) {

    public AppProperties {
        secret = secret == null ? "" : secret.strip();
        accessCode = accessCode == null ? "" : accessCode.strip();
        feedbackUrl = feedbackUrl == null ? "" : feedbackUrl.strip();
    }
}
