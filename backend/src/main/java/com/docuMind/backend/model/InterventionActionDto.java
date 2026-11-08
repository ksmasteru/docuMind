package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.InterventionAction;

import jakarta.validation.constraints.NotNull;

// one button pressed on the intervention's current step
public record InterventionActionDto(
    @NotNull(message = "action must not be null")
    InterventionAction action,

    // required to cancel (and later to send back)
    String comment
)
{}
