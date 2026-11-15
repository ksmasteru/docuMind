package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.enums.AlertRequestStatus;
import com.docuMind.backend.model.enums.AlertVerdict;

// One alert case as the web app reads it (alertStore.js): the same shape the browser used to keep in
// localStorage (times in milliseconds, severity in lowercase), plus what the field adds: the fault
// report, the technicians' verdicts and their requests to intervene. Names come with the emails.
public record AlertCaseView(
    long number,
    String key,
    String pumpId,
    String site,
    String kind,
    String source,          // TWIN, FIELD
    String severity,        // warning, critical
    String message,
    String status,          // NEW, ACKNOWLEDGED, IN_PROGRESS, RESOLVED
    String priority,        // TaskPriority
    long raisedAt,
    Long clearedAt,
    Long resolvedAt,
    Report report,          // null for a twin alert
    List<Verification> verifications, // each technician's latest verdict, oldest first
    List<Request> requests,
    List<Order> orders,
    List<Intervention> interventions,
    List<Event> events,
    String verification,    // AlertVerification: TO_CHECK, CHECK_ORDERED, CONFIRMED, FALSE_ALARM, INCONCLUSIVE
    Check check,            // the current or last check, null when none was ever sent
    String closeReason,     // AlertCloseReason, once closed
    String closeComment,
    Recurrence recurrence)  // a twin alert found false in the 30 days before this case opened, else null
{
    // the earlier false alarm: its case, when it was closed, what the check found and who checked it.
    // count: false alarms closed on this alert in those 30 days; worse: this case is more severe than
    // the false alarm was
    public record Recurrence(long number, Long closedAt, String cause, String technicianEmail, String technicianName,
                             int count, boolean worse) {}

    // the current check task and its latest report, in short (the full report: GET /api/v1/checks/{taskId})
    public record Check(String taskId, String technicianEmail, String technicianName, String taskStatus,
                        String statusComment, boolean selfAssigned, long assignedAt, Long submittedAt,
                        Integer round, String verdict, String falseAlarmCause, String inconclusiveReason,
                        boolean urgentStop, Boolean canHandle, String cannotHandleReason, String comment) {}

    public record Report(String by, String byName, String equipmentModel, String title, String description, List<String> imageIds) {}

    public record Verification(String technicianEmail, String name, AlertVerdict verdict, String comment, long at) {}

    public record Request(String id, String technicianEmail, String name, String message, AlertRequestStatus status,
                          long at, String decidedBy, String decidedByName, Long decidedAt, String comment, String taskId) {}

    public record Order(String taskId, String title, String technicianEmail, String technicianName, long at) {}

    public record Intervention(String id, String number, long at) {}

    // by: an email (the twin's own steps have none); byName: that person's name
    public record Event(String type, long at, String by, String byName, String from, String to,
                        String text, String severity, String message) {}
}
