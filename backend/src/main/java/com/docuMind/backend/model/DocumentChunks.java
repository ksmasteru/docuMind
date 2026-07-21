package com.docuMind.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import org.hibernate.annotations.Type;

@Entity
@Table(name = "document_chunks", indexes = {
    @Index(name = "idx_chunks_file_id", columnList = "fileId")
})
public class DocumentChunks {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String fileId;       // FK to FileEntity

    @Column(nullable = false)
    private String userEmail;       // for filtering by owner

    @Column(columnDefinition = "TEXT", nullable = false)
    private String chunkText;    // the actual text slice

    @Column(nullable = false)
    private int chunkIndex;      // position in the original document

    // pgvector column — 1536 dimensions matches OpenAI's
    // text-embedding-3-small output size.
    @Type(VectorType.class)
    @Column(columnDefinition = "vector(1536)")
    private float[] embedding;

    // getters/setters
    
    public String getId()
    {
        return this.id;
    }

    public void setId(String id)
    {
        this.id = id;
    }
    
    public String getFileId()
    {
        return this.fileId;
    }

    public void setFileId(String fileId)
    {
        this.fileId = fileId;
    }

    public String getUserEmail()
    {
        return this.userEmail;
    }

    public void setUserEmail(String userEmail)
    {
        this.userEmail = userEmail;
    }

    public String getChunkText()
    {
        return this.chunkText;
    }

    public void setChunkText(String ChunkText)
    {
        this.chunkText = ChunkText;
    }
    
    public int getChunkIndex()
    {
        return this.chunkIndex;
    }
    
    public void setChunkIndex(int chunkIndex)
    {
        this.chunkIndex = chunkIndex;
    }

    public void setEmbedding(float[] embedding)
    {     
        this.embedding = embedding;    
    }

    public float[] getEmbedding()
    {
        return this.embedding;
    }
}
