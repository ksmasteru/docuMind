package com.docuMind.backend.model;

import java.time.Instant;

import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;

// One line of the technician's « Envoyés » (GET /api/v1/task/mine/sent): a report he sent and what
// became of it. SUBMITTED: it waits for its review; APPROVED: validated, by whom and when.
public record SentTask(
    String id,
    String title,
    TaskType taskType,          // VERIFICATION: a check, whose report is on its alert
    String equipmentId,
    TaskStatus status,
    Instant submittedAt,
    Instant closedAt,           // when it was validated
    String reviewerName,        // who validated it, null while it waits
    String followUp,            // what the reviewer wrote when validating (« Suite donnée »), if anything
    String submissionId,        // the checklist to open read-only; null for a check
    SubmissionStatus submissionStatus,
    Long alertNumber,
    boolean workshop
) {}
