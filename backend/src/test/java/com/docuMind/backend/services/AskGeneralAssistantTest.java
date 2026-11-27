package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.openai.OpenAiAudioTranscriptionModel;
import org.springframework.test.util.ReflectionTestUtils;

import com.docuMind.backend.metrics.RagMetrics;
import com.docuMind.backend.model.AiResponse;
import com.docuMind.backend.model.AskInteraction;
import com.docuMind.backend.model.AskRequest;
import com.docuMind.backend.model.PumpDocumentViews.ResolvedModel;
import com.docuMind.backend.model.enums.AskOutcome;
import com.docuMind.backend.repository.AskInteractionRepository;
import com.docuMind.backend.repository.ChunkRepository;
import com.docuMind.backend.repository.ChunkRepository.ChunkMatch;

// The general assistant (plan_general_assistant.md, prompt 2.0): every question is searched as typed over the
// whole shared library, the task's equipment only goes to the model, and no PHOVA name is rewritten.
// Without Spring, a database or OpenAI: everything around AskService is a mock.
class AskGeneralAssistantTest {

    private static final String TECH = "tech@phova.com";

    private record Match(String getId, String getChunkText, Double getDistance, String getFileId) implements ChunkMatch {}

    private EmbeddingModel embeddings;
    private ChatModel chat;
    private ChunkRepository chunks;
    private DocumentService documents;
    private AskInteractionRepository interactions;
    private AskService service;

    @BeforeEach
    void setUp()
    {
        embeddings = mock(EmbeddingModel.class);
        chat = mock(ChatModel.class);
        chunks = mock(ChunkRepository.class);
        documents = mock(DocumentService.class);
        interactions = mock(AskInteractionRepository.class);
        when(interactions.save(any(AskInteraction.class))).thenAnswer(call -> call.getArgument(0));
        when(embeddings.embed(anyString())).thenReturn(new float[] { 0.1f, 0.2f });
        when(documents.getFileNames(any())).thenReturn(Map.of("f-ahlstar", "AHLSTAR.pdf", "f-loto", "consignation.pdf"));
        // no pump model known: these tests are about the general behaviour (the pump's context: AskPumpContextTest)
        PumpDocumentService pumpDocuments = mock(PumpDocumentService.class);
        when(pumpDocuments.resolveFor(any(), any())).thenReturn(new ResolvedModel(null, null, null));
        service = new AskService(embeddings, chat, chunks, mock(RagMetrics.class), documents,
            mock(OpenAiAudioTranscriptionModel.class), interactions, pumpDocuments);
        ReflectionTestUtils.setField(service, "self", service);
    }

    private void modelAnswers(String text)
    {
        when(chat.call(any(Prompt.class))).thenReturn(new ChatResponse(List.of(new Generation(new AssistantMessage(text)))));
    }

    private void libraryHolds(ChunkMatch... found)
    {
        when(chunks.findSimilarSharedChunks(anyString(), anyInt())).thenReturn(List.of(found));
    }

    private Prompt promptSent()
    {
        ArgumentCaptor<Prompt> prompt = ArgumentCaptor.forClass(Prompt.class);
        verify(chat).call(prompt.capture());
        return prompt.getValue();
    }

    private AskInteraction interactionSaved()
    {
        ArgumentCaptor<AskInteraction> saved = ArgumentCaptor.forClass(AskInteraction.class);
        verify(interactions).save(saved.capture());
        return saved.getValue();
    }

    private static String answerOf(AiResponse response)
    {
        return response.answer().get(0).answer();
    }

    @Test
    void aPhovaPumpNameIsSearchedAsTypedAndNeverRewritten()
    {
        libraryHolds(new Match("c1", "Roulements : graisser toutes les 2000 h", 0.3, "f-ahlstar"));
        modelAnswers("Graisser toutes les 2000 h sur la AHLSTAR, à confirmer pour une OTW.\nsources : AHLSTAR.pdf\nchunks : 0");

        AiResponse response = service.answerWithAiRag(new AskRequest("graissage roulements OTW ?", null, null), TECH);

        verify(embeddings).embed("graissage roulements OTW ?");
        assertTrue(promptSent().getContents().contains("Question : graissage roulements OTW ?"));
        // the answer is shown as the model wrote it: no AHLSTAR -> OTW rewriting any more
        assertEquals("Graisser toutes les 2000 h sur la AHLSTAR, à confirmer pour une OTW.\nsources : AHLSTAR.pdf", answerOf(response));
        verify(chunks, never()).findSimilarSharedChunksInFiles(anyString(), anyInt(), anyList());
        verify(documents, never()).searchFile(anyString());
    }

    @Test
    void theTasksEquipmentGoesToTheModelNotToTheSearch()
    {
        libraryHolds(new Match("c1", "Jeu axial", 0.3, "f-ahlstar"));
        modelAnswers("Mesurer au comparateur.\nsources : connaissances générales\nchunks :");

        service.answerWithAiRag(new AskRequest("quel jeu axial ?", null, "OTW-JORF-01"), TECH);

        verify(embeddings).embed("quel jeu axial ?");
        assertTrue(promptSent().getContents().contains("Équipement de la tâche : OTW-JORF-01"));
        assertEquals("OTW-JORF-01", interactionSaved().getPump());
    }

    @Test
    void twoPumpsInOneQuestionAreAnsweredNotRefused()
    {
        libraryHolds(new Match("c1", "texte", 0.3, "f-loto"));
        modelAnswers("Les deux se consignent de la même façon.\nsources : consignation.pdf\nchunks : 0");

        AiResponse response = service.answerWithAiRag(new AskRequest("OTW ou OTC, comment consigner ?", null, null), TECH);

        assertEquals("Les deux se consignent de la même façon.\nsources : consignation.pdf", answerOf(response));
        assertEquals(AskOutcome.ANSWERED, interactionSaved().getAskOutcome());
    }

