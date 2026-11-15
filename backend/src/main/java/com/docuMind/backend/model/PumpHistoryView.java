package com.docuMind.backend.model;

import java.time.Instant;
import java.util.List;

import com.docuMind.backend.model.enums.CannotHandleReason;
import com.docuMind.backend.model.enums.CheckVerdict;
import com.docuMind.backend.model.enums.FalseAlarmCause;
import com.docuMind.backend.model.enums.InconclusiveReason;
import com.docuMind.backend.model.enums.StatusReason;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;

// GET /api/v1/pumps/{pumpId}/history: everything the pump went through, newest first. The alerts it
// showed (the twin's and the ones technicians reported, as the alert page reads them), the
// maintenance tasks made on it, each with its latest report, and its checks on site (levée de doute),
// each with its latest round.
public record PumpHistoryView(
    String pumpId,
    List<AlertCaseView> alerts,
    List<Task> tasks,
    List<Check> checks)
{
    // one check task on the pump (also in tasks) and what its latest round found; the verdict and the
    // rest are null while no report was sent (in progress, declined, canceled)
    public record Check(
        String taskId,
        long alertNumber,
        String technicianEmail,
        String technicianName,
        TaskStatus status,
        boolean selfAssigned,
        boolean fieldReport,               // "Signaler une panne": the technician's own finding
        Instant createdAt,
        Instant submittedAt,               // its latest round
        int rounds,                        // 0 while none was sent
        CheckVerdict verdict,
        FalseAlarmCause falseAlarmCause,
        InconclusiveReason inconclusiveReason,
        boolean urgentStop,
        Boolean canHandle,
        CannotHandleReason cannotHandleReason,
        int points,
        int anomalies,
        int photos,
        String comment)
    {}

    public record Task(
        String id,
        String title,
        TaskType taskType,
        TaskPriority priority,
        TaskStatus status,
        StatusReason statusReason,
        String statusComment,
        String technicianEmail,
        String technicianName,
        String managerEmail,
        boolean workshop,
        Instant createdAt,
        Instant firstStartedAt,
        Instant submittedAt,
        Instant closedAt,
        long workedSeconds,
        String latestSubmissionId,          // its checklist; null for a check, whose report is in checks
        SubmissionStatus submissionStatus,  // what the latest report found: CONFORME, NON_CONFORME
        String formTitle,
        Long alertNumber)                   // the alert case it was created from, if any (a check's alert too)
    {}
}
