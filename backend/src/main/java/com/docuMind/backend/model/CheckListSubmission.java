package com.docuMind.backend.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;

import com.docuMind.backend.model.enums.SubmissionStatus;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;

// one filled copy of a checklist template (e.g. Monday's crane check on MP1)
@Entity
public class CheckListSubmission{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // which template does it answer.
    // many submissions → one template: the template_id column lives in THIS table
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name= "template_id", nullable=false)
    @JsonIgnore
    private CheckListTemplate template;
    
    // the equipment / location inspected, e.g. "MP1"
    @Column(nullable=false)
    private String equipment;

    // set by the server from the login token, never by the client
    @Column(nullable=false)
    private String userId;

    // the day the inspection was done, chosen by the technician.
    // Nullable in the DB only because older rows were created before this column existed;
    // new submissions always have it (@NotNull in SubmissionRequest).
    @Column
    private LocalDate inspectionDate;

    // set by Hibernate on insert: when it was actually sent (audit, can't be changed)
    @CreationTimestamp
    @Column(nullable=false, updatable=false)
    private Instant submittedAt;

    // computed by the server from the answers
    @Enumerated(EnumType.STRING)
    @Column(nullable=false, length=16)
    private SubmissionStatus status;

    @Column(columnDefinition = "TEXT")
    private String remarks;

    // the task this report answers, null for a standalone checklist.
    // A task can have several submissions: one per round after the manager returns it.
    @Column
    private String taskId;

    // answers: one submission → many answers.
    // No column here: each answer row stores submission_id (see CheckListAnswer.submission).
    // mappedBy = "submission" says "read the link from that field".
    @OneToMany(mappedBy = "submission",
               cascade = CascadeType.ALL,
               orphanRemoval = true)
    private List<CheckListAnswer> answers = new ArrayList<>();

    // sets both sides of the link, like CheckListTemplate.addQuestion
    public void addAnswer(CheckListAnswer answer)
    {
        answers.add(answer);
        answer.setSubmission(this);
    }

    public String getId()                               { return id; }

    public CheckListTemplate getTemplate()              { return template; }
    public void setTemplate(CheckListTemplate template) { this.template = template; }

    public String getEquipment()                        { return equipment; }
    public void setEquipment(String equipment)          { this.equipment = equipment; }

    public String getUserId()                           { return userId; }
    public void setUserId(String userId)                { this.userId = userId; }

    public LocalDate getInspectionDate()                { return inspectionDate; }
    public void setInspectionDate(LocalDate inspectionDate) { this.inspectionDate = inspectionDate; }

    public Instant getSubmittedAt()                     { return submittedAt; }

    public SubmissionStatus getStatus()                 { return status; }
    public void setStatus(SubmissionStatus status)      { this.status = status; }

    public String getRemarks()                          { return remarks; }
    public void setRemarks(String remarks)              { this.remarks = remarks; }

    public String getTaskId()                           { return taskId; }
    public void setTaskId(String taskId)                { this.taskId = taskId; }

    public List<CheckListAnswer> getAnswers()           { return Collections.unmodifiableList(answers); }
    // replaces all answers, going through addAnswer so each answer gets its submission
    public void setAnswers(List<CheckListAnswer> newAnswers) {
        List<CheckListAnswer> copy = new ArrayList<>(newAnswers); // safe if newAnswers == answers
        answers.clear();               // keep the same list object: orphanRemoval needs it
        for (CheckListAnswer answer : copy)
            addAnswer(answer);
    }
}
