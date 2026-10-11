package fr.trailplanner.extract;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lecture d'un roadbook : préparation du fichier, appel de l'IA configurée, puis remise au propre
 * de sa réponse (les modèles, surtout locaux, prennent des libertés avec les formats demandés).
 */
@Service
public class RoadbookExtractionService {

    private final RoadbookExtractor extractor;

    public RoadbookExtractionService(RoadbookExtractor extractor) {
        this.extractor = extractor;
    }

    public RoadbookExtractor.Status status() {
        return extractor.status();
    }

    public ExtractedRoadbook extract(byte[] content, String filename) {
        RoadbookDocument document = RoadbookPages.from(content, filename);
        ExtractedRoadbook result = normalize(extractor.extract(document));
        if (document.notes().isEmpty()) {
            return result;
        }
        List<String> warnings = new ArrayList<>(document.notes());
        warnings.addAll(result.warnings());
        return new ExtractedRoadbook(result.name(), result.startDate(), result.startTime(), result.checkpoints(), warnings);
    }

    private static final Pattern CLOCK = Pattern.compile("(\\d{1,2})\\s*[h:]\\s*(\\d{2})?", Pattern.CASE_INSENSITIVE);
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    static ExtractedRoadbook normalize(ExtractedRoadbook raw) {
        List<String> warnings = new ArrayList<>(raw.warnings().stream()
                .filter(w -> !w.isBlank()).map(String::trim).toList());
        List<ExtractedRoadbook.Point> points = new ArrayList<>();
        for (ExtractedRoadbook.Point p : raw.checkpoints()) {
            // Au départ, le dénivelé cumulé est nul par définition, même si le roadbook ne l'écrit pas.
            boolean start = points.isEmpty() && p.km() != null && p.km() == 0;
            points.add(new ExtractedRoadbook.Point(
                    trim(p.code()), trim(p.name()), p.km(),
                    start && p.gainM() == null ? Double.valueOf(0) : p.gainM(),
                    start && p.lossM() == null ? Double.valueOf(0) : p.lossM(),
                    clock(p.cutoffIn()), clock(p.cutoffOut()), aid(p.aid())));
        }
        if (points.isEmpty()) {
            warnings.add("Aucun point de passage n'a été reconnu : vérifie que le fichier est bien le roadbook.");
        } else if (points.stream().skip(1).anyMatch(p -> p.gainM() == null)) {
            warnings.add("Le roadbook ne donne pas le D+ de chaque point : ajoute la trace GPX de la course "
                    + "(souvent téléchargeable sur son site), le calcul prendra le dénivelé de la trace.");
        }
        String startDate = trim(raw.startDate());
        if (startDate != null && !DATE.matcher(startDate).matches()) {
            startDate = null;
        }
        String startTime = clock(raw.startTime());
        return new ExtractedRoadbook(trim(raw.name()), startDate,
                startTime == null ? null : startTime.replace('h', ':'), points, warnings);
    }

    /** "Vend 23 12h30", "12:30", "12h" → "12h30" / "12h00" ; null si pas d'heure lisible. */
    static String clock(String text) {
        if (text == null) {
            return null;
        }
        Matcher m = CLOCK.matcher(text);
        String found = null;
        while (m.find()) {    // la dernière heure du texte : "Vend 23 12h30" → 12h30, pas "23"
            int h = Integer.parseInt(m.group(1));
            int min = m.group(2) == null ? 0 : Integer.parseInt(m.group(2));
            if (h < 24 && min < 60) {
                found = String.format(Locale.ROOT, "%02dh%02d", h, min);
            }
        }
        return found;
    }

    private static String aid(String aid) {
        if (aid == null) {
            return "NONE";
        }
        return switch (aid.trim().toUpperCase(Locale.ROOT)) {
            case "LIGHT", "FULL" -> aid.trim().toUpperCase(Locale.ROOT);
            default -> "NONE";
        };
    }

    private static String trim(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
