package fr.trailplanner.extract;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.IntStream;

/**
 * Prépare un document (image ou PDF) pour une IA de vision : une image JPEG par page retenue, de taille
 * raisonnable, et le texte des pages quand le PDF en contient.
 * <p>
 * Un PDF est souvent un livret (accès, navettes, règlement...) dont deux ou trois pages seulement
 * nous intéressent. Au-delà de {@value #MAX_PAGES} pages, on garde celles dont le texte ressemble le plus
 * à ce qu'on cherche ({@link Relevance}) : un modèle local ne peut pas tout lire d'un coup, et les pages
 * inutiles le distraient.
 */
public final class DocumentPages {

    /**
     * Ce qui rend une page intéressante : des motifs pondérés, comptés dans son texte.
     *
     * @param subject ce que décrivent les pages retenues, pour prévenir le coureur ("le parcours")
     */
    public record Relevance(String subject, List<Weighted> patterns) {

        public record Weighted(Pattern pattern, int weight) {}

        int score(String text) {
            int score = 0;
            for (Weighted w : patterns) {
                Matcher m = w.pattern().matcher(text);
                while (m.find()) {
                    score += w.weight();
                }
            }
            return score;
        }
    }

    /** Roadbook : les heures pèsent le plus (barrières, temps de passage), puis les km, puis les mots-clés. */
    public static final Relevance ROADBOOK = new Relevance("le parcours", List.of(
            new Relevance.Weighted(Pattern.compile("\\b\\d{1,2}\\s?[hH]\\s?\\d{2}\\b|\\bBH\\b"), 3),
            new Relevance.Weighted(Pattern.compile("\\d+(?:[,.]\\d+)?\\s?km\\b|\\bKM\\b", Pattern.CASE_INSENSITIVE), 2),
            new Relevance.Weighted(Pattern.compile(
                    "barri[eè]re|ravito|ravitaillement|temps de passage|d\\+|dénivel|profil|cut.?off|départ|arrivée",
                    Pattern.CASE_INSENSITIVE), 1)));

    /** Règlement : la liste du matériel obligatoire. */
    public static final Relevance GEAR = new Relevance("le matériel", List.of(
            new Relevance.Weighted(Pattern.compile("mat[ée]riel (?:obligatoire|conseill[ée]|recommand[ée])", Pattern.CASE_INSENSITIVE), 5),
            new Relevance.Weighted(Pattern.compile(
                    "frontale|couverture de survie|sifflet|gobelet|imperm[ée]able|bande (?:élastique|adhésive)|"
                    + "réserve (?:d'eau|alimentaire)|téléphone|manches longues|gants|casquette|obligatoire",
                    Pattern.CASE_INSENSITIVE), 2)));

    static final int MAX_PAGES = 4;
    /** Une image seule peut être grande ; plusieurs pages doivent tenir ensemble dans le contexte du modèle. */
    static final int MAX_SIDE_PX = 2000;
    static final int MAX_SIDE_PX_MULTIPAGE = 1600;
    private static final float PDF_DPI = 150;

    private DocumentPages() {}

