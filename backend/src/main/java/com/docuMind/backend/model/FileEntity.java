package com.docuMind.backend.model;

import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document; 

@Document(collection = "stored_files")
public class FileEntity {

    @Id
    private String id;
    private String name; // name entered by user
    private String generatedName; // unique name handled internally to avoid conflicts
    private String contentType; // e.g., "application/pdf", "text/markdown", "text/plain"
    private long size;
    private byte[] data; // Holds the actual file binary content

    public FileEntity(
    ) {}

    public FileEntity(String name, String contentType, long size, byte[] data) {
        this.id = UUID.randomUUID().toString();
        this.name = name;
        this.contentType = contentType;
        this.generatedName = name + id + "." + contentType;
        this.size = size;
        this.data = data;
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getGeneratedName() {return generatedName;}
    public void setGeneratedName(String generatedName) {this.generatedName = generatedName;}
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }

    public byte[] getData() { return data; }
    public void setData(byte[] data) { this.data = data; }
}
