package com.docuMind.backend.services;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.model.AnalysisResult;
import com.docuMind.backend.model.DataAnalysis;
import com.docuMind.backend.model.DocumentChunks;
import com.docuMind.backend.model.FileContent;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.repository.ChunkRepository;

@Service
public class IngestionService {

    private final ChunkingService chunkingService;
    private final EmbeddingModel embeddingModel;  // Spring AI injects this
    private final ChunkRepository chunkRepository;
    private final DataAnalysisService dataAnalysisService;
    
    public static final String ANSI_RESET = "\u001B[0m";
    public static final String ANSI_GREEN = "\u001B[32m";
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
                            DataAnalysisService dataAnalysisService) {
        this.chunkingService = chunkingService;
        this.embeddingModel = embeddingModel;
        this.chunkRepository = chunkRepository;
        this.dataAnalysisService = dataAnalysisService;
    }


    // Embeddings for a given question never change, so they're cached for a
    // long time (30 days — see RedisCacheConfig). Must be called via `self`,
    // not `this`, or the @Cacheable proxy is bypassed entirely.
    @Cacheable("embeddings")
    public float[] getEmbedding(String question) {
        return embeddingModel.embed(question);
    }

    // The final answer is cached too, but for a much shorter window (15 min —
    // new documents can change what "similar chunks" means for the same question.
    @Cacheable("ragResponses")
    @Transactional(readOnly = true)
    public String answer(String question)
    {
        // transform this string to query
        float[] embedding = self.getEmbedding(question);
        String embeddingLiteral = Arrays.toString(embedding);
        // find similar vectors
        List<DocumentChunks> chunks = chunkRepository.findSimilarChunks("hicham@gmail.com",embeddingLiteral,5);

        return chunks.stream()
            .map(DocumentChunks::getChunkText)
            .collect(Collectors.joining("\n"));
    }

    @Async("ingestionExecutor")
    @Transactional
    public void ingest(FileContent file,  byte[] rawBytes, String originalFilename, String fileExtension,
        FileEntity fileToSave) {
        // 1. Extraction (PDF parsing, or plain text) — the slow, memory-heavy
        //    part that must never run on the upload request thread.
        //FileContent file, byte[] rawBytes,String originalFilename, String fileExtension,
        List<String> chunkies;
        try {
            chunkies = extractChunks(file.getData(), originalFilename, fileExtension,fileToSave);
        } catch (Exception ex) {
            System.out.println("hi");
            System.out.println(ANSI_GREEN + ex.getMessage() + ANSI_RESET);
            return;
        }

        if (chunkies == null || chunkies.isEmpty()) return ;
        // 2. Delete any existing chunks for this file
        //    (handles re-upload of the same document)
        //chunkRepository.deleteByFileId(file.getId());

        // 4. Embed all chunks in one API call (batching = fewer round trips)
        List<float[]> embeddings = embeddingModel
            .embedForResponse(chunkies)
            .getResults()
            .stream()
            .map(r -> r.getOutput())
            .toList();

        List<DocumentChunks> entities = new ArrayList<>();
        for (int i = 0; i < chunkies.size(); i++) {
            DocumentChunks chunk = new DocumentChunks();
            chunk.setFileId(file.getId());
            chunk.setUserEmail(file.getUserEmail());
            chunk.setChunkText(chunkies.get(i));
            chunk.setChunkIndex(i);
            chunk.setEmbedding(embeddings.get(i));
            entities.add(chunk);
        }
        chunkRepository.saveAll(entities);
    }

    private List<String> extractChunks(byte[] rawBytes,String originalFilename, String fileExtension,
        FileEntity fileToSave) throws Exception
    {
        List<String> result = null;
        if (fileExtension.equals("pdf"))
        {
            String extractedText = extractText(fileExtension, rawBytes,  fileToSave,originalFilename);
            result = chunkingService.chunk(extractedText);
        }
        else if (fileExtension.equals("csv")
            || fileExtension.equals("vnd.ms-excel")
            || fileExtension.equals("vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        {
            AnalysisResult dataAnalysis = dataAnalysisService.analyse(fileToSave, rawBytes, originalFilename);
            result = dataAnalysis.getTextChunks();
            System.out.println("gotted chunks from analyse-service: \n" + result);
        }
        else {
            String extractedText =  new String(rawBytes, StandardCharsets.UTF_8);  
            result = chunkingService.chunk(extractedText);
        }
        return result;
    }

    private String extractText(String fileExtension, byte[] rawBytes, FileEntity file, String originalFilename) throws Exception
    {
        PDDocument document = null;
        try {
            document = PDDocument.load(rawBytes);
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(document);
            document.close();
            return text;
            }
        finally{
            if (document != null) {
                document.close();
                }
            }
    }
}
 