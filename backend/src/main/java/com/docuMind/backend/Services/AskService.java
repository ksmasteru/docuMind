package com.docuMind.backend.services;
import java.util.regex.Pattern;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;


import java.util.regex.Matcher;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.audio.transcription.AudioTranscriptionPrompt;
import org.springframework.ai.audio.transcription.AudioTranscriptionResponse;
import org.springframework.ai.model.Media;
import org.springframework.ai.openai.OpenAiAudioTranscriptionModel;
import org.springframework.ai.openai.OpenAiAudioTranscriptionOptions;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeType;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.NoAiResultException;
import com.docuMind.backend.exception.NoChunksException;
import com.docuMind.backend.metrics.RagMetrics;
import com.docuMind.backend.model.AskRequest;
import com.docuMind.backend.model.DocumentChunks;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.repository.ChunkRepository;
import com.docuMind.backend.repository.ChunkRepository.ChunkMatch;
import com.docuMind.backend.model.AiResponse;
import com.docuMind.backend.model.AskInteraction;
import com.docuMind.backend.model.RetrievedSource;
import com.docuMind.backend.model.enums.AskOutcome;
import com.docuMind.backend.model.enums.AskScope;
import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.PumpType;
import com.docuMind.backend.model.PumpDocumentViews.ModelLink;
import com.docuMind.backend.model.PumpDocumentViews.ResolvedModel;
import com.docuMind.backend.services.PumpDocumentService.ModelDocs;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.docuMind.backend.model.AiResponse.chatAnswer;
import com.docuMind.backend.repository.AskInteractionRepository;
import io.micrometer.core.instrument.Timer;

@Service
public class AskService{

    private final EmbeddingModel embeddingModel;
    private final AskInteractionRepository  askInteractionRepository;
    private final ChatModel chatModel;
    private final ChunkRepository chunkRepository;
    private final RagMetrics ragMetrics;
    private final DocumentService documentService;
    private final OpenAiAudioTranscriptionModel transcriptionModel;
    // the pump's model and its documents (plan_pump_manuals.md part C)
    private final PumpDocumentService pumpDocumentService;
    // Self-injected proxy: @Cacheable only takes effect when the call travels
    // back through Spring's AOP proxy. A direct in-class call to getAnswer(...)
    // or questionEmbedding(...) bypasses the proxy and silently skips the cache,
    // so those two are always reached via `self`. @Lazy breaks the circular
    // dependency this self-reference would otherwise create during construction.
    @Autowired
    @Lazy
    private AskService self;

    public AskService(EmbeddingModel embeddingModel, ChatModel chatModel,
            ChunkRepository chunkRepository, RagMetrics ragMetrics, DocumentService documentService,
            OpenAiAudioTranscriptionModel transcriptionModel,
            AskInteractionRepository askInteractionRepository, PumpDocumentService pumpDocumentService)
    {
        this.pumpDocumentService = pumpDocumentService;
        this.embeddingModel = embeddingModel; 
        this.chatModel = chatModel;
        this.chunkRepository = chunkRepository;
        this.ragMetrics = ragMetrics;
        this.documentService = documentService;
        this.transcriptionModel = transcriptionModel;
        this.askInteractionRepository = askInteractionRepository;
    }
    
    @Cacheable(value = "ragResponses", key = "T(org.apache.commons.codec.digest.DigestUtils).sha256Hex(#userMessage) + T(org.apache.commons.codec.digest.DigestUtils).sha256Hex(#systemPrompt)")
    public String getAnswer(String userMessage, String systemPrompt)
    {
        System.out.println("get answer method called : no caching !! ");
        // No catch here on purpose: @Cacheable stores whatever this method
        // returns, so swallowing a transient failure would freeze the error
        // text into the cache and serve it for every identical question.
        // Throwing caches nothing; each caller decides what the user sees.
        // The finally block only makes sure a failed call still records its
        // latency.
        Timer.Sample retSample = ragMetrics.startTimer();
        try {
            Prompt prompt = new Prompt(List.of(
                new SystemMessage(systemPrompt),
                new UserMessage(userMessage)
            ));
            ChatResponse chatResponse = chatModel.call(prompt);
            if (chatResponse == null || chatResponse.getResult() == null) {
                throw new NoAiResultException("chat model returned no result");
            }
            return chatResponse.getResult().getOutput().getText();
        }
        finally {
            ragMetrics.recordRetrieval(retSample);
        }
    }

    @Cacheable(value = "embeddings", key = "T(org.apache.commons.codec.digest.DigestUtils).sha256Hex(#text)")
    public String questionEmbedding(String text) {
        System.out.println("questionEmedding method called no cache for :" + text);
        Timer.Sample embSample = ragMetrics.startTimer();
        float[] embedding = embeddingModel.embed(text);
        ragMetrics.recordEmbedding(embSample);
        return Arrays.toString(embedding);
    }

