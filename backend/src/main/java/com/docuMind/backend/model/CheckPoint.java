package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.CheckPointKind;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

// One thing to check on site, in a check task (TaskType.VERIFICATION): suggested from the alert by the
// web app (the twin's readings live there), then edited by whoever sent the check (CheckService).
// A MEASURE carries what the twin read when the check was sent, so the report can put both side by side.
@Entity
@Table(name = "check_point", indexes = @Index(name = "idx_check_point_task", columnList = "task_id, position"))
public class CheckPoint {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "task_id", nullable = false, length = 64)
    private String taskId;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CheckPointKind kind;

    @Column(length = 16) // "°C", "mm/s": a MEASURE's unit
    private String unit;

    @Column // the twin's reading when the check was sent
    private Double twinValue;

    @Column // the twin's warning and critical limits for that reading
    private Double warnLimit;

    @Column
    private Double critLimit;

    @Column(nullable = false)
    private boolean photoRequired;

    @Column(nullable = false) // added by hand, not suggested
    private boolean custom;

    protected CheckPoint() {} // for JPA

    public CheckPoint(String taskId, int position, String label, CheckPointKind kind, String unit, Double twinValue,
                      Double warnLimit, Double critLimit, boolean photoRequired, boolean custom) {
        this.taskId = taskId;
        this.position = position;
        this.label = label;
        this.kind = kind;
        this.unit = unit;
        this.twinValue = twinValue;
        this.warnLimit = warnLimit;
        this.critLimit = critLimit;
        this.photoRequired = photoRequired;
        this.custom = custom;
    }

    public String getId()             { return id; }
    public String getTaskId()         { return taskId; }
    public int getPosition()          { return position; }
    public String getLabel()          { return label; }
    public CheckPointKind getKind()   { return kind; }
    public String getUnit()           { return unit; }
    public Double getTwinValue()      { return twinValue; }
    public Double getWarnLimit()      { return warnLimit; }
    public Double getCritLimit()      { return critLimit; }
    public boolean isPhotoRequired()  { return photoRequired; }
    public boolean isCustom()         { return custom; }
}
