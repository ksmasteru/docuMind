package com.docuMind.backend.controller;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.DocumentChunks;
import com.docuMind.backend.repository.ChunkRepository;

import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api/v1/ask")
public class AskController {

    private final EmbeddingModel embeddingModel;
    private final ChatModel chatModel;
    private final ChunkRepository chunkRepository;

    // Self-injected proxy: calling questionEmbedding(...) through `self` (instead
    // of a plain call) routes it back through Spring's AOP proxy, which is what
    // actually makes @Cacheable take effect. A direct in-class call bypasses the
    // proxy entirely and silently skips the cache. @Lazy breaks the circular
    // dependency this self-reference would otherwise create during construction.
    @Autowired
    @Lazy
    private AskController self;

    public AskController(EmbeddingModel embeddingModel, ChatModel chatModel, ChunkRepository chunkRepository) {
        this.embeddingModel = embeddingModel;
        this.chatModel = chatModel;
        this.chunkRepository = chunkRepository;
    }

    @Cacheable(value = "ragResponses", key = "T(org.apache.commons.codec.digest.DigestUtils).sha256Hex(#text)")
    public String getAnswer(String text)
    {
        System.out.println("get answer method called : nno chaching !! ");
        String systemPrompt = """
        You are a helpful assistant that answers questions
        strictly based on the provided document context.
        If the answer is not in the context, say so clearly.
        Do not make up information.
        """;

        Prompt prompt = new Prompt(List.of(
            new SystemMessage(systemPrompt),
            new UserMessage(text)
        ));

        ChatResponse chatResponse = chatModel.call(prompt);
        return chatResponse.getResult().getOutput().getText();
    }

    @Cacheable(value = "embeddings", key = "T(org.apache.commons.codec.digest.DigestUtils).sha256Hex(#text)")
    public String questionEmbedding(String text) {
        System.out.println("questionEmedding method called no cache for :" + text);
        float[] embedding = embeddingModel.embed(text);
        return Arrays.toString(embedding);
    }

    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> ask(
            @RequestBody AskRequest request,
            Authentication authentication) {

        System.out.println("ask controller ask called");
        String userId = authentication.getName();

        // 1. Embed the question
        // caching -- we cache this function
        String embeddingLiteral = "";
        try{
            embeddingLiteral = self.questionEmbedding(request.question());
        }
        catch(Exception ex)
        {
            System.out.println(ex.getMessage());
            embeddingLiteral = Arrays.toString(embeddingModel.embed(request.question()));
        } 
        // 2. Retrieve top 5 relevant chunks
        List<DocumentChunks> relevantChunks = chunkRepository
            .findSimilarChunks(userId, embeddingLiteral, 5);

        if (relevantChunks.isEmpty()) {
            return Flux.just("No relevant documents found for your question.");
        }
        String userPrompt = """
            Context:
            %s

            Question: %s
            """.formatted(relevantChunks.stream()
                .map(c -> "--- From document chunk ---\n" + c.getChunkText())
                .collect(Collectors.joining("\n\n")), request.question());
        String answer = "";
        try {
            answer = self.getAnswer(userPrompt);
        }
        catch (Exception ex)
        {
            System.out.println(ex.getMessage());
            String systemPrompt = """
            You are a helpful assistant that answers questions
            strictly based on the provided document context.
            If the answer is not in the context, say so clearly.
            Do not make up information.
            """;
            Prompt prompt = new Prompt(List.of(
                new SystemMessage(systemPrompt),
                new UserMessage(userPrompt)
            ));
            ChatResponse chatResponse = chatModel.call(prompt);
            answer = chatResponse.getResult().getOutput().getText();
        }

        return Flux.just(answer);
    }
}

record AskRequest(String question) {}