package com.docuMind.backend.services;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docuMind.backend.exception.AlertException;
import com.docuMind.backend.exception.AlertNotFoundException;
import com.docuMind.backend.exception.TaskNotFoundException;
import com.docuMind.backend.model.AlertCase;
import com.docuMind.backend.model.AlertCaseView;
import com.docuMind.backend.model.AlertEvent;
import com.docuMind.backend.model.AlertForms;
import com.docuMind.backend.model.AlertRequest;
import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.CheckReport;
import com.docuMind.backend.model.PumpHistoryView;
import com.docuMind.backend.model.TaskCanceledEvent;
import com.docuMind.backend.model.TaskCreationDto;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.TaskReassignedEvent;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.AlertCloseReason;
import com.docuMind.backend.model.enums.AlertRequestStatus;
import com.docuMind.backend.model.enums.AlertSeverity;
import com.docuMind.backend.model.enums.AlertSource;
import com.docuMind.backend.model.enums.AlertStatus;
import com.docuMind.backend.model.enums.AlertVerdict;
import com.docuMind.backend.model.enums.AlertVerification;
import com.docuMind.backend.model.enums.CheckResult;
import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.repository.AlertCaseRepository;
import com.docuMind.backend.repository.AlertRequestRepository;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.UserRepository;

// The alert cases (AlertCase), shared by the manager and the technicians in the field.
//
//   the twin     sync(): the browsers running the simulated twin send the alerts that are on; a case
//                opens for a new one, follows it as it gets worse, and notes when it clears.
//                The same logic the browser ran in alertStore.js. Severity only ever goes up here,
//                so a browser whose simulation started later can't lower it.
//   the check    every alert is checked on site before anyone acts on it (CheckService, levée de doute):
//                the manager sends a check, or a technician of the site starts it himself. A work order,
//                a workshop request or a request accepted needs the alert CONFIRMED; closing it needs a
//                check report (confirmed, or a false alarm the manager agrees with), and a reason.
//   the manager  status, priority, comments, the orders and workshop interventions made from a case,
//                his answer to a technician's request to intervene (accept creates the task), and
//                the check's report: send a new one, send it back, cancel it.
//   technicians  see the open cases of their site, check them, and report a fault the twin did not see.
//                They can't close a case or change its status: that stays the manager's.
@Service
public class AlertService {

    // the newest cases the manager's list reads
    private static final int MANAGER_LIST_SIZE = 300;

    // a twin alert that comes back within this long after it was found false is marked as a repeat
    static final java.time.Duration REPEAT_WINDOW = java.time.Duration.ofDays(30);

    private final AlertCaseRepository caseRepository;
    private final AlertRequestRepository requestRepository;
    private final UserRepository userRepository;
    private final TaskRepository taskRepository;
    private final SubmissionRepository submissionRepository;
    private final TaskService taskService;
    private final CheckService checkService;

    public AlertService(AlertCaseRepository caseRepository, AlertRequestRepository requestRepository,
                        UserRepository userRepository,
                        TaskRepository taskRepository, SubmissionRepository submissionRepository,
                        TaskService taskService, CheckService checkService)
    {
        this.caseRepository = caseRepository;
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
        this.taskRepository = taskRepository;
        this.submissionRepository = submissionRepository;
        this.taskService = taskService;
        this.checkService = checkService;
    }

    // ---------- reading ----------

    // the manager: every case, newest first. A technician: the open cases of his site (every site
    // when his account has none) and the ones he reported
    @Transactional(readOnly = true)
    public List<AlertCaseView> list(Authentication auth)
    {
        if (!isTechnician(auth))
            return views(caseRepository.findAllByOrderByRaisedAtDesc(PageRequest.of(0, MANAGER_LIST_SIZE)));
        String site = worksiteOf(auth.getName());
        return views(site == null
            ? caseRepository.findForTechnicianAnySite(auth.getName())
            : caseRepository.findForTechnicianAtSite(site, auth.getName()));
    }

    @Transactional(readOnly = true)
    public AlertCaseView get(long number, Authentication auth)
    {
        return view(visibleCase(number, auth));
    }

    // ---------- the twin ----------

