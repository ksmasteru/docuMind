package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
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
import com.docuMind.backend.model.PumpDocumentViews.ModelLink;
import com.docuMind.backend.model.PumpDocumentViews.ResolvedModel;
import com.docuMind.backend.model.enums.AskScope;
import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.PumpType;
import com.docuMind.backend.repository.AskInteractionRepository;
import com.docuMind.backend.repository.ChunkRepository;
import com.docuMind.backend.repository.ChunkRepository.ChunkMatch;
import com.docuMind.backend.services.PumpDocumentService.ModelDocs;

// The chat takes the pump from its context (plan_pump_manuals.md part C): the model picks the search, its spec
// sheet always comes first, each excerpt says what it is to the model, and the server labels the figures that
// aren't the model's own. Without Spring, a database or OpenAI.
// The library: OTW's sheet (spec-otw), AHLSTAR ticked OTW as comparable (ahlstar), MBN ticked PHB3 as comparable
// (mbn), a lockout procedure ticked for nothing (loto).
class AskPumpContextTest {

    private static final String TECH = "tech@phova.com";

    private record Match(String getId, String getChunkText, Double getDistance, String getFileId) implements ChunkMatch {}

    private static final Match SHEET = new Match("c-spec", "Fiche technique PHOVA : pompe OTW. Pression : jusqu'à 25 bar. Température : jusqu'à 200 °C.", 0.4, "spec-otw");
    private static final Match AHLSTAR = new Match("c-ahl", "Use ISO VG 46 oil. Viscosity not below 12 cSt. Parallel misalignment 0.05 mm.", 0.3, "ahlstar");
    private static final Match MBN = new Match("c-mbn", "Balance drum clearance 0.30 mm. Minimum flow 25 %.", 0.35, "mbn");
    private static final Match LOTO = new Match("c-loto", "Consigner l'armoire, vidanger, rincer.", 0.5, "loto");

    private EmbeddingModel embeddings;
    private ChatModel chat;
    private ChunkRepository chunks;
    private DocumentService documents;
    private PumpDocumentService pumpDocuments;
    private AskInteractionRepository interactions;
    private AskService service;

    @BeforeEach
    void setUp()
    {
        embeddings = mock(EmbeddingModel.class);
        chat = mock(ChatModel.class);
        chunks = mock(ChunkRepository.class);
        documents = mock(DocumentService.class);
        pumpDocuments = mock(PumpDocumentService.class);
        interactions = mock(AskInteractionRepository.class);
        when(interactions.save(any(AskInteraction.class))).thenAnswer(call -> call.getArgument(0));
        when(embeddings.embed(anyString())).thenReturn(new float[] { 0.1f, 0.2f });
        when(documents.getFileNames(any())).thenReturn(Map.of("spec-otw", "Fiche technique OTW",
            "ahlstar", "AHLSTAR_IOM_ISO_EN", "mbn", "MBN_IOM_EN", "loto", "Procédure de consignation"));
        when(pumpDocuments.linksOf(anyCollection())).thenReturn(Map.of(
            "spec-otw", List.of(new ModelLink(PumpType.OTW, DocumentKind.SPEC)),
            "ahlstar", List.of(new ModelLink(PumpType.OTW, DocumentKind.COMPARABLE)),
            "mbn", List.of(new ModelLink(PumpType.PHB3, DocumentKind.COMPARABLE))));
        when(pumpDocuments.docsOf(PumpType.OTW)).thenReturn(new ModelDocs("spec-otw", true));
        when(pumpDocuments.docsOf(PumpType.OTC)).thenReturn(new ModelDocs(null, false));
        when(chunks.findChunksOfFile(anyString(), eq("spec-otw"))).thenReturn(List.of(SHEET));
        service = new AskService(embeddings, chat, chunks, mock(RagMetrics.class), documents,
            mock(OpenAiAudioTranscriptionModel.class), interactions, pumpDocuments);
        ReflectionTestUtils.setField(service, "self", service);
    }

    private void pumpIs(PumpType model, String source)
    {
        when(pumpDocuments.resolveFor(any(), any())).thenAnswer(call ->
            new ResolvedModel(call.getArgument(1), model, source));
    }

    private void modelAnswers(String text)
    {
        when(chat.call(any(Prompt.class))).thenReturn(new ChatResponse(List.of(new Generation(new AssistantMessage(text)))));
    }

