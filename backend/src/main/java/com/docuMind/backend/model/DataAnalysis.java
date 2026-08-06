package com.docuMind.backend.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "data_analyses")
public class DataAnalysis {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String fileId;

    @Column(nullable = false)
    private String userId;  // owner — lets findByUserIdOrderByCreatedAtDesc list a user's analyses

    @Column(columnDefinition = "TEXT")
    private String analysisJson;  // full JSON from Python service

    @Column(columnDefinition = "TEXT")
    private String textSummary;   // for RAG embedding

    private int rowCount;
    private int colCount;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    // getters/setters

    public String getId() { return id; }

    public void setId(String id) { this.id = id; }

    public String getFileId() { return fileId; }

    public void setFileId(String fileId) { this.fileId = fileId; }

    public String getUserId() { return userId; }

    public void setUserId(String userId) { this.userId = userId; }

    public String getAnalysisJson() { return analysisJson; }

    public void setAnalysisJson(String analysisJson) { this.analysisJson = analysisJson; }

    public String getTextSummary() { return textSummary; }

    public void setTextSummary(String textSummary) { this.textSummary = textSummary; }

    public int getRowCount() { return rowCount; }

    public void setRowCount(int rowCount) { this.rowCount = rowCount; }

    public int getColCount() { return colCount; }

    public void setColCount(int colCount) { this.colCount = colCount; }

    public Instant getCreatedAt() { return createdAt; }

    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}