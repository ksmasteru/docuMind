package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

import com.docuMind.backend.exception.InvalidFormException;
import com.docuMind.backend.exception.InvalidResponseException;
import com.docuMind.backend.model.CheckListItem;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.FormCreationDto;
import com.docuMind.backend.model.SubmissionReport;
import com.docuMind.backend.model.SubmissionReport.ReportRow;
import com.docuMind.backend.model.enums.AnswerType;
import com.docuMind.backend.model.enums.FormLayout;
import com.docuMind.backend.model.enums.UserRole;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

// PHOVA's quality control sheets (forms/quality/*.json): each form passes the checks the server runs
// when it's created, the TABLE answers compute their conformity, and a sheet renders as a PDF laid
// out like the paper one (target/pdf-preview/control-sheet.pdf), without Spring or a database.
class ControlSheetTest {

    private static final Path FORMS = Path.of("..", "forms", "quality");
    private final ObjectMapper mapper = new ObjectMapper();
    private final StructuredAnswers answers = new StructuredAnswers(mapper);

    private List<FormCreationDto> forms() throws Exception
    {
        List<FormCreationDto> out = new ArrayList<>();
        try (Stream<Path> files = Files.list(FORMS)) {
            for (Path file : files.filter(f -> f.toString().endsWith(".json")).sorted().toList())
                out.add(mapper.readValue(file.toFile(), FormCreationDto.class));
        }
        return out;
    }

    @Test
    void theQualityFormsPassTheServersChecks() throws Exception
    {
        List<FormCreationDto> forms = forms();
        // the 4 control sheets (Quality fills them) and the 4 quality forms (every PHOVA role does)
        assertEquals(8, forms.size());
        for (FormCreationDto form : forms)
        {
            assertEquals(FormLayout.CONTROL_SHEET, form.layout(), form.title());
            assertTrue(form.fillRoles().contains(UserRole.QUALITY), form.title());
            assertTrue(form.readRoles().contains(UserRole.QUALITY), form.title());
            assertTrue(form.instructions().length() <= 255, form.title());
            int position = 0;
            for (FormCreationDto.FormItem item : form.items())
                answers.checkOptions(item.answerType(), item.options(), ++position);
            // the wizard sends the report's equipment and date from these (SubmissionRequest needs both)
            assertTrue(form.items().stream().anyMatch(i -> "equipment".equals(i.options() == null ? null : i.options().path("meta").asText())), form.title());
            assertTrue(form.items().stream().anyMatch(i -> "inspectionDate".equals(i.options() == null ? null : i.options().path("meta").asText())), form.title());
        }
    }

    @Test
    void onlyTheNamedRolesFillAndRead()
    {
        CheckListTemplate sheet = new CheckListTemplate();
        sheet.setFillRoles(List.of(UserRole.QUALITY));
        sheet.setReadRoles(List.of(UserRole.QUALITY, UserRole.SALES));
        assertTrue(sheet.canFill(UserRole.QUALITY));
        assertTrue(sheet.canFill(UserRole.ADMIN), "the admin creates the forms");
        assertFalse(sheet.canFill(UserRole.USER));
        assertFalse(sheet.canFill(null));
        assertTrue(sheet.canReadAll(UserRole.SALES));
        assertFalse(sheet.canReadAll(UserRole.MANAGER));

        CheckListTemplate checklist = new CheckListTemplate();
        assertTrue(checklist.canFill(UserRole.USER), "a form made before roles is open to every role");
        assertFalse(checklist.canReadAll(UserRole.QUALITY));
    }

    @Test
    void aMeasuredDimensionIsConformWithinItsSignedTolerances() throws Exception
    {
        CheckListItem dimensions = item("Fiche de contrôle usinage", "Contrôle dimensionnel : Cotes contrôlées");
        String sent = """
            { "rows": [
              { "repere": "A1", "tool": "Pied à coulisse", "measured": "49,97", "nominal": "50", "min": "−0,05", "max": "+0,02", "result": "Conforme" },
              { "repere": "A2", "measured": "50.03", "nominal": "50", "min": "-0.05", "max": "0.02", "result": "Conforme" },
              { "repere": "A3", "measured": "12" },
              { "repere": "", "tool": "", "measured": "" }
            ] }""";
        StructuredAnswers.Normalized normalized = answers.normalize(dimensions, sent, true);
        JsonNode rows = mapper.readTree(normalized.value()).get("rows");
        assertEquals(3, rows.size(), "a blank row is dropped");
        assertEquals("Conforme", rows.get(0).get("result").asText(), "49,97 is within 50 −0,05 / +0,02");
        assertEquals("Non conforme", rows.get(1).get("result").asText(), "50,03 is above 50,02, whatever was sent");
        assertTrue(rows.get(2).get("result").isNull(), "not every number given: no verdict yet");
        assertTrue(normalized.nonConforming());

        assertThrows(InvalidResponseException.class, () -> answers.normalize(dimensions,
                "{ \"rows\": [ { \"measured\": \"50\", \"nominal\": \"50\", \"min\": \"0,05\", \"max\": \"-0,02\" } ] }", true),
                "TOL INF above TOL SUP");
        assertThrows(InvalidResponseException.class, () -> answers.normalize(dimensions,
                "{ \"rows\": [ { \"measured\": \"abc\" } ] }", true));
        assertNull(answers.normalize(dimensions, "{ \"rows\": [] }", true).value());
    }

