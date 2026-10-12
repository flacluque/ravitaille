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

class DocumentPagesTest {

    @Test
    void uneImageRaisonnableGardeSaTaille() throws IOException {
        byte[] jpg;
        try (InputStream in = getClass().getResourceAsStream("/roadbooks/troubadours-2026.jpg")) {
            jpg = in.readAllBytes();
        }
        PreparedDocument doc = DocumentPages.from(jpg, "troubadours.jpg", DocumentPages.ROADBOOK);

        assertEquals(1, doc.images().size());
        assertEquals(List.of(), doc.texts());
        BufferedImage page = read(doc.images().get(0));
        assertEquals(1500, page.getWidth());
        assertEquals(1061, page.getHeight());
    }

    @Test
    void unePhotoDeTelephoneEstReduite() throws IOException {
        PreparedDocument doc = DocumentPages.from(png(new BufferedImage(4032, 3024, BufferedImage.TYPE_INT_ARGB)), "photo.png", DocumentPages.ROADBOOK);

        BufferedImage page = read(doc.images().get(0));
        assertEquals(DocumentPages.MAX_SIDE_PX, page.getWidth());
        assertEquals(1500, page.getHeight());
    }

    @Test
    void unPdfDonneUneImageParPage() throws IOException {
        PreparedDocument doc = DocumentPages.from(pdf(2), "roadbook.pdf", DocumentPages.ROADBOOK);

        assertEquals(2, doc.images().size());
        assertEquals(2, doc.texts().size());
        assertTrue(doc.notes().isEmpty());
        BufferedImage page = read(doc.images().get(0));
        assertEquals(DocumentPages.MAX_SIDE_PX_MULTIPAGE, page.getWidth(), "A4 paysage à 150 dpi (~1750 px), ramené à 1600");
    }

    @Test
    void dansUnLivretOnGardeLesPagesQuiDecriventLeParcours() throws IOException {
        byte[] malene;
        try (InputStream in = getClass().getResourceAsStream("/roadbooks/malene-de-proust-2026.pdf")) {
            malene = in.readAllBytes();
        }
        PreparedDocument doc = DocumentPages.from(malene, "malene.pdf", DocumentPages.ROADBOOK);

        // Livret de 10 pages : profil (4), vagues de départ (6, 7), temps de passage et barrières (8).
        assertEquals(4, doc.images().size());
        assertTrue(doc.texts().get(3).contains("Temps"), doc.texts().get(3));
        assertTrue(doc.texts().get(3).contains("BH 14h"), doc.texts().get(3));
        assertTrue(doc.notes().get(0).contains("lu les pages 4, 6, 7 et 8"), doc.notes().get(0));
    }

    @Test
    void unLongPdfSansTexteSeLimiteAuxPremieresPages() {
        assertEquals(List.of(), DocumentPages.selectPages(List.of("", "", "", "", "", ""), DocumentPages.ROADBOOK));
        assertEquals(List.of(0, 1, 2), DocumentPages.selectPages(List.of("", "", ""), DocumentPages.ROADBOOK));
    }

    @Test
    void lesHeuresEtLesKmComptentPlusQueLeReste() {
        assertTrue(DocumentPages.ROADBOOK.score("Le Rozier 25,5 km 12h15 BH 14h") > DocumentPages.ROADBOOK.score("Départ, arrivée, ravitaillement"));
        assertEquals(0, DocumentPages.ROADBOOK.score("Charte du trailer : respecter la faune et la flore."));
    }

    @Test
    void refuseLesFichiersQuiNeSontNiImageNiPdf() {
        assertThrows(IllegalArgumentException.class, () -> DocumentPages.from("<gpx/>".getBytes(), "trace.gpx", DocumentPages.ROADBOOK));
        assertThrows(IllegalArgumentException.class, () -> DocumentPages.from(new byte[0], "vide", DocumentPages.ROADBOOK));
    }

    @Test
    void unLongPdfScanneEstLuSurSesPremieresPages() throws IOException {
        PreparedDocument doc = DocumentPages.from(pdf(DocumentPages.MAX_PAGES + 2), "scan.pdf", DocumentPages.ROADBOOK);

        assertEquals(DocumentPages.MAX_PAGES, doc.images().size());
        assertTrue(doc.notes().get(0).contains("sans texte"), doc.notes().get(0));
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

    @Test
    void lesPagesDeMaterielSontRepereesParLeurPropreVocabulaire() {
        String reglement = "Matériel obligatoire : 2 lampes frontales, couverture de survie, sifflet, gobelet, gants";
        String parcours = "Le Rozier 25,5 km 12h15 BH 14h ravitaillement";
        assertTrue(DocumentPages.GEAR.score(reglement) > DocumentPages.GEAR.score(parcours));
        assertTrue(DocumentPages.ROADBOOK.score(parcours) > DocumentPages.ROADBOOK.score(reglement));
    }
}
