package com.docuMind.backend.services;

import java.time.Instant;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.event.EventListener;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docuMind.backend.exception.AlertException;
import com.docuMind.backend.exception.AlertNotFoundException;
import com.docuMind.backend.exception.TaskNotFoundException;
import com.docuMind.backend.model.AlertCase;
import com.docuMind.backend.model.AlertEvent;
import com.docuMind.backend.model.AlertForms;
import com.docuMind.backend.model.AlertRequest;
import com.docuMind.backend.model.CheckPoint;
import com.docuMind.backend.model.CheckReport;
import com.docuMind.backend.model.CheckView;
import com.docuMind.backend.model.ImageEntity;
import com.docuMind.backend.model.TaskDeclinedEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.AlertRequestStatus;
import com.docuMind.backend.model.enums.AlertVerification;
import com.docuMind.backend.model.enums.CannotHandleReason;
import com.docuMind.backend.model.enums.CheckPointKind;
import com.docuMind.backend.model.enums.CheckResult;
import com.docuMind.backend.model.enums.CheckVerdict;
import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.repository.AlertCaseRepository;
import com.docuMind.backend.repository.CheckPointRepository;
import com.docuMind.backend.repository.CheckReportRepository;
import com.docuMind.backend.repository.ImageEntityRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.TeamRepository;
import com.docuMind.backend.repository.UserRepository;

// The check before acting on an alert (levée de doute, plan_alert_check_flow.md).
//
//   a check task   a real task (TaskType.VERIFICATION, TaskService.createCheckTask) for one technician,
//                  sent by a manager from the alert, or started by the technician himself on site:
//                  then it names his team's manager and starts at once. One open check per alert.
//   its report     what he found (CheckReport), sent with the task like any report (SUBMITTED). Its
//                  verdict applies at once: the alert is confirmed (a mission for the manager), a false
//                  alarm the manager closes, or not conclusive. "Je peux m'en charger" is his request.
//   the manager    settles the check from the alert (AlertService): it is approved when he acts on the
//                  report, returned for more details, or canceled if he'd rather send someone else.
//
// A fault report from a technician ("Signaler une panne") goes through here too: a check report,
// confirmed from the start, on the alert it creates.
@Service
public class CheckService {

