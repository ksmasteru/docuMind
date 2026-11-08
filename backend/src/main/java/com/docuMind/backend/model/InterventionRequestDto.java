package com.docuMind.backend.model;

import jakarta.validation.constraints.NotBlank;

// body sent by Sales while completing the request (step COMPLETER_DEMANDE): replaces these fields
public record InterventionRequestDto(
    @NotBlank(message = "equipmentId must not be blank")
    String equipmentId,

    @NotBlank(message = "fault must not be blank")
    String fault,

    boolean urgent,

    String client,
    String customerOrderNumber
)
{}