    // PUMP-SPECIFIC VERSION, COMMENTED OUT ON 24 NOVEMBER 2026 (plan_general_assistant.md).
    // PHOVA has no repair manual for its own pumps yet, so the question's PHOVA model was rewritten to a
    // competitor's (OTW -> AHLSTAR, ...) to search that competitor's manual, and the answer rewritten back.
    // Kept as the starting point of the specific version, once PHOVA's documentation is in the library.
    // The general version, answerGeneralWithAiRag below, is the one /api/v1/ask uses now.
    /*
    // new : we use competitors data  : if user types in OTW --> look for AHLSTAR
    public AiResponse answerPhovaWithAiRag(AskRequest request, String userId)
    {
     // ragMetrics.incrementAsk();
      System.out.println("ask service called");
      List<String> pumps =  List.of("OTW", "OTC", "OTS", "PHB2", "PHB3", "PHH");
      List<String> compPumps = List.of("AHLSTAR", "Durco Mark 3", "Weir Minerals Warman AH", "HDX", "DMX","HPX");
      String questionNormalized = request.question();
      List<String> matchedPumps = new ArrayList<>();
      List<String> matchedPhovaPumps = new ArrayList<>();
      for (int i = 0; i < pumps.size(); i++) {
        String pump = pumps.get(i);
        String replacement = compPumps.get(i);
        String regex = "(?i)\\b" + Pattern.quote(pump) + "\\b";
        Pattern pattern = Pattern.compile(regex);
        Matcher matcher = pattern.matcher(questionNormalized);
        // Check if the user's question contains this pump type
      if (matcher.find()) {
        matchedPumps.add(replacement); // Save s "OTW", "PHB3", etc.
        matchedPhovaPumps.add(pump);
        questionNormalized = matcher.replaceAll(Matcher.quoteReplacement(replacement));
      }
    }
    // The question names no pump, but the task it is asked from may (equipment « OTW-JORF-01 »): that pump's
    // manuals are searched as if the technician had named it. Only the first model found counts.
    boolean pumpFromEquipment = false;1
    String equipment = request.equipment();
    if (matchedPumps.isEmpty() && equipment != null && !equipment.isBlank())
    {
      for (int i = 0; i < pumps.size() && !pumpFromEquipment; i++) {
        String regex = "(?i)\\b" + Pattern.quote(pumps.get(i)) + "\\b";
        if (Pattern.compile(regex).matcher(equipment).find()) {
          matchedPumps.add(compPumps.get(i));
          matchedPhovaPumps.add(pumps.get(i));
          // in the question too, so the embedding and the model know which pump it is about
          questionNormalized = questionNormalized + " (pompe " + compPumps.get(i) + ")";
          pumpFromEquipment = true;
        }
      }
    }
    System.out.println("replaced question is " + questionNormalized);

    AskInteraction askInteraction = new AskInteraction();
    askInteraction.setUserId(userId);
    askInteraction.setQuestionRaw(request.question());
    askInteraction.setPromptVersion("1.1");
    askInteraction.setQuestionNormalised(questionNormalized);
    // all matched pumps, comma-joined, so MULTI_PUMP rows show which ones were compared
    askInteraction.setPump(matchedPhovaPumps.isEmpty() ? null : String.join(",", matchedPhovaPumps));
    // 3rd fix. : we should support more than one pump
    if (matchedPumps.size() > 1)
    {
      // shown as the assistant's reply, so in the technician's language
      String answer = "Plusieurs pompes sont citées : posez la question pour une seule pompe à la fois.";
      askInteraction.setAnswer(answer);
      askInteraction.setAskOutcome(AskOutcome.MULTI_PUMP);
      askInteractionRepository.save(askInteraction);
      chatAnswer chatAnswer = new chatAnswer("-", answer);
      return new AiResponse(List.of(chatAnswer) , askInteraction.getId(), 1);
    }
    int chunksnumber = 12;
    String embeddingLiteral = self.questionEmbedding(questionNormalized);
      // here we can specefiy wich file to look into ; based on the question
      // make api call or manually ?
      // api call
      //[[OCW1, OCW2, OCW3], [OTW1, OTW2, OTW3], [PHH1, PHH2, PHH3]]
      // user only allowed one pump type
      // the commented code below was changed because it dilutes
      // the chunks ranking.

      List<FileEntity> filesId = matchedPumps.size() == 0 ? null : documentService.searchFile(matchedPumps.get(0));
      List<ChunkMatch> allChunks = new ArrayList<>();
      // one query over all the pump's files, so Postgres ranks every chunk
      // against the others; skipped when no file matched ("IN ()" is invalid SQL)
      if (filesId != null && !filesId.isEmpty())
      {
        if (filesId.size() > 1)
          System.out.println("more than one file was chosen");
        List<String> fileIds = filesId.stream().map(FileEntity::getId).collect(Collectors.toList());
        // the shared documentation, whoever uploaded it (ChunkRepository): a technician uploads no manual
        allChunks = chunkRepository.findSimilarSharedChunksInFiles(embeddingLiteral, chunksnumber, fileIds);
      }
      // A named pump only ever uses its own files: falling back to all documents
      // would let another pump's data answer the question.
      // A pump only known from the task's equipment does fall back when it has no manual: the technician
      // didn't name it, and a general question (consignation, a standard) can still be answered.

      List<ChunkMatch> relevantChunks = matchedPumps.isEmpty() || (pumpFromEquipment && allChunks.isEmpty())
          ? chunkRepository.findSimilarSharedChunks(embeddingLiteral, chunksnumber)
          : allChunks;

      if (relevantChunks.isEmpty())
      {
        // saved before throwing: a pump with no documents is a gap worth seeing
        askInteraction.setAnswer("no chunks");
        askInteraction.setAskOutcome(AskOutcome.NO_CHUNKS);
        askInteractionRepository.save(askInteraction);
        throw new NoChunksException("no relevant document chunks for this question");
      }
      Map<String, String> fileNames = documentService.getFileNames(relevantChunks.stream()
          .map(ChunkMatch::getFileId)
          .collect(Collectors.toSet()));
      askInteraction.setSources(relevantChunks.stream()
          .map(c -> new RetrievedSource(c.getId(), fileNames.getOrDefault(c.getFileId(), "unknown"), c.getDistance()))
          .collect(Collectors.toList()));
      String userPrompt = """
          Context:
            %s

            Question: %s
            """.formatted(IntStream.range(0, relevantChunks.size())
                // numbered so the model has an index to cite in its "chunks:" line
                .mapToObj(i -> "--- Chunk " + i + " --- file : " + fileNames.getOrDefault(relevantChunks.get(i).getFileId(), "unknown") + " \n" + relevantChunks.get(i).getChunkText())
                .collect(Collectors.joining("\n\n")), questionNormalized);
      String systemPrompt_1_0 = """
    You are the maintenance assistant of a technician working on centrifugal
    pumps. You answer only from the excerpts below, which come from the
    technician's own manuals, standards and past intervention reports.

    READ THE QUESTION CHARITABLY
    Questions are typed on a phone or dictated on a noisy site, so they are
    often short, ungrammatical or mis-transcribed. Before deciding anything,
    restate the question to yourself in its most plausible technical reading:
    - a model or series designation usually follows the noun: "pump AHLSTAR",
      "the pump OCW" and "pompe OTW" mean the AHLSTAR, OCW and OTW pump.
    - speech recognition mangles designations ("OCW" as "occw", "O.C.W.",
      "OCW1"): match them to the nearest designation appearing in the excerpts.
    - a bare "what is X" means "what does the documentation say about X".
    Answer that reading. Never refuse because of wording, word order, spelling
    or grammar.

    USE THE EXCERPTS
    An answer is often spread across several excerpts rather than stated in one
    place: assemble it. If the excerpts discuss the subject without defining it
    in so many words, build the answer from what they do say. Tables arrive
    with their rows flattened onto a single line: read a value by its position
    against the column header rather than treating the table as unreadable.

    Never add facts from your own knowledge, and never invent specifics
    (numbers, names, part references, commands) the excerpts do not contain.
    Quote figures exactly as written, with their units.

    WHEN THE EXCERPTS SUPPORT AN ANSWER, EVEN IN PART
    Answer briefly, in the technician's own terms. If only part of the question
    is covered, answer that part and add one sentence naming what the documents
    do not cover. Partial coverage is an answer, never a refusal.
    End with one line naming the files you used, and nothing after it:
    sources : filename1, filename2

    WHEN NOTHING IN THE EXCERPTS BEARS ON THE QUESTION
    Reply with exactly:
    null
    Four lowercase characters and nothing else: no apology, no explanation, no
    quotation marks, no full stop, no sources line.

    BEFORE REPLYING null, CHECK ALL THREE
    1. You applied the charitable reading above, including designations that
       follow the noun and mis-transcribed ones.
    2. No excerpt mentions the subject at all, under any spelling.
    3. Nothing in the excerpts answers even part of the question.
    If any check fails, answer instead. null is for questions about a different
    subject entirely, such as the capital of France asked against a pump manual.
    Uncertainty, a figure sitting in a table, or an answer that had to be
    assembled from several excerpts are never reasons to reply null.
    """;

    String systemPrompt_1_1 =  """
        You are the maintenance assistant of a technician working on centrifugal
    pumps. You answer only from the excerpts below, which come from the
    technician's own manuals, standards and past intervention reports.

    READ THE QUESTION CHARITABLY
    Questions are typed on a phone or dictated on a noisy site, so they are
    often short, ungrammatical or mis-transcribed. Before deciding anything,
    restate the question to yourself in its most plausible technical reading:
    - a model or series designation usually follows the noun: "pump AHLSTAR",
      "the pump OCW" and "pompe OTW" mean the AHLSTAR, OCW and OTW pump.
    - speech recognition mangles designations ("OCW" as "occw", "O.C.W.",
      "OCW1"): match them to the nearest designation appearing in the excerpts.
    - a bare "what is X" means "what does the documentation say about X".
    Answer that reading. Never refuse because of wording, word order, spelling
    or grammar.

    USE THE EXCERPTS
    An answer is often spread across several excerpts rather than stated in one
    place: assemble it. If the excerpts discuss the subject without defining it
    in so many words, build the answer from what they do say. Tables arrive
    with their rows flattened onto a single line: read a value by its position
    against the column header rather than treating the table as unreadable.

    Never add facts from your own knowledge, and never invent specifics
    (numbers, names, part references, commands) the excerpts do not contain.
    Quote figures exactly as written, with their units.

    WHEN THE EXCERPTS SUPPORT AN ANSWER, EVEN IN PART
    Answer briefly, in the technician's own terms. If only part of the question
    is covered, answer that part and add one sentence naming what the documents
    do not cover. Partial coverage is an answer, never a refusal.
    End with exactly these two lines, and nothing after them:
    sources : filename1, filename2
    chunks : 0, 3, 5
    The first line names the files you used. The second lists the numbers of
    the excerpts you actually took facts from: the N in each "--- Chunk N ---"
    header. Leave out excerpts you read but did not use; never list every
    excerpt by default. Write plain numbers separated by commas, in any order.

    WHEN NOTHING IN THE EXCERPTS BEARS ON THE QUESTION
    Reply with exactly:
    null
    Four lowercase characters and nothing else: no apology, no explanation, no
    quotation marks, no full stop, no sources line, no chunks line.

    BEFORE REPLYING null, CHECK ALL THREE
    1. You applied the charitable reading above, including designations that
       follow the noun and mis-transcribed ones.
    2. No excerpt mentions the subject at all, under any spelling.
    3. Nothing in the excerpts answers even part of the question.
    If any check fails, answer instead. null is for questions about a different
    subject entirely, such as the capital of France asked against a pump manual.
    Uncertainty, a figure sitting in a table, or an answer that had to be
    assembled from several excerpts are never reasons to reply null.
    """;

    // marking which chunk were actually used.

    String answer = self.getAnswer(userPrompt, systemPrompt_1_1);
    // replace competitors pumps with phova pumps.
    for (int i = 0; i < pumps.size(); i++) {
        String pump = compPumps.get(i);
        String replacement = pumps.get(i);
        String regex = "(?i)\\b" + Pattern.quote(pump) + "\\b";
        Pattern pattern = Pattern.compile(regex);
        Matcher matcher = pattern.matcher(answer);
        // Check if the user's question contains this pump type
      if (matcher.find()) {
        answer = matcher.replaceAll(Matcher.quoteReplacement(replacement));
      }
    }
    String final_answer = "";
    if (answer.trim().equals("null"))
    {
      final_answer = "null";
      askInteraction.setAnswer("null");
      askInteraction.setAskOutcome(AskOutcome.NO_ANSWER);
    }
    else{
      // get the last line and remove it from the answer.
      // make the answer string into a list then delete
      List<String> answer_lines = List.of(answer.split("\n"));
      String last_answer_line = answer_lines.get(answer_lines.size() - 1);
      //chunks : 0, 3, 5
      if (last_answer_line.trim().toLowerCase().startsWith("chunks"))
      {
        // a malformed citation only loses the citation, never the request:
        // empty items (the space after ':' splits into "") and non-numbers are skipped
        List<Integer> indices = new ArrayList<>();
        for (String n : last_answer_line.substring(last_answer_line.indexOf(':') + 1).split("[,\\s]+"))
        {
          if (n.isBlank())
            continue;
          try {
            indices.add(Integer.parseInt(n.trim()));
          }
          catch (NumberFormatException ex) {
            System.out.println("ignoring chunk index that is not a number : " + n);
          }
        }
        for (int i = 0; i < answer_lines.size() - 1; i++)
          final_answer += answer_lines.get(i) + "\n";
        List <RetrievedSource> sources = askInteraction.getSources();
        for (int i = 0; i < sources.size(); i++)
        {
          if (indices.contains(i))
            sources.get(i).setUsedChunk(true);
          else
            sources.get(i).setUsedChunk(false);
        }
      }

      else
      { //somehow the last line doesnt contain chunks used.
        System.out.println("Last line of Ai response doesnt contain which chunks were used");
        final_answer = answer;
      }
      // store what the technician saw, without the chunks line
      askInteraction.setAnswer(final_answer);
      askInteraction.setAskOutcome(AskOutcome.ANSWERED);
      }
      // setting the chunks that were used
      askInteractionRepository.save(askInteraction);
        
      chatAnswer chatAnswer = new chatAnswer("-", final_answer);
    
      AiResponse response = new AiResponse(List.of(chatAnswer) , askInteraction.getId(), 1);

      return response;
    }
    */
    // END OF THE COMMENTED PUMP-SPECIFIC VERSION

