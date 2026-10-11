package fr.trailplanner.extract;

import fr.trailplanner.api.JsonSupport;
import fr.trailplanner.model.Checkpoint;
import fr.trailplanner.model.RaceDefinition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Évaluation d'un modèle de lecture sur de vrais roadbooks, comparés à une saisie à la main.
 * Nécessite Ollama lancé et le modèle installé ; ignoré par un simple « mvn test ». À lancer avec :
 * <pre>
 * mvn test -Dtest=RoadbookExtractionEvalTest -Dollama=true [-Dollama.model=qwen2.5vl:7b] [-Dollama.minScore=0.9]
 * </pre>
 * Pour ajouter un cas : l'image dans src/test/resources/roadbooks/, la saisie de référence dans
 * src/main/resources/samples/&lt;course&gt;/roadbook.json, et une ligne dans CASES.
 */
@EnabledIfSystemProperty(named = "ollama", matches = "true")
class RoadbookExtractionEvalTest {

    private record Case(String image, String reference) {}

    private static final List<Case> CASES = List.of(
            new Case("/roadbooks/troubadours-2026.jpg", "/samples/troubadours/roadbook.json"),
            new Case("/roadbooks/malene-de-proust-2026.pdf", "/samples/malene-de-proust/roadbook.json"));

    @Test
    void comparerLaLectureAuxSaisiesDeReference() throws IOException {
        String model = System.getProperty("ollama.model", "qwen2.5vl:7b");
        double minScore = Double.parseDouble(System.getProperty("ollama.minScore", "0"));
        RoadbookExtractionService service = new RoadbookExtractionService(new OllamaDocumentReader(
                new ExtractionProperties.Ollama(System.getProperty("ollama.url", "http://localhost:11434"), model,
                        Duration.ofMinutes(10), Integer.getInteger("ollama.contextTokens", 32768))));

        int ok = 0, total = 0;
        for (Case c : CASES) {
            RaceDefinition expected;
            byte[] image;
            try (InputStream ref = getClass().getResourceAsStream(c.reference());
                 InputStream img = getClass().getResourceAsStream(c.image())) {
                expected = JsonSupport.mapper().readValue(ref, RaceDefinition.class);
                image = img.readAllBytes();
            }
            long t0 = System.nanoTime();
            ExtractedRoadbook actual = service.extract(image, c.image());
            long seconds = (System.nanoTime() - t0) / 1_000_000_000;

            List<String> lines = new ArrayList<>();
            int[] score = compare(expected, actual, lines);
            ok += score[0];
            total += score[1];
            System.out.printf(Locale.ROOT, "%n=== %s avec %s : %d/%d champs corrects en %d s ===%n",
                    c.image(), model, score[0], score[1], seconds);
            lines.forEach(System.out::println);
            actual.warnings().forEach(w -> System.out.println("  (remarque) " + w));
        }
        double rate = total == 0 ? 0 : (double) ok / total;
        System.out.printf(Locale.ROOT, "%nScore global : %.0f %%%n", rate * 100);
        assertTrue(rate >= minScore, "Score " + rate + " < " + minScore);
    }

    /** Compare point par point (dans l'ordre) ; renvoie {champs corrects, champs comparés}. */
    private static int[] compare(RaceDefinition expected, ExtractedRoadbook actual, List<String> report) {
        int ok = 0, total = 0;
        List<Checkpoint> exp = expected.checkpoints();
        List<ExtractedRoadbook.Point> got = actual.checkpoints();
        if (exp.size() != got.size()) {
            report.add("  ✗ nombre de points : attendu " + exp.size() + ", lu " + got.size());
        }
        total++;
        ok += Objects.equals(expected.start().toLocalTime().toString(), actual.startTime()) ? 1 : 0;
        for (int i = 0; i < exp.size(); i++) {
            Checkpoint e = exp.get(i);
            ExtractedRoadbook.Point a = i < got.size() ? got.get(i) : null;
            List<String> errors = new ArrayList<>();
            Object[][] fields = {
                    {"code", e.code(), a == null ? null : a.code()},
                    {"km", e.km(), a == null ? null : a.km()},
                    {"D+", e.gainM(), a == null ? null : a.gainM()},
                    {"D-", e.lossM(), a == null ? null : a.lossM()},
                    {"barrière entrée", clock(e.cutoffIn()), a == null ? null : a.cutoffIn()},
                    {"barrière sortie", clock(e.cutoffOut()), a == null ? null : a.cutoffOut()},
                    {"type", e.aid().name(), a == null ? null : a.aid()},
                    {"services", e.services().stream().map(Enum::name).sorted().toList(),
                            a == null ? null : a.services().stream().sorted().toList()},
            };
            for (Object[] f : fields) {
                total++;
                if (same(f[1], f[2])) {
                    ok++;
                } else {
                    errors.add(f[0] + " " + f[1] + " ≠ " + f[2]);
                }
            }
            report.add(String.format(Locale.ROOT, "  %s %-4s %-40s %s", errors.isEmpty() ? "✓" : "✗", e.code(),
                    a == null ? "(manquant)" : a.name(), String.join(", ", errors)));
        }
        return new int[]{ok, total};
    }

    private static boolean same(Object expected, Object actual) {
        if (expected instanceof Number e && actual instanceof Number a) {
            return Math.abs(e.doubleValue() - a.doubleValue()) < 0.5;
        }
        return Objects.equals(expected, actual);
    }

    private static String clock(LocalDateTime t) {
        return t == null ? null : String.format(Locale.ROOT, "%02dh%02d", t.getHour(), t.getMinute());
    }
}
