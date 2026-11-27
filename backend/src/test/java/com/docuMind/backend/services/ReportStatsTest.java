package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.ReportStats;
import com.docuMind.backend.model.ReportStats.TechnicianRow;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.model.enums.UserRole;

// How the manager's « Tableau de bord » counts (ReportStatsService.build, plan_report_stats.md): a small team,
// the last 30 days, every figure checked by hand. Without Spring or a database.
class ReportStatsTest {

    private static final Instant NOW = Instant.parse("2026-11-23T12:00:00Z");
    private static final String A = "a@phova.com", B = "b@phova.com", C = "c@phova.com", M = "m@phova.com";
    private static final CheckListTemplate DEMONTAGE = template("Rapport d'expertise V2 (démontage)");
    private static final CheckListTemplate MONTAGE = template("Rapport d'expertise V2 (montage)");

    private final Map<String, List<TaskEvent>> events = new HashMap<>();
    private final Map<String, List<CheckListSubmission>> reports = new HashMap<>();

    private ReportStats stats()
    {
        // A and B are in the team (B did nothing); C left it but still has a task
        TaskModel t1 = task("t1", A, TaskStatus.APPROVED, false, LocalDate.of(2026, 11, 20));
        t1.setWorkedSeconds(3600);
        t1.setSubmittedAt(ago(3));      // the version validated
        report("t1", DEMONTAGE, ago(5), SubmissionStatus.CONFORME);
        report("t1", DEMONTAGE, ago(3), SubmissionStatus.CONFORME);    // its correction
        event("t1", TaskStatus.SUBMITTED, TaskStatus.RETURNED, ago(4));
        event("t1", TaskStatus.SUBMITTED, TaskStatus.APPROVED, ago(2));

        TaskModel t2 = task("t2", A, TaskStatus.SUBMITTED, true, null);  // his own report, waiting
        t2.setSubmittedAt(ago(1));
        t2.setLatestSubmissionId("s-t2");
        report("t2", MONTAGE, ago(1), SubmissionStatus.NON_CONFORME);

        TaskModel t3 = task("t3", C, TaskStatus.ASSIGNED, false, LocalDate.of(2026, 11, 21));  // late

        TaskModel t4 = task("t4", A, TaskStatus.APPROVED, false, null);  // the period before
        t4.setSubmittedAt(ago(40));
        report("t4", DEMONTAGE, ago(40), SubmissionStatus.CONFORME);
        event("t4", TaskStatus.SUBMITTED, TaskStatus.APPROVED, ago(39));

        Map<String, User> people = Map.of(A, user("ua", "Amine", A), B, user("ub", "Badr", B), C, user("uc", "Chama", C));
        return ReportStatsService.build(30, NOW, List.of(t1, t2, t3, t4), events, reports, Set.of(A, B), people, "Karim", List.of());
    }

    @Test
    void theFigures()
    {
        ReportStats.Figures f = stats().figures();
        assertEquals(2, f.filed(), "t1 and t2: first reports; t1's correction isn't a new report, t4 is older");
        assertEquals(1, f.filedBefore(), "t4, in the 30 days before");
        assertEquals(1, f.ownInitiative(), "t2");
        assertEquals(1, f.corrections());
        assertEquals(1, f.approved(), "t1 (t4 was validated before the period)");
        assertEquals(1, f.waiting());
        assertEquals(ago(1), f.oldestWaitingSince());
        assertEquals(0.0, f.firstTimeRight(), "t1 was sent back once");
        assertEquals(1.0, f.onTime(), "t1's validated version was sent on its due day");
        assertEquals(86400L, f.averageReviewSeconds(), "sent 3 days ago, validated 2 days ago");
        assertEquals(1.0 / 3, f.nonConform(), 1e-9, "t1's two versions and t2's: one non conforme");
        assertEquals(1, f.late(), "t3");
    }