    // GENERAL VERSION (prompt 2.0): the technician's assistant for any pump, whatever the library holds.
    // The question is searched as typed over the whole shared library; the task's equipment is passed to the
    // model as context only, since no PHOVA pump has its own manual to narrow the search to. The model answers
    // from the excerpts first and from general centrifugal-pump practice where they are silent, marking which
    // is which, and never inventing a figure.
    // 2.2 (plan_pump_manuals.md, part A): the model cites each excerpt it takes a fact from, « [2] », instead of
    // writing « sources : » / « chunks : » lines; the server builds the sources from those numbers
    // (AnswerCitations) and still ends the text with a « sources : » line for the mobile app.
    // 2.3 (part C): the pump's model comes from the screen or the task's equipment; its spec sheet is always the first
    // excerpt; the search follows the scope (MANUALS: the model's documents and the general ones; NO_MANUAL,
    // NO_MODEL: the whole library); each excerpt's header says what it is to that model; the server labels the
    // figures that are not the model's own (AnswerFigures).
    static final String GENERAL_PROMPT_VERSION = "2.3";
    static final int GENERAL_CHUNKS = 10;
    static final String GENERAL_SYSTEM_PROMPT = """
    Tu es l'assistant technique des techniciens de PHOVA, atelier de maintenance de pompes centrifuges
    (pompes de process : acide phosphorique, pulpe de phosphate, eau de mer ; sites de Jorf et de Safi).
    Modèles PHOVA : OTW, OTC, OTS, PHB2, PHB3, PHH. Le technicien te pose sa question sur son téléphone,
    souvent dictée sur chantier : elle peut être courte, mal orthographiée ou mal transcrite. Lis-la dans
    son sens technique le plus plausible et réponds à ce sens, sans jamais refuser pour une question de
    forme.

    CE QUE TU REÇOIS
    - « Équipement de la tâche » (s'il est donné) : la pompe sur laquelle il travaille. Le préfixe de la
      désignation est le modèle, la suite le site et le numéro (OTW-JORF-01 : une OTW de Jorf).
    - « Modèle de la pompe » : le modèle PHOVA de cette pompe, s'il est connu, et d'où viennent les extraits.
    - Des extraits de la bibliothèque partagée, numérotés [1], [2]… : manuels de pompes comparables (souvent d'autres
      fabricants), normes, procédures et rapports PHOVA. Ils sont triés par proximité avec la question,
      pas par pertinence réelle : ignore ceux qui ne traitent pas du sujet. L'en-tête de chaque extrait dit
      ce qu'il est pour ce modèle : sa fiche technique PHOVA, qui fait foi pour ses caractéristiques ; un
      document PHOVA sur lui ; le manuel d'une pompe comparable ; la documentation d'un autre modèle ; ou la
      documentation générale. Une valeur d'un manuel comparable ou d'un autre modèle n'est pas celle de la
      pompe : dis-le dans la phrase où tu l'écris.
    - La question.

    D'OÙ VIENT TA RÉPONSE
    1. D'abord les extraits. Rassemble une réponse répartie sur plusieurs extraits. Les tableaux arrivent
       aplatis sur une ligne : lis chaque valeur par sa position sous l'en-tête de colonne.
    2. Là où les extraits ne disent rien, les bonnes pratiques générales de maintenance des pompes
       centrifuges, celles qu'un chef d'atelier expérimenté donnerait. Signale-les par « (pratique
       générale) » pour que le technicien sache qu'aucun document PHOVA ne les confirme.
    3. Jamais de chiffre inventé : c'est la règle la plus importante. Tolérance, jeu, couple de serrage,
       faux rond, pression d'épreuve, intervalle de graissage, référence ou code de pièce : uniquement s'il
       figure dans un extrait, recopié tel quel avec son unité et suivi du numéro de l'extrait. Pas de valeur
       « habituelle », « typique » ou « en général », pas de plage (« 0,1 à 0,3 mm ») : ce sont des chiffres
       inventés, même suivis de « à valider ». S'il vient du manuel d'une autre pompe, dis-le (« valeur du
       manuel AHLSTAR, à confirmer pour une OTW »). S'il n'est dans aucun extrait, dis-le en une phrase, dis
       où le trouver (plan ou fiche constructeur, bureau d'études, responsable qualité) et explique comment
       le mesurer. Une conformité se juge sur une tolérance documentée, jamais sur une estimation.
    Les bons instruments : un jeu (roue / flasque, bague d'usure, palier / arbre) se mesure aux cales
    d'épaisseur ou au comparateur ; un faux rond, un déplacement radial ou axial au comparateur ; un
    diamètre d'arbre ou de portée au micromètre ; un alésage à l'alésomètre ou au micromètre d'intérieur.
    Le pied à coulisse ne sert pas à mesurer un jeu.

    CE QU'IL TE DEMANDE, ET CE QU'IL LUI FAUT
    - Un symptôme ou une panne (vibration, fuite à la garniture, échauffement des roulements, bruit de
      cavitation, débit ou pression insuffisants…) : les causes probables, de la plus fréquente à la plus
      rare, puis pour chacune le contrôle qui la confirme ou l'écarte.
    - Un contrôle ou une inspection : quoi regarder, avec quel instrument (comparateur, micromètre,
      cales, pied à coulisse…), où le placer, combien de prises, et ce qui rend la pièce non conforme.
    - Un démontage, une réparation, un remontage : les étapes dans l'ordre, numérotées, avec les points
      où l'on se trompe le plus souvent (sens de montage, appairage des roulements, réglage du jeu
      hydraulique, propreté des faces de garniture).
    - Une sécurité : avant toute intervention sur une pompe, consignation électrique et process, vidange,
      décompression, rinçage si le fluide est acide ou abrasif, EPI adaptés. Rappelle-le en une ligne
      quand la question mène à ouvrir ou à démonter la pompe, pas à chaque réponse.

    LES RAPPORTS QU'IL REMPLIT DANS L'APPLICATION
    Ne confonds jamais ces deux rapports : l'un ne s'appelle pas comme l'autre.
    - Rapport d'expertise : la pompe d'un client, reçue pour réparation.
      Démontage : 01 Informations générales, 02 Pompe réceptionnée, 03 Inspection des pièces (corps,
      roue, palier, roulements, arbre, flasques, déflecteur, autres), 04 Contrôles géométriques,
      05 Contrôles dimensionnels (arbre et palier : jeux, concentricité), 06 Garniture mécanique (face
      stationnaire, face rotative, chemise, couvercle), 07 Synthèse des pièces (quantité, code,
      recommandation, décision client, remarque).
      Montage : 08 Pièces changées / réparées, 09 Commentaires supplémentaires, 10 Pompe assemblée,
      11 Contrôle de montage.
      Pour chaque pièce : photos titrées, constats cochés (Bon état, Corrosion, Fissures, ou « Autre »),
      commentaire, et une recommandation : Nettoyage + réutilisation, Réparation + réutilisation ou
      Remplacement.
    - Rapport d'assemblage pompe (RASSN-02) : une pompe neuve que PHOVA fabrique et assemble, sur ordre
      de fabrication. Informations générales (ordre de fabrication, identification pompe), Pompe
      assemblée, Contrôles dimensionnels (jeux palier / arbre J1 à J4, concentricités C1 à C5), une page
      par pièce assemblée (photo, commentaire, conformité, n° de série), Contrôles géométriques (faux rond
      de l'arbre, déplacements radial et axial, perpendicularité et concentricité arbre / chaise, jeu
      hydraulique J et X), Contrôle de montage, Points à améliorer.
    - Fiches de contrôle qualité (contrôle par échantillonnage, contrôle usinage, ressuage, épreuve
      hydrostatique) et tickets non-conformité, réclamation client, dérogation, réclamation fournisseur.
    Pour l'aider à remplir, dans cet ordre :
    1. L'endroit exact : le rapport, la rubrique et la page (« Rapport d'expertise, 03 Inspection des
       pièces, page Roue »). Si l'équipement ne dit pas s'il s'agit d'une expertise ou d'un assemblage,
       une pièce constatée usée ou abîmée relève de l'expertise.
    2. Ce qu'il coche (le constat de la liste : Corrosion, Fissures…) et, si le cas n'y est pas, « Autre ».
    3. Un modèle de commentaire comme il s'écrit dans un rapport : pièce, défaut, emplacement, étendue,
       mesure. Ce que tu ne sais pas, laisse-le entre crochets à compléter (« [emplacement : aubes, flasque
       avant…] », « [profondeur mesurée] ») : n'invente jamais un constat qu'il n'a pas décrit.
    4. Les recommandations possibles et ce qui fait pencher vers chacune ; ne choisis pas à sa place
       quand cela dépend de ce qu'il a vu.
    Dans l'inspection d'un rapport d'expertise, une pièce n'est pas « conforme » ou « non conforme » :
    elle a des constats et une recommandation. Conforme / Non conforme sert aux contrôles (géométriques,
    de montage, du rapport d'assemblage) et aux fiches de contrôle ; là, une valeur hors tolérance ou
    douteuse est « Non conforme » avec une remarque obligatoire qui dit pourquoi. Une mesure se fait en
    plusieurs prises (l'application calcule la moyenne), avec son unité. Ne présente jamais une
    recommandation comme une décision : la décision appartient au client ou au responsable.

    FORME DE LA RÉPONSE
    Réponds dans la langue de la question (français par défaut). Texte simple, lu sur un téléphone : pas
    de titres, pas de gras, pas de tableau, pas de markdown. Commence par la réponse elle-même, sans
    reformuler la question. Étapes numérotées « 1. », listes avec « - ». Une dizaine de lignes au plus,
    sauf pour une procédure qui en demande davantage. Si une information indispensable manque (le
    modèle, la pièce, la mesure relevée), réponds avec ce que tu as et pose à la fin une seule question
    pour préciser.

    CITE TES EXTRAITS
    Chaque fait tiré d'un extrait est suivi, dans la même phrase ou la même ligne, du numéro de cet
    extrait entre crochets : « Vidanger toutes les 4000 heures [2]. » Plusieurs extraits : [2][5]. Ce qui
    vient de la pratique générale n'a pas de numéro. Ne termine par aucune liste de sources, de fichiers
    ou d'extraits : l'application affiche les sources à partir de ces numéros.

    QUAND LA QUESTION N'A RIEN À VOIR
    Si la question ne concerne ni les pompes, ni la maintenance, ni la mécanique, ni la sécurité au
    travail, ni l'atelier, ni les rapports de l'application (par exemple la capitale de la France),
    réponds exactement :
    null
    Quatre lettres minuscules et rien d'autre. Une question de maintenance à laquelle les documents ne
    répondent pas n'est jamais un cas de null : réponds-y avec la pratique générale.
    """;

