package fr.trailplanner.extract;

import java.util.List;

/**
 * Consignes de lecture communes à toutes les IA, et schéma JSON attendu en réponse.
 * Les roadbooks varient beaucoup d'une course à l'autre (tableau, profil annoté, plusieurs pages) :
 * les consignes décrivent ce qu'on cherche plutôt qu'une mise en page.
 */
public final class RoadbookPrompt {

    private RoadbookPrompt() {}

    public static final String SYSTEM = """
            Tu lis le roadbook d'une course de trail pour pré-remplir un formulaire. Ce peut être un tableau, \
            un profil annoté ou un livret de plusieurs pages dont seules certaines parlent du parcours. \
            Le coureur vérifiera tout avant de s'en servir : recopie ce qui est écrit, n'invente rien, et \
            laisse un champ vide plutôt que de deviner.

            Pour chaque point de passage du parcours (départ, ravitos, points de contrôle, arrivée), dans \
            l'ordre du parcours. Le départ (km 0) et l'arrivée en font partie, même si le tableau du \
            roadbook ne les liste pas :
            - code : le code du roadbook s'il y en a un (ex. "1P", "3", "1D"), sinon le numéro d'ordre en \
            commençant à "1" pour le départ.
            - name : le lieu, tel qu'écrit (sans les précisions secondaires en petit).
            - km : la distance depuis le départ.
            - gainM / lossM : le dénivelé positif / négatif CUMULÉ depuis le départ, en mètres, seulement \
            s'il est écrit en chiffres pour ce point. Si le roadbook le donne par tronçon, additionne-le et \
            signale-le dans warnings. Ne l'estime jamais à partir du dessin d'un profil : laisse-le vide.
            - cutoffIn : la barrière horaire (heure limite, "BH", "cut-off") à l'entrée du point, au format \
            "12h30" (heure seulement, sans le jour). cutoffOut : seulement si le roadbook précise une \
            barrière de sortie ("Sortie", "Exit", départ du ravito). Sans précision, une barrière est à \
            l'entrée. Une heure de déroutage (au-delà de laquelle les coureurs sont détournés vers un \
            parcours plus court) n'est pas la barrière : prends l'heure limite et cite le déroutage dans \
            warnings. La durée maximale de course (ex. "BH 19h30", "temps limite") n'est pas une \
            barrière de point. Les « temps de passage » estimés (ex. "8h25 - 11h10") ne sont pas des \
            barrières.
            - aid : "NONE" pour un simple pointage, un point sans ravitaillement, le départ et l'arrivée ; \
            "LIGHT" pour un ravito classique (eau, boissons, solides froids, éventuellement boisson \
            chaude) ; "FULL" pour un gros ravito (solides chauds / repas chaud, base de vie, sac de \
            délestage).

            Pour la course :
            - name : le nom de la course, avec l'année si elle est indiquée.
            - startTime : l'heure de départ au format "09:00". S'il y a plusieurs vagues, la première, \
            et cite les vagues dans warnings.
            - startDate : la date de départ au format "2026-10-23", seulement si le jour, le mois et \
            l'année sont lisibles ; sinon laisse vide.
            - warnings : quelques phrases courtes, en français, sur ce que le coureur doit vérifier \
            (valeur illisible, incohérence, par exemple une distance totale annoncée différente du tableau).
            """;

    public static final String USER = "Voici le roadbook. Extrais-en les points de passage.";

    /** Longueur maximale du texte d'une page transmis au modèle (le reste est coupé). */
    static final int MAX_TEXT_PER_PAGE = 3000;

    /**
     * Message du coureur. Quand le PDF contient du texte, on le joint aux images : les nombres y sont
     * exacts, et l'image sert à comprendre la mise en page (quelle valeur va dans quelle colonne).
     */
    public static String user(List<String> pageTexts) {
        if (pageTexts.stream().allMatch(String::isBlank)) {
            return USER;
        }
        StringBuilder sb = new StringBuilder(USER).append("""

                Texte extrait du PDF, page par page, dans l'ordre des images. Les nombres y sont exacts, \
                mais l'alignement des colonnes peut être perdu : appuie-toi sur les images pour savoir à \
                quel point et à quelle colonne chaque valeur se rapporte.
                """);
        for (int i = 0; i < pageTexts.size(); i++) {
            String text = pageTexts.get(i).strip();
            if (text.length() > MAX_TEXT_PER_PAGE) {
                text = text.substring(0, MAX_TEXT_PER_PAGE) + " […]";
            }
            sb.append("\n--- Image ").append(i + 1).append(" ---\n").append(text).append('\n');
        }
        return sb.toString();
    }

    /** Schéma de la réponse : la structure d'ExtractedRoadbook. */
    public static final String SCHEMA = """
            {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "startDate": { "type": "string" },
                "startTime": { "type": "string" },
                "checkpoints": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "code": { "type": "string" },
                      "name": { "type": "string" },
                      "km": { "type": "number" },
                      "gainM": { "type": "number" },
                      "lossM": { "type": "number" },
                      "cutoffIn": { "type": "string" },
                      "cutoffOut": { "type": "string" },
                      "aid": { "type": "string", "enum": ["NONE", "LIGHT", "FULL"] }
                    },
                    "required": ["code", "name", "km", "aid"]
                  }
                },
                "warnings": { "type": "array", "items": { "type": "string" } }
              },
              "required": ["name", "checkpoints", "warnings"]
            }
            """;
}
