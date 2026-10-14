package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.enums.AnswerType;
import com.docuMind.backend.model.enums.ChecklistType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

public record FormCreationDto(
    @NotBlank(message = "title must not be blank")
    String title,

    @NotNull(message = "type must not be null")
    ChecklistType type,

    @NotBlank(message = "instructions must not be blank")
    String instructions,

    // @Valid makes the validator also check every FormItem inside the list
    @NotEmpty(message = "a form must have at least one item")
    List<@Valid FormItem> items
)
{
    public record FormItem(
        String labelAr,

        @NotBlank(message = "labelFr must not be blank")
        String labelFr,

        boolean critical,

        @NotNull(message = "answerType must not be null")
        AnswerType answerType
    )
    {}
}
