package com.docuMind.backend.model;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Immutable;

import com.docuMind.backend.model.enums.EventType;
import com.docuMind.backend.model.enums.StatusReason;
import com.docuMind.backend.model.enums.TaskStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

// holds the full history of a task to avoid overloading
// the task table (this will be useful for pump history,
// technician profile, notifications)
// rows are only ever added : @Immutable makes Hibernate ignore any update
@Entity
@Immutable
@Table(name="task_event", indexes = {
    // one task's timeline
    @Index(name = "idx_task_event_task_occurred", columnList = "task_id, occurred_at"),
    // pump history
    @Index(name = "idx_task_event_equipment_occurred", columnList = "equipment_id, occurred_at")
})
public class TaskEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String taskId;

    @Column(nullable = false) // copied from the task so the pump history needs no join
    private String equipmentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EventType eventType;

    @Column(nullable = false)
    private String actorEmail; //either manager/technician

    @Enumerated(EnumType.STRING)
    @Column // null for the creation event
    private TaskStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false) // status after the event (unchanged for REASSIGNED / COMMENTED)
    private TaskStatus toStatus;

    @Enumerated(EnumType.STRING)
    @Column
    private StatusReason reason;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column // only for REASSIGNED
    private String previousTechnicianEmail;

    @Column // only for REASSIGNED
    private String newTechnicianEmail;

    @Column(nullable = false) // when it happened on the phone, even offline
    private Instant occurredAt;

    @CreationTimestamp
    @Column(nullable = false, updatable = false) // when the server received it
    private Instant receivedAt;

    protected TaskEvent() {} // for JPA

    private TaskEvent(String taskId, String equipmentId, EventType eventType, String actorEmail,
                      TaskStatus fromStatus, TaskStatus toStatus, StatusReason reason, String comment,
                      String previousTechnicianEmail, String newTechnicianEmail, Instant occurredAt) {
        this.taskId = taskId;
        this.equipmentId = equipmentId;
        this.eventType = eventType;
        this.actorEmail = actorEmail;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.reason = reason;
        this.comment = comment;
        this.previousTechnicianEmail = previousTechnicianEmail;
        this.newTechnicianEmail = newTechnicianEmail;
        this.occurredAt = occurredAt;
    }

    // ex: STARTED -> BLOCKED, reason MISSING_PART
    public static TaskEvent statusChanged(String taskId, String equipmentId, String actorEmail,
                                          TaskStatus fromStatus, TaskStatus toStatus,
                                          StatusReason reason, String comment, Instant occurredAt) {
        return new TaskEvent(taskId, equipmentId, EventType.STATUS_CHANGED, actorEmail,
                fromStatus, toStatus, reason, comment, null, null, occurredAt);
    }

    // ex: DECLINED (ON_LEAVE) then the manager gives the task to another technician
    public static TaskEvent reassigned(String taskId, String equipmentId, String actorEmail, TaskStatus status,
                                       String previousTechnicianEmail, String newTechnicianEmail,
                                       String comment, Instant occurredAt) {
        return new TaskEvent(taskId, equipmentId, EventType.REASSIGNED, actorEmail,
                status, status, null, comment, previousTechnicianEmail, newTechnicianEmail, occurredAt);
    }

    // a note added to the task without changing its status
    public static TaskEvent commented(String taskId, String equipmentId, String actorEmail, TaskStatus status,
                                      String comment, Instant occurredAt) {
        return new TaskEvent(taskId, equipmentId, EventType.COMMENTED, actorEmail,
                status, status, null, comment, null, null, occurredAt);
    }

    public String getId()                       { return id; }
    public String getTaskId()                   { return taskId; }
    public String getEquipmentId()              { return equipmentId; }
    public EventType getEventType()             { return eventType; }
    public String getActorEmail()                  { return actorEmail; }
    public TaskStatus getFromStatus()           { return fromStatus; }
    public TaskStatus getToStatus()             { return toStatus; }
    public StatusReason getReason()             { return reason; }
    public String getComment()                  { return comment; }
    public String getPreviousTechnicianEmail()     { return previousTechnicianEmail; }
    public String getNewTechnicianEmail()          { return newTechnicianEmail; }
    public Instant getOccurredAt()              { return occurredAt; }
    public Instant getReceivedAt()              { return receivedAt; }
}
