// DataAnalysisService.java
package com.docuMind.backend.services;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

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
    
    @Transactional
    public AnalysisResult analyseAndStore(FileEntity file, MultipartFile rawFile) {
        AnalysisResult result = client.analyse(rawFile);
        
        DataAnalysis analysis = new DataAnalysis();
        analysis.setFileId(file.getId());
        analysis.setUserId(file.getUserId());
        analysis.setAnalysisJson(toJson(result));
        analysis.setTextSummary(result.getTextSummary());
        analysis.setRowCount(result.getShape().getRows());
        analysis.setColCount(result.getShape().getCols());
        repository.save(analysis);
        return result;
    }

    private String toJson(AnalysisResult result) {
        try {
            return objectMapper.writeValueAsString(result);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize analysis result to JSON", e);
        }
    }
}