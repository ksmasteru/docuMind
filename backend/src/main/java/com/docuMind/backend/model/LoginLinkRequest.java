package com.docuMind.backend.model;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

// POST /api/v1/login-links: the technician the link signs in as, and for how many days (7 if left out)
public record LoginLinkRequest(
    @NotBlank(message = "email must not be blank")
    @Email(message = "email must be a valid email")
    String email,

    Integer days
)
{}
