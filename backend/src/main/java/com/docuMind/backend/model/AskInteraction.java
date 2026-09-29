package com.docuMind.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;

import com.docuMind.backend.model.enums.AskOutcome;
import com.docuMind.backend.model.enums.Verdict;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
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

// indexingn for fast lookup @Index(name=...)
@Entity
@Table(name = "ask_interaction", indexes = {
    @Index(name = "idx_ask_interaction_user_id", columnList = "userId")
})
public class AskInteraction {

    // returned to the phone so feedback can attach to it
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String userId;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    // as spoken or typed
    @Column(nullable = false, columnDefinition = "TEXT")
    private String questionRaw;

    // after pump names are replaced
    @Column(nullable = false, columnDefinition = "TEXT")
    private String questionNormalised;

    // matched pump, or null
    @Column
    private String pump;

    // what retrieval actually used, one row per chunk in ask_interaction_source
    // most important data to store : feeds rag v3
    // db design ...
    // this is handled by hibernate it wont show on db table
    @ElementCollection
    @CollectionTable(name = "ask_interaction_source",
                     joinColumns = @JoinColumn(name = "interaction_id"))
    // position in the list, 0 = first chunk given to the model
    @OrderColumn(name = "rank")
    private List<RetrievedSource> sources = new ArrayList<>();

    // full text including the sources line
    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;

    @Column(nullable = false)
    private String promptVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Verdict verdict = Verdict.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AskOutcome askOutcome;
    
    // the technician's own words
    @Column(columnDefinition = "TEXT")
    private String correction;

    public AskInteraction() {}

    public String getId()                          { return id; }
    public void setId(String id)                   { this.id = id; }
    public String getUserId()                      { return userId; }
    public void setUserId(String u)                { this.userId = u; }
    public Instant getCreatedAt()                  { return createdAt; }
    public void setCreatedAt(Instant c)            { this.createdAt = c; }
    public String getQuestionRaw()                 { return questionRaw; }
    public void setQuestionRaw(String q)           { this.questionRaw = q; }
    public String getQuestionNormalised()          { return questionNormalised; }
    public void setQuestionNormalised(String q)    { this.questionNormalised = q; }
    public String getPump()                        { return pump; }
    public void setPump(String p)                  { this.pump = p; }
    public List<RetrievedSource> getSources()      { return sources; }
    public void setSources(List<RetrievedSource> s){ this.sources = s; }
    public String getAnswer()                      { return answer; }
    public void setAnswer(String a)                { this.answer = a; }
    public String getPromptVersion()               { return promptVersion; }
    public void setPromptVersion(String v)         { this.promptVersion = v; }
    public Verdict getVerdict()                    { return verdict; }
    public void setVerdict(Verdict v)              { this.verdict = v; }
    public String getCorrection()                  { return correction; }
    public void setCorrection(String c)            { this.correction = c; }
    public AskOutcome getAskOutcome()              { return askOutcome; }
    public void setAskOutcome(AskOutcome o)        { this.askOutcome = o; }
}