    @Test
    void anEmptyLibraryStillGetsAnAnswerFromGeneralPractice()
    {
        libraryHolds();
        modelAnswers("1. Consigner.\nsources : connaissances générales\nchunks :");

        AiResponse response = service.answerWithAiRag(new AskRequest("comment changer une garniture ?", null, null), TECH);

        assertEquals("1. Consigner.\nsources : connaissances générales", answerOf(response));
        assertTrue(promptSent().getContents().contains("aucun extrait"));
        verify(documents, never()).getFileNames(any());
    }

    // prompt 2.2: the excerpts cited « [n] » (numbered from 1) mark the ones used, and the markers leave the text
    @Test
    void theCitedExcerptsAreMarkedUsedAndTheMarkersStripped()
    {
        libraryHolds(new Match("c1", "a", 0.2, "f-ahlstar"), new Match("c2", "b", 0.3, "f-loto"),
            new Match("c3", "c", 0.4, "f-loto"));
        modelAnswers("Consigner l'armoire [2].\nPuis le process [3][2].");

        AiResponse response = service.answerWithAiRag(new AskRequest("question", null, null), TECH);

        AskInteraction saved = interactionSaved();
        assertEquals(AskService.GENERAL_PROMPT_VERSION, saved.getPromptVersion());
        assertFalse(saved.getSources().get(0).getUsedChunk());
        assertTrue(saved.getSources().get(1).getUsedChunk());
        assertTrue(saved.getSources().get(2).getUsedChunk());
        // one source per document, and the closing line written by the server
        assertEquals(List.of(new AiResponse.Source("f-loto", "consignation.pdf", "GENERAL", List.of())), response.sources());
        assertEquals("Consigner l'armoire.\nPuis le process.\nsources : consignation.pdf", saved.getAnswer());
        assertEquals(saved.getAnswer(), answerOf(response));
        assertFalse(response.generalPractice());
    }

    @Test
    void theSourcesFollowTheOrderTheyAreFirstCited()
    {
        libraryHolds(new Match("c1", "a", 0.2, "f-ahlstar"), new Match("c2", "b", 0.3, "f-loto"));
        modelAnswers("Consigner [2]. Graisser [1].");

        AiResponse response = service.answerWithAiRag(new AskRequest("question", null, null), TECH);

        assertEquals(List.of(new AiResponse.Source("f-loto", "consignation.pdf", "GENERAL", List.of()),
            new AiResponse.Source("f-ahlstar", "AHLSTAR.pdf", "GENERAL", List.of())), response.sources());
        assertEquals("Consigner. Graisser.\nsources : consignation.pdf, AHLSTAR.pdf", answerOf(response));
    }

    // the 2026-11-24 baseline: « sources : fichier1, fichier9 », the prompt's template copied
    @Test
    void aSourcesLineNamingNoDocumentShowsGeneralPracticeNotAFakeFile()
    {
        libraryHolds(new Match("c1", "a", 0.2, "f-ahlstar"), new Match("c2", "b", 0.3, "f-loto"));
        modelAnswers("Vérifier l'alignement.\nsources : fichier1, fichier9");

        AiResponse response = service.answerWithAiRag(new AskRequest("question", null, null), TECH);

        assertTrue(response.sources().isEmpty());
        assertTrue(response.generalPractice());
        assertEquals("Vérifier l'alignement.\nsources : connaissances générales", answerOf(response));
    }

    @Test
    void aDocumentAnswerThatAlsoUsesGeneralPracticeSaysSo()
    {
        libraryHolds(new Match("c1", "a", 0.2, "f-ahlstar"));
        modelAnswers("Huile ISO VG 46 [1].\nContrôler le niveau chaque semaine (pratique générale).");

        AiResponse response = service.answerWithAiRag(new AskRequest("question", null, null), TECH);

        assertEquals(List.of(new AiResponse.Source("f-ahlstar", "AHLSTAR.pdf", "GENERAL", List.of())), response.sources());
        assertTrue(response.generalPractice());
    }

    @Test
    void theExcerptsAreNumberedFromOneForTheModel()
    {
        libraryHolds(new Match("c1", "a", 0.2, "f-ahlstar"), new Match("c2", "b", 0.3, "f-loto"));
        modelAnswers("ok [1]");

        service.answerWithAiRag(new AskRequest("question", null, null), TECH);

        String prompt = promptSent().getContents();
        assertTrue(prompt.contains("--- Extrait [1] · fichier : AHLSTAR.pdf · documentation générale ---"));
        assertTrue(prompt.contains("--- Extrait [2] · fichier : consignation.pdf · documentation générale ---"));
    }

    @Test
    void anOffTopicQuestionIsNull()
    {
        libraryHolds(new Match("c1", "a", 0.6, "f-ahlstar"));
        modelAnswers("null");

        AiResponse response = service.answerWithAiRag(new AskRequest("capitale de la France ?", null, null), TECH);

        assertEquals("null", answerOf(response));
        assertEquals(AskOutcome.NO_ANSWER, interactionSaved().getAskOutcome());
    }

    @Test
    void theSystemPromptIsTheGeneralOne()
    {
        libraryHolds(new Match("c1", "a", 0.2, "f-ahlstar"));
        modelAnswers("ok\nsources : AHLSTAR.pdf\nchunks : 0");

        service.answerWithAiRag(new AskRequest("question", null, null), TECH);

        assertTrue(promptSent().getContents().contains("RASSN-02"));
        verify(chunks).findSimilarSharedChunks(anyString(), eq(AskService.GENERAL_CHUNKS));
    }
}