    public AiResponse answerGeneralWithAiRag(AskRequest request, String userId)
    {
      String question = request.question();
      String equipment = request.equipment() == null || request.equipment().isBlank() ? null : request.equipment().trim();

      // the pump's model: chosen on the « Assistant » page, else the equipment's (registry, then its code)
      ResolvedModel resolved = pumpDocumentService.resolveFor(request.pumpModel(), equipment);
      PumpType model = resolved == null ? null : resolved.model();
      ModelDocs docs = model == null ? null : pumpDocumentService.docsOf(model);
      AskScope scope = model == null ? AskScope.NO_MODEL : docs.hasManuals() ? AskScope.MANUALS : AskScope.NO_MANUAL;

      AskInteraction askInteraction = new AskInteraction();
      askInteraction.setUserId(userId);
      askInteraction.setQuestionRaw(question);
      askInteraction.setQuestionNormalised(question);
      askInteraction.setPromptVersion(GENERAL_PROMPT_VERSION);
      askInteraction.setPump(equipment);
      askInteraction.setScope(scope);
      askInteraction.setPumpModel(model == null ? null : model.name());

      String embeddingLiteral = self.questionEmbedding(question);
      // the model's spec sheet first, whatever the question (§5); then the search, by scope: the model's documents
      // and the general ones (MANUALS), or the whole shared library, whoever uploaded it
      List<ChunkMatch> pinned = docs == null || docs.specFileId() == null
          ? List.of() : chunkRepository.findChunksOfFile(embeddingLiteral, docs.specFileId());
      List<ChunkMatch> found = scope == AskScope.MANUALS
          ? chunkRepository.findSimilarChunksForModel(embeddingLiteral, GENERAL_CHUNKS, model.name())
          : chunkRepository.findSimilarSharedChunks(embeddingLiteral, GENERAL_CHUNKS);
      List<ChunkMatch> relevantChunks = new ArrayList<>(pinned);
      for (ChunkMatch chunk : found)
        if (relevantChunks.size() < Math.max(GENERAL_CHUNKS, pinned.size())
            && relevantChunks.stream().noneMatch(c -> c.getId().equals(chunk.getId())))
          relevantChunks.add(chunk);

      Map<String, ExcerptDocument> documents = describeDocuments(relevantChunks, model);
      // an excerpt whose document no longer exists (deleted while it was being embedded) is left out
      relevantChunks.removeIf(c -> !documents.containsKey(c.getFileId()));
      askInteraction.setSources(relevantChunks.stream()
          .map(c -> new RetrievedSource(c.getId(), documents.get(c.getFileId()).title(), c.getDistance()))
          .collect(Collectors.toList()));

      // An empty library is no longer a 404: the model answers from general practice and says so.
      String excerpts = relevantChunks.isEmpty()
          ? "(aucun extrait : la bibliothèque est vide)"
          : IntStream.range(0, relevantChunks.size())
              // numbered from 1, the number the model writes after a fact taken from it (« [2] »); the header says
              // what the document is to the pump's model
              .mapToObj(i -> {
                ExcerptDocument d = documents.get(relevantChunks.get(i).getFileId());
                return "--- Extrait [" + (i + 1) + "] · fichier : " + d.title() + " · " + headerOf(d, model) + " ---\n"
                    + relevantChunks.get(i).getChunkText();
              })
              .collect(Collectors.joining("\n\n"));
      String userPrompt = """
          Équipement de la tâche : %s
          Modèle de la pompe : %s

          Extraits de la bibliothèque :
          %s

          Question : %s
          """.formatted(equipment == null ? "non précisé" : equipment, modelLine(resolved, model, scope), excerpts, question);

      String answer = self.getAnswer(userPrompt, GENERAL_SYSTEM_PROMPT);
      String known = question + " " + (equipment == null ? "" : equipment);
      AiResponse response = recordAnswer(answer, relevantChunks, documents, model, known, askInteraction);
      askInteractionRepository.save(askInteraction);
      return new AiResponse(response.answer(), askInteraction.getId(), 1, response.sources(), response.generalPractice(),
          scope.name(), model == null ? null : model.name(), response.warnings());
    }

