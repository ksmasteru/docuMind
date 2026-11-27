package com.docuMind.backend.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.docuMind.backend.model.enums.TaskStatus;

// The manager's « Tableau de bord » of reports (ReportStatsService, plan_report_stats.md): the figures of a
// period, the reports filed over time and per form, each technician's line, what waits and what is late.
// Rates and averages are null when there is nothing to measure in the period.
public record ReportStats(
    int days,                   // the period: the last N days, 0 = everything
    String scope,               // whose reports: the manager's name, or « Tous les managers »
    Figures figures,
    String bucket,              // the series' step: day | week | month
    List<Bucket> series,        // reports filed per step, oldest first, empty steps included
    List<FormCount> byForm,     // reports filed per form, the most filed first
    List<TechnicianRow> technicians,
    List<Waiting> waiting,      // the 5 oldest reports waiting for review
    List<Late> late,            // the 5 open tasks most behind their due date
    List<ManagerOption> managers) // the super admin's list to pick one manager; empty for a manager
{
    public record Figures(
        int filed,                  // reports filed in the period: a task's first report, not its corrected versions
        Integer filedBefore,        // the same in the period before, null for « everything »
        int ownInitiative,          // of those filed, the ones a technician filed on his own (no task)
        int corrections,            // corrected versions sent in the period, after a report was sent back
        int approved,               // reports validated in the period
        int waiting,                // reports waiting for review now
        Instant oldestWaitingSince, // when the oldest of them was sent
        Double firstTimeRight,      // of those validated in the period, the share never sent back
        Double onTime,              // of those validated in the period with a due date, the share sent by that day
        Long averageReviewSeconds,  // from the validated version being sent to its validation, on average
        Double nonConform,          // of the period's reports (every version), the share « non conforme »
        int late) {}                // open tasks whose due date has passed

    public record Bucket(LocalDate start, int filed) {}

    public record FormCount(String title, int filed) {}

    // id: for the technician's profile; inTeam: false for a technician no longer in the manager's team
    public record TechnicianRow(String id, String name, String email, boolean inTeam, int filed, int corrections,
                                int approved, int returns, Double firstTimeRight, Double onTime,
                                Long averageWorkedSeconds, int open, int late, Instant lastReportAt) {}

    public record Waiting(String taskId, String submissionId, String title, String technicianName, Instant submittedAt) {}

    public record Late(String taskId, String title, String technicianName, LocalDate dueDate, TaskStatus status) {}

    public record ManagerOption(String email, String name) {}
}
