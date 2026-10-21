package com.docuMind.backend.model;

import java.util.List;

// GET /api/v1/submissions/{id}/preview: the submission's PDF, one PNG per page,
// base64-encoded, so the mobile app can show it without a PDF viewer.
public record SubmissionPreview(
    List<String> pages
)
{}
