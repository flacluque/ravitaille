package fr.trailplanner.extract;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RoadbookPagesTest {

    @Test
    void uneImageRaisonnableGardeSaTaille() throws IOException {
        byte[] jpg;
        try (InputStream in = getClass().getResourceAsStream("/roadbooks/troubadours-2026.jpg")) {
            jpg = in.readAllBytes();
        }
        List<byte[]> pages = RoadbookPages.from(jpg, "troubadours.jpg");

        assertEquals(1, pages.size());
        BufferedImage page = read(pages.get(0));
        assertEquals(1500, page.getWidth());
        assertEquals(1061, page.getHeight());
    }

    @Test
    void unePhotoDeTelephoneEstReduite() throws IOException {
        List<byte[]> pages = RoadbookPages.from(png(new BufferedImage(4032, 3024, BufferedImage.TYPE_INT_ARGB)), "photo.png");

        BufferedImage page = read(pages.get(0));
        assertEquals(RoadbookPages.MAX_SIDE_PX, page.getWidth());
        assertEquals(1500, page.getHeight());
    }

    @Test
    void unPdfDonneUneImageParPage() throws IOException {
        List<byte[]> pages = RoadbookPages.from(pdf(2), "roadbook.pdf");

        assertEquals(2, pages.size());
        BufferedImage page = read(pages.get(0));
        assertTrue(page.getWidth() > 1000, "A4 paysage à 150 dpi : ~1750 px");
    }

    @Test
    void refuseLesFichiersQuiNeSontNiImageNiPdf() {
        assertThrows(IllegalArgumentException.class, () -> RoadbookPages.from("<gpx/>".getBytes(), "trace.gpx"));
        assertThrows(IllegalArgumentException.class, () -> RoadbookPages.from(new byte[0], "vide"));
    }

    @Test
    void refuseUnPdfTropLong() throws IOException {
        byte[] doc = pdf(RoadbookPages.MAX_PAGES + 1);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> RoadbookPages.from(doc, "reglement.pdf"));
        assertTrue(e.getMessage().contains("pages"));
    }

    private static byte[] pdf(int pages) throws IOException {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth())));
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] png(BufferedImage image) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private static BufferedImage read(byte[] bytes) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }
}
