package com.docuMind.backend.model;

import jakarta.persistence.*;

@Entity
@Table(name = "file_contents")
public class FileContent {

    @Id
    private String id; // same id as FileEntity — 1:1 relationship

    @Lob
    @Column(nullable = false)
    private byte[] data;

    public FileContent() {}

    public FileContent(String id, byte[] data) {
        this.id = id;
        this.data = data;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public byte[] getData() { return data; }
    public void setData(byte[] data) { this.data = data; }
}