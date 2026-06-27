package com.docuMind.backend.security;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.DocumentReference;
import java.time.Instant;
import com.docuMind.backend.model.User;

@Document(collection = "refresh_tokens")
public class RefreshToken {

    @Id
    private String id; // MongoDB uses String IDs by default

    @Indexed(unique = true) //helps find token FAST.
    private String token;

    // expireAfterSeconds = 0 tells MongoDB to delete this document 
    // the exact moment the clock hits the 'expiryDate' timestamp.
    @Indexed(expireAfter = "0s")
    private Instant expiryDate;

    // DocumentReference links this token to your User document without embedding it
    @DocumentReference
    private User user;

    private boolean revoked = false; 

    // Getters and Setters
    public boolean isRevoked() { return revoked; }
    public void setRevoked(boolean revoked) { this.revoked = revoked; }
    // Getters, Setters, and Constructors
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public Instant getExpiryDate() { return expiryDate; }
    public void setExpiryDate(Instant expiryDate) { this.expiryDate = expiryDate; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
}