    // synchronized: two browsers syncing at once would both open the same new case
    // (open_key is unique, so the second one fails instead of doubling it)
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN', 'USER')")
    @Transactional
    public synchronized void sync(AlertForms.Sync body)
    {
        Instant now = body.at() == null ? Instant.now() : Instant.ofEpochMilli(body.at());
        Set<String> live = new HashSet<>();

        for (AlertForms.LiveAlert alert : body.alerts()) {
            AlertSeverity severity = severity(alert.severity());
            String key = alert.id().strip();
            live.add(key);
            Instant since = alert.since() == null ? now : Instant.ofEpochMilli(alert.since());

            Optional<AlertCase> open = caseRepository.findByOpenKey(key);
            if (open.isEmpty()) {
                // a case resolved while its alert was still on covers it until the alert clears. After a
                // false alarm, only at the severity it was checked at: worse, it deserves a new look
                List<AlertCase> covering = caseRepository.findByAlertKeyAndResolvedAtGreaterThanEqual(key, since);
                boolean worse = false;
                if (!covering.isEmpty()) {
                    boolean falseAlarms = covering.stream().allMatch(c -> c.getCloseReason() == AlertCloseReason.FALSE_ALARM);
                    int checkedAt = covering.stream().mapToInt(c -> c.getSeverity().ordinal()).max().orElse(0);
                    if (!falseAlarms || severity.ordinal() <= checkedAt)
                        continue;
                    worse = true;
                }
                // a new case worse than the false alarm covering its alert opens now, not when the alert came on
                Instant raisedAt = worse ? now : since;
                String kind = key.contains(":") ? key.substring(key.indexOf(':') + 1) : "alert";
                AlertCase opened = new AlertCase(key, alert.pumpId(), alert.site(), kind, AlertSource.TWIN,
                    severity, alert.message(), priorityFor(severity), raisedAt);
                opened.log(AlertEvent.of("raised", raisedAt, null).severity(lower(severity)).message(alert.message()));
                rememberFalseAlarm(opened, worse);
                caseRepository.save(opened);
                continue;
            }

            AlertCase existing = open.get();
            if (existing.getSource() != AlertSource.TWIN)
                continue;
            if (severity.ordinal() > existing.getSeverity().ordinal()) {
                existing.log(AlertEvent.of("escalated", now, null)
                    .from(lower(existing.getSeverity())).to(lower(severity)).message(alert.message()));
                existing.setSeverity(severity);
            }
            if (existing.getClearedAt() != null) {
                existing.log(AlertEvent.of("reactivated", now, null).message(alert.message()));
                existing.setClearedAt(null);
            }
            if (alert.message() != null)
                existing.setMessage(alert.message());
        }

        // an open twin case whose alert is gone: the reading is back within limits.
        // A technician's report is not in the twin's feed, so it is never cleared this way
        for (AlertCase existing : caseRepository.findBySourceAndStatusNot(AlertSource.TWIN, AlertStatus.RESOLVED)) {
            if (existing.getClearedAt() == null && !live.contains(existing.getAlertKey())) {
                existing.setClearedAt(now);
                existing.log(AlertEvent.of("cleared", now, null));
            }
        }
    }

    // A twin alert found false in the last 30 days (same pump, same kind) comes back: the new case is
    // still to check, like every alert, but it says so ("recurred"), and the check is sent knowing it.
    // worse: it opened because the reading got worse than when it was found false
    private void rememberFalseAlarm(AlertCase opened, boolean worse)
    {
        Instant from = opened.getRaisedAt().minus(REPEAT_WINDOW);
        caseRepository.findFirstByAlertKeyAndCloseReasonAndResolvedAtGreaterThanEqualOrderByResolvedAtDesc(
                opened.getAlertKey(), AlertCloseReason.FALSE_ALARM, from)
            .ifPresent(previous -> {
                int count = (int) caseRepository.countByAlertKeyAndCloseReasonAndResolvedAtGreaterThanEqual(
                    opened.getAlertKey(), AlertCloseReason.FALSE_ALARM, from);
                opened.followsFalseAlarm(previous.getNumber(), count);
                opened.log(AlertEvent.of("recurred", opened.getRaisedAt(), null)
                    .to(String.valueOf(previous.getNumber())).from(worse ? "worse" : null).text(String.valueOf(count)));
            });
    }

