// A PUMP REPAIRED IN THE WORKSHOP: THE FILE THAT GOES FROM ONE ROLE TO THE NEXT (fix_workshop.md).
// The steps are fixed (WorkshopStep) and only one is open at a time, so the intervention only
// stores which one it is on and that step's status; the history is in InterventionEvent.
package com.docuMind.backend.model;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Generated;
import org.hibernate.annotations.UpdateTimestamp;

import com.docuMind.backend.model.enums.InterventionOrigin;
import com.docuMind.backend.model.enums.InterventionStatus;
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

@Entity
@Table(name = "intervention", indexes = {
    // each role's queue: the open interventions waiting at one of its steps
    @Index(name = "idx_intervention_status_step", columnList = "status, current_step"),
    // the interventions a manager (or Sales) launched
    @Index(name = "idx_intervention_launched_by", columnList = "launched_by, created_at")
})
public class Intervention {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // the N° d'opération, 1, 2, 3… given by the database (bigserial) on insert, read back by Hibernate.
    // Shown as "AT-00012" (InterventionDetails.number)
    @Generated
    @Column(columnDefinition = "bigserial", insertable = false, updatable = false)
    private Long operationNumber;

    // ---------- the request (stage 01) ----------

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InterventionOrigin origin;

    @Column // the alert case (alertStore.js) it came from, only for ALERT
    private Integer alertNumber;

    @Column(nullable = false) // the manager's or Sales' email
    private String launchedBy;

    @Column(nullable = false)
    private String equipmentId;

    @Column(nullable = false, columnDefinition = "TEXT") // the fault: the alert's message, or what the client said
    private String fault;

    @Column(nullable = false)
    private boolean urgent = false;

    @Column // filled by Sales
    private String client;

    @Column // N° de commande client, filled by Sales; checked by the Contract Admin at step 3
    private String customerOrderNumber;

    // ---------- current state ----------

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private WorkshopStep currentStep = WorkshopStep.COMPLETER_DEMANDE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private StepStatus stepStatus = StepStatus.A_TRAITER;

    @Column // who took the current step ("Prendre en charge"), null while it waits in the queue;
            // on a technician's step (8, 16), the technician the task was assigned to
    private String stepAssignee;

    @Column // the technician's current task (TaskModel id), set by the Workshop Lead at step 7 / 15
    private String taskId;

    @Column // the devis (Quote id): null until the Chef de projet validates one at step 10; a revised
            // devis (version 2, 3…) replaces it once validated
    private String quoteId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private InterventionStatus status = InterventionStatus.EN_COURS;

    @Column(columnDefinition = "TEXT") // why it was cancelled
    private String statusComment;

    // ---------- time ----------

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column // when it reached TERMINEE or ANNULEE
    private Instant closedAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;

    public Intervention() {}

    public Intervention(InterventionOrigin origin, Integer alertNumber, String launchedBy,
                        String equipmentId, String fault, boolean urgent)
    {
        this.origin = origin;
        this.alertNumber = alertNumber;
        this.launchedBy = launchedBy;
        this.equipmentId = equipmentId;
        this.fault = fault;
        this.urgent = urgent;
    }

    public String getId()                                   { return id; }
    public Long getOperationNumber()                        { return operationNumber; }
    public InterventionOrigin getOrigin()                   { return origin; }
    public Integer getAlertNumber()                         { return alertNumber; }
    public String getLaunchedBy()                           { return launchedBy; }
    public String getEquipmentId()                          { return equipmentId; }
    public void setEquipmentId(String equipmentId)          { this.equipmentId = equipmentId; }
    public String getFault()                                { return fault; }
    public void setFault(String fault)                      { this.fault = fault; }
    public boolean isUrgent()                               { return urgent; }
    public void setUrgent(boolean urgent)                   { this.urgent = urgent; }
    public String getClient()                               { return client; }
    public void setClient(String client)                    { this.client = client; }
    public String getCustomerOrderNumber()                  { return customerOrderNumber; }
    public void setCustomerOrderNumber(String customerOrderNumber) { this.customerOrderNumber = customerOrderNumber; }
    public WorkshopStep getCurrentStep()                    { return currentStep; }
    public void setCurrentStep(WorkshopStep currentStep)    { this.currentStep = currentStep; }
    public StepStatus getStepStatus()                       { return stepStatus; }
    public void setStepStatus(StepStatus stepStatus)        { this.stepStatus = stepStatus; }
    public String getStepAssignee()                         { return stepAssignee; }
    public void setStepAssignee(String stepAssignee)        { this.stepAssignee = stepAssignee; }
    public String getTaskId()                               { return taskId; }
    public void setTaskId(String taskId)                    { this.taskId = taskId; }

    public String getQuoteId()                              { return quoteId; }
    public void setQuoteId(String quoteId)                  { this.quoteId = quoteId; }
    public InterventionStatus getStatus()                   { return status; }
    public void setStatus(InterventionStatus status)        { this.status = status; }
    public String getStatusComment()                        { return statusComment; }
    public void setStatusComment(String statusComment)      { this.statusComment = statusComment; }
    public Instant getCreatedAt()                           { return createdAt; }
    public Instant getClosedAt()                            { return closedAt; }
    public void setClosedAt(Instant closedAt)               { this.closedAt = closedAt; }
    public Instant getUpdatedAt()                           { return updatedAt; }
}
