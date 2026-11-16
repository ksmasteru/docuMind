package com.docuMind.backend.model;

import java.time.Instant;

// A manager gave a task to another technician (TaskService.reassignTask). The alert the task was made
// from follows (AlertService): its work order now names the new technician.
public record TaskReassignedEvent(String taskId, Long alertNumber, String previousTechnicianEmail,
                                  String newTechnicianEmail, String byEmail, Instant at) {}
