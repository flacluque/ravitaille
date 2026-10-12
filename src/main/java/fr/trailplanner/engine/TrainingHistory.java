package fr.trailplanner.engine;

import fr.trailplanner.model.TrainingSession;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Historique d'entraînement du coureur, découpé en <b>blocs de préparation</b>.
 * <p>
 * Avant un objectif, on suit un plan de 12 à 16 semaines. Le bloc d'une course, ce sont les
 * {@value #BLOCK_WEEKS} semaines qui précèdent sa dernière semaine (souvent allégée, comme chez Tanda
 * qui l'exclut). Pour une course à venir, le bloc s'arrête à aujourd'hui.
 *
 * @param since date à partir de laquelle l'historique est connu : un bloc qui commence avant est incomplet
 */
public record TrainingHistory(LocalDate since, List<TrainingSession> sessions) {

    static final int BLOCK_WEEKS = 12;
    static final int RACE_WEEK_DAYS = 7;
    /** En dessous, on considère qu'il n'y a pas eu de préparation mesurable (ou qu'elle n'est pas sur Strava). */
    static final double MIN_WEEKLY_EFFORT_KM = 5;

    public TrainingHistory {
        sessions = List.copyOf(sessions);
    }

    /**
     * Volume d'un bloc de préparation.
     *
     * @param end               fin du bloc (exclue)
     * @param complete          l'historique couvre tout le bloc
     * @param weeklyEffortKm    km-effort par semaine, en moyenne
     * @param longestEffortKm   plus longue sortie, en km-effort
     * @param activeWeeks       semaines avec au moins 2 sorties (régularité)
     */
    public record PrepBlock(LocalDate start, LocalDate end, boolean complete, double weeklyEffortKm, double weeklyKm,
                            double weeklyGainM, double longestEffortKm, int sessions, int activeWeeks) {

        /** Assez de données pour comparer ce bloc à un autre. */
        public boolean usable() {
            return complete && weeklyEffortKm >= MIN_WEEKLY_EFFORT_KM;
        }
    }

    /** Une semaine d'entraînement, pour le graphique. */
    public record Week(LocalDate start, double effortKm, double km, double gainM, int sessions) {}

    /** Bloc de préparation d'une course du {@code date}, vu le {@code today}. */
    public PrepBlock blockBefore(LocalDate date, LocalDate today) {
        LocalDate raceWeek = date.minusDays(RACE_WEEK_DAYS);
        LocalDate tomorrow = today.plusDays(1);
        LocalDate end = raceWeek.isBefore(tomorrow) ? raceWeek : tomorrow;
        LocalDate start = end.minusWeeks(BLOCK_WEEKS);

        double effort = 0, km = 0, gain = 0, longest = 0;
        int count = 0;
        int[] perWeek = new int[BLOCK_WEEKS];
        for (TrainingSession s : sessions) {
            if (s.date().isBefore(start) || !s.date().isBefore(end)) {
                continue;
            }
            effort += s.effortKm();
            km += s.distanceKm();
            gain += s.gainM();
            longest = Math.max(longest, s.effortKm());
            count++;
            perWeek[(int) (java.time.temporal.ChronoUnit.DAYS.between(start, s.date()) / 7)]++;
        }
        int active = 0;
        for (int n : perWeek) {
            if (n >= 2) {
                active++;
            }
        }
        return new PrepBlock(start, end, !start.isBefore(since), round1(effort / BLOCK_WEEKS), round1(km / BLOCK_WEEKS),
                Math.round(gain / BLOCK_WEEKS), round1(longest), count, active);
    }

    /** Les {@code count} semaines qui finissent la veille de {@code end}, de la plus ancienne à la plus récente. */
    public List<Week> weeks(LocalDate end, int count) {
        List<Week> weeks = new ArrayList<>();
        for (int i = count; i >= 1; i--) {
            LocalDate from = end.minusWeeks(i);
            LocalDate to = from.plusWeeks(1);
            double effort = 0, km = 0, gain = 0;
            int n = 0;
            for (TrainingSession s : sessions) {
                if (!s.date().isBefore(from) && s.date().isBefore(to)) {
                    effort += s.effortKm();
                    km += s.distanceKm();
                    gain += s.gainM();
                    n++;
                }
            }
            weeks.add(new Week(from, round1(effort), round1(km), Math.round(gain), n));
        }
        return weeks;
    }

    /** Km-effort par semaine entre deux dates (fin exclue). */
    public double weeklyEffort(LocalDate from, LocalDate to) {
        double days = java.time.temporal.ChronoUnit.DAYS.between(from, to);
        if (days <= 0) {
            return 0;
        }
        double effort = sessions.stream()
                .filter(s -> !s.date().isBefore(from) && s.date().isBefore(to))
                .mapToDouble(TrainingSession::effortKm).sum();
        return effort / (days / 7);
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }
}
