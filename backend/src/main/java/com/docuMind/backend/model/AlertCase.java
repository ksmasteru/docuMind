package com.docuMind.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.BatchSize;

import com.docuMind.backend.model.enums.AlertCloseReason;
import com.docuMind.backend.model.enums.AlertSeverity;
import com.docuMind.backend.model.enums.AlertSource;
import com.docuMind.backend.model.enums.AlertStatus;
import com.docuMind.backend.model.enums.AlertVerification;
import com.docuMind.backend.model.enums.TaskPriority;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

// One alert case ("#12 · PHB3-J-07 · Vibrations élevées"): an alert the twin raised, or a fault a
// technician reported, and everything that happened to it (AlertService). Until now these lived in
// the manager's browser (alertStore.js); on the server, technicians can see and answer them.
//
// One alert has one open case at a time: openKey holds the alert's key while the case is open and
// goes back to null once it is resolved, and it is unique.
@Entity
@Table(name = "alert_case", indexes = {
    // the pump's history, newest first
    @Index(name = "idx_alert_case_pump", columnList = "pump_id, raised_at"),
    // a technician's list: the open cases of his site
    @Index(name = "idx_alert_case_site_status", columnList = "site, status")
})
public class AlertCase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long number; // the #12 people talk about

    @Column(nullable = false, length = 96) // "PHB3-J-07:vibration", or "PHB3-J-07:field:1a2b3c4d" for a report
    private String alertKey;

    @Column(unique = true, length = 96)
    private String openKey;

    @Column(nullable = false, length = 64)
    private String pumpId;

    @Column(length = 32) // Jorf, Safi
    private String site;

    @Column(nullable = false, length = 32) // vibration, bearing, fault, offline (the twin), field (a report)
    private String kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private AlertSource source;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AlertSeverity severity;

    @Column(columnDefinition = "TEXT") // the twin's latest message, or the report's title
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AlertStatus status = AlertStatus.NEW;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private TaskPriority priority;

    @Column(nullable = false)
    private Instant raisedAt;

    @Column // the reading went back within limits (a twin alert); null while it is on
    private Instant clearedAt;

    @Column
    private Instant resolvedAt;

    // ---------- a technician's fault report (source FIELD) ----------

    @Column
    private String reportedBy; // his email

    @Column(length = 64)
    private String equipmentModel;

    @Column
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @ElementCollection
    @CollectionTable(name = "alert_case_image", joinColumns = @JoinColumn(name = "case_number"))
    @OrderColumn(name = "position")
    @Column(name = "image_id", nullable = false)
    @BatchSize(size = 50)
    private List<String> imageIds = new ArrayList<>();

    // ---------- what was done about it ----------

    @OneToMany(mappedBy = "alertCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("at ASC")
    @BatchSize(size = 50)
    private List<AlertEvent> events = new ArrayList<>();

    @OneToMany(mappedBy = "alertCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("requestedAt ASC")
    @BatchSize(size = 50)
    private List<AlertRequest> requests = new ArrayList<>();

    // the work orders created from the case
    @ElementCollection
    @CollectionTable(name = "alert_order", joinColumns = @JoinColumn(name = "case_number"))
    @OrderColumn(name = "position")
    @BatchSize(size = 50)
    private List<LinkedOrder> orders = new ArrayList<>();

    // the workshop interventions the pump was sent to from the case
    @ElementCollection
    @CollectionTable(name = "alert_intervention", joinColumns = @JoinColumn(name = "case_number"))
    @OrderColumn(name = "position")
    @BatchSize(size = 50)
    private List<LinkedIntervention> interventions = new ArrayList<>();

    // ---------- the check before acting (levée de doute, CheckService) ----------

    // null for the cases made before it existed: getVerification() reads them
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private AlertVerification verification;

    @Column(length = 64) // the current check task, or the last one
    private String checkTaskId;

    @Column // who confirmed it, or found it false, and when
    private String verifiedBy;

    @Column
    private Instant verifiedAt;

    // ---------- how it was closed (AlertService.close) ----------

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private AlertCloseReason closeReason;

    @Column(columnDefinition = "TEXT")
    private String closeComment;

    // ---------- a twin alert found false not long ago (AlertService.sync) ----------

    // the latest case closed as a false alarm on the same alert (pump and kind) in the 30 days before
    // this one opened; null for none
    @Column
    private Long followsFalseAlarm;

    // how many false alarms were closed on that alert in those 30 days
    @Column
    private Integer falseAlarmsBefore;

    @Embeddable
    public static class LinkedOrder {
        @Column(nullable = false) private String taskId;
        @Column private String title;
        @Column private String technicianEmail;
        @Column(nullable = false) private Instant at;

        protected LinkedOrder() {}
        public LinkedOrder(String taskId, String title, String technicianEmail, Instant at) {
            this.taskId = taskId; this.title = title; this.technicianEmail = technicianEmail; this.at = at;
        }
        public String getTaskId()          { return taskId; }
        public String getTitle()           { return title; }
        public String getTechnicianEmail() { return technicianEmail; }
        public Instant getAt()             { return at; }
    }

    @Embeddable
    public static class LinkedIntervention {
        @Column(nullable = false) private String interventionId;
        @Column private String interventionNumber;
        @Column(nullable = false) private Instant at;

        protected LinkedIntervention() {}
        public LinkedIntervention(String interventionId, String interventionNumber, Instant at) {
            this.interventionId = interventionId; this.interventionNumber = interventionNumber; this.at = at;
        }
        public String getInterventionId()     { return interventionId; }
        public String getInterventionNumber() { return interventionNumber; }
        public Instant getAt()                { return at; }
    }

    protected AlertCase() {} // for JPA

    public AlertCase(String alertKey, String pumpId, String site, String kind, AlertSource source,
                     AlertSeverity severity, String message, TaskPriority priority, Instant raisedAt) {
        this.alertKey = alertKey;
        this.openKey = alertKey;
        this.pumpId = pumpId;
        this.site = site;
        this.kind = kind;
        this.source = source;
        this.severity = severity;
        this.message = message;
        this.priority = priority;
        this.raisedAt = raisedAt;
    }

    public boolean isOpen() { return status != AlertStatus.RESOLVED; }

    // where the check stands. A case made before checks existed: a fault report is confirmed, a twin
    // alert someone was already sent to fix too, any other is still to check
    public AlertVerification getVerification() {
        if (verification != null)
            return verification;
        if (source == AlertSource.FIELD || !orders.isEmpty() || !interventions.isEmpty())
            return AlertVerification.CONFIRMED;
        return AlertVerification.TO_CHECK;
    }

    // a check task was sent or started for it
    public void checkOrdered(String taskId) {
        this.verification = AlertVerification.CHECK_ORDERED;
        this.checkTaskId = taskId;
    }

    // the check report's verdict: CONFIRMED, FALSE_ALARM or INCONCLUSIVE
    public void checked(AlertVerification verdict, String by, Instant at) {
        this.verification = verdict;
        this.verifiedBy = by;
        this.verifiedAt = at;
    }

    // the check was declined or canceled before any report: nobody is checking any more
    public void checkDropped() {
        this.verification = AlertVerification.TO_CHECK;
    }

    // the report was sent back to the technician: the check is open again
    public void checkReopened() {
        this.verification = AlertVerification.CHECK_ORDERED;
    }

    // it comes back after a false alarm: still to check (every alert is), but the check knows it
    public void followsFalseAlarm(long number, int count) {
        this.followsFalseAlarm = number;
        this.falseAlarmsBefore = count;
    }

    public void close(AlertCloseReason reason, String comment, Instant at) {
        this.closeReason = reason;
        this.closeComment = comment;
        setStatus(AlertStatus.RESOLVED, at);
    }

    // adds one step to the activity, which belongs to this case
    public AlertEvent log(AlertEvent event) {
        event.attachTo(this);
        events.add(event);
        return event;
    }

    // resolving frees the alert's key, so the next time it fires a new case opens
    public void setStatus(AlertStatus status, Instant at) {
        // reopened: how it was closed no longer holds
        if (status != AlertStatus.RESOLVED) {
            this.closeReason = null;
            this.closeComment = null;
        }
        this.status = status;
        this.resolvedAt = status == AlertStatus.RESOLVED ? at : null;
        this.openKey = status == AlertStatus.RESOLVED ? null : alertKey;
    }

    public Long getNumber()                     { return number; }
    public String getAlertKey()                 { return alertKey; }
    public String getPumpId()                   { return pumpId; }
    public String getSite()                     { return site; }
    public String getKind()                     { return kind; }
    public AlertSource getSource()              { return source; }
    public AlertSeverity getSeverity()          { return severity; }
    public void setSeverity(AlertSeverity s)    { this.severity = s; }
    public String getMessage()                  { return message; }
    public void setMessage(String message)      { this.message = message; }
    public AlertStatus getStatus()              { return status; }
    public TaskPriority getPriority()           { return priority; }
    public void setPriority(TaskPriority p)     { this.priority = p; }
    public Instant getRaisedAt()                { return raisedAt; }
    public Instant getClearedAt()               { return clearedAt; }
    public void setClearedAt(Instant at)        { this.clearedAt = at; }
    public Instant getResolvedAt()              { return resolvedAt; }
    public String getReportedBy()               { return reportedBy; }
    public String getEquipmentModel()           { return equipmentModel; }
    public String getTitle()                    { return title; }
    public String getDescription()              { return description; }
    public List<String> getImageIds()           { return imageIds; }
    public List<AlertEvent> getEvents()         { return events; }
    public List<AlertRequest> getRequests()     { return requests; }
    public List<LinkedOrder> getOrders()        { return orders; }
    public List<LinkedIntervention> getInterventions() { return interventions; }
    public String getCheckTaskId()              { return checkTaskId; }
    public String getVerifiedBy()               { return verifiedBy; }
    public Instant getVerifiedAt()              { return verifiedAt; }
    public AlertCloseReason getCloseReason()    { return closeReason; }
    public String getCloseComment()             { return closeComment; }
    public Long getFollowsFalseAlarm()          { return followsFalseAlarm; }
    public int getFalseAlarmsBefore()           { return falseAlarmsBefore == null ? 0 : falseAlarmsBefore; }

    public void setReport(String reportedBy, String equipmentModel, String title, String description, List<String> imageIds) {
        this.reportedBy = reportedBy;
        this.equipmentModel = equipmentModel;
        this.title = title;
        this.description = description;
        this.imageIds = new ArrayList<>(imageIds);
    }
}
