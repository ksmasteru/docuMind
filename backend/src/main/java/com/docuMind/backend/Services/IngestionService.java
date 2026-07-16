package com.docuMind.backend.services;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.stereotype.Service;

import com.docuMind.backend.model.DocumentChunks;
import com.docuMind.backend.model.IngestionStatus;
import com.docuMind.backend.repository.ChunkRepository;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.repository.FileContentRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;

import jakarta.transaction.Transactional;
@Service
public class IngestionService {

    private final ChunkingService chunkingService;
    private final EmbeddingModel embeddingModel;  // Spring AI injects this
    private final ChunkRepository chunkRepository;
    private final DocumentRepository documentRepository;
    private final FileContentRepository fileContentRepository;

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
                           ChunkRepository chunkRepository,
                           DocumentRepository documentRepository,
                           FileContentRepository fileContentRepository) {
        this.chunkingService = chunkingService;
        this.embeddingModel = embeddingModel;
        this.chunkRepository = chunkRepository;
        this.documentRepository = documentRepository;
        this.fileContentRepository = fileContentRepository;
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

    @Async("ingestionExecutor")
    @Transactional
    public void processAndIngest(String fileId, String fileExtension, byte[] rawBytes, String userEmail) {
        try {
            // 1. Extraction (PDF parsing, or plain text) — the slow, CPU-heavy
            //    part that used to block the upload response.
            String text = extractText(fileExtension, rawBytes);
            if (text == null || text.isBlank()) {
                markStatus(fileId, IngestionStatus.FAILED);
                return;
            }

            // Now that we have the text, persist it onto the rows the upload
            // response already returned to the client.
            /*
            documentRepository.findById(fileId).ifPresent(entity -> {
                entity.setContent(text);
                documentRepository.save(entity);
            });*/
            fileContentRepository.findById(fileId).ifPresent(fc -> {
                fc.setContent(text);
                fileContentRepository.save(fc);
            });

            // 2. Delete any existing chunks for this file
            //    (handles re-upload of the same document)
            chunkRepository.deleteByFileId(fileId);

            // 3. Split into chunks
            List<String> chunks = chunkingService.chunk(text);

            // 4. Embed all chunks in one API call (batching = fewer round trips)
            List<float[]> embeddings = embeddingModel
                .embedForResponse(chunks)
                .getResults()
                .stream()
                .map(r -> r.getOutput())
                .toList();

            // 5. Persist each chunk with its embedding
            List<DocumentChunks> entities = new ArrayList<>();
            for (int i = 0; i < chunks.size(); i++) {
                DocumentChunks chunk = new DocumentChunks();
                chunk.setFileId(fileId);
                chunk.setUserEmail(userEmail);
                chunk.setChunkText(chunks.get(i));
                chunk.setChunkIndex(i);
                chunk.setEmbedding(embeddings.get(i));
                entities.add(chunk);
            }
            chunkRepository.saveAll(entities);

            markStatus(fileId, IngestionStatus.READY);
        } catch (Exception ex) {
            markStatus(fileId, IngestionStatus.FAILED);
        }
    }

    private String extractText(String fileExtension, byte[] rawBytes) throws IOException {
        if (fileExtension.equals("pdf")) {
            try (PDDocument pdf = PDDocument.load(new ByteArrayInputStream(rawBytes))) {
                return new PDFTextStripper().getText(pdf);
            }
        }
        return new String(rawBytes, StandardCharsets.UTF_8);
    }

    private void markStatus(String fileId, IngestionStatus status) {
        documentRepository.findById(fileId).ifPresent(entity -> {
            entity.setStatus(status);
            documentRepository.save(entity);
        });
    }
}