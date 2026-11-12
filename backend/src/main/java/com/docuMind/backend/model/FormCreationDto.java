package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.enums.AnswerType;
import com.docuMind.backend.model.enums.ChecklistType;
import com.docuMind.backend.model.enums.FormLayout;
import com.docuMind.backend.model.enums.UserRole;
import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record FormCreationDto(
    // the columns are varchar(255) (CheckListTemplate, CheckListItem): a longer text is refused here,
    // by field, instead of failing in the database
    @NotBlank(message = "title must not be blank")
    @Size(max = 255, message = "title is at most 255 characters")
    String title,

    @NotNull(message = "type must not be null")
    ChecklistType type,

    @NotBlank(message = "instructions must not be blank")
    @Size(max = 255, message = "instructions are at most 255 characters")
    String instructions,

    // @Valid makes the validator also check every FormItem inside the list
    @NotEmpty(message = "a form must have at least one item")
    List<@Valid FormItem> items,

    // optional, null for the original checklists: CONTROL_SHEET for the quality control sheets
    FormLayout layout,

    // optional: the paper sheet it replaces, printed in the PDF's header
    @Size(max = 64, message = "paperReference is at most 64 characters")
    String paperReference,
    @Size(max = 16, message = "paperEdition is at most 16 characters")
    String paperEdition,
    @Size(max = 16, message = "paperDate is at most 16 characters")
    String paperDate,

    // optional: who may fill it (null or empty = every role) and who may read every report sent with it
    List<UserRole> fillRoles,
    List<UserRole> readRoles
)
{
    public record FormItem(
        @Size(max = 255, message = "labelAr is at most 255 characters")
        String labelAr,

        @NotBlank(message = "labelFr must not be blank")
        @Size(max = 255, message = "labelFr is at most 255 characters")
        String labelFr,

        boolean critical,

        @NotNull(message = "answerType must not be null")
        AnswerType answerType,

        // optional: required by SINGLE_CHOICE / MULTI_CHOICE / PARTS_SUMMARY, checked by
        // StructuredAnswers.checkOptions (e.g. { "choices": ["Bon état", "Corrosion"], "allowOther": true })
        JsonNode options
    )
    {}
}
