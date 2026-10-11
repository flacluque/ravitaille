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
 * Prépare un roadbook (image ou PDF) pour une IA de vision : une image JPEG par page retenue, de taille
 * raisonnable, et le texte des pages quand le PDF en contient.
 * <p>
 * Un roadbook en PDF est souvent un livret (accès, navettes, règlement...) dont deux ou trois pages
 * seulement décrivent le parcours. Au-delà de {@value #MAX_PAGES} pages, on garde celles dont le texte
 * ressemble le plus à un roadbook (heures, kilomètres, mots-clés) : un modèle local ne peut pas tout
 * lire d'un coup, et les pages inutiles le distraient.
 */
public final class RoadbookPages {

    static final int MAX_PAGES = 4;
    /** Une image seule peut être grande ; plusieurs pages doivent tenir ensemble dans le contexte du modèle. */
    static final int MAX_SIDE_PX = 2000;
    static final int MAX_SIDE_PX_MULTIPAGE = 1600;
    private static final float PDF_DPI = 150;

    private RoadbookPages() {}

    public static RoadbookDocument from(byte[] content, String filename) {
        if (content == null || content.length == 0) {
            throw new IllegalArgumentException("Fichier vide");
        }
        if (isPdf(content)) {
            return fromPdf(content);
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
        return RoadbookDocument.ofImages(List.of(encode(downscale(image, MAX_SIDE_PX))));
    }

    private static boolean isPdf(byte[] content) {
        return content.length > 4 && content[0] == '%' && content[1] == 'P' && content[2] == 'D' && content[3] == 'F';
    }

    private static RoadbookDocument fromPdf(byte[] content) {
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
            List<Integer> pages = selectPages(texts);
            if (count > MAX_PAGES) {
                notes.add(pages.isEmpty()
                        ? "PDF de " + count + " pages sans texte : seules les " + MAX_PAGES + " premières ont été lues. "
                          + "Si le tableau des ravitos est plus loin, envoie seulement les bonnes pages (capture d'écran)."
                        : "PDF de " + count + " pages : lu les pages " + join(pages) + ", celles qui décrivent le parcours. "
                          + "S'il manque des points, envoie seulement les bonnes pages (capture d'écran).");
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
            return new RoadbookDocument(images, selectedTexts, notes);
        } catch (IOException e) {
            throw new IllegalArgumentException("PDF illisible : " + e.getMessage(), e);
        }
    }

    private static final Pattern CLOCK = Pattern.compile("\\b\\d{1,2}\\s?[hH]\\s?\\d{2}\\b|\\bBH\\b");
    private static final Pattern KM = Pattern.compile("\\d+(?:[,.]\\d+)?\\s?km\\b|\\bKM\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern KEYWORD = Pattern.compile(
            "barri[eè]re|ravito|ravitaillement|temps de passage|d\\+|dénivel|profil|cut.?off|départ|arrivée",
            Pattern.CASE_INSENSITIVE);

    /**
     * Pages à lire (indices à partir de 0, dans l'ordre du document). Toutes si le PDF est court ;
     * sinon les {@value #MAX_PAGES} pages les plus « roadbook » d'après leur texte. Liste vide si le PDF
     * est long et sans texte (scanné) : on ne peut pas choisir.
     */
    static List<Integer> selectPages(List<String> texts) {
        if (texts.size() <= MAX_PAGES) {
            return IntStream.range(0, texts.size()).boxed().toList();
        }
        int[] scores = texts.stream().mapToInt(RoadbookPages::score).toArray();
        return IntStream.range(0, texts.size()).boxed()
                .filter(i -> scores[i] > 0)
                .sorted(Comparator.comparingInt((Integer i) -> scores[i]).reversed())
                .limit(MAX_PAGES)
                .sorted()
                .toList();
    }

    /** Les heures pèsent le plus (barrières, temps de passage), puis les km, puis les mots-clés. */
    static int score(String text) {
        return 3 * count(CLOCK, text) + 2 * count(KM, text) + count(KEYWORD, text);
    }

    private static int count(Pattern p, String text) {
        Matcher m = p.matcher(text);
        int n = 0;
        while (m.find()) {
            n++;
        }
        return n;
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
