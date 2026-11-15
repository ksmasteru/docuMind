package com.docuMind.backend.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.docuMind.backend.model.enums.EventType;
import com.docuMind.backend.model.enums.StatusReason;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;

// GET /api/v1/team/technicians/{id}: one technician of the manager's team, his profile page.
// Every task he was given, newest first, each with the reports he sent for it (a task sent back
// has several) and its timeline: who moved it, when, and the remarks (reason, comment).
public record TechnicianProfile(
    TeamResponse.Technician technician,
    String managerName,      // whose team he is in
    Performance performance,
    List<Task> tasks)
{
    // what the tasks add up to; rates are null when there is nothing to measure yet
    public record Performance(
        int totalTasks,
        int activeTasks,           // ASSIGNED, STARTED, BLOCKED, RETURNED
        int toReview,              // SUBMITTED
        int approved,
        int declined,
        int canceled,              // CANCELED or REJECTED
        int returns,               // how many times a report was sent back, all tasks together
        Double firstTimeRightRate, // approved without ever being sent back / approved
        Double onTimeRate,         // approved with a due date, report sent by that day / those approved
        long workedSeconds,        // all tasks, the period running now included
        Long averageWorkedSeconds, // per approved task
        int nonConformReports      // reports that found the equipment NON_CONFORME
    ) {}

    public record Task(
        String id,
        String title,
        TaskType taskType,
        TaskPriority priority,
        TaskStatus status,
        StatusReason statusReason,
        String statusComment,
        String equipmentId,
        String instructions,        // what the manager asked
        LocalDate dueDate,
        String managerEmail,        // who assigned it
        boolean workshop,           // a workshop intervention's task, reviewed by the Workshop Lead
        Instant createdAt,
        Instant firstStartedAt,
        Instant submittedAt,
        Instant closedAt,
        long workedSeconds,         // the period running now included
        int returns,
        List<Report> reports,       // oldest first: the last one is the current report
        List<Event> events)         // oldest first
    {}

    public record Report(
        String id,
        String formTitle,
        SubmissionStatus status,
        LocalDate inspectionDate,
        Instant submittedAt,
        String remarks)             // what the technician wrote in the report's remarks
    {}

    public record Event(
        EventType eventType,
        String actorEmail,
        String actorName,           // null when the account is gone
        TaskStatus fromStatus,
        TaskStatus toStatus,
        StatusReason reason,
        String comment,
        Instant occurredAt)
    {}
}
