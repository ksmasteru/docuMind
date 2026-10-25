// A PUMP NEEDS A MAINTENACE, A TASK IS CREATED BY A MANAGER AND SENT TO A TECHINCIAN
// THAT RECEIVE AN EVENT.
package com.docuMind.backend.model;

import java.time.Instant;
import java.time.LocalDate;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.StatusReason;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name="task", indexes = {
    // technician's tabs: "À faire", "En cours", "Terminées"
    @Index(name = "idx_task_technician_status", columnList = "technician_email, status"),
    // manager's view of the tasks he assigned
    @Index(name = "idx_task_manager_status", columnList = "manager_email, status"),
    // pump history, newest first
    @Index(name = "idx_task_equipment_created", columnList = "equipment_id, created_at")
})
public class TaskModel {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // ---------- planning (set by the manager) ----------

    @Column(nullable = false) // short label for the task list
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TaskType taskType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TaskPriority priority = TaskPriority.NORMAL;

    @Column // optional deadline, used to measure lateness
    private LocalDate dueDate;

    @Column(nullable = false)//assigned to : the technician's email
    private String technicianEmail;

    @Column(nullable = false) // assigned from : the manager's email
    private String managerEmail;

    // so we have to derive the model from equipment to get manuals etc.
    @Column(nullable = false)
    private String equipmentId;// which equipement has issue.

    @Column(columnDefinition = "TEXT")
    private String instructions;

    @Column // the checklist (CheckListTemplate id) to fill for this task, null if none
    private String templateId;

    // ---------- current state ----------

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TaskStatus status = TaskStatus.ASSIGNED;

    @Enumerated(EnumType.STRING)
    @Column
    private StatusReason statusReason;

    @Column(columnDefinition = "TEXT")
    private String statusComment;

    // history of this task : stored in TaskEvent (taskId), read with TaskEventRepository

    // ---------- time ----------

    @CreationTimestamp
    @Column(nullable = false, updatable = false) // when the task was assigned
    private Instant createdAt;

    @Column // first press of "Démarrer"
    private Instant firstStartedAt;

    @Column // start of the current work period, null when the task is not STARTED
    private Instant activeSince;

    @Column(nullable = false) // total time spent in STARTED (blocked time is not counted)
    private long workedSeconds = 0;

    @Column // latest report submission
    private Instant submittedAt;

    // the CheckListSubmission sent with that report. Replaced on each round
    // (RETURNED -> STARTED -> SUBMITTED again); older rounds keep this task's id in their taskId
    @Column
    private String latestSubmissionId;

    @Column // when the task reached APPROVED, REJECTED or CANCELED
    private Instant closedAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;

    public TaskModel() {}

    // dueDate can be null : not every task has a deadline
    public TaskModel(String title, TaskType taskType, String technicianEmail, String managerEmail, String equipmentId, String instructions, LocalDate dueDate) {
        this.title = title;
        this.taskType = taskType;
        this.technicianEmail = technicianEmail;
        this.managerEmail = managerEmail;
        this.equipmentId = equipmentId;
        this.instructions = instructions;
        this.dueDate = dueDate;
    }

    public String getId()                               { return id; }
    public void setId(String id)                        { this.id = id; }
    public String getTitle()                            { return title; }
    public void setTitle(String title)                  { this.title = title; }
    public TaskType getTaskType()                       { return taskType; }
    public void setTaskType(TaskType taskType)          { this.taskType = taskType; }
    public TaskPriority getPriority()                   { return priority; }
    public void setPriority(TaskPriority priority)      { this.priority = priority; }
    public LocalDate getDueDate()                       { return dueDate; }
    public void setDueDate(LocalDate dueDate)           { this.dueDate = dueDate; }
    public String getTechnicianEmail()                     { return technicianEmail; }
    public void setTechnicianEmail(String technicianEmail)    { this.technicianEmail = technicianEmail; }
    public String getManagerEmail()                        { return managerEmail; }
    public void setManagerEmail(String managerEmail)          { this.managerEmail = managerEmail; }
    public String getEquipmentId()                      { return equipmentId; }
    public void setEquipmentId(String equipmentId)      { this.equipmentId = equipmentId; }
    public String getInstructions()                     { return instructions; }
    public void setInstructions(String instructions)    { this.instructions = instructions; }
    public String getTemplateId()                       { return templateId; }
    public void setTemplateId(String templateId)        { this.templateId = templateId; }
    public TaskStatus getStatus()                       { return status; }
    public void setStatus(TaskStatus status)            { this.status = status; }
    public StatusReason getStatusReason()               { return statusReason; }
    public void setStatusReason(StatusReason statusReason) { this.statusReason = statusReason; }
    public String getStatusComment()                    { return statusComment; }
    public void setStatusComment(String statusComment)  { this.statusComment = statusComment; }
    public Instant getCreatedAt()                       { return createdAt; }
    public void setCreatedAt(Instant createdAt)         { this.createdAt = createdAt; }
    public Instant getFirstStartedAt()                  { return firstStartedAt; }
    public void setFirstStartedAt(Instant firstStartedAt) { this.firstStartedAt = firstStartedAt; }
    public Instant getActiveSince()                     { return activeSince; }
    public void setActiveSince(Instant activeSince)     { this.activeSince = activeSince; }
    public long getWorkedSeconds()                      { return workedSeconds; }
    public void setWorkedSeconds(long workedSeconds)    { this.workedSeconds = workedSeconds; }
    public Instant getSubmittedAt()                     { return submittedAt; }
    public void setSubmittedAt(Instant submittedAt)     { this.submittedAt = submittedAt; }
    public String getLatestSubmissionId()               { return latestSubmissionId; }
    public void setLatestSubmissionId(String latestSubmissionId) { this.latestSubmissionId = latestSubmissionId; }
    public Instant getClosedAt()                        { return closedAt; }
    public void setClosedAt(Instant closedAt)           { this.closedAt = closedAt; }
    public Instant getUpdatedAt()                       { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt)         { this.updatedAt = updatedAt; }
}
