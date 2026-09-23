package com.docuMind.backend.services;
import java.util.regex.Pattern;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Arrays;
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

import io.micrometer.core.instrument.Timer;

@Service
public class AskService{

    private final EmbeddingModel embeddingModel;
    private final ChatModel chatModel;
    private final ChunkRepository chunkRepository;
    private final RagMetrics ragMetrics;
    private final DocumentService documentService;
    private final OpenAiAudioTranscriptionModel transcriptionModel;
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
            OpenAiAudioTranscriptionModel transcriptionModel)
    {
        this.embeddingModel = embeddingModel; 
        this.chatModel = chatModel;
        this.chunkRepository = chunkRepository;
        this.ragMetrics = ragMetrics;
        this.documentService = documentService;
        this.transcriptionModel = transcriptionModel;
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

    // new : we use competitors data  : if user types in OTW --> look for AHLSTAR
    public String answerPhovaWithAiRag(AskRequest request, String userId)
    {
     // ragMetrics.incrementAsk();
      System.out.println("ask service called");
      List<String> pumps =  List.of("OTW", "OTC", "OTS", "PHB2", "PHB3", "PHH");
      List<String> compPumps = List.of("AHLSTAR", "Durco Mark 3", "Weir Minerals Warman AH", "HDX", "DMX","HPX");
      String question = request.question();
      List<String> matchedPumps = new ArrayList<>();

      for (int i = 0; i < pumps.size(); i++) {
        String pump = pumps.get(i);
        String replacement = compPumps.get(i);
        String regex = "(?i)\\b" + Pattern.quote(pump) + "\\b";
        Pattern pattern = Pattern.compile(regex);
        Matcher matcher = pattern.matcher(question);
        // Check if the user's question contains this pump type
      if (matcher.find()) {
        matchedPumps.add(replacement); // Saves "OTW", "PHB3", etc.
        question = matcher.replaceAll(Matcher.quoteReplacement(replacement));
      }
    }
    System.out.println("replaced question is " + question);

    if (matchedPumps.size() > 1)
    {
      return("Please ask about 1 pump at each question"); 
    }
    int chunksnumber = 12;
    String embeddingLiteral = self.questionEmbedding(question);
      // here we can specefiy wich file to look into ; based on the question
      // make api call or manually ?  
      // api call
      //[[OCW1, OCW2, OCW3], [OTW1, OTW2, OTW3], [PHH1, PHH2, PHH3]]
      // user only allowed one pump type
      List<FileEntity> filesId = matchedPumps.size() == 0 ? null : documentService.searchFile(matchedPumps.get(0));
      List<ChunkMatch> allChunks = new ArrayList<>();
      if (filesId != null)
      {
        for (int i = 0 ; i < filesId.size(); i++)
          allChunks.addAll(chunkRepository.findSimilarChunksInDocumentWithDistance(userId, embeddingLiteral, chunksnumber, filesId.get(i).getId()));
      }
      // A named pump only ever uses its own files: falling back to all documents
      // would let another pump's data answer the question.
      List<ChunkMatch> relevantChunks = matchedPumps.isEmpty()
          ? chunkRepository.findSimilarChunksWithDistance(userId, embeddingLiteral, chunksnumber)
          : allChunks;

      //List<String> docs = new ArrayList<>();
      //for (ChunkMatch chunk : relevantChunks) {
          /*String preview = chunk.getChunkText().replace("\n", " ");
          System.out.printf("distance=%.4f  %s%n", chunk.getDistance(),
              preview.substring(0, Math.min(140, preview.length())));
          */
     //     String doc = documentService.getFileMetaData(chunk.getFileId()).getName();
     //   if (!docs.contains(doc))
     //       docs.add(doc);
     // }
      /*
      String citations = "citations :  ";
      for (String doc : docs)
        citations += doc + " ";
      */
      if (relevantChunks.isEmpty())
            throw new NoChunksException("no relevant document chunks for this question");
      Map<String, String> fileNames = documentService.getFileNames(relevantChunks.stream()
          .map(ChunkMatch::getFileId)
          .collect(Collectors.toSet()));
      String userPrompt = """
          Context:
            %s

            Question: %s
            """.formatted(IntStream.range(0, relevantChunks.size())
                // numbered so the model has an index to cite in its "chunks:" line
                .mapToObj(i -> "--- Chunk " + i + " --- file : " + fileNames.getOrDefault(relevantChunks.get(i).getFileId(), "unknown") + " \n" + relevantChunks.get(i).getChunkText())
                .collect(Collectors.joining("\n\n")), question);
String systemPrompt = """
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

    String answer = self.getAnswer(userPrompt, systemPrompt);
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
    return answer;
    }


    // NOW THE RAG IS SPECEFIC TO PHOVA PUMP QUESTIONS; REVERT THIS FOR NORMAL RAG RESPONSE
    public String answerWithAiRag(AskRequest request,
        String userId)
    {
        System.out.println("answer with ai rag called");
        return answerPhovaWithAiRag(request, userId);
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

    // Whisper takes the raw audio bytes as a multipart upload and hands back the
    // spoken text. It reads m4a, mp3, wav, webm and a few others, and caps the
    // upload at 25MB — spring.servlet.multipart.max-file-size stops us at 20MB
    // first.
    public String transcribe(MultipartFile file, String userId)
    {
      System.out.println("transcribe service called");
      byte[] bytes;
      try {
        bytes = file.getBytes();
      }
      catch (IOException ex) {
        throw new UncheckedIOException("could not read the uploaded audio", ex);
      }
      // No language set on purpose: Whisper detects it per request, which is
      // what a mix of French and English recordings needs.
      OpenAiAudioTranscriptionOptions options = OpenAiAudioTranscriptionOptions.builder()
          .model("whisper-1")
          .prompt(TRANSCRIPTION_VOCABULARY)
          .temperature(0f)
          .build();
      AudioTranscriptionResponse response = transcriptionModel
          .call(new AudioTranscriptionPrompt(new ByteArrayResource(bytes), options));
      if (response == null || response.getResult() == null)
        throw new NoAiResultException("transcription model returned no result");
      String text = response.getResult().getOutput();
      System.out.println("transcription : " + text);
      return text;
    }
    // converts image into text
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
