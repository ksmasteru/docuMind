package com.docuMind.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

// One chunk that retrieval used for an answer, kept paired with its file.
@Embeddable
public class RetrievedSource {

    @Column(nullable = false)
    private String chunkId;

    @Column(nullable = false)
    private String fileName;

    // cosine distance from the question (pgvector <=>): near 0 is a strong
    // match, higher means the chunk was only the least-unrelated one found
    @Column(nullable = false)
    private double distance;

    @Column
    private Boolean usedChunk;
    public RetrievedSource() {}

    public RetrievedSource(String chunkId, String fileName, double distance) {
        this.chunkId = chunkId;
        this.fileName = fileName;
        this.distance = distance;
    }

    public String getChunkId()             { return chunkId; }
    public void setChunkId(String c)       { this.chunkId = c; }
    public String getFileName()            { return fileName; }
    public void setFileName(String f)      { this.fileName = f; }
    public double getDistance()            { return distance; }
    public void setDistance(double d)      { this.distance = d; }
    public void setUsedChunk(Boolean used) { this.usedChunk = used;}
    public Boolean getUsedChunk() {return this.usedChunk; }
}
