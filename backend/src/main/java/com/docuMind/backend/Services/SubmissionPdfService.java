package com.docuMind.backend.services;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.stereotype.Service;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

import com.docuMind.backend.model.ControlSheet;
import com.docuMind.backend.model.ExpertiseDossier;
import com.docuMind.backend.model.ExpertiseReport;
import com.docuMind.backend.model.ExpertiseReportV2;
import com.docuMind.backend.model.SubmissionReport;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.openhtmltopdf.bidi.support.ICUBidiReorderer;
import com.openhtmltopdf.bidi.support.ICUBidiSplitter;
import com.openhtmltopdf.extend.FSSupplier;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.TextDirection;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;

// Turns a SubmissionReport into the PDF of the filled sheet:
//   report → Thymeleaf (templates/submission-report.html) → XHTML → OpenHTMLtoPDF → PDF bytes
// The full expertise report (ExpertiseReport.isFor) has its own template, laid out like
// PHOVA's paper report: templates/expertise-report.html; the v2 reports theirs,
// templates/expertise-report-v2.html (ExpertiseReportV2).
// Nothing is stored: the PDF is rebuilt from the saved submission on every request.
// We go through HTML because PDFBox alone can't shape or order Arabic text.
@Service
public class SubmissionPdfService {

    private static final String TEMPLATE = "submission-report";
    private static final String EXPERTISE_TEMPLATE = "expertise-report";
    // the v2 expertise reports (StructuredAnswers.isV2): a summary page, then a card per part (report_pdf.md)
    private static final String EXPERTISE_V2_TEMPLATE = "expertise-report-v2";
    // the quality control sheets (FormLayout.CONTROL_SHEET), laid out like the paper sheet (ControlSheet)
    private static final String CONTROL_SHEET_TEMPLATE = "control-sheet";
    // an intervention's final file: cover, synthèse, avant / après, devis, both reports, history
    private static final String DOSSIER_TEMPLATE = "expertise-dossier";

    // Preview pages for the phone. 110 dpi makes an A4 page ~910×1290 px: sharp at phone
    // width, ~150 KB per page once base64'd.
    private static final float PREVIEW_DPI = 110f;

    private final ITemplateEngine templateEngine;

    // The logo goes in as a data URI rather than a relative "phova_logo.png": inside the
    // packaged jar, classpath:/static/ is a jar:nested: URL that relative paths can't be
    // resolved against.
    private final String logoDataUri;
    // the expertise report's header also carries the university's and the client's logos
    private final String um6pLogoDataUri;
    private final String ocpLogoDataUri;
    // the paper report's measurement drawings (static/expertise), by name
    private final Map<String, String> drawings;

    public SubmissionPdfService(ITemplateEngine templateEngine)
    {
        this.templateEngine = templateEngine;
        this.logoDataUri = "data:image/png;base64,"
                + Base64.getEncoder().encodeToString(readClasspath("/static/phova_logo.png"));
        this.um6pLogoDataUri = "data:image/png;base64,"
                + Base64.getEncoder().encodeToString(readClasspath("/static/um6p_logo.png"));
        this.ocpLogoDataUri = "data:image/jpeg;base64,"
                + Base64.getEncoder().encodeToString(readClasspath("/static/ocp_logo.jpg"));
        Map<String, String> drawings = new HashMap<>();
        for (String name : List.of("arbre-palier", "coupe-pompe", "concentricite-arbre", "deplacement-axial",
                "deplacement-radial", "perpendicularite", "concentricite-boite"))
            drawings.put(name, "data:image/png;base64,"
                + Base64.getEncoder().encodeToString(readClasspath("/static/expertise/" + name + ".png")));
        this.drawings = Map.copyOf(drawings);
    }

    // the measurement drawings as data URIs, by name ("arbre-palier")
    public Map<String, String> drawings()
    {
        return drawings;
    }

    public byte[] render(SubmissionReport report)
    {
        return render(report, null);
    }

    // trace: where a v2 report sits in the workshop loop (ExpertiseDossierService.traceOf), null if unknown
    public byte[] render(SubmissionReport report, ExpertiseReportV2.Trace trace)
    {
        Context context = new Context(Locale.FRENCH);
        context.setVariable("logo", logoDataUri);
        // the verification block at the end of every report (templates/verification.html); none on a preview
        if (report.verification() != null)
            context.setVariable("verification", new VerificationBlock(report.verification().code(),
                    report.verification().url(), qrDataUri(report.verification().url())));
        String template = TEMPLATE;
        if (report.paper() != null) {
            template = CONTROL_SHEET_TEMPLATE;
            context.setVariable("sheet", ControlSheet.of(report));
        } else if (StructuredAnswers.isV2(report.title())) {
            template = EXPERTISE_V2_TEMPLATE;
            context.setVariable("report", trace == null ? ExpertiseReportV2.of(report, drawings) : ExpertiseReportV2.of(report, drawings, trace));
            context.setVariable("um6pLogo", um6pLogoDataUri);
            context.setVariable("ocpLogo", ocpLogoDataUri);
        } else if (ExpertiseReport.isFor(report.title())) {
            template = EXPERTISE_TEMPLATE;
            context.setVariable("report", ExpertiseReport.of(report));
            context.setVariable("um6pLogo", um6pLogoDataUri);
            context.setVariable("ocpLogo", ocpLogoDataUri);
            context.setVariable("drawings", drawings);
            // in the order of the report's geometric checks
            context.setVariable("geometricDrawings", List.of("concentricite-arbre", "deplacement-axial",
                    "deplacement-radial", "perpendicularite", "concentricite-boite"));
        } else {
            context.setVariable("report", report);
        }
        return toPdf(templateEngine.process(template, context));
    }

