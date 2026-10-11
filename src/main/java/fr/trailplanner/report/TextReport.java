package fr.trailplanner.report;

import fr.trailplanner.engine.CheckpointEta;
import fr.trailplanner.engine.RacePlan;
import fr.trailplanner.engine.ReferenceInsight;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;

/** Rendu texte d'un plan de course (console, test, export .txt imprimable). */
public final class TextReport {

    private static final DateTimeFormatter HOUR = DateTimeFormatter.ofPattern("HH'h'mm");

    private TextReport() {}

    public static String render(List<RacePlan> plans) {
        StringBuilder sb = new StringBuilder();
        for (RacePlan plan : plans) {
            sb.append(render(plan)).append('\n');
        }
        return sb.toString();
    }

    public static String render(RacePlan plan) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== ").append(plan.raceName()).append(" — scénario ").append(plan.scenario().name()).append(" ===\n");
        sb.append(String.format(Locale.FRANCE,
                "%.1f km, %d m D+, %.0f km-effort | arrivée %s | temps total %s (dont arrêts %s, nuit %s) | source : %s%n",
                plan.totalDistanceKm(), Math.round(plan.totalGainM()), plan.totalEffortKm(),
                day(plan.finish()), hm(plan.totalDuration()), hm(plan.totalStops()), hm(plan.nightDuration()),
                plan.elevationSource()));
        sb.append(String.format("%-4s %-28s %6s %6s %8s %9s %7s %10s %10s %9s%n",
                "Code", "Lieu", "Km", "D+", "Tronçon", "Allure", "Arrêt", "Arrivée", "Barrière", "Marge"));
        for (CheckpointEta e : plan.checkpoints()) {
            LocalDateTime cutoff = e.cutoffOut() != null ? e.cutoffOut() : e.cutoffIn();
            Duration margin = minMargin(e);
            sb.append(String.format(Locale.FRANCE, "%-4s %-28s %6.1f %6d %8s %9s %7s %10s %10s %9s%n",
                    e.code(), cut(e.name(), 28), e.km(), Math.round(e.cumulativeGainM()),
                    e.legDuration().isZero() ? "" : hm(e.legDuration()),
                    e.legPaceMinPerKm() == 0 ? "" : pace(e.legPaceMinPerKm()),
                    e.stop().isZero() ? "" : e.stop().toMinutes() + " min",
                    day(e.arrival()),
                    cutoff == null ? "" : day(cutoff) + (e.cutoffOut() != null ? "*" : ""),
                    margin == null ? "" : (margin.isNegative() ? "-" : "") + hm(margin.abs()) + flag(e.status())));
        }
        sb.append("(* barrière en sortie de ravito)\n");
        if (plan.references().size() > 1) {
            sb.append("Références (poids, arrivée prédite par chacune seule) :\n");
            for (ReferenceInsight r : plan.references()) {
                sb.append(String.format(Locale.FRANCE, "  %-28s %3.0f %%  %s%n", cut(r.label(), 28),
                        r.weight() * 100, day(r.predictedFinish())));
            }
        }
        for (String w : plan.warnings()) {
            sb.append("⚠ ").append(w).append('\n');
        }
        return sb.toString();
    }

    private static Duration minMargin(CheckpointEta e) {
        if (e.marginIn() == null) return e.marginOut();
        if (e.marginOut() == null) return e.marginIn();
        return e.marginIn().compareTo(e.marginOut()) < 0 ? e.marginIn() : e.marginOut();
    }

    private static String flag(CheckpointEta.CutoffStatus s) {
        return switch (s) {
            case TIGHT -> " !";
            case MISSED -> " ✗";
            default -> "";
        };
    }

    static String hm(Duration d) {
        long minutes = Math.round(d.toSeconds() / 60.0);
        return String.format("%dh%02d", minutes / 60, minutes % 60);
    }

    static String pace(double minPerKm) {
        int total = (int) Math.round(minPerKm * 60);
        return String.format("%d'%02d/km", total / 60, total % 60);
    }

    private static String day(LocalDateTime t) {
        String d = t.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.FRANCE);
        return d.substring(0, Math.min(3, d.length())) + " " + HOUR.format(t);
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