    @Test
    void aTableNeedsWellFormedColumns()
    {
        assertThrows(InvalidFormException.class, () -> answers.checkOptions(AnswerType.TABLE, null, 1));
        assertThrows(InvalidFormException.class, () -> answers.checkOptions(AnswerType.TABLE,
                json("{ \"columns\": [ { \"key\": \"r\", \"label\": \"Résultat\", \"type\": \"result\" } ] }"), 1),
                "a result column without a tolerance");
        assertThrows(InvalidFormException.class, () -> answers.checkOptions(AnswerType.TABLE,
                json("{ \"columns\": [ { \"key\": \"c\", \"label\": \"Conforme ?\", \"type\": \"choice\" } ] }"), 1),
                "a choice column without choices");
    }

    @Test
    void rendersAControlSheetLikeThePaperOne() throws Exception
    {
        CheckListItem dimensions = item("Fiche de contrôle usinage", "Contrôle dimensionnel : Cotes contrôlées");
        String stored = answers.normalize(dimensions, """
            { "rows": [
              { "repere": "A1", "tool": "Pied à coulisse", "measured": "49,97", "nominal": "50", "min": "-0,05", "max": "0,02", "comment": "" },
              { "repere": "A2", "tool": "Micromètre", "measured": "50,03", "nominal": "50", "min": "-0,05", "max": "0,02", "comment": "Reprise d'usinage" }
            ] }""", true).value();
        StructuredAnswers.Readable table = answers.describe(dimensions, stored);

        List<ReportRow> rows = List.of(
                row(1, "Identification : Type de pièce", "Roue", "TEXT", null),
                row(2, "Identification : N° de série", "PHB2-0412", "TEXT", null),
                row(3, "Identification : Matériau de coulée", "Fonte GS", "TEXT", null),
                row(4, "Contrôle dimensionnel : Cotes contrôlées", table.text(), "TABLE", table.data()),
                row(5, "État de surface : Commentaire", "Rugosité conforme au plan sur toutes les portées.", "TEXT", null));
        SubmissionReport report = new SubmissionReport("Fiche de contrôle usinage", "Inspection", 1,
                "Contrôle dimensionnel et d'état de surface d'une pièce usinée.", "8e8c5c3e-1f2a-4b6c-9d0e-123456789abc",
                "PHB2-0412", "06/10/2026", "Sara Alami", "06/10/2026 14:32", "NON_CONFORME", "Reprendre la cote A2.",
                rows, List.of(), new SubmissionReport.Verification("7K3F-9QXM-2B4C-8DHN", "https://greensense.example/verify/7K3F-9QXM-2B4C-8DHN"),
                new SubmissionReport.Paper("EN-PFD-MIC-01", "2.0", "29/03/2024", true));

        byte[] pdf = pdfService().render(report);
        Path out = Path.of("target", "pdf-preview");
        Files.createDirectories(out);
        Files.write(out.resolve("control-sheet.pdf"), pdf);
        try (PDDocument document = PDDocument.load(pdf)) {
            List<byte[]> pages = pdfService().renderPages(pdf);
            Files.write(out.resolve("control-sheet-page-1.png"), pages.get(0));
            String text = new PDFTextStripper().getText(document).replaceAll("\\s+", " ");
            assertTrue(text.contains("EN-PFD-MIC-01"), "the paper reference");
            assertTrue(text.contains("FICHE DE CONTRÔLE USINAGE"), "the title");
            assertTrue(text.contains("PHB2-0412"), "the serial number");
            assertTrue(text.contains("49,97"), "a measured value, French decimals");
            assertTrue(text.contains("Non conforme"), "the computed result");
            assertTrue(text.contains("Responsable qualité"), "the signature box");
            assertTrue(text.contains("7K3F-9QXM-2B4C-8DHN"), "the verification code");
        }
    }

    // the question with this label in the form with this title, as the server stores it
    private CheckListItem item(String title, String label) throws Exception
    {
        for (FormCreationDto form : forms())
            if (form.title().equals(title))
            {
                int position = 0;
                for (FormCreationDto.FormItem i : form.items())
                {
                    position++;
                    if (!i.labelFr().equals(label))
                        continue;
                    CheckListItem item = new CheckListItem();
                    item.setId("item-" + position);
                    item.setPosition(position);
                    item.setLabelFr(i.labelFr());
                    item.setAnswerType(i.answerType());
                    item.setOptions(answers.checkOptions(i.answerType(), i.options(), position));
                    return item;
                }
            }
        throw new IllegalArgumentException(label);
    }

    private static ReportRow row(int position, String label, String value, String type, JsonNode data)
    {
        return new ReportRow(position, label, null, false, value, null, null, List.of(), type, data, List.of(), null);
    }

    private JsonNode json(String text)
    {
        try {
            return mapper.readTree(text);
        } catch (Exception e) {
            throw new IllegalArgumentException(e);
        }
    }

    private static SubmissionPdfService pdfService()
    {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setCharacterEncoding(StandardCharsets.UTF_8.name());
        SpringTemplateEngine engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        return new SubmissionPdfService(engine);
    }
}
