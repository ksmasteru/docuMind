package com.docuMind.backend.model;

import java.time.Instant;

import com.docuMind.backend.model.enums.AlertRequestStatus;

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
import jakarta.persistence.Table;

// A technician asks to intervene on an alert (Demander à intervenir). The manager accepts it, which
// creates his task (taskId) through the usual task flow, or refuses it with a comment.
@Entity
@Table(name = "alert_request")
public class AlertRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_number", nullable = false)
    private AlertCase alertCase;

    @Column(nullable = false)
    private String technicianEmail;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AlertRequestStatus status = AlertRequestStatus.PENDING;

    @Column(nullable = false)
    private Instant requestedAt;

    @Column
    private String decidedBy;

    @Column
    private Instant decidedAt;

    @Column(columnDefinition = "TEXT")
    private String decisionComment;

    @Column // the task created when it was accepted
    private String taskId;

    protected AlertRequest() {} // for JPA

    public AlertRequest(AlertCase alertCase, String technicianEmail, String message, Instant requestedAt) {
        this.alertCase = alertCase;
        this.technicianEmail = technicianEmail;
        this.message = message;
        this.requestedAt = requestedAt;
    }

    public void accept(String managerEmail, String taskId, Instant at) {
        this.status = AlertRequestStatus.ACCEPTED;
        this.decidedBy = managerEmail;
        this.decidedAt = at;
        this.taskId = taskId;
    }

    public void refuse(String managerEmail, String comment, Instant at) {
        this.status = AlertRequestStatus.REFUSED;
        this.decidedBy = managerEmail;
        this.decidedAt = at;
        this.decisionComment = comment;
    }

    public String getId()                   { return id; }
    public AlertCase getAlertCase()         { return alertCase; }
    public String getTechnicianEmail()      { return technicianEmail; }
    public String getMessage()              { return message; }
    public AlertRequestStatus getStatus()   { return status; }
    public Instant getRequestedAt()         { return requestedAt; }
    public String getDecidedBy()            { return decidedBy; }
    public Instant getDecidedAt()           { return decidedAt; }
    public String getDecisionComment()      { return decisionComment; }
    public String getTaskId()               { return taskId; }
}