    // ---------- the manager ----------

    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView setStatus(long number, String value, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        AlertStatus status = parse(AlertStatus.class, value, "statut");
        if (status == AlertStatus.RESOLVED && alertCase.isOpen())
            throw new AlertException("Pour clore l'alerte, utilisez « Clore » : il faut en donner la raison.");
        if (status != alertCase.getStatus()) {
            Instant now = Instant.now();
            alertCase.log(AlertEvent.of("status", now, auth.getName()).from(alertCase.getStatus().name()).to(status.name()));
            alertCase.setStatus(status, now);
        }
        return view(alertCase);
    }

    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView setPriority(long number, String value, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        TaskPriority priority = parse(TaskPriority.class, value, "priorité");
        if (priority != alertCase.getPriority()) {
            alertCase.log(AlertEvent.of("priority", Instant.now(), auth.getName())
                .from(alertCase.getPriority().name()).to(priority.name()));
            alertCase.setPriority(priority);
        }
        return view(alertCase);
    }

    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView addComment(long number, String text, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        alertCase.log(AlertEvent.of("comment", Instant.now(), auth.getName()).text(text.strip()));
        return view(alertCase);
    }

    // a work order was created from the case (AssignTask.jsx): the case is now being worked on
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView linkOrder(long number, AlertForms.Order order, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        requireConfirmed(alertCase);
        TaskModel task = taskRepository.findById(order.taskId())
            .orElseThrow(() -> new TaskNotFoundException("no task with id " + order.taskId()));
        checkService.settle(alertCase, auth.getName());
        addOrder(alertCase, task.getId(), order.title() != null ? order.title() : task.getTitle(),
            task.getTechnicianEmail(), auth.getName(), Instant.now());
        return view(alertCase);
    }

    // the pump was sent to the workshop from the case (WorkshopRequest.jsx)
    @PreAuthorize("!hasRole('USER')")
    @Transactional
    public AlertCaseView linkIntervention(long number, AlertForms.Intervention intervention, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        requireConfirmed(alertCase);
        checkService.settle(alertCase, auth.getName());
        Instant now = Instant.now();
        alertCase.getInterventions().add(new AlertCase.LinkedIntervention(intervention.id(), intervention.number(), now));
        alertCase.log(AlertEvent.of("workshop", now, auth.getName()).text(intervention.number()));
        startWork(alertCase, auth.getName(), now);
        return view(alertCase);
    }

    // a technician's request accepted: his task, created through the usual task flow
    // (TaskService.createNewTask), then linked to the case like any order
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView acceptRequest(String requestId, TaskCreationDto body, Authentication auth)
    {
        AlertRequest request = pendingRequest(requestId);
        AlertCase alertCase = request.getAlertCase();
        requireConfirmed(alertCase);
        checkService.settle(alertCase, auth.getName());
        String equipment = body.equipmentId() == null || body.equipmentId().isBlank() ? alertCase.getPumpId() : body.equipmentId();
        TaskCreationDto task = new TaskCreationDto(body.title(), body.taskType(), request.getTechnicianEmail(),
            equipment, body.instructions(), body.dueDate(), body.priority(), body.templateId());
        String taskId = taskService.createNewTask(task, auth);

        Instant now = Instant.now();
        request.accept(auth.getName(), taskId, now);
        alertCase.log(AlertEvent.of("request-accepted", now, auth.getName())
            .to(request.getTechnicianEmail()).text(body.title()));
        addOrder(alertCase, taskId, body.title(), request.getTechnicianEmail(), auth.getName(), now);
        return view(alertCase);
    }

    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView refuseRequest(String requestId, String comment, Authentication auth)
    {
        AlertRequest request = pendingRequest(requestId);
        checkService.settle(request.getAlertCase(), auth.getName());
        Instant now = Instant.now();
        request.refuse(auth.getName(), comment.strip(), now);
        request.getAlertCase().log(AlertEvent.of("request-refused", now, auth.getName())
            .to(request.getTechnicianEmail()).text(comment.strip()));
        return view(request.getAlertCase());
    }

