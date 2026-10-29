package com.docuMind.backend.security;

import java.time.Instant;

import com.docuMind.backend.model.User;

import jakarta.persistence.*;

// A link that signs a technician in without a password: https://<front>/t/<token>.
// Made by a manager to hand out for testing. Only the token's SHA-256 is stored, so
// someone reading this table can't rebuild a working link from it; the token itself
// is shown once, when the link is created.
// It works until it expires or is revoked, from any number of devices.
@Entity
@Table(name = "login_links", indexes = {
    @Index(name = "idx_login_links_token_hash", columnList = "tokenHash")
})
public class LoginLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // SHA-256 of the token, hex
    @Column(nullable = false, unique = true, length = 64)
    private String tokenHash;

    // the technician the link signs in as
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // email of the manager or admin who made it
    @Column(nullable = false)
    private String createdBy;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private boolean revoked = false;

    // last time someone signed in with it; null = never opened
    @Column
    private Instant lastUsedAt;

    public Long getId()                        { return id; }
    public String getTokenHash()               { return tokenHash; }
    public void setTokenHash(String hash)      { this.tokenHash = hash; }
    public User getUser()                      { return user; }
    public void setUser(User user)             { this.user = user; }
    public String getCreatedBy()               { return createdBy; }
    public void setCreatedBy(String email)     { this.createdBy = email; }
    public Instant getCreatedAt()              { return createdAt; }
    public void setCreatedAt(Instant t)        { this.createdAt = t; }
    public Instant getExpiresAt()              { return expiresAt; }
    public void setExpiresAt(Instant t)        { this.expiresAt = t; }
    public boolean isRevoked()                 { return revoked; }
    public void setRevoked(boolean revoked)    { this.revoked = revoked; }
    public Instant getLastUsedAt()             { return lastUsedAt; }
    public void setLastUsedAt(Instant t)       { this.lastUsedAt = t; }
}
