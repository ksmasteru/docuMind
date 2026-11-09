package com.docuMind.backend.model;

// PUT /api/v1/drafts: a form's state as the app keeps it (FormDraftService.save). The user comes from the token
public record FormDraftSaveDto(String templateId, String taskId, String payload) {}
