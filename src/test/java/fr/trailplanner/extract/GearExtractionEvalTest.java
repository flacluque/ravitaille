package fr.trailplanner.extract;

import com.fasterxml.jackson.databind.JsonNode;
import fr.trailplanner.api.JsonSupport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.io.InputStream;
import java.text.Normalizer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Évaluation de la lecture du matériel obligatoire par un modèle, sur de vrais règlements comparés à une
 * saisie de référence. Nécessite Ollama ; ignoré par un simple « mvn test ». À lancer avec :
 * <pre>
 * mvn test -Dtest=GearExtractionEvalTest -Dollama=true [-Dollama.model=qwen2.5vl:7b] [-Dollama.minScore=0.9]
 * </pre>
 * Un élément attendu est trouvé si un élément lu contient tous ses mots-clés (sans accents ni majuscules).
 * Les éléments « absent » appartiennent à d'autres courses du même document : les lire est une erreur.
 */
@EnabledIfSystemProperty(named = "ollama", matches = "true")
class GearExtractionEvalTest {

    private record Case(String document, String reference, String raceName) {}

    private static final List<Case> CASES = List.of(
            new Case("/reglements/materiel-grand-raid-cathares-2026.jpg", "/samples/troubadours/gear.json",
                    "Raid des Troubadours 2026"));

    @Test
    void comparerLaLectureAuxListesDeReference() throws Exception {
        String model = System.getProperty("ollama.model", "qwen2.5vl:7b");
        double minScore = Double.parseDouble(System.getProperty("ollama.minScore", "0"));
        GearExtractionService service = new GearExtractionService(new OllamaDocumentReader(
                new ExtractionProperties.Ollama(System.getProperty("ollama.url", "http://localhost:11434"), model,
                        Duration.ofMinutes(10), Integer.getInteger("ollama.contextTokens", 32768))));

        int ok = 0, total = 0;
        for (Case c : CASES) {
            JsonNode expected;
            byte[] document;
            try (InputStream ref = getClass().getResourceAsStream(c.reference());
                 InputStream doc = getClass().getResourceAsStream(c.document())) {
                expected = JsonSupport.mapper().readTree(ref);
                document = doc.readAllBytes();
            }
            long t0 = System.nanoTime();
            ExtractedGear actual = service.extract(document, c.document(), c.raceName());
            long seconds = (System.nanoTime() - t0) / 1_000_000_000;

            List<String> report = new ArrayList<>();
            List<ExtractedGear.Item> unmatched = new ArrayList<>(actual.items());
            for (JsonNode item : expected.path("items")) {
                total++;
                ExtractedGear.Item found = find(actual.items(), item.path("keywords"));
                unmatched.remove(found);
                if (found != null && found.status().equals(item.path("status").asText())) {
                    ok++;
                    report.add("  ✓ " + found.name());
                } else {
                    report.add("  ✗ " + item.path("name").asText() + (found == null ? " : manquant" : " : statut " + found.status()));
                }
            }
            for (JsonNode absent : expected.path("absent")) {
                total++;
                ExtractedGear.Item found = find(actual.items(), absent.path("keywords"));
                unmatched.remove(found);
                if (found == null) {
                    ok++;
                } else {
                    report.add("  ✗ lu à tort (" + absent.path("name").asText() + ") : " + found.name());
                }
            }
            unmatched.forEach(i -> report.add("  ? en plus : " + i.name() + " (" + i.status() + ")"));

            System.out.printf(Locale.ROOT, "%n=== %s, course « %s » (lue : « %s ») avec %s : %d/%d en %d s ===%n",
                    c.document(), c.raceName(), actual.race(), model, ok, total, seconds);
            report.forEach(System.out::println);
            actual.warnings().forEach(w -> System.out.println("  (remarque) " + w));
        }
        double rate = total == 0 ? 0 : (double) ok / total;
        System.out.printf(Locale.ROOT, "%nScore global : %.0f %%%n", rate * 100);
        assertTrue(rate >= minScore, "Score " + rate + " < " + minScore);
    }

    private static ExtractedGear.Item find(List<ExtractedGear.Item> items, JsonNode keywords) {
        for (ExtractedGear.Item item : items) {
            String name = plain(item.name());
            boolean all = true;
            for (JsonNode k : keywords) {
                all &= name.contains(plain(k.asText()));
            }
            if (all) {
                return item;
            }
        }
        return null;
    }

    private static String plain(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
                .replace('’', '\'').replace('.', ',');
    }
}