    private String promptSent()
    {
        ArgumentCaptor<Prompt> prompt = ArgumentCaptor.forClass(Prompt.class);
        verify(chat).call(prompt.capture());
        return prompt.getValue().getContents();
    }

    private AskInteraction interactionSaved()
    {
        ArgumentCaptor<AskInteraction> saved = ArgumentCaptor.forClass(AskInteraction.class);
        verify(interactions).save(saved.capture());
        return saved.getValue();
    }

    // ---- the model picks the search ----

    @Test
    void aPumpWithManualsSearchesItsDocumentsWithItsSheetFirst()
    {
        pumpIs(PumpType.OTW, "CODE");
        when(chunks.findSimilarChunksForModel(anyString(), anyInt(), eq("OTW"))).thenReturn(List.of(AHLSTAR, SHEET, LOTO));
        modelAnswers("Huile ISO VG 46 [2].");

        AiResponse response = service.answerWithAiRag(new AskRequest("quelle huile ?", null, "OTW-JORF-01"), TECH);

        verify(chunks, never()).findSimilarSharedChunks(anyString(), anyInt());
        String prompt = promptSent();
        assertTrue(prompt.contains("Modèle de la pompe : OTW (d'après l'équipement OTW-JORF-01)."));
        // the sheet first, once, then the search results
        assertTrue(prompt.contains("--- Extrait [1] · fichier : Fiche technique OTW · fiche technique PHOVA du modèle OTW ---"));
        assertTrue(prompt.contains("--- Extrait [2] · fichier : AHLSTAR_IOM_ISO_EN · manuel d'une pompe comparable au modèle OTW"));
        assertTrue(prompt.contains("--- Extrait [3] · fichier : Procédure de consignation · documentation générale ---"));
        assertEquals(3, interactionSaved().getSources().size());
        assertEquals("MANUALS", response.scope());
        assertEquals("OTW", response.pumpModel());
        assertEquals(AskScope.MANUALS, interactionSaved().getScope());
        assertEquals("OTW", interactionSaved().getPumpModel());
    }

    @Test
    void aPumpWithoutManualsSearchesTheWholeLibrary()
    {
        pumpIs(PumpType.OTC, "REGISTRY");
        when(chunks.findSimilarSharedChunks(anyString(), anyInt())).thenReturn(List.of(MBN, LOTO));
        modelAnswers("Débit minimum 25 % [1].");

        AiResponse response = service.answerWithAiRag(new AskRequest("débit minimum ?", null, "OTC125-45"), TECH);

        assertEquals("NO_MANUAL", response.scope());
        String prompt = promptSent();
        assertTrue(prompt.contains("Aucun manuel n'est rattaché à ce modèle"));
        assertTrue(prompt.contains("--- Extrait [1] · fichier : MBN_IOM_EN · manuel d'une pompe comparable au modèle PHB3 : ses valeurs ne sont pas celles du modèle PHB3, pas du modèle OTC ---"));
        // another model's figure: labelled with that model, whatever the model wrote
        assertEquals(List.of(new AiResponse.Warning("OTHER", List.of("25 %"), "MBN_IOM_EN", "mbn", List.of("PHB3"), "COMPARABLE")),
            response.warnings());
        assertEquals(List.of(new AiResponse.Source("mbn", "MBN_IOM_EN", "OTHER", List.of("PHB3"))), response.sources());
    }

    @Test
    void noModelSearchesTheWholeLibraryAndSaysWhichModelEachDocumentIsAbout()
    {
        pumpIs(null, null);
        when(chunks.findSimilarSharedChunks(anyString(), anyInt())).thenReturn(List.of(AHLSTAR, LOTO));
        modelAnswers("Consigner l'armoire [2].");

        AiResponse response = service.answerWithAiRag(new AskRequest("consignation ?", null, null), TECH);

        assertEquals("NO_MODEL", response.scope());
        assertNull(response.pumpModel());
        String prompt = promptSent();
        assertTrue(prompt.contains("Modèle de la pompe : non précisé."));
        assertTrue(prompt.contains("· manuel d'une pompe comparable au modèle OTW : ses valeurs ne sont pas celles du modèle OTW ---"));
        verify(chunks, never()).findChunksOfFile(anyString(), anyString());
        assertTrue(response.warnings().isEmpty()); // a general document: no label
    }

