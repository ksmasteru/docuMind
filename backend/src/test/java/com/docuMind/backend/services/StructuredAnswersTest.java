package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.docuMind.backend.exception.InvalidFormException;
import com.docuMind.backend.exception.InvalidResponseException;
import com.docuMind.backend.model.CheckListItem;
import com.docuMind.backend.model.SubmissionRequest;
import com.docuMind.backend.model.enums.AnswerType;
import com.fasterxml.jackson.databind.ObjectMapper;

// the v2 expertise reports' answers (report_ui.md): what a form's options must hold, what an answer
// may say, and how it reads back
class StructuredAnswersTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final StructuredAnswers answers = new StructuredAnswers(mapper);

    private CheckListItem item(AnswerType type, String options) throws Exception
    {
        CheckListItem item = new CheckListItem();
        item.setPosition(7);
        item.setLabelFr("Inspection des pièces / Corps de pompe : Constats");
        item.setAnswerType(type);
        item.setOptions(options == null ? null : answers.checkOptions(type, mapper.readTree(options), 7));
        return item;
    }

    private static final String FINDINGS = """
        { "choices": ["Bon état", "Corrosion", "Fissures"], "exclusive": "Bon état", "allowOther": true }""";

    @Test
    void formOptions_choicesAreRequiredAndExclusiveMustBeOne()
    {
        assertThrows(InvalidFormException.class, () -> answers.checkOptions(AnswerType.MULTI_CHOICE, null, 1));
        assertThrows(InvalidFormException.class,
                () -> answers.checkOptions(AnswerType.MULTI_CHOICE, mapper.readTree("{\"choices\": []}"), 1));
        assertThrows(InvalidFormException.class, () -> answers.checkOptions(AnswerType.MULTI_CHOICE,
                mapper.readTree("{\"choices\": [\"A\"], \"exclusive\": \"B\"}"), 1));
        assertThrows(InvalidFormException.class, () -> answers.checkOptions(AnswerType.TEXT,
                mapper.readTree("{\"meta\": \"pump\"}"), 1));
        assertNull(answers.checkOptions(AnswerType.TEXT, null, 1));
    }

    @Test
    void multiChoice_keepsTheFormsOrderAndReadsBack() throws Exception
    {
        CheckListItem findings = item(AnswerType.MULTI_CHOICE, FINDINGS);
        StructuredAnswers.Normalized n = answers.normalize(findings,
                "{\"selected\": [\"Fissures\", \"Corrosion\"], \"other\": \"rayure côté aspiration\"}", true);
        assertEquals("{\"selected\":[\"Corrosion\",\"Fissures\"],\"other\":\"rayure côté aspiration\"}", n.value());
        assertEquals("Corrosion, Fissures, rayure côté aspiration", answers.describe(findings, n.value()).text());
        // several values typed with « + Autre » come as one "other", read back one by one
        String two = answers.normalize(findings, "{\"selected\": [\"Corrosion\"], \"other\": \"rayure; piqûres\"}", true).value();
        assertEquals("Corrosion, rayure, piqûres", answers.describe(findings, two).text());
    }

    @Test
    void multiChoice_goodStateExcludesTheRest_andNothingTickedIsBlank() throws Exception
    {
        CheckListItem findings = item(AnswerType.MULTI_CHOICE, FINDINGS);
        assertThrows(InvalidResponseException.class,
                () -> answers.normalize(findings, "{\"selected\": [\"Bon état\", \"Corrosion\"]}", true));
        assertThrows(InvalidResponseException.class,
                () -> answers.normalize(findings, "{\"selected\": [\"Rouille\"]}", true));
        assertTrue(answers.normalize(findings, "{\"selected\": []}", true).blank());
    }

    @Test
    void singleChoice_nonConformingAndOther() throws Exception
    {
        CheckListItem status = item(AnswerType.SINGLE_CHOICE, """
            { "choices": ["Conforme", "Non conforme", "Non applicable", "À reprendre"],
              "nonConforming": ["Non conforme", "À reprendre"], "remark": true }""");
        assertTrue(answers.normalize(status, "{\"selected\": \"À reprendre\"}", true).nonConforming());
        assertFalse(answers.normalize(status, "{\"selected\": \"Conforme\"}", true).nonConforming());
        // no « Autre » on this one
        assertThrows(InvalidResponseException.class, () -> answers.normalize(status, "{\"other\": \"bof\"}", true));

        CheckListItem recommendation = item(AnswerType.SINGLE_CHOICE,
                "{ \"choices\": [\"Remplacement\"], \"allowOther\": true }");
        String stored = answers.normalize(recommendation, "{\"selected\": \"Autre\", \"other\": \"rodage\"}", true).value();
        assertEquals("rodage", answers.describe(recommendation, stored).text());
    }

    @Test
    void measure_keepsEveryReadingAndAverages() throws Exception
    {
        CheckListItem measure = item(AnswerType.MEASURE, "{ \"unit\": \"mm\" }");
        String stored = answers.normalize(measure, "{\"readings\": [0.05, \"0,06\", 0.05]}", true).value();
        StructuredAnswers.Readable readable = answers.describe(measure, stored);
        assertEquals("0.05 / 0.06 / 0.05 mm — moyenne 0.053 mm".replace('.', ','), readable.text());
        assertEquals(3, readable.data().path("readings").size());
        assertEquals(new BigDecimal("0.053"), readable.data().path("average").decimalValue());
        assertThrows(InvalidResponseException.class, () -> answers.normalize(measure, "{\"readings\": [\"abc\"]}", true));
        assertEquals(new BigDecimal("2"), StructuredAnswers.average(List.of(new BigDecimal("1"), new BigDecimal("3"))));
    }

    @Test
    void measure_outOfToleranceIsTheTechniciansFlag() throws Exception
    {
        CheckListItem measure = item(AnswerType.MEASURE, "{ \"unit\": \"mm\" }");
        String flagged = answers.normalize(measure, "{\"readings\": [1.3], \"out\": true}", true).value();
        assertEquals("{\"readings\":[1.3],\"out\":true}", flagged);
        StructuredAnswers.Readable readable = answers.describe(measure, flagged);
        assertEquals("1,3 mm — hors tolérance", readable.text());
        assertTrue(readable.data().path("out").asBoolean());
        // not flagged: nothing stored, read back as false
        String plain = answers.normalize(measure, "{\"readings\": [0.05], \"out\": false}", true).value();
        assertEquals("{\"readings\":[0.05]}", plain);
        assertFalse(answers.describe(measure, plain).data().path("out").asBoolean());
        // a flag without readings is a blank measure; a flag that isn't true / false is refused
        assertTrue(answers.normalize(measure, "{\"readings\": [], \"out\": true}", true).blank());
        assertThrows(InvalidResponseException.class, () -> answers.normalize(measure, "{\"readings\": [1], \"out\": \"oui\"}", true));
    }

    @Test
    void photos_oldFormsKeepIds_v2KeepsTitles() throws Exception
    {
        CheckListItem photos = item(AnswerType.IMAGE, null);
        assertEquals("a,b", answers.normalize(photos, "a, b", false).value());
        assertThrows(InvalidResponseException.class, () -> answers.normalize(photos, "a,b,c,d,e", false));
        StructuredAnswers.Normalized v2 = answers.normalize(photos,
                "[{\"imageId\": \"a\", \"title\": \"Vue 1\"}, {\"imageId\": \"b\", \"title\": \"Vue 2\", \"comment\": \"bride\"}]", true);
        assertEquals(List.of(new StructuredAnswers.PhotoRef("a", "Vue 1", null), new StructuredAnswers.PhotoRef("b", "Vue 2", "bride")),
                answers.photoRefs(v2.value()));
    }

    @Test
    void partsSummary_needsDescriptionsAndWholeQuantities() throws Exception
    {
        CheckListItem summary = item(AnswerType.PARTS_SUMMARY,
                "{ \"recommendations\": [\"Changer\"], \"decisions\": [\"PHOVA\"], \"remarks\": [] }");
        String stored = answers.normalize(summary,
                "{\"rows\": [{\"quantity\": \"2\", \"description\": \"Roulement 6309\", \"code\": \"R-6309\", \"recommendation\": \"Changer\", \"decision\": \"PHOVA\"}]}", true).value();
        assertEquals("2 × Roulement 6309 (R-6309) — Changer — PHOVA", answers.describe(summary, stored).text());
        assertThrows(InvalidResponseException.class,
                () -> answers.normalize(summary, "{\"rows\": [{\"quantity\": 1}]}", true));
        assertThrows(InvalidResponseException.class,
                () -> answers.normalize(summary, "{\"rows\": [{\"quantity\": \"1,5\", \"description\": \"x\"}]}", true));
    }

    @Test
    void extraParts_readBack()
    {
        String json = answers.normalizeExtraParts(List.of(new SubmissionRequest.ExtraPart("Bague d'usure",
                List.of(new SubmissionRequest.PhotoItem("img1", "Vue de face", null)), List.of("Dégradé"),
                "rayure", "à surveiller", null, "rodage")));
        StructuredAnswers.ExtraPartData part = answers.readExtraParts(json).get(0);
        assertEquals("Bague d'usure", part.name());
        assertEquals("Dégradé, rayure", part.findings());
        assertEquals("rodage", part.recommendation());
        assertEquals("Vue de face", part.photos().get(0).title());
        assertNull(answers.normalizeExtraParts(List.of()));
    }

    @Test
    void v2IsTheTitlesPrefix()
    {
        assertTrue(StructuredAnswers.isV2("Rapport d'expertise V2 (démontage)"));
        assertFalse(StructuredAnswers.isV2("Rapport d'expertise (démontage)"));
    }
}
