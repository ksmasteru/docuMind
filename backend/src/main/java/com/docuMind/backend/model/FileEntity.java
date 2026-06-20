package com.docuMind.backend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document; 
import jakarta.annotation.Generated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Column;
@Document(collection = "stored_files")
public class FileEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 100)
    private String name; // name entered by user
    private String generatedName; // unique name handled internally to avoid conflicts
    private String contentType; // e.g., "application/pdf", "text/markdown", "text/plain"
    private long size;
    private byte[] data; // Holds the actual file binary content

    public FileEntity() {}

    public FileEntity(String name, String contentType, long size, byte[] data) {
        this.name = name;
        this.contentType = contentType;
        this.generatedName = name + String.valueOf(id) + "." + contentType;
        this.size = size;
        this.data = data;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }

    public byte[] getData() { return data; }
    public void setData(byte[] data) { this.data = data; }
}
