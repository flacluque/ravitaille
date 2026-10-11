package fr.trailplanner.api;

import fr.trailplanner.engine.RacePlan;

import java.util.List;

/** Course à dessiner + plans de course, en une seule réponse (la trace GPX n'est envoyée qu'une fois). */
public record PlanView(CourseView course, List<RacePlan> plans) {
}
