package com.docuMind.backend.model;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "files", indexes = {
    // Replaces MongoDB's @Indexed on userId
    @Index(name = "idx_files_user_id", columnList = "userId")
})

public class FileEntity {

    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String generatedName;

    @Column(nullable = false)
    private String contentType;

    @Column(nullable = false)
    private long size;

    // email..
    @Column(nullable = false)
    private String userId;

    // Extracted text content — this is the field phase 2 will chunk
    // and embed. Stored as TEXT (no length limit) in Postgres.
    @Column(columnDefinition = "TEXT")
    private String content;

    // No byte[] data here — that lives in FileContent now.

    // Ingestion (chunking + embedding) runs async after the upload response
    // is already sent, so the frontend needs this to know when a file
    // actually becomes searchable/askable.
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IngestionStatus status = IngestionStatus.PENDING;

    public FileEntity() {}

    public FileEntity(String name, String contentType, long size,
                      String userId, String content) {
        this.id = UUID.randomUUID().toString();
        this.name = name;
        this.contentType = contentType;
        this.generatedName = this.id + "_" + name;
        this.size = size;
        this.userId = userId;
        this.content = content;
    }

    public String getId()           { return id; }
    public void setId(String id)    { this.id = id; }
    public String getName()         { return name; }
    public void setName(String n)   { this.name = n; }
    public String getGeneratedName(){ return generatedName; }
    public void setGeneratedName(String gn) { this.generatedName = gn; }
    public String getContentType()  { return contentType; }
    public void setContentType(String ct) { this.contentType = ct; }
    public long getSize()           { return size; }
    public void setSize(long s)     { this.size = s; }
    public String getUserId()       { return userId; }
    public void setUserId(String u) { this.userId = u; }
    public String getContent()      { return content; }
    public void setContent(String c){ this.content = c; }
    public IngestionStatus getStatus()        { return status; }
    public void setStatus(IngestionStatus s)  { this.status = s; }
}