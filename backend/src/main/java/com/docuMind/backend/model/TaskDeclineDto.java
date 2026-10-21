package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.StatusReason;


import jakarta.validation.constraints.NotNull;

public record TaskDeclineDto(
    @NotNull(message = "reason must not be null")
    StatusReason reason,
    String comment
) {
     
}