    // ---- what each document sent is to the pump's model (plan_pump_manuals.md §6) ----

    // SPEC its spec sheet, OWN a PHOVA document on it, COMPARABLE a comparable pump's manual ticked for it, OTHER
    // ticked only for other models (or, with no model known, for some model: `models` says which), GENERAL ticked for
    // no model
    enum Relation { SPEC, OWN, COMPARABLE, OTHER, GENERAL }

    // linkKind: for OTHER, what the document is to the models it is ticked for (SPEC their sheet, OWN a PHOVA document,
    // COMPARABLE a comparable pump's manual): a comparable manual's value must not read as that model's either
    record ExcerptDocument(String fileId, String title, Relation relation, List<PumpType> models, DocumentKind linkKind) {}

    private Map<String, ExcerptDocument> describeDocuments(List<ChunkMatch> chunks, PumpType model)
    {
      if (chunks.isEmpty())
        return Map.of();
      java.util.Set<String> fileIds = chunks.stream().map(ChunkMatch::getFileId).collect(Collectors.toSet());
      Map<String, String> names = documentService.getFileNames(fileIds);
      Map<String, List<ModelLink>> links = pumpDocumentService.linksOf(fileIds);
      Map<String, ExcerptDocument> out = new java.util.HashMap<>();
      for (String fileId : fileIds)
        if (names.containsKey(fileId))
          out.put(fileId, relationOf(fileId, names.get(fileId), links.getOrDefault(fileId, List.of()), model));
      return out;
    }

    static ExcerptDocument relationOf(String fileId, String title, List<ModelLink> links, PumpType model)
    {
      if (links.isEmpty())
        return new ExcerptDocument(fileId, title, Relation.GENERAL, List.of(), null);
      List<PumpType> models = links.stream().map(ModelLink::model).distinct().toList();
      if (model != null)
        for (ModelLink link : links)
          if (link.model() == model)
            return new ExcerptDocument(fileId, title, switch (link.kind()) {
              case SPEC -> Relation.SPEC;
              case OWN -> Relation.OWN;
              case COMPARABLE -> Relation.COMPARABLE;
            }, models, link.kind());
      // ticked for other models only: what it is to them, its strongest tie first (a sheet, then PHOVA's, then comparable)
      DocumentKind kind = links.stream().map(ModelLink::kind).min(java.util.Comparator.naturalOrder()).orElse(DocumentKind.COMPARABLE);
      return new ExcerptDocument(fileId, title, Relation.OTHER, models, kind);
    }

    private static String headerOf(ExcerptDocument d, PumpType model)
    {
      String others = d.models().stream().map(PumpType::name).collect(Collectors.joining(", "));
      return switch (d.relation()) {
        case SPEC -> "fiche technique PHOVA du modèle " + model;
        case OWN -> "document PHOVA sur le modèle " + model;
        case COMPARABLE -> "manuel d'une pompe comparable au modèle " + model + " : ses valeurs ne sont pas celles du modèle " + model;
        case OTHER -> (switch (d.linkKind() == null ? DocumentKind.OWN : d.linkKind()) {
              case SPEC -> "fiche technique PHOVA du modèle " + others;
              case OWN -> "documentation du modèle " + others;
              case COMPARABLE -> "manuel d'une pompe comparable au modèle " + others + " : ses valeurs ne sont pas celles du modèle " + others;
            }) + (model == null ? "" : ", pas du modèle " + model);
        case GENERAL -> "documentation générale";
      };
    }

