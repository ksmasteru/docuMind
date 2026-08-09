// DataAnalysisService.java
package com.docuMind.backend.services;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.docuMind.backend.exception.UserNotFoundException;
import com.docuMind.backend.model.AnalysisResult;
import com.docuMind.backend.model.DataAnalysis;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.repository.DataAnalysisRepository;
import com.docuMind.backend.exception.FileNotFoundException;

@Service
public class DataAnalysisService {

    private final AnalysisServiceClient client;
    private final DataAnalysisRepository repository;
    private final ObjectMapper objectMapper;  // ← inject this

    public DataAnalysisService(AnalysisServiceClient client,
                                DataAnalysisRepository repository,
                                ObjectMapper objectMapper) {
        this.client = client;
        this.repository = repository;
        this.objectMapper = objectMapper;
    }
    
    public DataAnalysis getAnalysis(String fileId)
    {
       return repository.findByFileId(fileId).
       orElseThrow(() -> new FileNotFoundException("file not found with id: " + fileId));
    }
    
    // Used by IngestionService (extractChunks) — it needs the raw AnalysisResult
    // to pull textChunks out of. Also persists a DataAnalysis row as a side
    // effect so GET /{fileId}/analysis (used by the visualizer page) has
    // something to find; previously this method returned without saving
    // anything, which left that endpoint 404ing for every csv/excel upload.
    @Transactional
    public AnalysisResult analyse(FileEntity file, byte[] fileBytes, String originalFilename)
    {
        AnalysisResult result = client.analyse(fileBytes, originalFilename);
        persist(file, result);
        return result;
    }

    @Transactional
    public DataAnalysis analyseAndStore(FileEntity file, byte[] fileBytes, String originalFilename) {
        AnalysisResult result = client.analyse(fileBytes, originalFilename);
        return persist(file, result);
    }

    private DataAnalysis persist(FileEntity file, AnalysisResult result) {
        DataAnalysis analysis = new DataAnalysis();
        analysis.setFileId(file.getId());
        analysis.setUserId(file.getUserId());
        analysis.setAnalysisJson(toJson(result));
        analysis.setTextSummary(result.getTextSummary());
        analysis.setRowCount(result.getShape().getRows());
        analysis.setColCount(result.getShape().getCols());
        return repository.save(analysis);
    }


    private String toJson(AnalysisResult result) {
        try {
            return objectMapper.writeValueAsString(result);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize analysis result to JSON", e);
        }
    }
}