    @Test
    void theModelChosenOnTheAssistantPageGoesToTheResolver()
    {
        pumpIs(PumpType.OTW, "CHOSEN");
        when(chunks.findSimilarChunksForModel(anyString(), anyInt(), eq("OTW"))).thenReturn(List.of());
        modelAnswers("ok");

        service.answerWithAiRag(new AskRequest("question", null, null, "OTW"), TECH);

        verify(pumpDocuments).resolveFor("OTW", null);
        assertTrue(promptSent().contains("Modèle de la pompe : OTW (choisi par le technicien)."));
    }

    // an excerpt whose document was deleted while it was being embedded: left out, never an « unknown » source
    @Test
    void anExcerptOfADeletedDocumentIsLeftOut()
    {
        pumpIs(null, null);
        Match orphan = new Match("c-gone", "texte d'un document supprimé", 0.1, "gone");
        when(chunks.findSimilarSharedChunks(anyString(), anyInt())).thenReturn(List.of(orphan, LOTO));
        modelAnswers("Consigner [1].");

        AiResponse response = service.answerWithAiRag(new AskRequest("consignation ?", null, null), TECH);

        String prompt = promptSent();
        assertTrue(prompt.contains("--- Extrait [1] · fichier : Procédure de consignation"));
        assertTrue(!prompt.contains("texte d'un document supprimé"));
        assertEquals(List.of(new AiResponse.Source("loto", "Procédure de consignation", "GENERAL", List.of())), response.sources());
        assertEquals(1, interactionSaved().getSources().size());
    }

    // ---- the server's labels (§6) ----

    @Test
    void aComparablePumpsFigureIsLabelledEvenUncited()
    {
        pumpIs(PumpType.OTW, "CODE");
        when(chunks.findSimilarChunksForModel(anyString(), anyInt(), eq("OTW"))).thenReturn(List.of(AHLSTAR));
        modelAnswers("Alignement : 0,05 mm au plus.");

        AiResponse response = service.answerWithAiRag(new AskRequest("tolérance d'alignement ?", null, "OTW-JORF-01"), TECH);

        assertEquals(List.of(new AiResponse.Warning("COMPARABLE", List.of("0,05 mm"), "AHLSTAR_IOM_ISO_EN", "ahlstar", List.of("OTW"))),
            response.warnings());
        assertTrue(interactionSaved().getWarnings().contains("\"kind\":\"COMPARABLE\""));
    }

    @Test
    void theModelsOwnSheetsFigureIsNotLabelled()
    {
        pumpIs(PumpType.OTW, "CODE");
        when(chunks.findSimilarChunksForModel(anyString(), anyInt(), eq("OTW"))).thenReturn(List.of());
        modelAnswers("Jusqu'à 25 bar et 200 °C [1].");

        AiResponse response = service.answerWithAiRag(new AskRequest("pression max ?", null, "OTW-JORF-01"), TECH);

        assertTrue(response.warnings().isEmpty());
        assertEquals(List.of(new AiResponse.Source("spec-otw", "Fiche technique OTW", "SPEC", List.of("OTW"))), response.sources());
    }

    @Test
    void aFigureInNoExcerptIsUndocumented()
    {
        pumpIs(PumpType.OTW, "CODE");
        when(chunks.findSimilarChunksForModel(anyString(), anyInt(), eq("OTW"))).thenReturn(List.of(LOTO));
        modelAnswers("Au-delà de 70 °C généralement, le roulement souffre.");

        AiResponse response = service.answerWithAiRag(new AskRequest("roulement chaud", null, "OTW-JORF-01"), TECH);

        assertEquals(List.of(new AiResponse.Warning("UNDOCUMENTED", List.of("70 °C"), null, null, List.of())), response.warnings());
    }

    @Test
    void aProcedureCitedFromAComparableManualIsLabelledWithoutFigures()
    {
        pumpIs(PumpType.OTW, "CODE");
        when(chunks.findSimilarChunksForModel(anyString(), anyInt(), eq("OTW"))).thenReturn(List.of(AHLSTAR));
        modelAnswers("Remplir le palier avant le démarrage [2].");

        AiResponse response = service.answerWithAiRag(new AskRequest("avant démarrage ?", null, "OTW-JORF-01"), TECH);

        assertEquals(List.of(new AiResponse.Warning("COMPARABLE", List.of(), "AHLSTAR_IOM_ISO_EN", "ahlstar", List.of("OTW"))),
            response.warnings());
        assertEquals("COMPARABLE", response.sources().get(0).kind());
    }
}