    // the alert closed, with its reason. Never without a check report: a false alarm the technician
    // found (the manager agrees), or a confirmed alert (repaired, planned, risk accepted…)
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView close(long number, AlertForms.Close form, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        if (!alertCase.isOpen())
            throw new AlertException("Cette alerte est déjà close.");
        AlertVerification verification = alertCase.getVerification();
        AlertCloseReason reason = form.reason();
        String comment = blankToNull(form.comment());
        if (verification != AlertVerification.CONFIRMED && verification != AlertVerification.FALSE_ALARM)
            throw new AlertException("Une alerte se clôt après sa levée de doute : elle n'a pas encore été vérifiée sur place.");
        if (verification == AlertVerification.FALSE_ALARM && reason != AlertCloseReason.FALSE_ALARM)
            throw new IllegalArgumentException("Le technicien a conclu à une fausse alerte : confirmez-la, ou envoyez une nouvelle levée de doute.");
        if (verification == AlertVerification.CONFIRMED && reason == AlertCloseReason.FALSE_ALARM)
            throw new IllegalArgumentException("L'alerte a été confirmée sur place : ce n'est pas une fausse alerte.");
        if (reason == AlertCloseReason.FIXED && alertCase.getOrders().isEmpty() && alertCase.getInterventions().isEmpty())
            throw new IllegalArgumentException("« Réparée » suppose un ordre de travail ou une intervention atelier.");
        if (reason == AlertCloseReason.OTHER && comment == null)
            throw new IllegalArgumentException("Précisez la raison.");

        Instant now = Instant.now();
        checkService.settle(alertCase, auth.getName());
        alertCase.log(AlertEvent.of("closed", now, auth.getName()).to(reason.name()).text(comment));
        alertCase.close(reason, comment, now);
        return view(alertCase);
    }

    // ---------- the check (levée de doute, CheckService) ----------

    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView orderCheck(long number, AlertForms.CheckOrder form, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        checkService.order(alertCase, form, auth.getName());
        return view(alertCase);
    }

    // a technician starts the check himself, on an alert he can see: his check task's id, to open it
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public SelfCheck selfCheck(long number, AlertForms.SelfCheck form, Authentication auth)
    {
        AlertCase alertCase = visibleCase(number, auth);
        String taskId = checkService.selfStart(alertCase, form, auth);
        return new SelfCheck(taskId, view(alertCase));
    }

    public record SelfCheck(String taskId, AlertCaseView alert) {}

    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView cancelCheck(long number, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        checkService.cancel(alertCase, auth.getName());
        return view(alertCase);
    }

    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public AlertCaseView returnCheck(long number, String comment, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        checkService.returnReport(alertCase, comment, auth.getName());
        return view(alertCase);
    }

    // his check report sent (CheckService.submit): the alert as it is now
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public AlertCaseView submitCheck(String taskId, AlertForms.CheckReportForm form, Authentication auth)
    {
        return view(checkService.submit(taskId, form, auth));
    }

    // ---------- technicians ----------

    // a fault the twin did not see: it becomes an alert case, confirmed by his report (CheckService)
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public AlertCaseView report(AlertForms.FieldReport form, Authentication auth)
    {
        String me = auth.getName();
        AlertSeverity severity = severity(form.severity());
        String pumpId = form.pumpId().strip();
        String site = form.site() != null && !form.site().isBlank() ? form.site().strip() : worksiteOf(me);
        String title = form.title().strip();
        String key = pumpId + ":field:" + UUID.randomUUID().toString().substring(0, 8);
        Instant now = Instant.now();

        AlertCase alertCase = new AlertCase(key, pumpId, site, "field", AlertSource.FIELD,
            severity, title, priorityFor(severity), now);
        alertCase.setReport(me, blankToNull(form.equipmentModel()), title, blankToNull(form.description()), List.of());
        alertCase.log(AlertEvent.of("reported", now, me).severity(lower(severity)).text(title).message(blankToNull(form.description())));
        AlertCase saved = caseRepository.save(alertCase);
        checkService.fieldReport(saved, form.report(), auth);
        return view(saved);
    }