    private static String modelLine(ResolvedModel resolved, PumpType model, AskScope scope)
    {
      if (model == null)
        return "non précisé. Les extraits viennent de toute la bibliothèque ; l'en-tête de chacun dit de quel modèle il parle.";
      String from = "CHOSEN".equals(resolved.source()) ? "choisi par le technicien" : "d'après l'équipement " + resolved.equipment();
      return model + " (" + from + "). " + (scope == AskScope.MANUALS
          ? "Les extraits viennent de sa fiche technique, des documents rattachés à ce modèle et de la documentation générale."
          : "Aucun manuel n'est rattaché à ce modèle : après sa fiche technique, les extraits viennent de toute la bibliothèque, "
            + "y compris de la documentation d'autres modèles.");
    }

    // what the closing « sources : » line says when no document was used
    static final String GENERAL_PRACTICE_SOURCE = "connaissances générales";
    private static final ObjectMapper JSON = new ObjectMapper();

    // Reads the model's reply into the interaction and builds what the technician sees:
    //   "null"        → NO_ANSWER, shown as is;
    //   otherwise     → the text without the « [n] » markers, the sources from the excerpts cited (one per
    //                   document, in the order first cited, with what each is to the pump's model), usedChunk set on
    //                   each excerpt sent, a closing « sources : » line written by the server for the mobile app (the
    //                   web reads `sources`), and the server's warnings (§6).
    // A model that cites nothing but still writes a « sources : » line (prompt 2.1's habit): the names on it are
    // matched to the titles of the excerpts sent; a name that matches none (« fichier1 ») is dropped.
    // generalPractice: no document used, or the answer says « (pratique générale) » somewhere.
    // known: the question and the equipment, whose numbers aren't the answer's figures.
    // The id and answerCount of the returned AiResponse are left to the caller.
    static AiResponse recordAnswer(String answer, List<ChunkMatch> excerpts, Map<String, ExcerptDocument> documents,
        PumpType model, String known, AskInteraction askInteraction)
    {
      if (answer.trim().equals("null"))
      {
        askInteraction.setAnswer("null");
        askInteraction.setAskOutcome(AskOutcome.NO_ANSWER);
        return new AiResponse(List.of(new chatAnswer("-", "null")), null, 1);
      }
      AnswerCitations.Parsed parsed = AnswerCitations.parse(answer, excerpts.size());

      // file ids in the order the answer first used them
      LinkedHashSet<String> usedFiles = new LinkedHashSet<>();
      List<RetrievedSource> sent = askInteraction.getSources();
      if (!parsed.cited().isEmpty())
      {
        parsed.cited().forEach(i -> usedFiles.add(excerpts.get(i).getFileId()));
        for (int i = 0; i < sent.size(); i++)
          sent.get(i).setUsedChunk(parsed.cited().contains(i));
      }
      else if (parsed.modelSources() != null)
        for (String name : parsed.modelSources().split(","))
        {
          String wanted = name.strip().toLowerCase();
          if (wanted.isEmpty() || wanted.contains(GENERAL_PRACTICE_SOURCE))
            continue;
          excerpts.stream()
              .map(ChunkMatch::getFileId)
              .filter(id -> sameTitle(documents.get(id).title(), wanted))
              .findFirst()
              .ifPresent(usedFiles::add);
        }

      List<AiResponse.Source> sources = usedFiles.stream()
          .map(documents::get)
          .map(d -> new AiResponse.Source(d.fileId(), d.title(), d.relation().name(), names(d.models())))
          .collect(Collectors.toList());
      boolean generalPractice = sources.isEmpty() || parsed.text().toLowerCase().contains("(pratique générale)");
      List<AiResponse.Warning> warnings = warningsFor(parsed, excerpts, documents, known);
      String closing = "sources : " + (sources.isEmpty()
          ? GENERAL_PRACTICE_SOURCE
          : sources.stream().map(AiResponse.Source::title).collect(Collectors.joining(", ")));
      String shown = parsed.text() + "\n" + closing;

      askInteraction.setAnswer(shown);
      askInteraction.setAskOutcome(AskOutcome.ANSWERED);
      try {
        askInteraction.setWarnings(warnings.isEmpty() ? null : JSON.writeValueAsString(warnings));
      }
      catch (JsonProcessingException ex) {
        System.out.println("warnings not saved : " + ex.getMessage());
      }
      return new AiResponse(List.of(new chatAnswer("-", shown)), null, 1, sources, generalPractice,
          null, model == null ? null : model.name(), warnings);
    }

    // The labels the server puts on the answer (§6), whatever the model wrote:
    //   - each figure of the answer is looked up in the excerpts sent: found in the pump's own documents (its sheet,
    //     PHOVA's) or in the general documentation, no label; found only in a comparable pump's manual or another
    //     model's documentation, labelled with that document (a cited one first); found nowhere, UNDOCUMENTED;
    //   - a cited document that isn't the pump's own is labelled even without a figure (a procedure taken from it).
    static List<AiResponse.Warning> warningsFor(AnswerCitations.Parsed parsed, List<ChunkMatch> excerpts,
        Map<String, ExcerptDocument> documents, String known)
    {
      Map<String, List<String>> figuresByFile = new java.util.LinkedHashMap<>();
      List<String> undocumented = new ArrayList<>();
      for (AnswerFigures.Figure figure : AnswerFigures.in(parsed.text(), known))
      {
        List<Integer> holders = IntStream.range(0, excerpts.size())
            .filter(i -> AnswerFigures.states(excerpts.get(i).getChunkText(), figure))
            .boxed().toList();
        if (holders.isEmpty())
        {
          undocumented.add(figure.shown());
          continue;
        }
        boolean ownOrGeneral = holders.stream().map(i -> documents.get(excerpts.get(i).getFileId()).relation())
            .anyMatch(r -> r == Relation.SPEC || r == Relation.OWN || r == Relation.GENERAL);
        if (ownOrGeneral)
          continue;
        int holder = holders.stream().filter(parsed.cited()::contains).findFirst().orElse(holders.get(0));
        figuresByFile.computeIfAbsent(excerpts.get(holder).getFileId(), id -> new ArrayList<>()).add(figure.shown());
      }
      for (int i : parsed.cited())
      {
        ExcerptDocument d = documents.get(excerpts.get(i).getFileId());
        if (d.relation() == Relation.COMPARABLE || d.relation() == Relation.OTHER)
          figuresByFile.putIfAbsent(d.fileId(), new ArrayList<>());
      }
      List<AiResponse.Warning> warnings = new ArrayList<>();
      figuresByFile.forEach((fileId, figures) -> {
        ExcerptDocument d = documents.get(fileId);
        warnings.add(new AiResponse.Warning(d.relation().name(), figures, d.title(), d.fileId(), names(d.models()),
            d.relation() == Relation.OTHER && d.linkKind() != null ? d.linkKind().name() : null));
      });
      if (!undocumented.isEmpty())
        warnings.add(new AiResponse.Warning("UNDOCUMENTED", undocumented, null, null, List.of()));
      return warnings;
    }

    private static List<String> names(List<PumpType> models)
    {
      return models.stream().map(PumpType::name).toList();
    }

    // « AHLSTAR.pdf », « AHLSTAR » and « ahlstar.PDF » name the same document; « fichier1 » names none
    private static boolean sameTitle(String title, String wanted)
    {
      String a = title.toLowerCase().replaceFirst("\\.(pdf|txt|md|csv|xlsx?)$", "").strip();
      String b = wanted.replaceFirst("\\.(pdf|txt|md|csv|xlsx?)$", "").strip();
      return !a.isEmpty() && a.equals(b);
    }

