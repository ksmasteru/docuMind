package com.docuMind.backend.model.enums;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record TaskDeclineDto(
    @NotNull(message = "reason must not be null")
    StatusReason reason,
    @NotBlank(message = "comment must not be blank ")
    String comment
) {
}
