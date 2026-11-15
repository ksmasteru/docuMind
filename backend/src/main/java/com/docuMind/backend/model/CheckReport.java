package com.docuMind.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.hibernate.annotations.BatchSize;

import com.docuMind.backend.model.enums.CannotHandleReason;
import com.docuMind.backend.model.enums.CheckPointKind;
import com.docuMind.backend.model.enums.CheckResult;
import com.docuMind.backend.model.enums.CheckVerdict;
import com.docuMind.backend.model.enums.FalseAlarmCause;
import com.docuMind.backend.model.enums.InconclusiveReason;
import com.docuMind.backend.model.enums.PumpArrivalState;

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
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

// What a technician found when he checked an alert on site (levée de doute), sent with its check
// task (CheckService.submit). One per round: a report sent back for more details is sent again as
// round 2, and the latest one counts. A technician's fault report ("Signaler une panne") is a check
// report too, CONFIRMED from the start, with sections and no check points.
@Entity
@Table(name = "check_report", indexes = @Index(name = "idx_check_report_task", columnList = "task_id, round"))
public class CheckReport {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "task_id", nullable = false, length = 64)
    private String taskId;

    @Column(nullable = false)
    private long alertNumber;

    @Column(nullable = false)
    private String technicianEmail;

    @Column(nullable = false)
    private int round;

    @Column(nullable = false)
    private Instant submittedAt;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private PumpArrivalState arrivalState;

    // ---------- the conclusion ----------

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CheckVerdict verdict;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private FalseAlarmCause falseAlarmCause;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private InconclusiveReason inconclusiveReason;

    @Column(nullable = false) // "Arrêt immédiat recommandé"
    private boolean urgentStop;

    @Column(columnDefinition = "TEXT")
    private String comment;

    // ---------- what comes next (a confirmed alert) ----------

    @Column // null unless CONFIRMED
    private Boolean canHandle;

    @Column(columnDefinition = "TEXT")
    private String handleMessage;

    @Column
    private Double estimatedHours;

    @Column(columnDefinition = "TEXT")
    private String partsNeeded;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private CannotHandleReason cannotHandleReason;

    @Column(columnDefinition = "TEXT")
    private String cannotHandleComment;

    // ---------- its PDF's verification (ReportVerification, like the checklists) ----------

    // printed with a QR code of its /verify page; given when it is sent (or at startup, for older ones)
    @Column(unique = true, length = 16)
    private String verificationCode;

    // SHA-256 of the report as it was sent: a check recomputes it to tell whether it was altered
    @Column(length = 64)
    private String contentHash;

    // ---------- what he found ----------

    // one per check point, in the points' order; the point's label is copied so the report reads alone
    @ElementCollection
    @CollectionTable(name = "check_report_result", joinColumns = @JoinColumn(name = "report_id"))
    @OrderColumn(name = "position")
    @BatchSize(size = 50)
    private List<Result> results = new ArrayList<>();

    // the free sections: a title, photos, a comment ("Plaque signalétique", "Fuite côté accouplement")
    @ElementCollection
    @CollectionTable(name = "check_report_section", joinColumns = @JoinColumn(name = "report_id"))
    @OrderColumn(name = "position")
    @BatchSize(size = 50)
    private List<Section> sections = new ArrayList<>();

    // photo ids are kept as "id1,id2" in one column: an embeddable can't hold a collection
    static String joinPhotos(List<String> ids) {
        return ids == null || ids.isEmpty() ? null : String.join(",", ids);
    }

    static List<String> splitPhotos(String photos) {
        return photos == null || photos.isBlank() ? List.of() : Arrays.asList(photos.split(","));
    }

    @Embeddable
    public static class Result {
        @Column(length = 64) private String pointId;
        @Column(nullable = false) private String label;
        @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private CheckPointKind kind;
        @Column(length = 16) private String unit;
        @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private CheckResult result;
        @Column private Double reading;
        @Column(columnDefinition = "TEXT") private String comment;
        @Column(columnDefinition = "TEXT") private String photos;

        protected Result() {}
        public Result(CheckPoint point, CheckResult result, Double reading, String comment, List<String> photos) {
            this.pointId = point.getId(); this.label = point.getLabel(); this.kind = point.getKind(); this.unit = point.getUnit();
            this.result = result; this.reading = reading; this.comment = comment; this.photos = joinPhotos(photos);
        }
        public String getPointId()       { return pointId; }
        public String getLabel()         { return label; }
        public CheckPointKind getKind()  { return kind; }
        public String getUnit()          { return unit; }
        public CheckResult getResult()   { return result; }
        public Double getReading()       { return reading; }
        public String getComment()       { return comment; }
        public List<String> getPhotos()  { return splitPhotos(photos); }
    }

    @Embeddable
    public static class Section {
        @Column private String title;
        @Column(columnDefinition = "TEXT") private String comment;
        @Column(columnDefinition = "TEXT") private String photos;

        protected Section() {}
        public Section(String title, String comment, List<String> photos) {
            this.title = title; this.comment = comment; this.photos = joinPhotos(photos);
        }
        public String getTitle()         { return title; }
        public String getComment()       { return comment; }
        public List<String> getPhotos()  { return splitPhotos(photos); }
    }

    protected CheckReport() {} // for JPA

    public CheckReport(String taskId, long alertNumber, String technicianEmail, int round, Instant submittedAt) {
        this.taskId = taskId;
        this.alertNumber = alertNumber;
        this.technicianEmail = technicianEmail;
        this.round = round;
        this.submittedAt = submittedAt;
    }

    public void setConclusion(PumpArrivalState arrivalState, CheckVerdict verdict, FalseAlarmCause falseAlarmCause,
                              InconclusiveReason inconclusiveReason, boolean urgentStop, String comment) {
        this.arrivalState = arrivalState;
        this.verdict = verdict;
        this.falseAlarmCause = falseAlarmCause;
        this.inconclusiveReason = inconclusiveReason;
        this.urgentStop = urgentStop;
        this.comment = comment;
    }

    public void setNextStep(Boolean canHandle, String handleMessage, Double estimatedHours, String partsNeeded,
                            CannotHandleReason cannotHandleReason, String cannotHandleComment) {
        this.canHandle = canHandle;
        this.handleMessage = handleMessage;
        this.estimatedHours = estimatedHours;
        this.partsNeeded = partsNeeded;
        this.cannotHandleReason = cannotHandleReason;
        this.cannotHandleComment = cannotHandleComment;
    }

    public void setVerification(String code, String hash) {
        this.verificationCode = code;
        this.contentHash = hash;
    }

    // every photo of the report, the points' and the sections'
    public List<String> allPhotos() {
        List<String> all = new ArrayList<>();
        results.forEach(r -> all.addAll(r.getPhotos()));
        sections.forEach(s -> all.addAll(s.getPhotos()));
        return all;
    }

    public String getId()                            { return id; }
    public String getTaskId()                        { return taskId; }
    public long getAlertNumber()                     { return alertNumber; }
    public String getTechnicianEmail()               { return technicianEmail; }
    public int getRound()                            { return round; }
    public Instant getSubmittedAt()                  { return submittedAt; }
    public PumpArrivalState getArrivalState()        { return arrivalState; }
    public CheckVerdict getVerdict()                 { return verdict; }
    public FalseAlarmCause getFalseAlarmCause()      { return falseAlarmCause; }
    public InconclusiveReason getInconclusiveReason(){ return inconclusiveReason; }
    public boolean isUrgentStop()                    { return urgentStop; }
    public String getComment()                       { return comment; }
    public Boolean getCanHandle()                    { return canHandle; }
    public String getHandleMessage()                 { return handleMessage; }
    public Double getEstimatedHours()                { return estimatedHours; }
    public String getPartsNeeded()                   { return partsNeeded; }
    public CannotHandleReason getCannotHandleReason(){ return cannotHandleReason; }
    public String getCannotHandleComment()           { return cannotHandleComment; }
    public List<Result> getResults()                 { return results; }
    public List<Section> getSections()               { return sections; }
    public String getVerificationCode()              { return verificationCode; }
    public String getContentHash()                   { return contentHash; }
}