    // /api/v1/ask: the general version for now (answerPhovaWithAiRag above, commented out, is the specific one)
    public AiResponse answerWithAiRag(AskRequest request,
        String userId)
    {
      System.out.println("answer with ai rag called");

      AiResponse response = answerGeneralWithAiRag(request, userId);

      return response;
        /*
        ragMetrics.incrementAsk();
        System.out.println("ask service called");
        // here any exception should be thrown and handled by spring
        String embeddingLiteral = self.questionEmbedding(request.question());
        // 12 rather than 5: a book runs to thousands of 500-word chunks, and five
        // of them is far too thin a slice to answer a broad question from.
        List<ChunkMatch> relevantChunks = (request.fileId() != null && !request.fileId().isBlank())
        ? chunkRepository.findSimilarChunksInDocumentWithDistance(userId, embeddingLiteral, 12, request.fileId())
        : chunkRepository.findSimilarChunksWithDistance(userId, embeddingLiteral, 12);
        // Distances tell you whether a "match" is real: near 0 is a strong hit,
        // a top result up around 0.4+ means nothing relevant was found.
        for (ChunkMatch chunk : relevantChunks) {
          String preview = chunk.getChunkText().replace("\n", " ");
          System.out.printf("distance=%.4f  %s%n", chunk.getDistance(),
              preview.substring(0, Math.min(140, preview.length())));
        }
        if (relevantChunks.isEmpty())
            throw new NoChunksException("no relevant document chunks for this question");
        String userPrompt = """
            Context:
            %s

            Question: %s
            """.formatted(relevantChunks.stream()
                .map(c -> "--- From document chunk ---\n" + c.getChunkText())
                .collect(Collectors.joining("\n\n")), request.question());
        String systemPrompt = """
        You are a helpful assistant that answers questions using only the
        provided document context.

        The context is a set of excerpts from the user's own documents, so an
        answer is often spread across several of them rather than stated in one
        place. If the context discusses the subject without defining it in so
        many words, build the answer from what it does say.

        Refuse only when the context is about a different subject entirely -
        then say clearly that the documents do not cover it.

        Never add facts from your own knowledge, and never invent specifics
        (numbers, names, commands) that the context does not contain.
        """;
        String answer = self.getAnswer(userPrompt, systemPrompt);
        return answer;
        */
    }

    // Whisper's prompt is not an instruction — it biases decoding towards the
    // words it contains, so it is written as a sample of what a transcript of
    // these recordings sounds like. That is what stops product codes coming
    // back as "OTW" -> "OTV" or "AHLSTAR" -> "all star". Only the last ~224
    // tokens are used, so this stays a vocabulary list, not prose.
    //
    // Each recording is entirely French or entirely English, so the language is
    // left unset in the options below and Whisper detects it per recording.
    // Both languages are framed here because the prompt has to suit whichever
    // one it turns out to be; the weight sits on the model codes and brand
    // names, which are the same in both and are what Whisper actually gets
    // wrong. Ordinary words like "bearing" or "roulement" it already knows, so
    // listing them would only dilute the bias.
    private static final String TRANSCRIPTION_VOCABULARY = """
        A question about PHOVA Technology pumps: models OTW, OTC, OTS, PHB2,
        PHB3, PHH. Competitor pumps: AHLSTAR by Sulzer, Durco Mark 3, Weir
        Minerals Warman AH, Flowserve HDX, Flowserve DMX, Flowserve HPX.
        Une question sur les pompes PHOVA : OTW, OTC, OTS, PHB2, PHB3, PHH,
        pompe à eau, pompe slurry, garniture mécanique, hauteur manométrique,
        débit, NPSH.
        """;
    
    // Report recordings are French comments from technicians on the reporting
    // platform. Technicians speak in short fragments ("roulement HS, fuite
    // garniture"), not full sentences, so the prompt mimics that and packs in
    // as many technical terms as fit. Kept around ~700 characters, about the
    // 224 tokens Whisper actually reads.
    private static final String TRANSCRIPTION_REPORT_VOCABULARY = """
        Fuite garniture mécanique, suintement presse-étoupe, resserrage tresse.
        Roulement HS côté accouplement, échauffement palier, niveau d'huile bas.
        Vibrations, balourd, désalignement, jeu axial, comparateur. Cavitation,
        désamorçage, purge, crépine colmatée, clapet anti-retour bloqué. Vanne
        d'aspiration, refoulement, manomètre, débit faible. Roue usée, volute
        érodée, plaque d'usure, chemise d'arbre rayée. Joint torique, joint
        spiralé, bride, boulonnerie, couple de serrage, clé dynamométrique,
        extracteur. Moteur, bornier, câble, intensité, isolement mégohmmètre,
        variateur, disjoncteur. Consignation, cadenas, pièce de rechange,
        graissage. RAS, OK, HS.
        """;

    public String transcribeReport(MultipartFile file, String language, String context, String userId)
    {
      System.out.println("transcribeReport service called");
      System.out.println("transcribtion context is : " + context);
      byte[] bytes;
      try {
        bytes = file.getBytes();
      }
      catch (IOException ex) {
        throw new UncheckedIOException("could not read the uploaded audio", ex);
      }
      // Without a language Whisper detects it per request, which is what a mix
      // of French and English questions needs. A caller that knows the language
      // (checklist comments are always French) pins it instead.
      OpenAiAudioTranscriptionOptions.Builder builder = OpenAiAudioTranscriptionOptions.builder()
          .model("whisper-1")
          .prompt(transcriptionReportPrompt(context))
          .temperature(0f);
      if (language != null && !language.isBlank())
        builder.language(language.trim());
      OpenAiAudioTranscriptionOptions options = builder.build();
      AudioTranscriptionResponse response = transcriptionModel
          .call(new AudioTranscriptionPrompt(new ByteArrayResource(bytes), options));
      if (response == null || response.getResult() == null)
        throw new NoAiResultException("transcription model returned no result");
      String text = response.getResult().getOutput();
      System.out.println("transcription : " + text);
      return text;
    }
    // transcritption prompt for report tramscribtion. 
    private static String transcriptionReportPrompt(String context)
    {
      if (context == null || context.isBlank())
        return TRANSCRIPTION_REPORT_VOCABULARY; //MAKE GENERAL PROMPT ABOUT REPORT FIX (FOR CHECKLISTTEMPLATE)
      // SOMETHING LIKE CABLES, TOOLS IDK NOW CONTEXT IS FIXING, REPORTING PUMPS MAINTENANACE ALL IN FRENCH
      String prompt = context.strip();
      return prompt.length() > MAX_PROMPT_CHARS
          ? prompt.substring(prompt.length() - MAX_PROMPT_CHARS)
          : prompt;
    }


    // Whisper takes the raw audio bytes as a multipart upload and hands back the
    // spoken text. It reads m4a, mp3, wav, webm and a few others, and caps the
    // upload at 25MB — spring.servlet.multipart.max-file-size stops us at 20MB
    // first.
    public String transcribe(MultipartFile file, String language, String context, String userId)
    {
      System.out.println("transcribe service called");
      System.out.println("transcribtion context is : " + context);
      byte[] bytes;
      try {
        bytes = file.getBytes();
      }
      catch (IOException ex) {
        throw new UncheckedIOException("could not read the uploaded audio", ex);
      }
      // Without a language Whisper detects it per request, which is what a mix
      // of French and English questions needs. A caller that knows the language
      // (checklist comments are always French) pins it instead.
      OpenAiAudioTranscriptionOptions.Builder builder = OpenAiAudioTranscriptionOptions.builder()
          .model("whisper-1")
          .prompt(transcriptionPrompt(context))
          .temperature(0f);
      if (language != null && !language.isBlank())
        builder.language(language.trim());
      OpenAiAudioTranscriptionOptions options = builder.build();
      AudioTranscriptionResponse response = transcriptionModel
          .call(new AudioTranscriptionPrompt(new ByteArrayResource(bytes), options));
      if (response == null || response.getResult() == null)
        throw new NoAiResultException("transcription model returned no result");
      String text = response.getResult().getOutput();
      System.out.println("transcription : " + text);
      return text;
    }

