package com.docuMind.backend.security;

import jakarta.persistence.*;
import java.time.Instant;
import com.docuMind.backend.model.User;

@Entity
@Table(name = "refresh_tokens", indexes = {
    // Replaces MongoDB's @Indexed(unique = true) on token —
    // the column itself is unique, plus an index for fast lookup
    // since findByToken() is called on every authenticated request.
    @Index(name = "idx_refresh_tokens_token", columnList = "token")
})
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String token;

    @Column(nullable = false)
    private Instant expiryDate;

    // @DocumentReference becomes a proper FK join.
    // LAZY loading means the User isn't fetched from the DB unless
    // you actually call getUser() — same behaviour as DocumentReference.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private boolean revoked = false;

    public Long getId()                      { return id; }
    public void setId(Long id)               { this.id = id; }
    public String getToken()                 { return token; }
    public void setToken(String token)       { this.token = token; }
    public Instant getExpiryDate()           { return expiryDate; }
    public void setExpiryDate(Instant t)     { this.expiryDate = t; }
    public User getUser()                    { return user; }
    public void setUser(User user)           { this.user = user; }
    public boolean isRevoked()               { return revoked; }
    public void setRevoked(boolean revoked)  { this.revoked = revoked; }
}