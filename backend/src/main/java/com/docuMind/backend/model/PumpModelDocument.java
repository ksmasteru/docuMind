package com.docuMind.backend.model;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.LinkOrigin;
import com.docuMind.backend.model.enums.PumpType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

// One document of the library tied to one pump model, and what it is to it (plan_pump_manuals.md §1, §6, §7):
// the admin ticks the models a document serves when uploading it or on « Documents »; the spec sheets are
// installed by the app. A document ticked for three models has three rows.
// fileId is a plain column, like document_chunks.file_id: DocumentService.deleteFile removes the rows itself.
// Replaces PumpModel's many-to-many `manuals` (table pump_model_manuals), which was never used and could not
// carry the kind, the origin or who changed it.
@Entity
@Table(name = "pump_model_document",
    uniqueConstraints = @UniqueConstraint(name = "uk_pump_model_document", columnNames = { "model", "fileId" }),
    indexes = {
        @Index(name = "idx_pump_model_document_file", columnList = "fileId"),
        @Index(name = "idx_pump_model_document_model", columnList = "model")
    })
public class PumpModelDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PumpType model;

    @Column(nullable = false)
    private String fileId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DocumentKind kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private LinkOrigin origin;

    // SHA-256 of the bundled sheet it was installed from (origin INSTALLED), to see a newer one; null otherwise
    @Column(length = 64)
    private String installedHash;

    // the person's e-mail, or "system" for the app
    @Column(nullable = false)
    private String changedBy;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant changedAt;

    protected PumpModelDocument() {} // for JPA

    public PumpModelDocument(PumpType model, String fileId, DocumentKind kind, LinkOrigin origin, String changedBy)
    {
        this.model = model;
        this.fileId = fileId;
        this.kind = kind;
        this.origin = origin;
        this.changedBy = changedBy;
    }

    public String getId()                           { return id; }
    public PumpType getModel()                      { return model; }
    public String getFileId()                       { return fileId; }
    public DocumentKind getKind()                   { return kind; }
    public void setKind(DocumentKind kind)          { this.kind = kind; }
    public LinkOrigin getOrigin()                   { return origin; }
    public void setOrigin(LinkOrigin origin)        { this.origin = origin; }
    public String getInstalledHash()                { return installedHash; }
    public void setInstalledHash(String hash)       { this.installedHash = hash; }
    public String getChangedBy()                    { return changedBy; }
    public void setChangedBy(String changedBy)      { this.changedBy = changedBy; }
    public Instant getCreatedAt()                   { return createdAt; }
    public Instant getChangedAt()                   { return changedAt; }
}
