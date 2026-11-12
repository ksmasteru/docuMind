package com.docuMind.backend.model;

// PUT /api/v1/drafts: a form's state as the app keeps it (FormDraftService.save). The user comes from the token
// label: a ticket's "PHB2-0412 · 06/10/2026" (FormDraft.label), ignored for the other drafts
public record FormDraftSaveDto(String templateId, String taskId, String payload, String label) {}
