package com.docuMind.backend.model;

import java.time.Instant;

import org.hibernate.annotations.Immutable;

import com.docuMind.backend.model.enums.InterventionAction;
import com.docuMind.backend.model.enums.StepStatus;
import com.docuMind.backend.model.enums.WorkshopStep;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

// the history of an intervention, like TaskEvent for a task: who pressed which button on which step.
// Rows are only ever added: @Immutable makes Hibernate ignore any update
@Entity
@Immutable
@Table(name = "intervention_event", indexes = {
    // one intervention's timeline
    @Index(name = "idx_intervention_event_occurred", columnList = "intervention_id, occurred_at")
})
public class InterventionEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String interventionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32) // the step the button was pressed on
    private WorkshopStep step;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private InterventionAction action;

    @Column(nullable = false)
    private String actorEmail;

    @Enumerated(EnumType.STRING)
    @Column(length = 16) // null for the creation event
    private StepStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16) // the step's status after the event (VALIDE when it was validated)
    private StepStatus toStatus;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(nullable = false) // set by the server: the workshop pages are web only, no offline clock
    private Instant occurredAt;

    protected InterventionEvent() {} // for JPA

    public InterventionEvent(String interventionId, WorkshopStep step, InterventionAction action, String actorEmail,
                             StepStatus fromStatus, StepStatus toStatus, String comment, Instant occurredAt)
    {
        this.interventionId = interventionId;
        this.step = step;
        this.action = action;
        this.actorEmail = actorEmail;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.comment = comment;
        this.occurredAt = occurredAt;
    }

    public String getId()                   { return id; }
    public String getInterventionId()       { return interventionId; }
    public WorkshopStep getStep()           { return step; }
    public InterventionAction getAction()   { return action; }
    public String getActorEmail()           { return actorEmail; }
    public StepStatus getFromStatus()       { return fromStatus; }
    public StepStatus getToStatus()         { return toStatus; }
    public String getComment()              { return comment; }
    public Instant getOccurredAt()          { return occurredAt; }
}