    // what templates/verification.html reads
    public record VerificationBlock(String code, String url, String qr) {}

    // The URL as a QR code PNG, as a data URI like the logos. Drawn from ZXing's matrix here rather
    // than with zxing-javase, which would only add MatrixToImageWriter. Level M survives a creased
    // or slightly stained printout; the 4-module quiet zone is what phone scanners expect.
    static String qrDataUri(String url)
    {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 4);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            BitMatrix matrix = new QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, 0, 0, hints);
            // 8 px per module: sharp once the template scales it to ~22 mm
            int scale = 8;
            BufferedImage image = new BufferedImage(matrix.getWidth() * scale, matrix.getHeight() * scale,
                    BufferedImage.TYPE_BYTE_BINARY);
            for (int y = 0; y < image.getHeight(); y++)
                for (int x = 0; x < image.getWidth(); x++)
                    image.setRGB(x, y, matrix.get(x / scale, y / scale) ? 0x000000 : 0xFFFFFF);
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(image, "png", png);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(png.toByteArray());
        } catch (WriterException | IOException ex) {
            throw new IllegalStateException("could not draw the verification QR code", ex);
        }
    }

    // the intervention's final file (ExpertiseDossierService.dossier)
    public byte[] renderDossier(ExpertiseDossier dossier)
    {
        Context context = new Context(Locale.FRENCH);
        context.setVariable("dossier", dossier);
        context.setVariable("logo", logoDataUri);
        context.setVariable("um6pLogo", um6pLogoDataUri);
        context.setVariable("ocpLogo", ocpLogoDataUri);
        return toPdf(templateEngine.process(DOSSIER_TEMPLATE, context));
    }

    private byte[] toPdf(String html)
    {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            // the families and weights the template's CSS asks for
            builder.useFont(font("NotoSans-Regular.ttf"), "Noto Sans", 400, FontStyle.NORMAL, true);
            builder.useFont(font("NotoSans-Bold.ttf"), "Noto Sans", 700, FontStyle.NORMAL, true);
            builder.useFont(font("NotoNaskhArabic.ttf"), "Noto Naskh Arabic", 400, FontStyle.NORMAL, true);
            // ICU (openhtmltopdf-rtl-support) splits the Arabic labels into right-to-left runs,
            // then joins and orders their letters
            builder.useUnicodeBidiSplitter(new ICUBidiSplitter.ICUBidiSplitterFactory());
            builder.useUnicodeBidiReorderer(new ICUBidiReorderer());
            builder.defaultTextDirection(TextDirection.LTR);
            builder.withHtmlContent(html, null);
            builder.toStream(out);
            builder.run();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new UncheckedIOException("could not render the submission PDF", ex);
        }
    }

    // one PNG per page of an already-rendered PDF, for the in-app preview
    public List<byte[]> renderPages(byte[] pdf)
    {
        try (PDDocument document = PDDocument.load(pdf)) {
            PDFRenderer renderer = new PDFRenderer(document);
            List<byte[]> pages = new ArrayList<>();
            for (int i = 0; i < document.getNumberOfPages(); i++) {
                BufferedImage image = renderer.renderImageWithDPI(i, PREVIEW_DPI, ImageType.RGB);
                ByteArrayOutputStream png = new ByteArrayOutputStream();
                ImageIO.write(image, "png", png);
                pages.add(png.toByteArray());
            }
            return pages;
        } catch (IOException ex) {
            throw new UncheckedIOException("could not render the PDF preview", ex);
        }
    }

    // a fresh stream each time the builder asks; it closes what it gets
    private static FSSupplier<InputStream> font(String name)
    {
        return () -> {
            InputStream stream = SubmissionPdfService.class.getResourceAsStream("/fonts/" + name);
            if (stream == null)
                throw new IllegalStateException("font missing from the classpath: fonts/" + name);
            return stream;
        };
    }

    private static byte[] readClasspath(String path)
    {
        try (InputStream stream = SubmissionPdfService.class.getResourceAsStream(path)) {
            if (stream == null)
                throw new IllegalStateException("missing from the classpath: " + path);
            return stream.readAllBytes();
        } catch (IOException ex) {
            throw new UncheckedIOException("could not read " + path, ex);
        }
    }
}
