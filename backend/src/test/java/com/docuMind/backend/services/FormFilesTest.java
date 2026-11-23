package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import com.docuMind.backend.model.ExpertiseReportV2;
import com.docuMind.backend.model.FormCreationDto;
import com.docuMind.backend.model.enums.UserRole;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;

// The form files scripts/init-server.sh posts (forms/quality/, forms/workshop/): each one must be accepted by
// POST /api/v1/forms/, so they are read here as the server reads them, then checked like it does
// (FormCreationDto's constraints, then StructuredAnswers.checkOptions for every question)
class FormFilesTest {

    private static final Path FORMS = Path.of("..", "forms");
    private final ObjectMapper mapper = new ObjectMapper();
    private final StructuredAnswers answers = new StructuredAnswers(mapper);

    private List<Path> formFiles() throws IOException
    {
        List<Path> files = new ArrayList<>();
        for (String folder : List.of("quality", "workshop"))
            try (Stream<Path> listed = Files.list(FORMS.resolve(folder))) {
                listed.filter(p -> p.toString().endsWith(".json")).sorted().forEach(files::add);
            }
        return files;
    }

    private FormCreationDto read(Path file) throws IOException
    {
        return mapper.readValue(file.toFile(), FormCreationDto.class);
    }

    @Test
    void everyFormFileIsAcceptedByTheServer() throws IOException
    {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        List<Path> files = formFiles();
        assertEquals(12, files.size(), "8 quality forms, the assembly report and the 3 v2 expertise reports: " + files);
        for (Path file : files)
        {
            FormCreationDto form = read(file);
            Set<ConstraintViolation<FormCreationDto>> violations = validator.validate(form);
            assertTrue(violations.isEmpty(), file.getFileName() + ": " + violations);
            int position = 0;
            for (FormCreationDto.FormItem item : form.items())
                answers.checkOptions(item.answerType(), item.options(), ++position);
        }
    }

    // 21 November 2026: technicians fill the control sheets too (plan_forms_technician_assembly.md)
    @Test
    void theControlSheetsAreFilledByQualityAndTechnicians() throws IOException
    {
        int sheets = 0;
        for (Path file : formFiles())
        {
            FormCreationDto form = read(file);
            if (form.paperReference() == null
                    || !(form.paperReference().startsWith("EN-PFD-MIC") || form.paperReference().equals("EN-CPE-QU-01")))
                continue;
            sheets++;
            assertTrue(form.fillRoles().containsAll(List.of(UserRole.QUALITY, UserRole.USER)), file.getFileName() + ": " + form.fillRoles());
        }
        assertEquals(4, sheets);
    }

    @Test
    void theAssemblyReportIsATechniciansV2Report() throws IOException
    {
        FormCreationDto form = read(FORMS.resolve("workshop/RASSN-02_rapport_assemblage_pompe.json"));
        assertTrue(StructuredAnswers.isV2(form.title()), "opened by the section wizard, printed by the v2 PDF");
        assertEquals("ASSEMBLAGE", ExpertiseReportV2.kindOf(form.title()));
        assertEquals(List.of(UserRole.USER), form.fillRoles());
        assertFalse(form.readRoles().contains(UserRole.USER));
        // the report's equipment and date come from the form
        long metas = form.items().stream().filter(i -> i.options() != null && i.options().has("meta")).count();
        assertEquals(2, metas);
        // every conformity and every check: critical, so « Non conforme » needs a remark and makes the report non conforme
        assertTrue(form.items().stream()
                .filter(i -> i.options() != null && i.options().path("remark").asBoolean(false))
                .allMatch(FormCreationDto.FormItem::critical));
    }
}
