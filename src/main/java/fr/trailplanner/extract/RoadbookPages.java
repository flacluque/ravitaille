package fr.trailplanner.extract;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Prépare un roadbook (image ou PDF) pour une IA de vision : une image JPEG par page, de taille raisonnable.
 * Les photos de téléphone (4000 px et plus) n'apportent rien de plus à la lecture et ralentissent beaucoup
 * un modèle local : on les ramène à {@value #MAX_SIDE_PX} px de côté.
 */
public final class RoadbookPages {

    static final int MAX_SIDE_PX = 2000;
    static final int MAX_PAGES = 4;
    private static final float PDF_DPI = 150;

    private RoadbookPages() {}

    public static List<byte[]> from(byte[] content, String filename) {
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
        return List.of(encode(downscale(image)));
    }

    private static boolean isPdf(byte[] content) {
        return content.length > 4 && content[0] == '%' && content[1] == 'P' && content[2] == 'D' && content[3] == 'F';
    }

    private static List<byte[]> fromPdf(byte[] content) {
        try (PDDocument doc = Loader.loadPDF(content)) {
            int pages = doc.getNumberOfPages();
            if (pages == 0) {
                throw new IllegalArgumentException("PDF sans page");
            }
            if (pages > MAX_PAGES) {
                throw new IllegalArgumentException("PDF de " + pages + " pages : garde seulement les pages du roadbook (" +
                        MAX_PAGES + " maximum).");
            }
            PDFRenderer renderer = new PDFRenderer(doc);
            List<byte[]> out = new ArrayList<>();
            for (int i = 0; i < pages; i++) {
                out.add(encode(downscale(renderer.renderImageWithDPI(i, PDF_DPI, ImageType.RGB))));
            }
            return out;
        } catch (IOException e) {
            throw new IllegalArgumentException("PDF illisible : " + e.getMessage(), e);
        }
    }

    static BufferedImage downscale(BufferedImage image) {
        int w = image.getWidth(), h = image.getHeight();
        double ratio = (double) MAX_SIDE_PX / Math.max(w, h);
        if (ratio >= 1 && image.getType() == BufferedImage.TYPE_INT_RGB) {
            return image;
        }
        ratio = Math.min(1, ratio);
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