    // ---------- the pump's history ----------

    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional(readOnly = true)
    public PumpHistoryView pumpHistory(String pumpId)
    {
        String id = pumpId.strip();
        List<AlertCase> cases = caseRepository.findByPumpIdIgnoreCaseOrderByRaisedAtDesc(id);
        List<TaskModel> tasks = taskRepository.findByEquipmentIdIgnoreCaseOrderByCreatedAtDesc(id);

        // the alert each task was created from
        Map<String, Long> alertOfTask = new HashMap<>();
        cases.forEach(c -> c.getOrders().forEach(o -> alertOfTask.putIfAbsent(o.getTaskId(), c.getNumber())));
        tasks.forEach(t -> { if (t.getAlertNumber() != null) alertOfTask.putIfAbsent(t.getId(), t.getAlertNumber()); });
        // each task's latest checklist, in one query. A check task's latest "submission" is its check
        // report, not a checklist: it is read below, and the history doesn't link it as one
        List<String> submissionIds = tasks.stream().filter(t -> t.getTaskType() != TaskType.VERIFICATION)
            .map(TaskModel::getLatestSubmissionId).filter(s -> s != null).toList();
        Map<String, CheckListSubmission> submissions = submissionIds.isEmpty() ? Map.of()
            : submissionRepository.findAllById(submissionIds).stream()
                .collect(Collectors.toMap(CheckListSubmission::getId, s -> s));
        Map<String, String> names = namesOf(tasks.stream().map(TaskModel::getTechnicianEmail).toList());

        Instant now = Instant.now();
        List<PumpHistoryView.Task> lines = tasks.stream().map(task -> {
            boolean check = task.getTaskType() == TaskType.VERIFICATION;
            CheckListSubmission report = check || task.getLatestSubmissionId() == null ? null : submissions.get(task.getLatestSubmissionId());
            long running = task.getActiveSince() == null ? 0 : Math.max(0, now.getEpochSecond() - task.getActiveSince().getEpochSecond());
            return new PumpHistoryView.Task(task.getId(), task.getTitle(), task.getTaskType(), task.getPriority(),
                task.getStatus(), task.getStatusReason(), task.getStatusComment(), task.getTechnicianEmail(),
                names.get(task.getTechnicianEmail()), task.getManagerEmail(), task.getInterventionId() != null,
                task.getCreatedAt(), task.getFirstStartedAt(), task.getSubmittedAt(), task.getClosedAt(),
                task.getWorkedSeconds() + running, check ? null : task.getLatestSubmissionId(),
                report == null ? null : report.getStatus(),
                report == null || report.getTemplate() == null ? null : report.getTemplate().getTitle(),
                alertOfTask.get(task.getId()));
        }).toList();

        // its checks on site, each with its latest round
        List<TaskModel> checkTasks = tasks.stream()
            .filter(t -> t.getTaskType() == TaskType.VERIFICATION && t.getAlertNumber() != null).toList();
        Map<String, CheckReport> latest = checkService.latestReports(checkTasks.stream().map(TaskModel::getId).toList());
        Set<Long> fieldCases = cases.stream().filter(c -> c.getSource() == AlertSource.FIELD)
            .map(AlertCase::getNumber).collect(Collectors.toSet());
        List<PumpHistoryView.Check> checks = checkTasks.stream().map(task -> {
            CheckReport r = latest.get(task.getId());
            return new PumpHistoryView.Check(task.getId(), task.getAlertNumber(), task.getTechnicianEmail(),
                names.get(task.getTechnicianEmail()), task.getStatus(), task.isSelfAssigned(),
                fieldCases.contains(task.getAlertNumber()), task.getCreatedAt(),
                r == null ? null : r.getSubmittedAt(), r == null ? 0 : r.getRound(),
                r == null ? null : r.getVerdict(), r == null ? null : r.getFalseAlarmCause(),
                r == null ? null : r.getInconclusiveReason(), r != null && r.isUrgentStop(),
                r == null ? null : r.getCanHandle(), r == null ? null : r.getCannotHandleReason(),
                r == null ? 0 : r.getResults().size(),
                r == null ? 0 : (int) r.getResults().stream().filter(x -> x.getResult() == CheckResult.ANOMALY).count(),
                r == null ? 0 : r.allPhotos().size(),
                r == null ? null : r.getComment());
        }).toList();

        return new PumpHistoryView(id, views(cases), lines, checks);
    }

    // ---------- a work order made from a case changes hands or stops (TaskService) ----------

    // the order went to another technician: the case names him, and its activity says so
    @EventListener
    @Transactional
    public void onTaskReassigned(TaskReassignedEvent moved)
    {
        if (moved.alertNumber() == null)
            return;
        caseRepository.findById(moved.alertNumber()).ifPresent(alertCase -> {
            List<AlertCase.LinkedOrder> orders = alertCase.getOrders();
            for (int i = 0; i < orders.size(); i++) {
                AlertCase.LinkedOrder order = orders.get(i);
                if (!order.getTaskId().equals(moved.taskId()))
                    continue;
                orders.set(i, new AlertCase.LinkedOrder(order.getTaskId(), order.getTitle(), moved.newTechnicianEmail(), order.getAt()));
                alertCase.log(AlertEvent.of("order-reassigned", moved.at(), moved.byEmail())
                    .text(order.getTitle()).to(moved.newTechnicianEmail()));
            }
        });
    }

