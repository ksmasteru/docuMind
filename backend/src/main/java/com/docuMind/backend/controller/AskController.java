package com.docuMind.backend.controller;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.embedding.EmbeddingModel;
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

    public AskController(EmbeddingModel embeddingModel, ChatModel chatModel, ChunkRepository chunkRepository) {
        this.embeddingModel = embeddingModel;
        this.chatModel = chatModel;
        this.chunkRepository = chunkRepository;
    }

    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> ask(
            @RequestBody AskRequest request,
            Authentication authentication) {

        String userId = authentication.getName();

        // 1. Embed the question
        float[] questionEmbedding = embeddingModel
            .embed(request.question());
        String embeddingLiteral = Arrays.toString(questionEmbedding);

        // 2. Retrieve top 5 relevant chunks
        List<DocumentChunks> relevantChunks = chunkRepository
            .findSimilarChunks(userId, embeddingLiteral, 5);

        if (relevantChunks.isEmpty()) {
            return Flux.just("No relevant documents found for your question.");
        }

        // 3. Build context string from retrieved chunks
        String context = relevantChunks.stream()
            .map(c -> "--- From document chunk ---\n" + c.getChunkText())
            .collect(Collectors.joining("\n\n"));

        // 4. Build the prompt
        String systemPrompt = """
            You are a helpful assistant that answers questions
            strictly based on the provided document context.
            If the answer is not in the context, say so clearly.
            Do not make up information.
            """;

        String userPrompt = """
            Context:
            %s

            Question: %s
            """.formatted(context, request.question());

        Prompt prompt = new Prompt(List.of(
            new SystemMessage(systemPrompt),
            new UserMessage(userPrompt)
        ));

        // 5. Stream the response
        return chatModel.stream(prompt)
            .mapNotNull(response -> response.getResult().getOutput().getText());
    }
}

record AskRequest(String question) {}