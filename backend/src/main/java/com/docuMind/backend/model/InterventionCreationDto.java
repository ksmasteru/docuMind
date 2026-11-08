package com.docuMind.backend.model;

import jakarta.validation.constraints.NotBlank;

// body sent to create a workshop intervention, by a manager from an alert or by Sales for a client.
// No origin and no launchedBy here: the service takes them from the caller's token and role.
public record InterventionCreationDto(
    @NotBlank(message = "equipmentId must not be blank")
    String equipmentId,

    @NotBlank(message = "fault must not be blank")
    String fault,

    boolean urgent,

    // required from a manager: the alert case the request answers; ignored from Sales
    Integer alertNumber,

    // optional: Sales usually knows them, a manager doesn't
    String client,
    String customerOrderNumber
)
{}
