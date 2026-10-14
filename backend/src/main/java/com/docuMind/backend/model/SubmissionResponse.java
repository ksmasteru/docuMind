package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.SubmissionStatus;

// returned after a submission is saved: { "id": "...", "status": "NON_CONFORME" }
public record SubmissionResponse(
    String id,
    SubmissionStatus status
)
{}
