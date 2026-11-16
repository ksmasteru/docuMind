package com.docuMind.backend.model;

import java.time.Instant;

// A manager canceled a task (TaskService.cancelTask). The alert the task was made from notes it
// (AlertService), so its activity says why the work order stopped.
public record TaskCanceledEvent(String taskId, Long alertNumber, String title, String comment,
                                String byEmail, Instant at) {}
