package com.docuMind.backend.model;

import java.time.Instant;

// A new login link. token is only ever returned here; link is the full URL to send when the
// server knows the web app's address (FRONT_END_URL), null otherwise: then it's <web app>/t/<token>.
// id is what DELETE /api/v1/login-links/{id} takes to cancel it.
public record LoginLinkResponse(
    Long id,
    String email,
    String token,
    String link,
    Instant expiresAt
)
{}
