package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

import com.docuMind.backend.model.SubmissionReport;
import com.docuMind.backend.model.SubmissionReport.ReportRow;

// Renders the real template with the real fonts, without Spring or a database, so the
// PDF (fonts, Arabic, record accessors in the template) is checked by `mvn test`.
// The output lands in target/pdf-preview/ to look at.
class SubmissionPdfServiceTest {

    private static SubmissionPdfService service()
    {
        // what spring-boot-starter-thymeleaf configures, minus the application context
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setCharacterEncoding(StandardCharsets.UTF_8.name());
        SpringTemplateEngine engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        return new SubmissionPdfService(engine);
    }

    private static SubmissionReport sampleReport() throws IOException
    {
        return new SubmissionReport(
                "Checklist du pont roulant",
                "Inspection",
                1,
                "L'opérateur doit inspecter l'équipement avant de commencer les travaux.",
                "8e8c5c3e-1f2a-4b6c-9d0e-123456789abc",
                "MP1",
                "12/10/2026",
                "Hicham Essaquy",
                "12/10/2026 10:30",
                "NON_CONFORME",
                "Pont mis à l'arrêt, responsable prévenu.",
                List.of(
                        new ReportRow(1, "Affichage de la charge MAX", "عرض الحمولة القصوى", false, "bon", null, null),
                        new ReportRow(3, "Linguet de sécurité du crochet", "لسان الأمان للخطاف", true, "mauvais",
                                "Linguet cassé, ressort absent.", null),
                        new ReportRow(4, "Câble de levage (enroulement, signes d'usure, etc.)",
                                "كابل الرفع (لف، علامات الاهتراء، إلخ)", true, "bon", null, null),
                        new ReportRow(17, "Charge de test (kg)", null, false, "500", null, null),
                        new ReportRow(18, "Photo du crochet", "صورة الخطاف", false, null,
                                "Vue de face.", photo(450, 1000, Color.ORANGE)),
                        new ReportRow(19, "Photo du câble", null, false, null, null, photo(1000, 600, Color.GRAY)),
                        new ReportRow(20, "Photo de la plaque", null, false, "Photo non disponible", null, null)));
    }

    // a plain-colour JPEG standing in for a phone photo (portrait or landscape)
    private static String photo(int width, int height, Color color) throws IOException
    {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", jpeg);
        return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(jpeg.toByteArray());
    }

    @Test
    void rendersTheFilledSheetAsPdfAndPreviewPages() throws Exception
    {
        SubmissionPdfService service = service();

        byte[] pdf = service.render(sampleReport());
        assertEquals("%PDF", new String(pdf, 0, 4, StandardCharsets.US_ASCII));

        // written before the checks, so a failing render can still be looked at
        List<byte[]> pages = service.renderPages(pdf);
        assertFalse(pages.isEmpty());
        Path out = Path.of("target", "pdf-preview");
        Files.createDirectories(out);
        Files.write(out.resolve("submission.pdf"), pdf);
        for (int i = 0; i < pages.size(); i++)
            Files.write(out.resolve("page-" + (i + 1) + ".png"), pages.get(i));

        try (PDDocument document = PDDocument.load(pdf)) {
            // line breaks depend on column widths, which shift with the content
            String text = new PDFTextStripper().getText(document).replaceAll("\\s+", " ");
            assertTrue(text.contains("CHECKLIST DU PONT ROULANT"), "title");
            assertTrue(text.contains("MP1"), "equipment");
            assertTrue(text.contains("NON CONFORME"), "status");
            assertTrue(text.contains("Linguet cassé, ressort absent."), "comment");
            assertTrue(text.contains("Hicham Essaquy"), "inspector");
            assertTrue(text.contains("Vue de face."), "photo comment");
            assertTrue(text.contains("Photo non disponible"), "unreadable photo note");
        }
    }
}
