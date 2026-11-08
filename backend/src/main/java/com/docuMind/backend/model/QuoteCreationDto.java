package com.docuMind.backend.model;

import jakarta.validation.constraints.NotBlank;

// "Générer le devis" (step 10): the intervention to quote
public record QuoteCreationDto(
    @NotBlank(message = "interventionId must not be blank")
    String interventionId
) {}