    public static PreparedDocument from(byte[] content, String filename, Relevance relevance) {
        if (content == null || content.length == 0) {
            throw new IllegalArgumentException("Fichier vide");
        }
        if (isPdf(content)) {
            return fromPdf(content, relevance);
        }
        BufferedImage image;
        try {
            image = ImageIO.read(new ByteArrayInputStream(content));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (image == null) {
            throw new IllegalArgumentException("Format non reconnu pour « " + filename
                    + " » : envoie une image (PNG, JPEG) ou un PDF.");
        }
        return PreparedDocument.ofImages(List.of(encode(downscale(image, MAX_SIDE_PX))));
    }

    private static boolean isPdf(byte[] content) {
        return content.length > 4 && content[0] == '%' && content[1] == 'P' && content[2] == 'D' && content[3] == 'F';
    }

    private static PreparedDocument fromPdf(byte[] content, Relevance relevance) {
        try (PDDocument doc = Loader.loadPDF(content)) {
            int count = doc.getNumberOfPages();
            if (count == 0) {
                throw new IllegalArgumentException("PDF sans page");
            }
            List<String> texts = new ArrayList<>();
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            for (int i = 1; i <= count; i++) {
                stripper.setStartPage(i);
                stripper.setEndPage(i);
                texts.add(stripper.getText(doc));
            }

            List<String> notes = new ArrayList<>();
            List<Integer> pages = selectPages(texts, relevance);
            if (count > MAX_PAGES) {
                notes.add(pages.isEmpty()
                        ? "PDF de " + count + " pages sans texte : seules les " + MAX_PAGES + " premières ont été lues. "
                          + "Si ce que tu cherches est plus loin, envoie seulement les bonnes pages (capture d'écran)."
                        : "PDF de " + count + " pages : lu les pages " + join(pages) + ", celles qui décrivent "
                          + relevance.subject() + ". S'il manque quelque chose, envoie seulement les bonnes pages (capture d'écran).");
            }
            if (pages.isEmpty()) {
                pages = IntStream.range(0, Math.min(count, MAX_PAGES)).boxed().toList();
            }

            PDFRenderer renderer = new PDFRenderer(doc);
            int maxSide = pages.size() > 1 ? MAX_SIDE_PX_MULTIPAGE : MAX_SIDE_PX;
            List<byte[]> images = new ArrayList<>();
            List<String> selectedTexts = new ArrayList<>();
            for (int i : pages) {
                images.add(encode(downscale(renderer.renderImageWithDPI(i, PDF_DPI, ImageType.RGB), maxSide)));
                selectedTexts.add(texts.get(i));
            }
            return new PreparedDocument(images, selectedTexts, notes);
        } catch (IOException e) {
            throw new IllegalArgumentException("PDF illisible : " + e.getMessage(), e);
        }
    }

    /**
     * Pages à lire (indices à partir de 0, dans l'ordre du document). Toutes si le PDF est court ;
     * sinon les {@value #MAX_PAGES} pages les plus pertinentes d'après leur texte. Liste vide si le PDF
     * est long et sans texte (scanné) : on ne peut pas choisir.
     */
    static List<Integer> selectPages(List<String> texts, Relevance relevance) {
        if (texts.size() <= MAX_PAGES) {
            return IntStream.range(0, texts.size()).boxed().toList();
        }
        int[] scores = texts.stream().mapToInt(relevance::score).toArray();
        return IntStream.range(0, texts.size()).boxed()
                .filter(i -> scores[i] > 0)
                .sorted(Comparator.comparingInt((Integer i) -> scores[i]).reversed())
                .limit(MAX_PAGES)
                .sorted()
                .toList();
    }

    private static String join(List<Integer> pages) {
        List<String> numbers = pages.stream().map(i -> String.valueOf(i + 1)).toList();
        return numbers.size() == 1 ? numbers.get(0)
                : String.join(", ", numbers.subList(0, numbers.size() - 1)) + " et " + numbers.get(numbers.size() - 1);
    }

    static BufferedImage downscale(BufferedImage image, int maxSide) {
        int w = image.getWidth(), h = image.getHeight();
        double ratio = Math.min(1, (double) maxSide / Math.max(w, h));
        if (ratio == 1 && image.getType() == BufferedImage.TYPE_INT_RGB) {
            return image;
        }
        int nw = (int) Math.round(w * ratio), nh = (int) Math.round(h * ratio);
        BufferedImage out = new BufferedImage(nw, nh, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setColor(java.awt.Color.WHITE);   // fond blanc pour les PNG transparents
        g.fillRect(0, 0, nw, nh);
        g.drawImage(image, 0, 0, nw, nh, null);
        g.dispose();
        return out;
    }

    private static byte[] encode(BufferedImage image) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "jpg", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
