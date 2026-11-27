package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

// The figures the server looks up in the excerpts (plan_pump_manuals.md §6), read without any mock.
class AnswerFiguresTest {

    private static List<String> shown(String text, String known)
    {
        return AnswerFigures.in(text, known).stream().map(AnswerFigures.Figure::shown).toList();
    }

    @Test
    void aNumberWithAUnitOrADecimalIsAFigure()
    {
        assertEquals(List.of("70 °C", "0,05 mm", "4000 h", "12 cSt", "2,5"),
            shown("Au-delà de 70 °C, un jeu de 0,05 mm, vidange toutes les 4000 h, au moins 12 cSt, facteur 2,5.", ""));
    }

    @Test
    void aCountOrAStepIsNotAFigure()
    {
        assertTrue(shown("1. Prenez 3 mesures.\n2. Répétez 2 fois sur la PHB3 et la M12.", "").isEmpty());
    }

    @Test
    void aSpacedThousandIsOneNumber()
    {
        List<AnswerFigures.Figure> figures = AnswerFigures.in("Jusqu'à 2 960 tr/min.", "");
        assertEquals(1, figures.size());
        assertEquals("2 960 tr/min", figures.get(0).shown());
        assertEquals("2960", figures.get(0).value());
    }

    @Test
    void theQuestionsAndTheEquipmentsNumbersAreNotTheAnswersFigures()
    {
        assertTrue(shown("Oui, 6 bar convient pour la OTW-JORF-01.", "pression 6 bar ? OTW-JORF-01").isEmpty());
    }

    // the baseline's Q25: « entre 0,1 mm et 0,2 mm », both are checked (none is in the question)
    @Test
    void bothEndsOfARangeAreChecked()
    {
        assertEquals(List.of("0,1 mm", "0,2 mm"), shown("Un jeu typique entre 0,1 mm et 0,2 mm.", "quel jeu axial ?"));
    }

    @Test
    void anExcerptStatesAFigureWhateverItsSeparators()
    {
        AnswerFigures.Figure oil = AnswerFigures.in("tous les 4 000 h", "").get(0);
        assertTrue(AnswerFigures.states("change the oil every 4000 operating hours", oil));
        assertTrue(AnswerFigures.states("vidange : 4 000 heures", oil));
        assertFalse(AnswerFigures.states("change at 40000 hours", oil));

        AnswerFigures.Figure gap = AnswerFigures.in("un jeu de 0,05 mm", "").get(0);
        assertTrue(AnswerFigures.states("Parallel 0.05 mm (0.002 in.) TIR", gap));
        assertFalse(AnswerFigures.states("0.051 mm", gap));
    }
}
