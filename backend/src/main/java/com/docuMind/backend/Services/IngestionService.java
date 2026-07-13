package com.docuMind.backend.services;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.stereotype.Service;

import com.docuMind.backend.model.DocumentChunks;
import com.docuMind.backend.model.FileContent;
import com.docuMind.backend.repository.ChunkRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;

import jakarta.transaction.Transactional;
@Service
public class IngestionService {

    private final ChunkingService chunkingService;
    private final EmbeddingModel embeddingModel;  // Spring AI injects this
    private final ChunkRepository chunkRepository;

    // Self-injected proxy: calling getEmbedding(...) through `self` (instead of
    // `this`) routes the call back through Spring's AOP proxy, which is what
    // actually makes @Cacheable take effect. A plain `this.getEmbedding(...)`
    // call bypasses the proxy entirely and silently skips the cache.
    // @Lazy breaks the circular dependency this self-reference would otherwise
    // create during bean construction.
    @Autowired
    @Lazy
    private IngestionService self;

        public IngestionService(ChunkingService chunkingService,
                           EmbeddingModel embeddingModel,
                           ChunkRepository chunkRepository) {
        this.chunkingService = chunkingService;
        this.embeddingModel = embeddingModel;
        this.chunkRepository = chunkRepository;
    }
 

    @Transactional
    public String answer(String question)
    {
        // transform this string to query
        float[] embedding = embeddingModel.embed(question);
        String embeddingLiteral = Arrays.toString(embedding);
        // find similar vectors
        List<DocumentChunks> chunks = chunkRepository.findSimilarChunks("hicham@gmail.com",embeddingLiteral,5);

        return chunks.stream()
            .map(DocumentChunks::getChunkText)
            .collect(Collectors.joining("\n"));
    }

    @Transactional
    public void ingest(FileContent file) {
        // 1. Get the extracted text from FileEntity.content
        String text = file.getContent();
        if (text == null || text.isBlank()) return;

        // 2. Delete any existing chunks for this file
        //    (handles re-upload of the same document)
        chunkRepository.deleteByFileId(file.getId());

        // 3. Split into chunks
        List<String> chunks = chunkingService.chunk(text);

        // 4. Embed all chunks in one API call (batching = fewer round trips)
        List<float[]> embeddings = embeddingModel
            .embedForResponse(chunks)
            .getResults()
            .stream()
            .map(r -> r.getOutput())
            .toList();

        System.out.println("Ai response is  : " + embeddings);
        // 5. Persist each chunk with its embedding
        List<DocumentChunks> entities = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            DocumentChunks chunk = new DocumentChunks();
            chunk.setFileId(file.getId());
            chunk.setUserEmail(file.getUserEmail());
            chunk.setChunkText(chunks.get(i));
            chunk.setChunkIndex(i);
            chunk.setEmbedding(embeddings.get(i));
            entities.add(chunk);
        }
        chunkRepository.saveAll(entities);
    }
}