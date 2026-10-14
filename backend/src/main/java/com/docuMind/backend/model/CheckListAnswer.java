package com.docuMind.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

// the technician's answer to ONE question, inside ONE submission
@Entity
public class CheckListAnswer{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // many answers → one submission: owning side, holds the submission_id column
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submission_id", nullable = false)
    @JsonIgnore // prevents infinite loop when sending JSON
    private CheckListSubmission submission;

    // many answers → one question (the same question is answered in every submission)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "item_id", nullable = false)
    @JsonIgnore
    private CheckListItem item;

    // "BON" / "MAUVAIS" for BON_MAUVAIS items, free text for TEXT items,
    // later a file reference for IMAGE items. The item's answerType says how to read it.
    @Column(columnDefinition = "TEXT")
    private String value;

    // optional, but required by the service for a critical MAUVAIS
    @Column(columnDefinition = "TEXT")
    private String comment;

    public String getId()                                   { return id; }

    public CheckListSubmission getSubmission()              { return submission; }
    public void setSubmission(CheckListSubmission submission) { this.submission = submission; }

    public CheckListItem getItem()                          { return item; }
    public void setItem(CheckListItem item)                 { this.item = item; }

    public String getValue()                                { return value; }
    public void setValue(String value)                      { this.value = value; }

    public String getComment()                              { return comment; }
    public void setComment(String comment)                  { this.comment = comment; }
}