    // a check in progress: what the technician still has to do
    private static final Set<TaskStatus> OPEN =
        EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.STARTED, TaskStatus.BLOCKED, TaskStatus.RETURNED);

    private final AlertCaseRepository caseRepository;
    private final CheckPointRepository pointRepository;
    private final CheckReportRepository reportRepository;
    private final TaskRepository taskRepository;
    private final TaskService taskService;
    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final ImageEntityRepository imageRepository;
    private final ReportVerification reportVerification;

    public CheckService(AlertCaseRepository caseRepository, CheckPointRepository pointRepository,
                        CheckReportRepository reportRepository, TaskRepository taskRepository, TaskService taskService,
                        TeamRepository teamRepository, UserRepository userRepository, ImageEntityRepository imageRepository,
                        ReportVerification reportVerification)
    {
        this.caseRepository = caseRepository;
        this.pointRepository = pointRepository;
        this.reportRepository = reportRepository;
        this.taskRepository = taskRepository;
        this.taskService = taskService;
        this.teamRepository = teamRepository;
        this.userRepository = userRepository;
        this.imageRepository = imageRepository;
        this.reportVerification = reportVerification;
    }

    // ---------- starting a check (the caller found the alert and checked who may) ----------

    // the manager sends the check: a first one, or a new one after a false alarm or a check that could
    // not conclude (that report has been read: it is approved)
    @Transactional
    public synchronized void order(AlertCase alertCase, AlertForms.CheckOrder form, String managerEmail)
    {
        requireNoCheck(alertCase, EnumSet.of(AlertVerification.TO_CHECK, AlertVerification.INCONCLUSIVE,
            AlertVerification.FALSE_ALARM));
        settle(alertCase, managerEmail);
        TaskPriority priority = form.priority() != null ? form.priority() : alertCase.getPriority();
        TaskModel task = taskService.createCheckTask(checkTitle(alertCase), form.technicianEmail().strip(), managerEmail,
            managerEmail, alertCase.getPumpId(), blankToNull(form.instructions()), form.dueDate(), priority,
            alertCase.getNumber(), false);
        savePoints(task.getId(), form.points());
        alertCase.checkOrdered(task.getId());
        alertCase.log(AlertEvent.of("check-ordered", Instant.now(), managerEmail).to(task.getTechnicianEmail()));
    }

    // a technician on site starts the check himself: a check task for him, under his team's manager,
    // started at once through the usual start (so his time on site is counted the usual way).
    // Only on an alert nobody is checking, and not one waiting for the manager's decision.
    @Transactional
    public synchronized String selfStart(AlertCase alertCase, AlertForms.SelfCheck form, Authentication technician)
    {
        requireNoCheck(alertCase, EnumSet.of(AlertVerification.TO_CHECK));
        String me = technician.getName();
        TaskModel task = taskService.createCheckTask(checkTitle(alertCase), me, managerOf(me), me,
            alertCase.getPumpId(), null, null, alertCase.getPriority(), alertCase.getNumber(), true);
        savePoints(task.getId(), form.points());
        taskService.startTask(task.getId(), technician);
        alertCase.checkOrdered(task.getId());
        alertCase.log(AlertEvent.of("check-started", Instant.now(), me));
        return task.getId();
    }

    // ---------- the report ----------

    // his report: saved, the task sent (STARTED → SUBMITTED, refused otherwise), the verdict applied
    @Transactional
    public AlertCase submit(String taskId, AlertForms.CheckReportForm form, Authentication technician)
    {
        String me = technician.getName();
        TaskModel task = checkTask(taskId);
        if (!task.getTechnicianEmail().equals(me))
            throw new AccessDeniedException("task not assigned to this technician");
        AlertCase alertCase = caseOf(task);
        if (!taskId.equals(alertCase.getCheckTaskId()) || !alertCase.isOpen())
            throw new AlertException("Cette levée de doute n'est plus attendue : l'alerte a changé entre-temps.");

        CheckReport report = buildReport(task, alertCase, pointRepository.findByTaskIdOrderByPositionAsc(taskId), form, me, false);
        taskService.submitTask(taskId, me, null, report.getId());
        applyVerdict(alertCase, report, me, true);
        return alertCase;
    }

    // a fault the twin did not see (AlertService.report, which just saved the new case): his check
    // task, started and sent at once, with a report confirmed from the start
    @Transactional
    public void fieldReport(AlertCase alertCase, AlertForms.CheckReportForm form, Authentication technician)
    {
        String me = technician.getName();
        TaskModel task = taskService.createCheckTask("Panne signalée · " + alertCase.getPumpId(), me, managerOf(me), me,
            alertCase.getPumpId(), alertCase.getTitle(), null, alertCase.getPriority(), alertCase.getNumber(), true);
        taskService.startTask(task.getId(), technician);
        alertCase.checkOrdered(task.getId());
        CheckReport report = buildReport(task, alertCase, List.of(), form, me, true);
        taskService.submitTask(task.getId(), me, null, report.getId());
        // "a signalé une panne" is already in the activity: no "a confirmé" under it
        applyVerdict(alertCase, report, me, false);
    }

    // the technician's team's manager: who reviews a check he started himself
    public String managerOf(String technicianEmail)
    {
        User technician = userRepository.findByEmail(technicianEmail)
            .orElseThrow(() -> new AlertException("Compte introuvable."));
        return teamRepository.findByTechnicianId(technician.getId()).map(team -> team.getManager().getEmail())
            .orElseThrow(() -> new AlertException(
                "Vous n'êtes dans aucune équipe : demandez à votre manager de vous ajouter à la sienne."));
    }

    // ---------- the manager, from the alert ----------

    // he acted on the report (an order, a workshop request, a request answered, a new check, the alert
    // closed): the check task is approved, like a report he accepted
    public void settle(AlertCase alertCase, String managerEmail)
    {
        if (alertCase.getCheckTaskId() == null)
            return;
        taskRepository.findById(alertCase.getCheckTaskId())
            .filter(task -> task.getStatus() == TaskStatus.SUBMITTED)
            .ifPresent(task -> taskService.approveCheck(task.getId(), managerEmail));
    }

    // the report goes back to the technician: he completes it and sends it again (a new round)
    @Transactional
    public void returnReport(AlertCase alertCase, String comment, String managerEmail)
    {
        TaskModel task = currentCheck(alertCase);
        if (task.getStatus() != TaskStatus.SUBMITTED)
            throw new AlertException("Il n'y a pas de rapport à renvoyer : il a déjà été traité, ou pas encore envoyé.");
        String what = comment.strip();
        taskService.returnCheck(task.getId(), managerEmail, what);
        alertCase.checkReopened();
        alertCase.log(AlertEvent.of("check-returned", Instant.now(), managerEmail).to(task.getTechnicianEmail()).text(what));
    }

    // nobody needs this check any more (he'd rather send someone else): the task is canceled
    @Transactional
    public void cancel(AlertCase alertCase, String managerEmail)
    {
        TaskModel task = currentCheck(alertCase);
        if (!OPEN.contains(task.getStatus()))
            throw new AlertException("Aucune levée de doute en cours à annuler.");
        taskService.cancelCheck(task.getId(), managerEmail, "Annulée depuis l'alerte #" + alertCase.getNumber() + ".");
        alertCase.checkDropped();
        alertCase.log(AlertEvent.of("check-canceled", Instant.now(), managerEmail).to(task.getTechnicianEmail()));
    }

    // a technician declined the check he was sent (TaskService.declineTask): the alert is to check again
    @EventListener
    @Transactional
    public void onDeclined(TaskDeclinedEvent declined)
    {
        taskRepository.findById(declined.taskId())
            .filter(task -> task.getTaskType() == TaskType.VERIFICATION && task.getAlertNumber() != null)
            .flatMap(task -> caseRepository.findById(task.getAlertNumber()))
            .filter(alertCase -> declined.taskId().equals(alertCase.getCheckTaskId())
                && alertCase.getVerification() == AlertVerification.CHECK_ORDERED)
            .ifPresent(alertCase -> {
                alertCase.checkDropped();
                alertCase.log(AlertEvent.of("check-declined", declined.at(), declined.technicianEmail())
                    .text(blankToNull(declined.comment())));
            });
    }

    // ---------- reading ----------

    // one check with its points and every round of its report: a manager, its technician, or a
    // technician with a task on the same alert (the work order made from it)
    @Transactional(readOnly = true)
    public CheckView view(String taskId, Authentication auth)
    {
        return viewOf(readable(taskId, auth));
    }

    // the check behind a work order (the repair task, TaskScreen): the one that confirmed the alert it
    // was made from. Its technician, or a manager. Empty when the task doesn't come from an alert, or
    // its alert has no check report (confirmed before the check report existed)
    @Transactional(readOnly = true)
    public Optional<CheckView> behind(String taskId, Authentication auth)
    {
        TaskModel task = taskRepository.findById(taskId)
            .orElseThrow(() -> new TaskNotFoundException("no task found with id :" + taskId));
        if (isTechnician(auth) && !task.getTechnicianEmail().equals(auth.getName()))
            throw new AccessDeniedException("task not assigned to this technician");
        if (task.getTaskType() == TaskType.VERIFICATION)
            return Optional.of(viewOf(task));
        if (task.getAlertNumber() == null)
            return Optional.empty();
        return caseRepository.findById(task.getAlertNumber())
            .map(AlertCase::getCheckTaskId)
            .flatMap(taskRepository::findById)
            .filter(check -> !reportRepository.findByTaskIdOrderByRoundDesc(check.getId()).isEmpty())
            .map(this::viewOf);
    }

    // a check task the caller may read (its view, its PDF): a manager, its technician, or a technician
    // with another task on the same alert (one he declined, or that was canceled, doesn't count)
    public TaskModel readable(String taskId, Authentication auth)
    {
        TaskModel task = checkTask(taskId);
        String me = auth.getName();
        if (isTechnician(auth) && !task.getTechnicianEmail().equals(me)
                && !taskRepository.existsByTechnicianEmailAndAlertNumberAndStatusNotIn(me, task.getAlertNumber(),
                        EnumSet.of(TaskStatus.DECLINED, TaskStatus.CANCELED)))
            throw new AccessDeniedException("this technician has no task on alert " + task.getAlertNumber());
        return task;
    }

    private static boolean isTechnician(Authentication auth)
    {
        return auth.getAuthorities().stream().anyMatch(a -> "ROLE_USER".equals(a.getAuthority()));
    }

    private CheckView viewOf(TaskModel task)
    {
        String taskId = task.getId();
        List<CheckView.Point> points = pointRepository.findByTaskIdOrderByPositionAsc(taskId).stream().map(p ->
            new CheckView.Point(p.getId(), p.getPosition(), p.getLabel(), p.getKind().name(), p.getUnit(), p.getTwinValue(),
                p.getWarnLimit(), p.getCritLimit(), p.isPhotoRequired(), p.isCustom())).toList();
        List<CheckView.Report> reports = reportRepository.findByTaskIdOrderByRoundDesc(taskId).stream()
            .map(CheckService::reportView).toList();
        String name = userRepository.findByEmail(task.getTechnicianEmail()).map(User::getName).orElse(null);
        long running = task.getActiveSince() == null ? 0
            : Math.max(0, Instant.now().getEpochSecond() - task.getActiveSince().getEpochSecond());

        return new CheckView(task.getId(), task.getAlertNumber(), task.getEquipmentId(), task.getTitle(),
            task.getInstructions(), task.getStatus().name(), task.getStatusComment(), task.getTechnicianEmail(), name,
            task.getManagerEmail(), task.isSelfAssigned(), task.getCreatedAt().toEpochMilli(),
            task.getFirstStartedAt() == null ? null : task.getFirstStartedAt().toEpochMilli(),
            task.getWorkedSeconds() + running, points, reports);
    }

    // for the alert list (AlertService.views): the check tasks, and each one's latest report
    public Map<String, TaskModel> tasks(Collection<String> taskIds)
    {
        // a HashMap, empty or not: the caller looks up cases with no check (a null key), which Map.of() refuses
        Map<String, TaskModel> tasks = new HashMap<>();
        if (!taskIds.isEmpty())
            taskRepository.findAllById(taskIds).forEach(task -> tasks.put(task.getId(), task));
        return tasks;
    }

    public Map<String, CheckReport> latestReports(Collection<String> taskIds)
    {
        Map<String, CheckReport> latest = new HashMap<>();
        if (!taskIds.isEmpty())
            reportRepository.findByTaskIdIn(taskIds).forEach(report -> latest.merge(report.getTaskId(), report,
                (a, b) -> a.getRound() >= b.getRound() ? a : b));
        return latest;
    }

    // ---------- helpers ----------

    private static CheckView.Report reportView(CheckReport r)
    {
        return new CheckView.Report(r.getId(), r.getRound(), r.getSubmittedAt().toEpochMilli(), name(r.getArrivalState()),
            r.getVerdict().name(), name(r.getFalseAlarmCause()), name(r.getInconclusiveReason()), r.isUrgentStop(),
            r.getComment(), r.getCanHandle(), r.getHandleMessage(), r.getEstimatedHours(), r.getPartsNeeded(),
            name(r.getCannotHandleReason()), r.getCannotHandleComment(),
            r.getResults().stream().map(x -> new CheckView.Result(x.getPointId(), x.getLabel(), x.getKind().name(),
                x.getUnit(), x.getResult().name(), x.getReading(), x.getComment(), x.getPhotos())).toList(),
            r.getSections().stream().map(s -> new CheckView.Section(s.getTitle(), s.getComment(), s.getPhotos())).toList());
    }

    private static String name(Enum<?> value)
    {
        return value == null ? null : value.name();
    }

    // "Levée de doute · Palier chaud · HDX-S-08"
    private static String checkTitle(AlertCase alertCase)
    {
        String what = alertCase.getTitle() != null ? alertCase.getTitle() : alertCase.getMessage();
        return "Levée de doute · " + (what == null ? alertCase.getKind() : what) + " · " + alertCase.getPumpId();
    }

    // a new check: the alert is open, nobody is checking it, and it is in one of these states
    private void requireNoCheck(AlertCase alertCase, Set<AlertVerification> allowed)
    {
        if (!alertCase.isOpen())
            throw new AlertException("Cette alerte est close.");
        if (alertCase.getCheckTaskId() != null) {
            TaskModel current = taskRepository.findById(alertCase.getCheckTaskId()).orElse(null);
            if (current != null && OPEN.contains(current.getStatus()))
                throw new AlertException("Une levée de doute est déjà en cours sur cette alerte.");
        }
        AlertVerification verification = alertCase.getVerification();
        if (verification == AlertVerification.CONFIRMED)
            throw new AlertException("Cette alerte est déjà confirmée sur place.");
        if (!allowed.contains(verification))
            throw new AlertException("Le rapport de levée de doute attend la décision du manager.");
    }

    private void savePoints(String taskId, List<AlertForms.CheckPointForm> points)
    {
        int position = 0;
        for (AlertForms.CheckPointForm p : points) {
            CheckPointKind kind = p.kind() == null ? CheckPointKind.STATE : p.kind();
            pointRepository.save(new CheckPoint(taskId, position++, p.label().strip(), kind,
                kind == CheckPointKind.MEASURE ? blankToNull(p.unit()) : null,
                kind == CheckPointKind.MEASURE ? p.twinValue() : null,
                kind == CheckPointKind.MEASURE ? p.warnLimit() : null,
                kind == CheckPointKind.MEASURE ? p.critLimit() : null,
                p.photoRequired(), p.custom()));
        }
    }

    // the report, checked against its points: every point answered, a comment where something is wrong,
    // the reading of a measure, the photo a point asks for, his own photos; then the conclusion and,
    // for a confirmed alert, what comes next. The messages are the technician's (French)
    private CheckReport buildReport(TaskModel task, AlertCase alertCase, List<CheckPoint> points,
                                    AlertForms.CheckReportForm form, String me, boolean fieldReport)
    {
        List<CheckReport> earlier = reportRepository.findByTaskIdOrderByRoundDesc(task.getId());
        CheckReport report = new CheckReport(task.getId(), alertCase.getNumber(), me,
            earlier.isEmpty() ? 1 : earlier.get(0).getRound() + 1, Instant.now());

        Map<String, AlertForms.CheckResultForm> answers = new LinkedHashMap<>();
        if (form.results() != null)
            form.results().forEach(r -> answers.put(r.pointId(), r));
        Set<String> known = points.stream().map(CheckPoint::getId).collect(Collectors.toSet());
        if (!known.containsAll(answers.keySet()))
            throw new IllegalArgumentException("Un point du rapport n'appartient pas à cette levée de doute.");

        for (CheckPoint point : points) {
            AlertForms.CheckResultForm answer = answers.get(point.getId());
            String where = "« " + point.getLabel() + " » : ";
            if (answer == null)
                throw new IllegalArgumentException(where + "choisissez un résultat.");
            String comment = blankToNull(answer.comment());
            List<String> photos = clean(answer.photos());
            if (answer.result() != CheckResult.OK && comment == null)
                throw new IllegalArgumentException(where + "dites ce que vous avez constaté.");
            boolean measured = point.getKind() == CheckPointKind.MEASURE && answer.result() != CheckResult.NOT_CHECKABLE;
            if (measured && answer.reading() == null)
                throw new IllegalArgumentException(where + "notez la valeur relevée.");
            if (point.isPhotoRequired() && answer.result() != CheckResult.NOT_CHECKABLE && photos.isEmpty())
                throw new IllegalArgumentException(where + "une photo est demandée.");
            report.getResults().add(new CheckReport.Result(point, answer.result(), measured ? answer.reading() : null,
                comment, photos));
        }

        if (form.sections() != null)
            for (AlertForms.CheckSectionForm section : form.sections()) {
                String title = blankToNull(section.title());
                String comment = blankToNull(section.comment());
                List<String> photos = clean(section.photos());
                if (title != null || comment != null || !photos.isEmpty())
                    report.getSections().add(new CheckReport.Section(title, comment, photos));
            }

        // the conclusion
        CheckVerdict verdict = fieldReport ? CheckVerdict.CONFIRMED : form.verdict();
        if (verdict == null)
            throw new IllegalArgumentException("Concluez : alerte confirmée, fausse alerte ou non concluant.");
        String comment = blankToNull(form.comment());
        if (verdict == CheckVerdict.FALSE_ALARM && form.falseAlarmCause() == null)
            throw new IllegalArgumentException("Dites pourquoi l'alerte est fausse.");
        if (verdict == CheckVerdict.INCONCLUSIVE && form.inconclusiveReason() == null)
            throw new IllegalArgumentException("Dites ce qui vous a empêché de conclure.");
        if (verdict == CheckVerdict.INCONCLUSIVE && comment == null)
            throw new IllegalArgumentException("Expliquez en quelques mots pourquoi vous n'avez pas pu conclure.");
        report.setConclusion(form.arrivalState(), verdict,
            verdict == CheckVerdict.FALSE_ALARM ? form.falseAlarmCause() : null,
            verdict == CheckVerdict.INCONCLUSIVE ? form.inconclusiveReason() : null,
            verdict == CheckVerdict.CONFIRMED && form.urgentStop(), comment);

        // what comes next, for a confirmed alert: he can fix it (his request), or why he can't
        if (verdict == CheckVerdict.CONFIRMED) {
            if (form.canHandle() == null)
                throw new IllegalArgumentException("Dites si vous pouvez vous en charger.");
            if (form.canHandle()) {
                Double hours = form.estimatedHours();
                if (hours != null && (hours <= 0 || hours > 500))
                    throw new IllegalArgumentException("La durée estimée doit être entre 0 et 500 heures.");
                report.setNextStep(true, blankToNull(form.handleMessage()), hours, blankToNull(form.partsNeeded()), null, null);
            }
            else {
                CannotHandleReason why = form.cannotHandleReason();
                String whyComment = blankToNull(form.cannotHandleComment());
                if (why == null)
                    throw new IllegalArgumentException("Dites pourquoi vous ne pouvez pas vous en charger.");
                if (why == CannotHandleReason.OTHER && whyComment == null)
                    throw new IllegalArgumentException("Précisez pourquoi vous ne pouvez pas vous en charger.");
                report.setNextStep(false, null, null, null, why, whyComment);
            }
        }

        // his photos, not used by another report (a photo of an earlier round of this check may come back)
        Set<String> earlierIds = earlier.stream().map(CheckReport::getId).collect(Collectors.toSet());
        List<ImageEntity> images = new java.util.ArrayList<>();
        for (String imageId : new HashSet<>(report.allPhotos())) {
            ImageEntity image = imageRepository.findById(imageId)
                .orElseThrow(() -> new IllegalArgumentException("Une photo n'existe plus : reprenez-la."));
            if (!me.equals(image.getUploadedBy()))
                throw new IllegalArgumentException("Une photo du rapport n'est pas la vôtre.");
            if (image.getReportId() != null && !earlierIds.contains(image.getReportId()))
                throw new IllegalArgumentException("Une photo est déjà utilisée dans un autre rapport.");
            images.add(image);
        }

        CheckReport saved = reportRepository.save(report);
        // its PDF's QR code and the fingerprint the verification page checks it against
        saved.setVerification(reportVerification.newCode(), reportVerification.fingerprint(saved,
            points.stream().collect(Collectors.toMap(CheckPoint::getId, p -> p))));
        images.forEach(image -> image.setReportId(saved.getId()));
        imageRepository.saveAll(images);
        return saved;
    }

    // the verdict on the alert, his request when he can fix it, URGENT when he asks for an immediate stop
    private static void applyVerdict(AlertCase alertCase, CheckReport report, String me, boolean logVerdict)
    {
        Instant now = report.getSubmittedAt();
        AlertVerification verification = switch (report.getVerdict()) {
            case CONFIRMED -> AlertVerification.CONFIRMED;
            case FALSE_ALARM -> AlertVerification.FALSE_ALARM;
            case INCONCLUSIVE -> AlertVerification.INCONCLUSIVE;
        };
        alertCase.checked(verification, me, now);
        if (logVerdict) {
            Enum<?> why = report.getFalseAlarmCause() != null ? report.getFalseAlarmCause() : report.getInconclusiveReason();
            alertCase.log(AlertEvent.of("checked", now, me).to(report.getVerdict().name())
                .from(name(why)).text(report.getComment()));
        }
        if (report.isUrgentStop()) {
            alertCase.log(AlertEvent.of("urgent-stop", now, me));
            if (alertCase.getPriority() != TaskPriority.URGENT) {
                alertCase.log(AlertEvent.of("priority", now, me).from(alertCase.getPriority().name()).to(TaskPriority.URGENT.name()));
                alertCase.setPriority(TaskPriority.URGENT);
            }
        }
        // a round sent back and sent again: his earlier request gives way to this one
        alertCase.getRequests().removeIf(r -> r.getTechnicianEmail().equals(me) && r.getStatus() == AlertRequestStatus.PENDING);
        if (Boolean.TRUE.equals(report.getCanHandle())) {
            alertCase.getRequests().add(new AlertRequest(alertCase, me, report.getHandleMessage(), now));
            alertCase.log(AlertEvent.of("request", now, me).text(report.getHandleMessage()));
        }
    }

    private TaskModel checkTask(String taskId)
    {
        TaskModel task = taskRepository.findById(taskId)
            .orElseThrow(() -> new TaskNotFoundException("no task found with id :" + taskId));
        if (task.getTaskType() != TaskType.VERIFICATION || task.getAlertNumber() == null)
            throw new TaskNotFoundException("task " + taskId + " is not a check");
        return task;
    }

    private AlertCase caseOf(TaskModel task)
    {
        return caseRepository.findById(task.getAlertNumber())
            .orElseThrow(() -> new AlertNotFoundException("L'alerte #" + task.getAlertNumber() + " n'existe pas."));
    }

    private TaskModel currentCheck(AlertCase alertCase)
    {
        if (alertCase.getCheckTaskId() == null)
            throw new AlertException("Aucune levée de doute n'a été envoyée pour cette alerte.");
        return taskRepository.findById(alertCase.getCheckTaskId())
            .orElseThrow(() -> new TaskNotFoundException("no task found with id :" + alertCase.getCheckTaskId()));
    }

    private static List<String> clean(List<String> ids)
    {
        return ids == null ? List.of() : ids.stream().filter(id -> id != null && !id.isBlank()).map(String::strip).distinct().toList();
    }

    private static String blankToNull(String value)
    {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
