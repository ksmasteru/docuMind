package com.docuMind.backend.model;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

/*
What the client sends when a technician submits a filled form:
{
  "templateId": "8e8c5c3e-…",
  "equipment": "MP1",
  "inspectionDate": "2026-10-06",
  "remarks": "RAS",
  "answers": [
    { "itemId": "I1", "value": "BON" },
    { "itemId": "I4", "value": "MAUVAIS", "comment": "fils cassés près du tambour" }
  ],
  "taskId": "7c1f…"
}
Not sent on purpose: the user (from the token), the date and the status (set by the server).
*/
public record SubmissionRequest(
    @NotBlank(message = "templateId must not be blank")
    String templateId,

    @NotBlank(message = "equipment must not be blank")
    String equipment,

    // the day the inspection was done, chosen by the technician ("2026-10-06").
    // Different from submittedAt, which the server stamps itself.
    @NotNull(message = "inspectionDate must not be null")
    @PastOrPresent(message = "inspectionDate cannot be in the future")
    LocalDate inspectionDate,

    // optional
    String remarks,

    // @Valid makes the validator also check every AnswerItem inside the list
    @NotEmpty(message = "a submission must have at least one answer")
    List<@Valid AnswerItem> answers,

    // optional: the task this report answers. When set, the task moves STARTED -> SUBMITTED
    String taskId,
    // v2 expertise reports only: the parts the technician added (« + Ajouter une pièce »), each
    // with its photos, findings, comment and recommendation. Refused on other forms
    List<@Valid ExtraPart> extraParts
)
{
    public record ExtraPart(
        @NotBlank(message = "an added part needs a name")
        @Size(max = 255, message = "a part name is at most 255 characters")
        String name,
        List<@Valid PhotoItem> photos,
        List<String> findings,          // the ticked findings
        String findingsOther,           // « Autre »
        String comment,
        String recommendation,          // the chosen recommendation
        String recommendationOther      // « Autre », or a justification
    ) {}

    // one photo of an added part: an uploaded image (/api/v1/images) with its title
    public record PhotoItem(
        @NotBlank(message = "each photo needs its imageId")
        String imageId,
        String title,
        String comment
    ) {}

    public record AnswerItem(
        @NotBlank(message = "itemId must not be blank")
        String itemId,

        // required by the service, except where a form lets a question be left empty
        // (the full expertise report: SubmissionService.allowsBlank)
        String value,

        // optional here; the service requires it for a critical MAUVAIS
        String comment
    )
    {}
}
