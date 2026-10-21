package com.docuMind.backend.services;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.stereotype.Service;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

import com.docuMind.backend.model.SubmissionReport;
import com.openhtmltopdf.bidi.support.ICUBidiReorderer;
import com.openhtmltopdf.bidi.support.ICUBidiSplitter;
import com.openhtmltopdf.extend.FSSupplier;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.TextDirection;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;

// Turns a SubmissionReport into the PDF of the filled sheet:
//   report → Thymeleaf (templates/submission-report.html) → XHTML → OpenHTMLtoPDF → PDF bytes
// Nothing is stored: the PDF is rebuilt from the saved submission on every request.
// We go through HTML because PDFBox alone can't shape or order Arabic text.
@Service
public class SubmissionPdfService {

    private static final String TEMPLATE = "submission-report";

    // Preview pages for the phone. 110 dpi makes an A4 page ~910×1290 px: sharp at phone
    // width, ~150 KB per page once base64'd.
    private static final float PREVIEW_DPI = 110f;

    private final ITemplateEngine templateEngine;

    // The logo goes in as a data URI rather than a relative "phova_logo.png": inside the
    // packaged jar, classpath:/static/ is a jar:nested: URL that relative paths can't be
    // resolved against.
    private final String logoDataUri;

    public SubmissionPdfService(ITemplateEngine templateEngine)
    {
        this.templateEngine = templateEngine;
        this.logoDataUri = "data:image/png;base64,"
                + Base64.getEncoder().encodeToString(readClasspath("/static/phova_logo.png"));
    }

    public byte[] render(SubmissionReport report)
    {
        Context context = new Context(Locale.FRENCH);
        context.setVariable("report", report);
        context.setVariable("logo", logoDataUri);
        String html = templateEngine.process(TEMPLATE, context);

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
