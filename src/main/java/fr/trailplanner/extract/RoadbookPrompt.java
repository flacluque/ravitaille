package fr.trailplanner.extract;

/**
 * Consignes de lecture communes à toutes les IA, et schéma JSON attendu en réponse.
 * Les roadbooks varient beaucoup d'une course à l'autre (tableau, profil annoté, plusieurs pages) :
 * les consignes décrivent ce qu'on cherche plutôt qu'une mise en page.
 */
public final class RoadbookPrompt {

    private RoadbookPrompt() {}

    public static final String SYSTEM = """
            Tu lis le roadbook d'une course de trail (tableau ou profil annoté, sur une ou plusieurs pages) \
            pour pré-remplir un formulaire. Le coureur vérifiera tout avant de s'en servir : recopie ce qui \
            est écrit, n'invente rien, et laisse un champ vide plutôt que de deviner.

            Pour chaque point de passage du parcours (départ, ravitos, points de contrôle, arrivée), dans \
            l'ordre du parcours :
            - code : le code du roadbook s'il y en a un (ex. "1P", "3", "1D"), sinon le numéro d'ordre.
            - name : le lieu, tel qu'écrit (sans les précisions secondaires en petit).
            - km : la distance depuis le départ.
            - gainM / lossM : le dénivelé positif / négatif CUMULÉ depuis le départ, en mètres. Si le \
            roadbook donne le dénivelé par tronçon, additionne-le et signale-le dans warnings.
            - cutoffIn : la barrière horaire à l'entrée du point, au format "12h30" (heure seulement, \
            sans le jour). cutoffOut : seulement si le roadbook précise une barrière de sortie \
            ("Sortie", "Exit", départ du ravito). Sans précision, une barrière est à l'entrée. \
            La durée maximale de course (ex. "BH 19h30", "temps limite") n'est pas une barrière de point.
            - aid : "NONE" pour un simple pointage, un point sans ravitaillement, le départ et l'arrivée ; \
            "LIGHT" pour un ravito classique (boissons, solides froids, éventuellement boisson chaude) ; \
            "FULL" pour un gros ravito (solides chauds / repas chaud, base de vie, sac de délestage).

            Pour la course :
            - name : le nom de la course, avec l'année si elle est indiquée.
            - startTime : l'heure de départ au format "09:00".
            - startDate : la date de départ au format "2026-10-23", seulement si le jour, le mois et \
            l'année sont lisibles ; sinon laisse vide.
            - warnings : quelques phrases courtes, en français, sur ce que le coureur doit vérifier \
            (valeur illisible, incohérence, par exemple une distance totale annoncée différente du tableau).
            """;

    public static final String USER = "Voici le roadbook. Extrais-en les points de passage.";

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
