package com.docuMind.backend.model;

import java.time.Instant;

/*
A saved draft, as the app gets it back when a form is opened:
{
  "templateId": "8e8c5c3e-…",
  "taskId": "7c1f…",
  "payload": "{\"answers\":{\"I1\":{\"value\":\"bon\"}},\"equipment\":\"MP1\",…}",
  "updatedAt": "2026-11-03T14:32:05Z"
}
payload is the form state exactly as the app saved it: the app JSON.parse's it and fills its fields.
No question types here: the app already has them from the template.
Not sent on purpose: the id and the user (the draft is found by user + form + task).
*/
public record FormDraftDto(
    String templateId,

    // null for a standalone checklist
    String taskId,

    String payload,

    // shown as "Brouillon enregistré à 14:32"
    Instant updatedAt
)
{
    public static FormDraftDto from(FormDraft draft) {
        return new FormDraftDto(draft.getTemplateId(), draft.getTaskId(),
                draft.getPayload(), draft.getUpdatedAt());
    }
}
