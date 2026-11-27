package com.docuMind.backend.services;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.ReportStats;
import com.docuMind.backend.model.ReportStats.Bucket;
import com.docuMind.backend.model.ReportStats.Figures;
import com.docuMind.backend.model.ReportStats.FormCount;
import com.docuMind.backend.model.ReportStats.Late;
import com.docuMind.backend.model.ReportStats.ManagerOption;
import com.docuMind.backend.model.ReportStats.TechnicianRow;
import com.docuMind.backend.model.ReportStats.Waiting;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.TaskEventRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.TeamRepository;
import com.docuMind.backend.repository.UserRepository;

import jakarta.transaction.Transactional;

// The manager's « Tableau de bord » of reports (plan_report_stats.md).
//
// Whose reports: the tasks that name the manager, the ones he sent and the ones his technicians started
// themselves to file a report on their own (OwnReportService). The super admin: every manager's, or one's.
// Checks on site (levée de doute) are left out: they have no report form.
//
// A task's first report is « filed »; the versions after it (sent back, corrected) are « corrections ».
// « Bon du premier coup » and « à l'heure » follow the technician profile's rules (TeamService.performance).
// The data is read in four queries (tasks, their history, their reports, the people), then counted by build(),
// which needs no database.
@Service
public class ReportStatsService {
    static final ZoneId PLANT_ZONE = ZoneId.of("Africa/Casablanca");
    static final Set<TaskStatus> OPEN = EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.STARTED, TaskStatus.BLOCKED, TaskStatus.RETURNED);
    static final int LIST_SIZE = 5;

    private final TaskRepository taskRepository;
    private final TaskEventRepository taskEventRepository;
    private final SubmissionRepository submissionRepository;
    private final TeamRepository teamRepository;
    private final UserRepository userRepository;

    public ReportStatsService(TaskRepository taskRepository, TaskEventRepository taskEventRepository,
                              SubmissionRepository submissionRepository, TeamRepository teamRepository,
                              UserRepository userRepository)
    {
        this.taskRepository = taskRepository;
        this.taskEventRepository = taskEventRepository;
        this.submissionRepository = submissionRepository;
        this.teamRepository = teamRepository;
        this.userRepository = userRepository;
    }

    // days: the last N days, 0 = everything; manager: the super admin's choice of one manager (ignored for a manager)
    @Transactional
    public ReportStats stats(String callerEmail, int days, String manager)
    {
        User caller = userRepository.findByEmail(callerEmail)
            .orElseThrow(() -> new AccessDeniedException("unknown caller"));
        String scopeEmail;
        List<ManagerOption> managers = List.of();
        if (caller.getRole() == UserRole.MANAGER)
            scopeEmail = caller.getEmail();
        else if (caller.getRole() == UserRole.ADMIN)
        {
            scopeEmail = manager == null || manager.isBlank() ? null : manager.strip();
            managers = userRepository.findByRole(UserRole.MANAGER).stream()
                .sorted(Comparator.comparing(User::getName, String.CASE_INSENSITIVE_ORDER))
                .map(m -> new ManagerOption(m.getEmail(), m.getName())).toList();
        }
        else
            throw new AccessDeniedException("the report figures are the managers' and the admin's");

        List<TaskModel> tasks = (scopeEmail == null ? taskRepository.findAll() : taskRepository.findByManagerEmail(scopeEmail))
            .stream().filter(t -> t.getTaskType() != TaskType.VERIFICATION).toList();
        List<String> ids = tasks.stream().map(TaskModel::getId).toList();
        Map<String, List<TaskEvent>> events = ids.isEmpty() ? Map.of()
            : taskEventRepository.findByTaskIdInOrderByOccurredAtAsc(ids).stream()
                .collect(Collectors.groupingBy(TaskEvent::getTaskId));
        Map<String, List<CheckListSubmission>> reports = ids.isEmpty() ? Map.of()
            : submissionRepository.findByTaskIdInOrderBySubmittedAtAsc(ids).stream()
                .collect(Collectors.groupingBy(CheckListSubmission::getTaskId));

        // the people: the manager's team (everyone, even with nothing in the period), or every technician
        List<User> roster = scopeEmail == null ? userRepository.findAllTechnicians()
            : teamRepository.findByManager_Email(scopeEmail).map(team -> List.copyOf(team.getTechnicians())).orElse(List.of());
        Set<String> emails = tasks.stream().map(TaskModel::getTechnicianEmail).collect(Collectors.toSet());
        roster.forEach(u -> emails.add(u.getEmail()));
        Map<String, User> people = emails.isEmpty() ? Map.of()
            : userRepository.findByEmailIn(emails).stream().collect(Collectors.toMap(User::getEmail, Function.identity(), (a, b) -> a));

        String scope = scopeEmail == null ? "Tous les managers"
            : userRepository.findByEmail(scopeEmail).map(User::getName).orElse(scopeEmail);
        return build(days, Instant.now(), tasks, events, reports,
            roster.stream().map(User::getEmail).collect(Collectors.toSet()), people, scope, managers);
    }

    // ------------------------------------------------------------------ the counting, without a database

    // team: the emails of the scope's technicians (their rows show even with nothing in the period)
    static ReportStats build(int days, Instant now, Collection<TaskModel> tasks, Map<String, List<TaskEvent>> eventsByTask,
                             Map<String, List<CheckListSubmission>> reportsByTask, Set<String> team, Map<String, User> people,
                             String scope, List<ManagerOption> managers)
    {
        LocalDate today = LocalDate.ofInstant(now, PLANT_ZONE);
        Instant from = days > 0 ? now.minus(Duration.ofDays(days)) : Instant.EPOCH;
        Instant before = days > 0 ? from.minus(Duration.ofDays(days)) : null;

        int filed = 0, filedBefore = 0, own = 0, corrections = 0, approvedCount = 0, rightFirstTime = 0, dueCount = 0,
            onTime = 0, versions = 0, nonConform = 0;
        long reviewSeconds = 0;
        int reviewed = 0;
        Map<LocalDate, Integer> perBucket = new HashMap<>();
        Map<String, Integer> perForm = new HashMap<>();
        Map<String, Row> rows = new LinkedHashMap<>();
        team.forEach(email -> rows.put(email, new Row(email)));
        List<TaskModel> waiting = new ArrayList<>();
        List<TaskModel> late = new ArrayList<>();
        String bucket = days == 0 ? "month" : days <= 31 ? "day" : "week";

        for (TaskModel task : tasks)
        {
            Row row = rows.computeIfAbsent(task.getTechnicianEmail(), Row::new);
            List<CheckListSubmission> reports = reportsByTask.getOrDefault(task.getId(), List.of()).stream()
                .filter(r -> r.getSubmittedAt() != null)
                .sorted(Comparator.comparing(CheckListSubmission::getSubmittedAt)).toList();
            List<TaskEvent> events = eventsByTask.getOrDefault(task.getId(), List.of());
            int returns = (int) events.stream().filter(e -> e.getToStatus() == TaskStatus.RETURNED).count();

            if (!reports.isEmpty())
            {
                CheckListSubmission first = reports.get(0);
                row.lastReportAt = max(row.lastReportAt, reports.get(reports.size() - 1).getSubmittedAt());
                if (in(first.getSubmittedAt(), from, now))
                {
                    filed++;
                    row.filed++;
                    if (task.isSelfAssigned())
                        own++;
                    perBucket.merge(stepOf(LocalDate.ofInstant(first.getSubmittedAt(), PLANT_ZONE), bucket), 1, Integer::sum);
                    perForm.merge(first.getTemplate() == null ? "—" : first.getTemplate().getTitle(), 1, Integer::sum);
                }
                if (before != null && in(first.getSubmittedAt(), before, from) && first.getSubmittedAt().isBefore(from))
                    filedBefore++;
                for (int i = 1; i < reports.size(); i++)
                    if (in(reports.get(i).getSubmittedAt(), from, now))
                    {
                        corrections++;
                        row.corrections++;
                    }
                for (CheckListSubmission report : reports)
                    if (in(report.getSubmittedAt(), from, now))
                    {
                        versions++;
                        if (report.getStatus() == SubmissionStatus.NON_CONFORME)
                            nonConform++;
                    }
            }
            row.returns += (int) events.stream()
                .filter(e -> e.getToStatus() == TaskStatus.RETURNED && in(e.getOccurredAt(), from, now)).count();

            // validated in the period: its last approval
            TaskEvent approval = null;
            for (TaskEvent e : events)
                if (e.getToStatus() == TaskStatus.APPROVED)
                    approval = e;
            if (task.getStatus() == TaskStatus.APPROVED && approval != null && in(approval.getOccurredAt(), from, now))
            {
                approvedCount++;
                row.approved++;
                row.workedSeconds += task.getWorkedSeconds();
                if (returns == 0)
                {
                    rightFirstTime++;
                    row.rightFirstTime++;
                }
                if (task.getDueDate() != null && task.getSubmittedAt() != null)
                {
                    dueCount++;
                    row.due++;
                    if (!LocalDate.ofInstant(task.getSubmittedAt(), PLANT_ZONE).isAfter(task.getDueDate()))
                    {
                        onTime++;
                        row.onTime++;
                    }
                }
                if (task.getSubmittedAt() != null && !approval.getOccurredAt().isBefore(task.getSubmittedAt()))
                {
                    reviewSeconds += Duration.between(task.getSubmittedAt(), approval.getOccurredAt()).getSeconds();
                    reviewed++;
                }
            }

            if (task.getStatus() == TaskStatus.SUBMITTED)
                waiting.add(task);
            if (OPEN.contains(task.getStatus()))
            {
                row.open++;
                if (task.getDueDate() != null && task.getDueDate().isBefore(today))
                {
                    row.late++;
                    late.add(task);
                }
            }
        }

        Instant oldest = waiting.stream().map(TaskModel::getSubmittedAt).filter(t -> t != null).min(Comparator.naturalOrder()).orElse(null);
        Figures figures = new Figures(filed, before == null ? null : filedBefore, own, corrections, approvedCount,
            waiting.size(), oldest, ratio(rightFirstTime, approvedCount), ratio(onTime, dueCount),
            reviewed == 0 ? null : reviewSeconds / reviewed, ratio(nonConform, versions), late.size());

        Function<String, String> nameOf = email -> people.containsKey(email) ? people.get(email).getName() : email;
        List<TechnicianRow> technicianRows = rows.values().stream()
            .map(r -> new TechnicianRow(people.containsKey(r.email) ? people.get(r.email).getId() : null, nameOf.apply(r.email),
                r.email, team.contains(r.email), r.filed, r.corrections, r.approved, r.returns,
                ratio(r.rightFirstTime, r.approved), ratio(r.onTime, r.due),
                r.approved == 0 ? null : r.workedSeconds / r.approved, r.open, r.late, r.lastReportAt))
            .sorted(Comparator.comparingInt(TechnicianRow::filed).reversed()
                .thenComparing(TechnicianRow::name, String.CASE_INSENSITIVE_ORDER))
            .toList();

        List<FormCount> byForm = perForm.entrySet().stream()
            .map(e -> new FormCount(e.getKey(), e.getValue()))
            .sorted(Comparator.comparingInt(FormCount::filed).reversed().thenComparing(FormCount::title))
            .toList();

        List<Waiting> waitingList = waiting.stream()
            .sorted(Comparator.comparing(TaskModel::getSubmittedAt, Comparator.nullsLast(Comparator.naturalOrder())))
            .limit(LIST_SIZE)
            .map(t -> new Waiting(t.getId(), t.getLatestSubmissionId(), t.getTitle(), nameOf.apply(t.getTechnicianEmail()), t.getSubmittedAt()))
            .toList();
        List<Late> lateList = late.stream()
            .sorted(Comparator.comparing(TaskModel::getDueDate))
            .limit(LIST_SIZE)
            .map(t -> new Late(t.getId(), t.getTitle(), nameOf.apply(t.getTechnicianEmail()), t.getDueDate(), t.getStatus()))
            .toList();

        return new ReportStats(days, scope, figures, bucket, series(bucket, days, today, perBucket), byForm,
            technicianRows, waitingList, lateList, managers);
    }

    // every step of the period, oldest first, empty ones included: days, weeks (from Monday) or months.
    // « Everything » starts at the first month with a report (the current month without any)
    static List<Bucket> series(String bucket, int days, LocalDate today, Map<LocalDate, Integer> perBucket)
    {
        List<Bucket> out = new ArrayList<>();
        LocalDate end = stepOf(today, bucket);
        LocalDate start = switch (bucket) {
            case "day" -> today.minusDays(days - 1L);
            case "week" -> stepOf(today.minusDays(days - 1L), bucket);
            default -> perBucket.keySet().stream().min(Comparator.naturalOrder()).orElse(end);
        };
        for (LocalDate step = start; !step.isAfter(end); step = next(step, bucket))
            out.add(new Bucket(step, perBucket.getOrDefault(step, 0)));
        return out;
    }

    static LocalDate stepOf(LocalDate day, String bucket)
    {
        return switch (bucket) {
            case "day" -> day;
            case "week" -> day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            default -> day.withDayOfMonth(1);
        };
    }

    private static LocalDate next(LocalDate step, String bucket)
    {
        return switch (bucket) {
            case "day" -> step.plusDays(1);
            case "week" -> step.plusWeeks(1);
            default -> step.plusMonths(1);
        };
    }

    // [from, to]: from included, to included
    private static boolean in(Instant at, Instant from, Instant to)
    {
        return at != null && !at.isBefore(from) && !at.isAfter(to);
    }

    private static Double ratio(int part, int whole)
    {
        return whole == 0 ? null : (double) part / whole;
    }

    private static Instant max(Instant a, Instant b)
    {
        return a == null ? b : b == null ? a : a.isAfter(b) ? a : b;
    }

    // one technician's counts while they add up
    private static final class Row {
        final String email;
        int filed, corrections, approved, returns, rightFirstTime, due, onTime, open, late;
        long workedSeconds;
        Instant lastReportAt;

        Row(String email) { this.email = email; }
    }
}
