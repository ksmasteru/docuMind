package com.docuMind.backend.model;

import java.time.Instant;
import java.time.LocalDate;

import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskType;

// one line of the manager's review queue (GET /api/v1/task/review): a SUBMITTED task
// and the report sent for it. Built straight by TaskRepository.findTasksToReview,
// one query for the whole list, so the field order here is the query's order.
//
// The ids are what the next screens need:
//   submissionId → GET /api/v1/submissions/{id}/pdf (or /preview) to read the report
//   taskId       → the approve / return / reject routes, once they exist
//   templateId   → GET /api/v1/forms/inspectionForm/{id} for the blank form
// The submission fields are null for a task submitted before latestSubmissionId existed.
public record ReviewTask(
    // ---- task ----
    String taskId,
    String title,
    TaskType taskType,
    TaskPriority priority,
    String equipmentId,
    String technicianEmail,
    String instructions,
    LocalDate dueDate,          // null when the task has no deadline
    Instant assignedAt,         // task creation
    Instant submittedAt,        // when the report was sent
    long workedSeconds,         // time spent STARTED, blocked time not counted

    // ---- report ----
    String submissionId,
    SubmissionStatus submissionStatus, // CONFORME / NON_CONFORME, from the answers
    LocalDate inspectionDate,          // the day the technician says the work was done

    // ---- form ----
    String templateId,
    String templateTitle
)
{}
