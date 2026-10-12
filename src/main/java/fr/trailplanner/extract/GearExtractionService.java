package fr.trailplanner.extract;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Lecture de la liste du matériel obligatoire d'une course dans son règlement (image ou PDF). */
@Service
public class GearExtractionService {

    private final DocumentReader reader;

    public GearExtractionService(DocumentReader reader) {
        this.reader = reader;
    }

    /**
     * @param raceName nom de la course du coureur : un règlement couvre souvent plusieurs courses
     */
    public ExtractedGear extract(byte[] content, String filename, String raceName) {
        PreparedDocument document = DocumentPages.from(content, filename, DocumentPages.GEAR);
        String json = reader.read(new DocumentReader.Request(GearPrompt.SYSTEM, GearPrompt.user(raceName, document.texts()),
                GearPrompt.SCHEMA, document.images()));
        ExtractedGear raw = RoadbookExtractionService.parse(json, ExtractedGear.class);
        List<String> warnings = new ArrayList<>(document.notes());
        warnings.addAll(raw.warnings());
        return normalize(new ExtractedGear(raw.race(), raw.items(), warnings));
    }

    /** Libellés nettoyés, doublons fusionnés (en gardant le statut le plus exigeant), statuts connus. */
    static ExtractedGear normalize(ExtractedGear raw) {
        Map<String, ExtractedGear.Item> byName = new LinkedHashMap<>();
        for (ExtractedGear.Item item : raw.items()) {
            if (item.name() == null || item.name().isBlank()) {
                continue;
            }
            String name = item.name().strip().replaceAll("\\s+", " ").replaceFirst("^[*•\\-–]\\s*", "");
            String status = "RECOMMENDED".equalsIgnoreCase(String.valueOf(item.status()).strip()) ? "RECOMMENDED" : "MANDATORY";
            String key = name.toLowerCase(Locale.ROOT);
            ExtractedGear.Item known = byName.get(key);
            if (known == null || "MANDATORY".equals(status)) {
                byName.put(key, new ExtractedGear.Item(name, status));
            }
        }
        List<String> warnings = new ArrayList<>(raw.warnings().stream().filter(w -> !w.isBlank()).map(String::strip).toList());
        if (byName.isEmpty()) {
            warnings.add("Aucun matériel n'a été reconnu : vérifie que le document contient bien la liste du matériel.");
        }
        String race = raw.race() == null || raw.race().isBlank() ? null : raw.race().strip();
        return new ExtractedGear(race, List.copyOf(byName.values()), warnings);
    }
}