    @Test
    void eachTechniciansLine()
    {
        List<TechnicianRow> rows = stats().technicians();
        assertEquals(List.of("Amine", "Badr", "Chama"), rows.stream().map(TechnicianRow::name).toList(), "most filed first, then by name");
        TechnicianRow amine = rows.get(0);
        assertEquals(2, amine.filed());
        assertEquals(1, amine.corrections());
        assertEquals(1, amine.approved());
        assertEquals(1, amine.returns());
        assertEquals(3600L, amine.averageWorkedSeconds());
        assertEquals(ago(1), amine.lastReportAt());
        TechnicianRow badr = rows.get(1);
        assertEquals(0, badr.filed(), "a teammate with nothing in the period still has his line");
        assertNull(badr.firstTimeRight());
        assertTrue(badr.inTeam());
        TechnicianRow chama = rows.get(2);
        assertFalse(chama.inTeam(), "no longer in the team");
        assertEquals(1, chama.late());
    }

    @Test
    void theSeriesTheFormsAndTheLists()
    {
        ReportStats s = stats();
        assertEquals("day", s.bucket());
        assertEquals(30, s.series().size(), "one column per day, empty ones included");
        assertEquals(LocalDate.of(2026, 11, 23), s.series().get(29).start());
        assertEquals(2, s.series().stream().mapToInt(ReportStats.Bucket::filed).sum());
        assertEquals(1, s.series().get(29 - 5).filed(), "t1, filed 5 days ago");
        assertEquals(List.of("Rapport d'expertise V2 (démontage)", "Rapport d'expertise V2 (montage)"),
                s.byForm().stream().map(ReportStats.FormCount::title).toList());
        assertEquals("s-t2", s.waiting().get(0).submissionId());
        assertEquals("Chama", s.late().get(0).technicianName());
    }

    @Test
    void longerPeriodsGoByWeekOrMonth()
    {
        Map<LocalDate, Integer> none = Map.of();
        List<ReportStats.Bucket> weeks = ReportStatsService.series("week", 90, LocalDate.of(2026, 11, 23), none);
        assertEquals(14, weeks.size(), "90 days from Monday 23 November start on Wednesday 26 August: its week, then 13 more");
        assertEquals(LocalDate.of(2026, 8, 24), weeks.get(0).start());
        assertEquals(LocalDate.of(2026, 11, 23), ReportStatsService.stepOf(LocalDate.of(2026, 11, 26), "week"), "a week starts on Monday");
        assertEquals(1, ReportStatsService.series("month", 0, LocalDate.of(2026, 11, 23), none).size(), "everything, no report: this month");
        assertEquals(4, ReportStatsService.series("month", 0, LocalDate.of(2026, 11, 23), Map.of(LocalDate.of(2026, 8, 1), 2)).size(),
                "from the first month with a report");
    }

    // ------------------------------------------------------------------ helpers

    private static Instant ago(int days)
    {
        return NOW.minus(Duration.ofDays(days));
    }

    private static TaskModel task(String id, String technician, TaskStatus status, boolean own, LocalDate due)
    {
        TaskModel t = new TaskModel("Tâche " + id, TaskType.CORRECTIVE, technician, M, "", null, due);
        t.setId(id);
        t.setStatus(status);
        t.setSelfAssigned(own);
        return t;
    }

    private void report(String taskId, CheckListTemplate template, Instant at, SubmissionStatus status)
    {
        CheckListSubmission s = new CheckListSubmission();
        s.setTemplate(template);
        s.setTaskId(taskId);
        s.setStatus(status);
        ReflectionTestUtils.setField(s, "submittedAt", at);
        reports.computeIfAbsent(taskId, k -> new java.util.ArrayList<>()).add(s);
    }

    private void event(String taskId, TaskStatus from, TaskStatus to, Instant at)
    {
        events.computeIfAbsent(taskId, k -> new java.util.ArrayList<>())
            .add(TaskEvent.statusChanged(taskId, "", M, from, to, null, null, at));
    }

    private static CheckListTemplate template(String title)
    {
        CheckListTemplate t = new CheckListTemplate();
        t.setTitle(title);
        return t;
    }

    private static User user(String id, String name, String email)
    {
        User u = new User(name, email, "x", UserRole.USER);
        u.setId(id);
        return u;
    }
}