    // Whisper reads the prompt as the text spoken just before the audio: it
    // steers spelling and vocabulary, and only its last 224 tokens count. A
    // caller's context (e.g. "Checklist du pont roulant. Point 3 : Linguet de
    // sécurité du crochet. Anomalie constatée :") replaces the pump vocabulary,
    // which would only pull a crane comment towards pump words. Cut from the
    // front so the end, the part closest to the audio, survives.
    private static final int MAX_PROMPT_CHARS = 1000;

    private static String transcriptionPrompt(String context)
    {
      if (context == null || context.isBlank())
        return TRANSCRIPTION_VOCABULARY;
      String prompt = context.strip();
      return prompt.length() > MAX_PROMPT_CHARS
          ? prompt.substring(prompt.length() - MAX_PROMPT_CHARS)
          : prompt;
    }

    public String questionImagetoText(MultipartFile file, String userId)
    {
            System.out.println("answer Image service called");
            byte[] bytes;
            try {
                bytes = file.getBytes();
            }
            catch (IOException ex) {
                throw new UncheckedIOException("could not read the uploaded image", ex);
            }
            MimeType  mimeType = MimeType.valueOf(file.getContentType() != null ?
                 file.getContentType() : MediaType.IMAGE_JPEG_VALUE);
            Media image = new Media(mimeType, new ByteArrayResource(bytes));
            String systemPrompt = """
            You are an OCR and text-extraction engine.

            The image contains one or more questions, some of which may be
            multiple-choice. Extract every question exactly as written in the image.
        Rules:
        - Separate questions from each other with a semicolon ';'.
        - Keep the question number exactly as it appears in the image (e.g. "3.",
          "Q4)", "12 -") at the very start of the question text. Do not renumber it
          and do not invent a number for a question that has none.
        - Within a question, separate the question text from each answer choice with
          a pipe '|'. Keep the choices in the order they appear.
        - If the choices are labeled in the image (A), B., 1), i., ...), keep those
          labels exactly as written.
        - If a question's choices have no labels, assign them yourself: A), B), C),
          D), ... in order of appearance, and prefix each choice with its assigned
          label followed by ') ' — for example "A) Red".
        - Label assignment restarts at A) for every question.
        - If a question has no answer choices, output just the question text with no
          pipe.
        - No bullets, no line breaks, no quotes, no commentary, no markdown,
          no preamble.
        - Keep the original language, wording, accents and punctuation, including
          the trailing question mark of each question.
        - If a question or a choice wraps over several lines in the image, join it
          into one (collapse the line break into a single space).
        - Ignore headers, footers, page numbers and general instructions.
        - If a question or a choice itself contains a ';' or a '|', replace it
         with a ','.
        - Trim leading/trailing spaces around each question and each choice.
        - If a checkbox or bubble is marked, do not indicate it — extract the text only.
        - If the image contains no question, return an empty string.

        Example output:
        1. What is the capital of France?|A) Rome|B) Paris|C) Madrid;2. How old are you?;3. Pick a color|A) Red|B) Blue|C) Green
            """;
        Prompt prompt = new Prompt(List.of(
                new SystemMessage(systemPrompt),
                new UserMessage("convert the following image to text", image)),
                OpenAiChatOptions.builder()
                    .temperature(0.0d)
                    .build());

        ChatResponse chatResponse = chatModel.call(prompt);
        String answer = chatResponse.getResult().getOutput().getText();
        System.out.println("Chat response for image conversion :" + answer);
        return answer;
    }    
    
    public String answerImageQuestions(MultipartFile file, String userId)
    {
        String question = questionImagetoText(file, userId);
        List<String> questions = List.of(question.split(";"));
        List<String> embeddingLiterals = new ArrayList<>();
        //embeddingLiteral = self.questionEmbedding(request.question());
        for (String _question : questions)
        {
          if(_question == null || _question.isBlank())
            continue;
          embeddingLiterals.add(self.questionEmbedding(_question));
          System.out.println(_question);
        }
        
        List<DocumentChunks> relevantChunks = new ArrayList<>(); 
        for (String embeddingLiteral : embeddingLiterals)
            relevantChunks.addAll(chunkRepository.findSimilarChunks(userId, embeddingLiteral, 5));
        
        String userPrompt = """
            Context:
            %s
            Question: %s
            """.formatted(relevantChunks.stream()
            .map(c -> "--- From document chunk ---\n" + c.getChunkText())
            .collect(Collectors.joining("\n\n")), question);
        
        String systemPrompt = """
            You are answering exam-style questions using ONLY the document
            excerpts supplied in the user message.

            INPUT FORMAT
            The user message has two parts:
            1. "Context:" — excerpts retrieved from the user's own documents,
               each one introduced by "--- From document chunk ---".
            2. "Question:" — a SINGLE line holding ALL the questions, produced by
               an OCR pass over an image. Parse it like this:
               - Questions are separated from each other by ';'.
               - A question may start with its original number exactly as it was
                 printed ("3.", "Q4)", "12 -"). Some questions have no number.
               - Inside a question, '|' separates the question text from each of
                 its answer choices. Choices keep their labels ("A)", "B.", "1)",
                 "i."), in the order given.
               - A question containing no '|' has no answer choices.
               Example input:
               1. What is the capital of France?|A) Rome|B) Paris|C) Madrid;2. When was the treaty signed?
               -> two questions: the first multiple-choice with three choices,
                  the second a direct question.

            HOW TO ANSWER EACH TYPE

            A. MULTIPLE-CHOICE (the question contains '|'):
               - Choose only from the listed choices. Never invent a choice and
                 never answer with free text instead of a choice.
               - Output the label and the full text of the choice you picked,
                 followed by one short sentence of justification taken from the
                 context.
               - If the wording asks for every correct option, list every correct
                 label; otherwise give exactly one.
               - If the context does not let you decide between the choices,
                 answer exactly: Not answerable from the provided documents.
                 Do not guess just to produce a letter.

            B. DIRECT / OPEN QUESTION (no '|'):
               - Answer in one to three sentences using only facts stated in the
                 context.
               - Prefer the document's own wording, figures and dates; quote a
                 short span when precision matters.
               - If a number, date or list is asked for, state it plainly first,
                 then the supporting detail.
               - If the context does not contain the answer, answer exactly:
                 Not answerable from the provided documents.

            GROUNDING RULES
            - Use only the Context. No outside knowledge, no assumptions, no
              filling in gaps from what is plausible.
            - If two chunks contradict each other, say so and give both readings.
            - Answer in the same language as the question was written in.

            OUTPUT FORMAT
            - Answer every question, in the original order, one per line. Never
              merge two questions and never split one.
            - Begin each line with the question's original number exactly as it
              appeared; if a question had no number, number it by its position.
            - Do not repeat the question text. Do not re-emit ';' or '|'.
            - No preamble, no closing summary, no markdown.

            Example output:
            1. B) Paris - the context names Paris as the seat of the French government.
            2. Not answerable from the provided documents.
            """;
        String answer = self.getAnswer(userPrompt, systemPrompt);
        return answer;
    }
}
