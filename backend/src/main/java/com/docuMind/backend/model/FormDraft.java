// making draft filling more persistent

package com.docuMind.backend.model;

import java.time.Instant;

import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

// a form the technician started but hasn't sent yet: saved as they type, so it survives
// a logout or a lost connection. Deleted when the real CheckListSubmission is sent.
@Entity
@Table(name = "form_draft",
       // one draft per technician per form/task: saving again updates it.
       // Postgres treats NULLs as distinct, so for standalone drafts (taskId null) this
       // doesn't stop duplicates: the service must look the draft up before saving.
       uniqueConstraints = @UniqueConstraint(columnNames = {"userId", "templateId", "taskId"}))
public class FormDraft {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // set by the server from the login token, never by the client
    @Column(nullable = false)
    private String userId;

    // the CheckListTemplate being filled
    @Column(nullable = false)
    private String templateId;

    // the task this draft answers, null for a standalone checklist
    @Column
    private String taskId;

    // hna ghadi nstoriw the react state, as JSON:
    // { answers: { itemId → { value, comment, … } }, equipment, inspectionDate, remarks, step }
    // Not validated here: a draft may be half filled. The checks run when it's sent.
    @Column(nullable = false, columnDefinition = "TEXT")
    private String payload;

    // what a ticket is about, as the « Fiches en cours » list shows it ("PHB2-0412 · 06/10/2026"):
    // written by the app from the form's equipment and date fields; null for the other drafts
    @Column(length = 255)
    private String label;

    // set by Hibernate on every save: when the draft was last saved
    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;

    public String getId()                           { return id; }

    public String getUserId()                       { return userId; }
    public void setUserId(String userId)            { this.userId = userId; }

    public String getTemplateId()                   { return templateId; }
    public void setTemplateId(String templateId)    { this.templateId = templateId; }

    public String getTaskId()                       { return taskId; }
    public void setTaskId(String taskId)            { this.taskId = taskId; }

    public String getLabel()                        { return label; }
    public void setLabel(String label)              { this.label = label; }

    public String getPayload()                      { return payload; }
    public void setPayload(String payload)          { this.payload = payload; }

    public Instant getUpdatedAt()                   { return updatedAt; }
}
