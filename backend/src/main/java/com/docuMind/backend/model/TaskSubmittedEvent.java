package com.docuMind.backend.model;

import java.time.Instant;

// published by TaskService.submitTask once the report is saved, in the same transaction.
// InterventionService listens: a workshop task's report moves its intervention to the review step.
// An event rather than a call, so TaskService doesn't depend on InterventionService (which uses it).
public record TaskSubmittedEvent(String taskId, String technicianEmail, Instant submittedAt) {}
