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

    @Lob
    @Column(nullable = false)
    private String content;
    
    @Column(nullable = false)
    private String userEmail;
    
    public FileContent() {}

    public FileContent(String id, byte[] data, String content, String userEmail) {
        this.id = id;
        this.data = data;
        this.content = content;
        this.userEmail = userEmail;
    }

    public String getContent() { return content;}
    
    public void setContent(String content) {this.content = content;}
    
    public String getId() { return id; }
    
    public void setId(String id) { this.id = id; }
    
    public byte[] getData() { return data; }

    public void setData(byte[] data) { this.data = data; }
    
    public String getUserEmail()
    {
        return this.userEmail;
    }

    public void setUserEmail(String userEmail)
    {
        this.userEmail = userEmail;
    }
}