    // the order was canceled: the case's activity says why (the case itself stays as it is, confirmed:
    // the manager sends another order, the workshop, or closes it)
    @EventListener
    @Transactional
    public void onTaskCanceled(TaskCanceledEvent canceled)
    {
        if (canceled.alertNumber() == null)
            return;
        caseRepository.findById(canceled.alertNumber())
            .filter(alertCase -> alertCase.getOrders().stream().anyMatch(o -> o.getTaskId().equals(canceled.taskId())))
            .ifPresent(alertCase -> alertCase.log(AlertEvent.of("order-canceled", canceled.at(), canceled.byEmail())
                .text(canceled.title()).message(canceled.comment())));
    }

    // ---------- at startup ----------

    // the work orders made before tasks recorded their alert get it from the cases' order lists.
    // Runs once per task: afterwards every linked order has its alert
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfillOrderAlerts()
    {
        Map<String, Long> alertOfTask = new HashMap<>();
        caseRepository.findOrderLinks().forEach(row -> alertOfTask.putIfAbsent((String) row[0], (Long) row[1]));
        if (alertOfTask.isEmpty())
            return;
        List<TaskModel> missing = taskRepository.findByIdInAndAlertNumberIsNull(alertOfTask.keySet());
        missing.forEach(task -> task.setAlertNumber(alertOfTask.get(task.getId())));
        if (!missing.isEmpty())
            System.out.println("alert numbers given to " + missing.size() + " older work orders");
    }

    // ---------- helpers ----------

    private static boolean isTechnician(Authentication auth)
    {
        return auth.getAuthorities().stream().anyMatch(a -> "ROLE_USER".equals(a.getAuthority()));
    }

    // the site on his account, null when none (he then sees every site)
    private String worksiteOf(String email)
    {
        return userRepository.findByEmail(email).map(User::getWorksite)
            .filter(site -> site != null && !site.isBlank()).orElse(null);
    }

    private AlertCase byNumber(long number)
    {
        return caseRepository.findById(number)
            .orElseThrow(() -> new AlertNotFoundException("L'alerte #" + number + " n'existe pas."));
    }

    // a technician only reaches the open cases of his site and his own reports; the same 404 otherwise
    private AlertCase visibleCase(long number, Authentication auth)
    {
        AlertCase alertCase = byNumber(number);
        if (!isTechnician(auth))
            return alertCase;
        String me = auth.getName();
        String site = worksiteOf(me);
        boolean mine = me.equals(alertCase.getReportedBy());
        boolean onHisSite = alertCase.isOpen() && (site == null || site.equalsIgnoreCase(alertCase.getSite()));
        if (!mine && !onHisSite)
            throw new AlertNotFoundException("L'alerte #" + number + " n'existe pas.");
        return alertCase;
    }

    // a work order, a workshop request or a request accepted: only once the alert is confirmed on site
    private static void requireConfirmed(AlertCase alertCase)
    {
        if (alertCase.getVerification() != AlertVerification.CONFIRMED)
            throw new AlertException("Cette alerte n'est pas encore confirmée sur place : il faut d'abord sa levée de doute.");
    }

    private AlertRequest pendingRequest(String requestId)
    {
        AlertRequest request = requestRepository.findById(requestId)
            .orElseThrow(() -> new AlertNotFoundException("Cette demande n'existe pas."));
        if (request.getStatus() != AlertRequestStatus.PENDING)
            throw new AlertException("Cette demande a déjà reçu une réponse.");
        return request;
    }

    private void addOrder(AlertCase alertCase, String taskId, String title, String technicianEmail, String by, Instant at)
    {
        // the task remembers its alert, as a check task does: its technician reads the check behind it
        taskRepository.findById(taskId).filter(task -> task.getAlertNumber() == null)
            .ifPresent(task -> task.setAlertNumber(alertCase.getNumber()));
        alertCase.getOrders().add(new AlertCase.LinkedOrder(taskId, title, technicianEmail, at));
        alertCase.log(AlertEvent.of("order", at, by).text(title).to(technicianEmail));
        startWork(alertCase, by, at);
    }

    // an order or a workshop intervention: a new or acknowledged case is now being worked on
    private static void startWork(AlertCase alertCase, String by, Instant at)
    {
        AlertStatus status = alertCase.getStatus();
        if (status == AlertStatus.NEW || status == AlertStatus.ACKNOWLEDGED) {
            alertCase.log(AlertEvent.of("status", at, by).from(status.name()).to(AlertStatus.IN_PROGRESS.name()));
            alertCase.setStatus(AlertStatus.IN_PROGRESS, at);
        }
    }

