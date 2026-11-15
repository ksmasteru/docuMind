package com.docuMind.backend.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

// One step of an alert case's activity (the alert page's feed). Only ever added.
// type: raised, escalated, cleared, reactivated (the twin) · reported (a technician's fault report) ·
// status, priority, comment, order, workshop (the manager) · verified, request, request-accepted,
// request-refused (the field). A String, not an enum: new kinds of steps need no database change.
@Entity
@Table(name = "alert_event", indexes = @Index(name = "idx_alert_event_case", columnList = "case_number, at"))
public class AlertEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_number", nullable = false)
    private AlertCase alertCase;

    @Column(nullable = false, length = 24)
    private String type;

    @Column(nullable = false)
    private Instant at;

    @Column // who did it (an email); null for what the twin did
    private String byEmail;

    @Column(length = 64) // status / priority / severity before; for "verified", unused
    private String fromValue;

    @Column // after; the verdict (CONFIRMED, FALSE_ALARM); the technician of an order or a request
    private String toValue;

    @Column(columnDefinition = "TEXT") // a comment, an order's title, an intervention's number
    private String text;

    @Column(length = 16)
    private String severity;

    @Column(columnDefinition = "TEXT") // the twin's message at that moment
    private String message;

    protected AlertEvent() {} // for JPA

    private AlertEvent(String type, Instant at, String byEmail) {
        this.type = type;
        this.at = at;
        this.byEmail = byEmail;
    }

    public static AlertEvent of(String type, Instant at, String byEmail) {
        return new AlertEvent(type, at, byEmail);
    }

    public AlertEvent from(String value)     { this.fromValue = value; return this; }
    public AlertEvent to(String value)       { this.toValue = value; return this; }
    public AlertEvent text(String value)     { this.text = value; return this; }
    public AlertEvent severity(String value) { this.severity = value; return this; }
    public AlertEvent message(String value)  { this.message = value; return this; }

    void attachTo(AlertCase alertCase)       { this.alertCase = alertCase; }

    public String getId()           { return id; }
    public String getType()         { return type; }
    public Instant getAt()          { return at; }
    public String getByEmail()      { return byEmail; }
    public String getFromValue()    { return fromValue; }
    public String getToValue()      { return toValue; }
    public String getText()         { return text; }
    public String getSeverity()     { return severity; }
    public String getMessage()      { return message; }
}
