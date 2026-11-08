package com.docuMind.backend.model;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

// "Valider" on the devis page: every part of the devis, in order, replacing what was saved before;
// vatApplicable: the TVA box, ticked when left out (TVA applies by default)
public record QuoteLinesDto(
    @NotEmpty(message = "the devis needs at least one part")
    @Size(max = 200, message = "a devis has at most 200 parts")
    List<@Valid Line> lines,
    Boolean vatApplicable)
{
    public record Line(
        @NotBlank(message = "each part needs a designation")
        @Size(max = 255, message = "a designation is at most 255 characters")
        String designation,
        @Min(value = 1, message = "a quantity is at least 1")
        @Max(value = 100000, message = "a quantity is at most 100000")
        int quantity,
        // MAD, per unit; 0 allowed (a part the client supplies)
        @NotNull(message = "each part needs a unit price")
        @DecimalMin(value = "0.00", message = "a unit price can't be negative")
        @Digits(integer = 10, fraction = 2, message = "a unit price has at most 10 digits and 2 decimals")
        BigDecimal unitPrice
    ) {}
}