    private static AlertSeverity severity(String value)
    {
        if ("critical".equalsIgnoreCase(value)) return AlertSeverity.CRITICAL;
        if ("warning".equalsIgnoreCase(value)) return AlertSeverity.WARNING;
        throw new IllegalArgumentException("Gravité inconnue : " + value + " (warning ou critical).");
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value, String what)
    {
        try {
            return Enum.valueOf(type, value.strip().toUpperCase(Locale.ROOT));
        }
        catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Valeur de " + what + " inconnue : " + value);
        }
    }

    // a new case's priority, from its severity (as the browser did)
    private static TaskPriority priorityFor(AlertSeverity severity)
    {
        return severity == AlertSeverity.CRITICAL ? TaskPriority.HIGH : TaskPriority.NORMAL;
    }

    private static String lower(AlertSeverity severity)
    {
        return severity.name().toLowerCase(Locale.ROOT);
    }

    private static String blankToNull(String value)
    {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static Long millis(Instant at)
    {
        return at == null ? null : at.toEpochMilli();
    }

    // ---------- views ----------

    // a HashMap: the twin's own steps have no email, and Map.of() refuses get(null)
    private Map<String, String> namesOf(Collection<String> emails)
    {
        Map<String, String> names = new HashMap<>();
        Set<String> wanted = emails.stream().filter(e -> e != null).collect(Collectors.toSet());
        if (!wanted.isEmpty())
            userRepository.findByEmailIn(wanted).forEach(user -> names.putIfAbsent(user.getEmail(), user.getName()));
        return names;
    }

    private AlertCaseView view(AlertCase alertCase)
    {
        return views(List.of(alertCase)).get(0);
    }

    // the cases with every name they mention, found in one query
    private List<AlertCaseView> views(List<AlertCase> cases)
    {
        Set<String> emails = new HashSet<>();
        for (AlertCase c : cases) {
            emails.add(c.getReportedBy());
            c.getEvents().forEach(e -> emails.add(e.getByEmail()));
            c.getRequests().forEach(r -> { emails.add(r.getTechnicianEmail()); emails.add(r.getDecidedBy()); });
            c.getOrders().forEach(o -> emails.add(o.getTechnicianEmail()));
        }
        // the earlier false alarms the repeats follow, with their checks
        Set<Long> earlierNumbers = cases.stream().map(AlertCase::getFollowsFalseAlarm).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, AlertCase> earlier = new HashMap<>();
        if (!earlierNumbers.isEmpty())
            caseRepository.findAllById(earlierNumbers).forEach(c -> earlier.put(c.getNumber(), c));

        Set<String> checkIds = new HashSet<>();
        cases.forEach(c -> { if (c.getCheckTaskId() != null) checkIds.add(c.getCheckTaskId()); });
        earlier.values().forEach(c -> { if (c.getCheckTaskId() != null) checkIds.add(c.getCheckTaskId()); });
        Map<String, TaskModel> checks = checkService.tasks(checkIds);
        Map<String, CheckReport> reports = checkService.latestReports(checkIds);
        checks.values().forEach(t -> emails.add(t.getTechnicianEmail()));
        Map<String, String> names = namesOf(emails);
        return cases.stream().map(c -> {
            AlertCaseView.Recurrence recurrence = recurrenceOf(c, earlier.get(c.getFollowsFalseAlarm()), checks, reports, names);
            return c.getCheckTaskId() == null ? toView(c, names, null, null, recurrence)
                : toView(c, names, checks.get(c.getCheckTaskId()), reports.get(c.getCheckTaskId()), recurrence);
        }).toList();
    }

    // what a repeat says of the false alarm it follows (null for a case that follows none)
    private static AlertCaseView.Recurrence recurrenceOf(AlertCase c, AlertCase previous, Map<String, TaskModel> checks,
                                                        Map<String, CheckReport> reports, Map<String, String> names)
    {
        if (c.getFollowsFalseAlarm() == null)
            return null;
        TaskModel check = previous == null || previous.getCheckTaskId() == null ? null : checks.get(previous.getCheckTaskId());
        CheckReport report = check == null ? null : reports.get(check.getId());
        String by = check == null ? null : check.getTechnicianEmail();
        return new AlertCaseView.Recurrence(c.getFollowsFalseAlarm(), previous == null ? null : millis(previous.getResolvedAt()),
            report == null || report.getFalseAlarmCause() == null ? null : report.getFalseAlarmCause().name(),
            by, names.get(by), c.getFalseAlarmsBefore(),
            previous != null && c.getSeverity().ordinal() > previous.getSeverity().ordinal());
    }

    // the case's current check, in short: its task, and its latest report once one was sent
    private static AlertCaseView.Check checkView(TaskModel task, CheckReport report, Map<String, String> names)
    {
        if (task == null)
            return null;
        return new AlertCaseView.Check(task.getId(), task.getTechnicianEmail(), names.get(task.getTechnicianEmail()),
            task.getStatus().name(), task.getStatusComment(), task.isSelfAssigned(), task.getCreatedAt().toEpochMilli(),
            millis(task.getSubmittedAt()),
            report == null ? null : report.getRound(),
            report == null ? null : report.getVerdict().name(),
            report == null || report.getFalseAlarmCause() == null ? null : report.getFalseAlarmCause().name(),
            report == null || report.getInconclusiveReason() == null ? null : report.getInconclusiveReason().name(),
            report != null && report.isUrgentStop(),
            report == null ? null : report.getCanHandle(),
            report == null || report.getCannotHandleReason() == null ? null : report.getCannotHandleReason().name(),
            report == null ? null : report.getComment());
    }

    private static AlertCaseView toView(AlertCase c, Map<String, String> names, TaskModel check, CheckReport report,
                                        AlertCaseView.Recurrence recurrence)
    {
        // each technician's latest verdict, in the order they first answered
        Map<String, AlertCaseView.Verification> verdicts = new LinkedHashMap<>();
        c.getEvents().stream().filter(e -> "verified".equals(e.getType())).forEach(e ->
            verdicts.put(e.getByEmail(), new AlertCaseView.Verification(e.getByEmail(), names.get(e.getByEmail()),
                AlertVerdict.valueOf(e.getToValue()), e.getText(), e.getAt().toEpochMilli())));

        AlertCaseView.Report fieldReport = c.getSource() != AlertSource.FIELD ? null
            : new AlertCaseView.Report(c.getReportedBy(), names.get(c.getReportedBy()), c.getEquipmentModel(),
                c.getTitle(), c.getDescription(), List.copyOf(c.getImageIds()));

        List<AlertCaseView.Request> requests = c.getRequests().stream().map(r -> new AlertCaseView.Request(
            r.getId(), r.getTechnicianEmail(), names.get(r.getTechnicianEmail()), r.getMessage(), r.getStatus(),
            r.getRequestedAt().toEpochMilli(), r.getDecidedBy(), names.get(r.getDecidedBy()), millis(r.getDecidedAt()),
            r.getDecisionComment(), r.getTaskId())).toList();

        List<AlertCaseView.Order> orders = c.getOrders().stream().map(o -> new AlertCaseView.Order(
            o.getTaskId(), o.getTitle(), o.getTechnicianEmail(), names.get(o.getTechnicianEmail()),
            o.getAt().toEpochMilli())).toList();

        List<AlertCaseView.Intervention> interventions = c.getInterventions().stream().map(i -> new AlertCaseView.Intervention(
            i.getInterventionId(), i.getInterventionNumber(), i.getAt().toEpochMilli())).toList();

        List<AlertCaseView.Event> events = c.getEvents().stream().map(e -> new AlertCaseView.Event(
            e.getType(), e.getAt().toEpochMilli(), e.getByEmail(), names.get(e.getByEmail()), e.getFromValue(),
            e.getToValue(), e.getText(), e.getSeverity(), e.getMessage())).toList();

        return new AlertCaseView(c.getNumber(), c.getAlertKey(), c.getPumpId(), c.getSite(), c.getKind(),
            c.getSource().name(), lower(c.getSeverity()), c.getMessage(), c.getStatus().name(), c.getPriority().name(),
            c.getRaisedAt().toEpochMilli(), millis(c.getClearedAt()), millis(c.getResolvedAt()),
            fieldReport, new ArrayList<>(verdicts.values()), requests, orders, interventions, events,
            c.getVerification().name(), checkView(check, report, names),
            c.getCloseReason() == null ? null : c.getCloseReason().name(), c.getCloseComment(), recurrence);
    }
}
