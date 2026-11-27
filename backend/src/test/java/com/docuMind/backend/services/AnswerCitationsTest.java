package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

// The « [n] » citations of prompt 2.2 (plan_pump_manuals.md, part A), read without any mock.
class AnswerCitationsTest {

    @Test
    void aMarkerIsReadAndRemovedWithTheSpaceBeforeIt()
    {
        AnswerCitations.Parsed parsed = AnswerCitations.parse("Vidanger toutes les 4000 heures [2].", 10);

        assertEquals("Vidanger toutes les 4000 heures.", parsed.text());
        assertEquals(List.of(1), parsed.cited());
    }

    @Test
    void severalMarkersAndSeveralNumbersInOne()
    {
        AnswerCitations.Parsed parsed = AnswerCitations.parse("A [3][1]. B [2, 3]. C [4; 1].", 4);

        assertEquals("A. B. C.", parsed.text());
        // 0-based, in the order first cited, each once
        assertEquals(List.of(2, 0, 1, 3), parsed.cited());
    }

    @Test
    void bracketsThatAreNotCitationsStay()
    {
        AnswerCitations.Parsed parsed = AnswerCitations.parse(
            "Roue, corrosion [emplacement : aubes], [profondeur mesurée], jeu [0,05 mm].", 10);

        assertEquals("Roue, corrosion [emplacement : aubes], [profondeur mesurée], jeu [0,05 mm].", parsed.text());
        assertTrue(parsed.cited().isEmpty());
    }

    @Test
    void aNumberOutsideTheExcerptsSentIsNotACitation()
    {
        AnswerCitations.Parsed parsed = AnswerCitations.parse("Voir [12] et [2].", 10);

        assertEquals("Voir [12] et.", parsed.text());
        assertEquals(List.of(1), parsed.cited());
    }

    @Test
    void listNumberingAndIndentationAreKept()
    {
        AnswerCitations.Parsed parsed = AnswerCitations.parse("1. Consigner [1].\n   - armoire [2]\n2. Vidanger.", 2);

        assertEquals("1. Consigner.\n   - armoire\n2. Vidanger.", parsed.text());
    }

    @Test
    void theClosingLinesOfPrompt21AreTakenOff()
    {
        AnswerCitations.Parsed parsed = AnswerCitations.parse("Réponse [1].\n\nsources : AHLSTAR.pdf\nchunks : 0", 3);

        assertEquals("Réponse.", parsed.text());
        assertEquals("AHLSTAR.pdf", parsed.modelSources());
        assertEquals(List.of(0), parsed.cited());
    }

    @Test
    void noClosingLineNoModelSources()
    {
        AnswerCitations.Parsed parsed = AnswerCitations.parse("Réponse sans source.", 3);

        assertEquals("Réponse sans source.", parsed.text());
        assertNull(parsed.modelSources());
        assertTrue(parsed.cited().isEmpty());
    }
}
