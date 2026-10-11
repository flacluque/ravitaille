package fr.trailplanner.extract;

import java.util.List;

/** Consignes de lecture d'une liste de matériel obligatoire, et schéma JSON attendu en réponse. */
public final class GearPrompt {

    private GearPrompt() {}

    public static final String SYSTEM = """
            Tu lis la liste du matériel obligatoire d'une course de trail (règlement, roadbook, tableau) \\
            pour pré-remplir la checklist d'un coureur. Il la vérifiera : recopie ce qui est écrit, \\
            n'invente rien.

            - Le document peut couvrir plusieurs courses, par exemple un tableau avec une colonne par course. \\
            Ne garde que la course demandée : même nom, éventuellement sans l'année ou en abrégé. Mets son \\
            nom, tel qu'écrit, dans race. Si tu ne la trouves pas, prends la plus probable et dis-le dans \\
            warnings.
            - items : un élément par ligne de matériel requise pour CETTE course. name : le libellé tel \\
            qu'écrit, quantités et précisions comprises (ex. "2 lampes frontales avec piles ou batteries \\
            de rechange"). status : "MANDATORY" si obligatoire (O, X, coche, « obligatoire ») ; \\
            "RECOMMENDED" si recommandé ou conseillé (R, « conseillé »). Une case vide pour cette course \\
            veut dire que l'élément n'est pas demandé : ne le mets pas.
            - warnings : quelques phrases courtes, en français, sur ce qu'il faut vérifier (case illisible, \\
            course introuvable, matériel imposé selon la météo...).

            Exemple de forme (valeurs fictives) :
            {"race": "Trail des Crêtes", "items": [
              {"name": "1 couverture de survie", "status": "MANDATORY"},
              {"name": "Bâtons", "status": "RECOMMENDED"}],
             "warnings": []}
            """;

    /** Demande, avec le nom de la course et le texte des pages quand le document en contient. */
    public static String user(String raceName, List<String> pageTexts) {
        String race = raceName == null || raceName.isBlank()
                ? "Il n'y a qu'une course, ou prends la principale."
                : "La course du coureur : « " + raceName.strip() + " ».";
        return "Voici le document. Extrais la liste du matériel. " + race + RoadbookPrompt.pageTexts(pageTexts);
    }

    public static final String SCHEMA = """
            {
              "type": "object",
              "properties": {
                "race": { "type": ["string", "null"] },
                "items": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "name": { "type": "string" },
                      "status": { "type": "string", "enum": ["MANDATORY", "RECOMMENDED"] }
                    },
                    "required": ["name", "status"]
                  }
                },
                "warnings": { "type": "array", "items": { "type": "string" } }
              },
              "required": ["race", "items", "warnings"]
            }
            """;
}
