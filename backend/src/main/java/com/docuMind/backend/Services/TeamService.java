package com.docuMind.backend.services;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docuMind.backend.exception.InvalidRoleException;
import com.docuMind.backend.exception.TeamException;
import com.docuMind.backend.exception.UserNotFoundException;
import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.Team;
import com.docuMind.backend.model.TeamResponse;
import com.docuMind.backend.model.TeamTechnicianForm;
import com.docuMind.backend.model.TechnicianProfile;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.EventType;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.TaskEventRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.TeamRepository;
import com.docuMind.backend.repository.UserRepository;

// A manager's team (Team): the technicians on his Techniciens page. He adds the ones in no team yet,
// creates accounts for new ones, removes them, and opens each one's profile: every task he was
// given, with its reports and remarks, and what they add up to (TechnicianProfile).
// Every method works on the logged-in manager's own team: the controller passes his email.
@Service
public class TeamService {

    private static final Set<TaskStatus> ACTIVE =
        EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.STARTED, TaskStatus.BLOCKED, TaskStatus.RETURNED);
    // the plant's day, for "report sent by the due date"
    private static final ZoneId PLANT_ZONE = ZoneId.of("Africa/Casablanca");

    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final TaskRepository taskRepository;
    private final TaskEventRepository taskEventRepository;
    private final SubmissionRepository submissionRepository;

    public TeamService(TeamRepository teamRepository, UserRepository userRepository, UserService userService,
                       TaskRepository taskRepository, TaskEventRepository taskEventRepository,
                       SubmissionRepository submissionRepository)
    {
        this.teamRepository = teamRepository;
        this.userRepository = userRepository;
        this.userService = userService;
        this.taskRepository = taskRepository;
        this.taskEventRepository = taskEventRepository;
        this.submissionRepository = submissionRepository;
    }

    // ---------- the team ----------

    // his technicians and the ones he can add. No team yet: an empty list, nothing is created
    @PreAuthorize("hasRole('MANAGER')")
    @Transactional(readOnly = true)
    public TeamResponse getTeam(String managerEmail)
    {
        List<User> members = teamRepository.findByManager_Email(managerEmail)
            .map(team -> new ArrayList<>(team.getTechnicians()))
            .orElseGet(ArrayList::new);
        return response(members);
    }

    // an existing technician joins the team. Already in it: nothing changes
    @PreAuthorize("hasRole('MANAGER')")
    @Transactional
    public TeamResponse addTechnician(String managerEmail, String technicianId)
    {
        User technician = technicianById(technicianId);
        teamRepository.findByTechnicianId(technicianId)
            .filter(team -> !team.getManager().getEmail().equals(managerEmail))
            .ifPresent(team -> {
                throw new TeamException(technician.getName() + " fait déjà partie de l'équipe de "
                    + team.getManager().getName() + ".");
            });
        Team team = teamOf(managerEmail);
        team.addTechnician(technician);
        return response(new ArrayList<>(teamRepository.save(team).getTechnicians()));
    }

    // a new technician account (role USER), which joins the team. He logs in with this e-mail and password
    @PreAuthorize("hasRole('MANAGER')")
    @Transactional
    public TeamResponse createTechnician(String managerEmail, TeamTechnicianForm form)
    {
        String email = form.email().strip();
        if (userRepository.findByEmail(email).isPresent())
            throw new TeamException("Un compte existe déjà avec l'e-mail " + email + ".");
        User account = new User(form.name().strip(), email, form.password(), UserRole.USER);
        if (form.worksite() != null && !form.worksite().isBlank())
            account.setWorksite(form.worksite().strip());
        User technician = userService.registerUser(account); // hashes the password
        Team team = teamOf(managerEmail);
        team.addTechnician(technician);
        return response(new ArrayList<>(teamRepository.save(team).getTechnicians()));
    }

    // he leaves the team; his account and his tasks stay as they are
    @PreAuthorize("hasRole('MANAGER')")
    @Transactional
    public TeamResponse removeTechnician(String managerEmail, String technicianId)
    {
        Team team = teamRepository.findByManager_Email(managerEmail).orElse(null);
        if (team == null || !team.removeTechnician(technicianId))
            throw new UserNotFoundException("Ce technicien ne fait pas partie de votre équipe.");
        return response(new ArrayList<>(teamRepository.save(team).getTechnicians()));
    }

    // ---------- one technician's profile ----------

    @PreAuthorize("hasRole('MANAGER')")
    @Transactional(readOnly = true)
    public TechnicianProfile getProfile(String managerEmail, String technicianId)
    {
        User technician = technicianById(technicianId);
        Team team = teamRepository.findByManager_Email(managerEmail)
            .filter(t -> t.hasTechnician(technicianId))
            .orElseThrow(() -> new AccessDeniedException("Ce technicien ne fait pas partie de votre équipe."));

        List<TaskModel> tasks = taskRepository.findByTechnicianEmailOrderByCreatedAtDesc(technician.getEmail());
        List<String> taskIds = tasks.stream().map(TaskModel::getId).toList();
        Map<String, List<TaskEvent>> eventsByTask = taskIds.isEmpty() ? Map.of()
            : taskEventRepository.findByTaskIdInOrderByOccurredAtAsc(taskIds).stream()
                .collect(Collectors.groupingBy(TaskEvent::getTaskId));
        Map<String, List<CheckListSubmission>> reportsByTask = taskIds.isEmpty() ? Map.of()
            : submissionRepository.findByTaskIdInOrderBySubmittedAtAsc(taskIds).stream()
                .collect(Collectors.groupingBy(CheckListSubmission::getTaskId));

        // who moved the tasks: one query for every name
        Set<String> actors = eventsByTask.values().stream().flatMap(List::stream)
            .map(TaskEvent::getActorEmail).collect(Collectors.toCollection(HashSet::new));
        Map<String, String> names = actors.isEmpty() ? Map.of()
            : userRepository.findByEmailIn(actors).stream()
                .collect(Collectors.toMap(User::getEmail, User::getName, (a, b) -> a));

        Instant now = Instant.now();
        List<TechnicianProfile.Task> lines = tasks.stream().map(task -> {
            List<TaskEvent> events = eventsByTask.getOrDefault(task.getId(), List.of());
            List<CheckListSubmission> reports = reportsByTask.getOrDefault(task.getId(), List.of());
            return new TechnicianProfile.Task(
                task.getId(), task.getTitle(), task.getTaskType(), task.getPriority(), task.getStatus(),
                task.getStatusReason(), task.getStatusComment(), task.getEquipmentId(), task.getInstructions(),
                task.getDueDate(), task.getManagerEmail(), task.getInterventionId() != null,
                task.getCreatedAt(), task.getFirstStartedAt(), task.getSubmittedAt(), task.getClosedAt(),
                workedSeconds(task, now), returnsOf(events),
                reports.stream().map(TeamService::report).toList(),
                events.stream().map(event -> event(event, names)).toList());
        }).toList();

        return new TechnicianProfile(TeamResponse.Technician.from(technician), team.getManager().getName(),
            performance(lines), lines);
    }

    // ---------- helpers ----------

    // the manager's team, created the first time he adds someone
    private Team teamOf(String managerEmail)
    {
        return teamRepository.findByManager_Email(managerEmail).orElseGet(() -> {
            User manager = userRepository.findByEmail(managerEmail)
                .orElseThrow(() -> new UserNotFoundException("no user with email " + managerEmail));
            return teamRepository.save(new Team(manager));
        });
    }

    private User technicianById(String technicianId)
    {
        User user = userRepository.findById(technicianId)
            .orElseThrow(() -> new UserNotFoundException("Ce technicien n'existe pas."));
        if (user.getRole() != UserRole.USER)
            throw new InvalidRoleException(user.getName() + " n'est pas un technicien.");
        return user;
    }

    // the members with their task counts, and the technicians in no team, both by name
    private TeamResponse response(Collection<User> members)
    {
        Map<String, Counts> counts = new HashMap<>();
        if (!members.isEmpty()) {
            List<String> emails = members.stream().map(User::getEmail).toList();
            for (Object[] row : taskRepository.countByTechnicianAndStatus(emails))
                counts.computeIfAbsent((String) row[0], e -> new Counts())
                      .add((TaskStatus) row[1], ((Number) row[2]).intValue(), (Instant) row[3]);
        }
        Comparator<User> byName = Comparator.comparing(User::getName, String.CASE_INSENSITIVE_ORDER);
        List<TeamResponse.Member> lines = members.stream().sorted(byName).map(user -> {
            Counts c = counts.getOrDefault(user.getEmail(), new Counts());
            return new TeamResponse.Member(user.getId(), user.getName(), user.getEmail(), user.getWorksite(),
                c.active, c.toReview, c.approved, c.total, c.lastActivityAt);
        }).toList();

        Set<String> inATeam = new HashSet<>(teamRepository.findAllMemberIds());
        List<TeamResponse.Technician> available = userRepository.findAllTechnicians().stream()
            .filter(user -> !inATeam.contains(user.getId()))
            .sorted(byName)
            .map(TeamResponse.Technician::from)
            .toList();
        return new TeamResponse(lines, available);
    }

    private static final class Counts {
        int active, toReview, approved, total;
        Instant lastActivityAt;

        void add(TaskStatus status, int n, Instant last) {
            total += n;
            if (ACTIVE.contains(status)) active += n;
            if (status == TaskStatus.SUBMITTED) toReview += n;
            if (status == TaskStatus.APPROVED) approved += n;
            if (last != null && (lastActivityAt == null || last.isAfter(lastActivityAt))) lastActivityAt = last;
        }
    }

    // time worked on the task: the closed periods, plus the one running now
    private static long workedSeconds(TaskModel task, Instant now)
    {
        long running = task.getActiveSince() == null ? 0
            : Math.max(0, Duration.between(task.getActiveSince(), now).getSeconds());
        return task.getWorkedSeconds() + running;
    }

    // how many times its report was sent back (a comment on a returned task doesn't count)
    private static int returnsOf(List<TaskEvent> events)
    {
        return (int) events.stream().filter(e -> e.getEventType() == EventType.STATUS_CHANGED
            && e.getToStatus() == TaskStatus.RETURNED && e.getFromStatus() != TaskStatus.RETURNED).count();
    }

    private static TechnicianProfile.Report report(CheckListSubmission submission)
    {
        String form = submission.getTemplate() == null ? null : submission.getTemplate().getTitle();
        return new TechnicianProfile.Report(submission.getId(), form, submission.getStatus(),
            submission.getInspectionDate(), submission.getSubmittedAt(), submission.getRemarks());
    }

    private static TechnicianProfile.Event event(TaskEvent event, Map<String, String> names)
    {
        return new TechnicianProfile.Event(event.getEventType(), event.getActorEmail(),
            names.get(event.getActorEmail()), event.getFromStatus(), event.getToStatus(),
            event.getReason(), event.getComment(), event.getOccurredAt());
    }

    private static TechnicianProfile.Performance performance(List<TechnicianProfile.Task> tasks)
    {
        Map<TaskStatus, Long> byStatus = tasks.stream()
            .collect(Collectors.groupingBy(TechnicianProfile.Task::status, Collectors.counting()));
        Function<TaskStatus, Integer> count = status -> byStatus.getOrDefault(status, 0L).intValue();

        List<TechnicianProfile.Task> approved = tasks.stream()
            .filter(t -> t.status() == TaskStatus.APPROVED).toList();
        long rightFirstTime = approved.stream().filter(t -> t.returns() == 0).count();
        List<TechnicianProfile.Task> due = approved.stream()
            .filter(t -> t.dueDate() != null && t.submittedAt() != null).toList();
        long onTime = due.stream()
            .filter(t -> !LocalDate.ofInstant(t.submittedAt(), PLANT_ZONE).isAfter(t.dueDate())).count();
        long approvedWork = approved.stream().mapToLong(TechnicianProfile.Task::workedSeconds).sum();

        return new TechnicianProfile.Performance(
            tasks.size(),
            (int) tasks.stream().filter(t -> ACTIVE.contains(t.status())).count(),
            count.apply(TaskStatus.SUBMITTED),
            approved.size(),
            count.apply(TaskStatus.DECLINED),
            count.apply(TaskStatus.CANCELED) + count.apply(TaskStatus.REJECTED),
            tasks.stream().mapToInt(TechnicianProfile.Task::returns).sum(),
            approved.isEmpty() ? null : (double) rightFirstTime / approved.size(),
            due.isEmpty() ? null : (double) onTime / due.size(),
            tasks.stream().mapToLong(TechnicianProfile.Task::workedSeconds).sum(),
            approved.isEmpty() ? null : approvedWork / approved.size(),
            (int) tasks.stream().flatMap(t -> t.reports().stream())
                .filter(r -> r.status() == SubmissionStatus.NON_CONFORME).count());
    }
}
