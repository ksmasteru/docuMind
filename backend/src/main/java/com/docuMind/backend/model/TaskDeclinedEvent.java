package com.docuMind.backend.model;

import java.time.Instant;

// published by TaskService when a technician declines a task (ASSIGNED → DECLINED): a declined check
// sends its alert back to "À vérifier" (CheckService)
public record TaskDeclinedEvent(String taskId, String technicianEmail, String comment, Instant at) {}
