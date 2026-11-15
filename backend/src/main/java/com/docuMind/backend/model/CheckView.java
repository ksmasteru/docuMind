package com.docuMind.backend.model;

import java.util.List;

// One check task with its points and reports (GET /api/v1/checks/{taskId}): what the technician fills,
// and what the manager reads. Times in milliseconds, like the alerts.
public record CheckView(
    String taskId,
    long alertNumber,
    String pumpId,
    String title,
    String instructions,
    String status,          // TaskStatus
    String statusComment,   // why it was returned, declined or canceled
    String technicianEmail,
    String technicianName,
    String managerEmail,
    boolean selfAssigned,
    long assignedAt,
    Long startedAt,
    long workedSeconds,
    List<Point> points,
    List<Report> reports)   // the latest round first
{
    public record Point(String id, int position, String label, String kind, String unit, Double twinValue,
                        Double warnLimit, Double critLimit, boolean photoRequired, boolean custom) {}

    public record Report(String id, int round, long submittedAt, String arrivalState, String verdict,
                         String falseAlarmCause, String inconclusiveReason, boolean urgentStop, String comment,
                         Boolean canHandle, String handleMessage, Double estimatedHours, String partsNeeded,
                         String cannotHandleReason, String cannotHandleComment,
                         List<Result> results, List<Section> sections) {}

    public record Result(String pointId, String label, String kind, String unit, String result, Double reading,
                         String comment, List<String> photos) {}

    public record Section(String title, String comment, List<String> photos) {}
}
