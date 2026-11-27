// ONE NOTIFICATION FOR ONE PERSON: what changed, in a line, and the page that shows it.
// Written by NotificationService after an action is saved; the bell of the web pages reads them
// (NotificationController), and they go out by e-mail when an SMTP account is set (NotificationMailer).
// A role's queue ("étape 13 à traiter") gives each user of the role his own row, so each keeps his own
// read state.
package com.docuMind.backend.model;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;

import com.docuMind.backend.model.enums.NotificationKind;

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
@Table(name = "notification", indexes = {
    // the bell: one person's newest, and his unread count
    @Index(name = "idx_notification_recipient_created", columnList = "recipient_email, created_at"),
    @Index(name = "idx_notification_recipient_read", columnList = "recipient_email, read_at")
})
public class Notification {
    // the longest title and body kept; longer ones are cut with "…"
    public static final int TITLE_MAX = 255;
    public static final int BODY_MAX = 1000;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String recipientEmail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private NotificationKind kind;

    @Column(nullable = false, length = TITLE_MAX) // "Nouvelle tâche : Vérifier le palier"
    private String title;

    @Column(length = BODY_MAX) // the detail: the pump, who did it, the comment
    private String body;

    @Column // the web page it opens ("/atelier/…"), null when there is none to open
    private String link;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column // null while unread
    private Instant readAt;

    protected Notification() {} // for JPA

    public Notification(String recipientEmail, NotificationKind kind, String title, String body, String link)
    {
        this.recipientEmail = recipientEmail;
        this.kind = kind;
        this.title = cut(title, TITLE_MAX);
        this.body = body == null || body.isBlank() ? null : cut(body.strip(), BODY_MAX);
        this.link = link;
    }

    private static String cut(String text, int max)
    {
        return text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }

    public String getId()               { return id; }
    public String getRecipientEmail()   { return recipientEmail; }
    public NotificationKind getKind()   { return kind; }
    public String getTitle()            { return title; }
    public String getBody()             { return body; }
    public String getLink()             { return link; }
    public Instant getCreatedAt()       { return createdAt; }
    public Instant getReadAt()          { return readAt; }
    public void setReadAt(Instant at)   { this.readAt = at; }
}
