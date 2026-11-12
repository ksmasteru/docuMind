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
The user isn't sent: it comes from the token. The id is what a ticket is found by
(the control sheets opened outside a task: several drafts of one form, FormDraftService.tickets).
*/
public record FormDraftDto(
    String id,

    String templateId,

    // null for a standalone checklist
    String taskId,

    String payload,

    // shown as "Brouillon enregistré à 14:32"
    Instant updatedAt,

    // a ticket's "PHB2-0412 · 06/10/2026"; null for the other drafts
    String label
)
{
    public static FormDraftDto from(FormDraft draft) {
        return new FormDraftDto(draft.getId(), draft.getTemplateId(), draft.getTaskId(),
                draft.getPayload(), draft.getUpdatedAt(), draft.getLabel());
    }
}
