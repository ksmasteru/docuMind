package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.StatusReason;

import jakarta.validation.constraints.NotBlank;

// a report sent back to the technician: what to redo is required.
// reason: MISSING_INFO, WRONG_MEASUREMENT or OTHER; OTHER when left out
public record TaskReturnDto(
    StatusReason reason,
    @NotBlank(message = "comment must not be blank")
    String comment
) {}
