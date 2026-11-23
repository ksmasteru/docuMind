package com.docuMind.backend.services;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.security.access.AccessDeniedException;
import com.docuMind.backend.exception.FormNotActiveException;
import com.docuMind.backend.exception.FormNotFoundException;
import com.docuMind.backend.exception.InvalidRoleException;
import com.docuMind.backend.exception.InvalidTaskException;
import com.docuMind.backend.exception.TaskNotFoundException;
import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.SentTask;
import com.docuMind.backend.model.TaskCanceledEvent;
import com.docuMind.backend.model.TaskReassignedEvent;
import com.docuMind.backend.model.ReviewTask;
import com.docuMind.backend.model.TaskCreationDto;
import com.docuMind.backend.model.TaskDeclinedEvent;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.TaskSubmittedEvent;
import com.docuMind.backend.model.User;
import java.util.List;
import com.docuMind.backend.model.enums.StatusReason;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.CheckListTemplateRepository;
import com.docuMind.backend.repository.FormDraftRepository;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.UserRepository;
import com.docuMind.backend.repository.TaskEventRepository;
import com.docuMind.backend.repository.TaskRepository;

import jakarta.transaction.Transactional;

@Service
public class TaskService {
    private final TaskRepository taskRepository;
    private final TaskEventRepository taskEventRepository;
    private final UserService userService;
    // to check the task's checklist exists and is still in use
    private final CheckListTemplateRepository checkListTemplateRepository;
    private final ApplicationEventPublisher events;
    // a task's drafts go when it is closed or given to someone else
    private final FormDraftRepository formDraftRepository;
    // the latest report's verdict (a non-conforming one isn't validated in silence)
    private final SubmissionRepository submissionRepository;
    // the names shown in the technician's « Envoyés »
    private final UserRepository userRepository;

    // the reasons a report may be returned with
    private static final Set<StatusReason> RETURN_REASONS =
            EnumSet.of(StatusReason.MISSING_INFO, StatusReason.WRONG_MEASUREMENT, StatusReason.OTHER);

    // statuses a task may be started from (see maintenace_loop_servicetohandle.md)
    private static final Set<TaskStatus> CAN_START_FROM =
            EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.BLOCKED, TaskStatus.RETURNED);

    private static final Set<TaskStatus> ACTIVE_STATUSES =
        EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.STARTED, TaskStatus.BLOCKED, TaskStatus.RETURNED);

    // a task the manager may cancel: not sent yet (a sent report is validated or sent back), or declined
    private static final Set<TaskStatus> CANCELABLE =
        EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.STARTED, TaskStatus.BLOCKED, TaskStatus.RETURNED, TaskStatus.DECLINED);

    // a task that can go to another technician: nobody worked on it yet
    private static final Set<TaskStatus> REASSIGNABLE = EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.DECLINED);

    private static final Set<StatusReason> CANCEL_REASONS =
        EnumSet.of(StatusReason.WRONG_ASSIGNMENT, StatusReason.DUPLICATE, StatusReason.OTHER);

    public TaskService(TaskRepository taskRepository, TaskEventRepository taskEventRepository,
        UserService userService, CheckListTemplateRepository checkListTemplateRepository,
        ApplicationEventPublisher events, FormDraftRepository formDraftRepository,
        SubmissionRepository submissionRepository, UserRepository userRepository
    )
    {
        this.events = events;
        this.formDraftRepository = formDraftRepository;
        this.submissionRepository = submissionRepository;
        this.userRepository = userRepository;
        this.taskRepository = taskRepository;
        this.taskEventRepository = taskEventRepository;
        this.userService = userService;
        this.checkListTemplateRepository = checkListTemplateRepository;
    }

    //One method changes the status. It checks who is acting 
    // and whether the transition is allowed, updates the times 
    // (fixing points 3 and 4), saves the task 
    // and writes the event in the same transaction.
    //  Fix point 2 here by having all code go through it.
    
    // creating an order by a manager should preauthorize
     // task 
    @PreAuthorize("hasRole('USER')")
    public List<TaskModel> getTechnicianActiveTasks(Authentication technician)
    {
        return taskRepository.findByTechnicianEmailAndStatusInOrderByCreatedAtDesc(technician.getName(), ACTIVE_STATUSES);
    }

    // the manager's side of /mine : the active tasks he sent, newest first
    // the token holds the email, and tasks store the manager's email
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public List<TaskModel> getManagerActiveTasks(Authentication manager)
    {
        return taskRepository.findByManagerEmailAndStatusInOrderByCreatedAtDesc(manager.getName(), ACTIVE_STATUSES);
    }

    // the tasks he sent that their technician declined: they wait for him to give them to someone
    // else, or cancel them (« À réaffecter » on the Ordres page). Kept apart from the active ones, so
    // the pages that count the work in progress are not changed
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public List<TaskModel> getManagerDeclinedTasks(Authentication manager)
    {
        return taskRepository.findByManagerEmailAndStatusInOrderByCreatedAtDesc(manager.getName(), EnumSet.of(TaskStatus.DECLINED)).stream()
            .filter(task -> task.getTaskType() != TaskType.VERIFICATION && task.getInterventionId() == null)
            .toList();
    }

    // true when this user created the task, false for an unknown task.
    // Lets the manager read the reports sent for his tasks (SubmissionService.getReport)
    // a workshop intervention's task (démontage or montage), whichever step the intervention is on now
    public boolean isWorkshopTask(String taskId)
    {
        return taskRepository.findById(taskId).map(task -> task.getInterventionId() != null).orElse(false);
    }

    // a task's history, oldest first (what became of its reports: SubmissionService, the verify page)
    public List<TaskEvent> historyOf(String taskId)
    {
        return taskEventRepository.findByTaskIdOrderByOccurredAtAsc(taskId);
    }

    // What was decided on a report sent at that moment: the first validation, return or rejection after
    // it. Empty while it waits.
    public static Optional<TaskEvent> decisionOn(List<TaskEvent> history, Instant sentAt)
    {
        return history.stream()
            .filter(e -> e.getFromStatus() == TaskStatus.SUBMITTED && e.getToStatus() != TaskStatus.SUBMITTED
                && !e.getOccurredAt().isBefore(sentAt))
            .findFirst();
    }

    public boolean isTaskManager(String taskId, String email)
    {
        return taskRepository.findById(taskId)
            .map(task -> task.getManagerEmail().equals(email))
            .orElse(false);
    }

    // the tasks he sent whose report is waiting for his review (SUBMITTED), oldest submission first
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public List<ReviewTask> getManagerTasksToReview(Authentication manager)
    {
        return taskRepository.findTasksToReview(manager.getName(), TaskStatus.SUBMITTED);
    }

    // every manager's reports waiting (« Tous les rapports »): any manager may review one when its
    // sender is away, under his own name
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    public List<ReviewTask> getAllTasksToReview()
    {
        return taskRepository.findAllTasksToReview(TaskStatus.SUBMITTED);
    }

    // « Envoyés »: the reports a technician sent, waiting or validated, the latest first, with who
    // validated each and what he wrote
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public List<SentTask> getTechnicianSentTasks(Authentication technician)
    {
        List<TaskModel> tasks = taskRepository.findTop60ByTechnicianEmailAndStatusInOrderBySubmittedAtDesc(
            technician.getName(), EnumSet.of(TaskStatus.SUBMITTED, TaskStatus.APPROVED));
        if (tasks.isEmpty())
            return List.of();
        // each task's validation: its last APPROVED step
        Map<String, TaskEvent> approvals = new HashMap<>();
        taskEventRepository.findByTaskIdInOrderByOccurredAtAsc(tasks.stream().map(TaskModel::getId).toList()).stream()
            .filter(e -> e.getToStatus() == TaskStatus.APPROVED && e.getFromStatus() == TaskStatus.SUBMITTED)
            .forEach(e -> approvals.put(e.getTaskId(), e));
        Map<String, String> names = new HashMap<>();
        Set<String> reviewers = approvals.values().stream().map(TaskEvent::getActorEmail).collect(Collectors.toSet());
        if (!reviewers.isEmpty())
            userRepository.findByEmailIn(reviewers).forEach(u -> names.putIfAbsent(u.getEmail(), u.getName()));
        Map<String, CheckListSubmission> reports = new HashMap<>();
        List<String> reportIds = tasks.stream().filter(t -> t.getTaskType() != TaskType.VERIFICATION)
            .map(TaskModel::getLatestSubmissionId).filter(id -> id != null).toList();
        if (!reportIds.isEmpty())
            submissionRepository.findAllById(reportIds).forEach(r -> reports.put(r.getId(), r));

        return tasks.stream().map(task -> {
            boolean check = task.getTaskType() == TaskType.VERIFICATION;
            TaskEvent approval = task.getStatus() == TaskStatus.APPROVED ? approvals.get(task.getId()) : null;
            CheckListSubmission report = check || task.getLatestSubmissionId() == null ? null : reports.get(task.getLatestSubmissionId());
            return new SentTask(task.getId(), task.getTitle(), task.getTaskType(), task.getEquipmentId(), task.getStatus(),
                task.getSubmittedAt(), task.getClosedAt(),
                approval == null ? null : names.getOrDefault(approval.getActorEmail(), approval.getActorEmail()),
                approval == null ? null : approval.getComment(),
                report == null ? null : report.getId(), report == null ? null : report.getStatus(),
                task.getAlertNumber(), task.getInterventionId() != null);
        }).toList();
    }

    // the numbers on the tabs. A technician: what he has to do (a new task to accept, a report sent back).
    // A manager: his reports to review, every manager's, and his tasks declined (to give to someone else)
    @Transactional
    public Map<String, Integer> counts(Authentication caller)
    {
        boolean technician = caller.getAuthorities().stream().anyMatch(a -> "ROLE_USER".equals(a.getAuthority()));
        boolean manager = caller.getAuthorities().stream()
            .anyMatch(a -> "ROLE_MANAGER".equals(a.getAuthority()) || "ROLE_ADMIN".equals(a.getAuthority()));
        Map<String, Integer> counts = new HashMap<>();
        if (technician)
            counts.put("toDo", taskRepository.findByTechnicianEmailAndStatusInOrderByCreatedAtDesc(caller.getName(),
                EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.RETURNED)).size());
        if (manager) {
            counts.put("toReview", taskRepository.findTasksToReview(caller.getName(), TaskStatus.SUBMITTED).size());
            counts.put("toReviewAll", taskRepository.findAllTasksToReview(TaskStatus.SUBMITTED).size());
            counts.put("declined", getManagerDeclinedTasks(caller).size());
        }
        return counts;
    }

    @Transactional
    //@PreAuthorize('hasRole')
    // managerEmail and technicianEmail store the users' emails (what the JWT holds)
    public String createNewTask(TaskCreationDto task, Authentication manager)
    {
        // test if the user actualy exist and is a technician.
        // users are identified by their email (unique, and it's what the JWT holds)
        // getUserByEmail throws UserNotFoundException (404) if the email doesn't exist
        // a check is sent from its alert (createCheckTask), so it always has one
        if (task.taskType() == TaskType.VERIFICATION)
            throw new InvalidTaskException("a check task (VERIFICATION) is sent from its alert");

        User technician = userService.getUserByEmail(task.technicianEmail());
        if (technician.getRole() != UserRole.USER)
            throw new InvalidRoleException("user " + task.technicianEmail() + " is not a technician");

        TaskModel taskOrder = new TaskModel(task.title(), task.taskType(), technician.getEmail(),
                manager.getName(), task.equipmentId() == null ? "" : task.equipmentId(), task.instructions(), task.dueDate()
        );
        
        taskOrder.setStatus(TaskStatus.ASSIGNED);

        // the column is NOT NULL: keep the entity's NORMAL default when the manager sent none
        if (task.priority() != null)
            taskOrder.setPriority(task.priority());

        // same checks as a submission: the form must exist and still be active
        if (task.templateId() != null && !task.templateId().isBlank())
        {
            String templateId = task.templateId().trim();
            CheckListTemplate template = checkListTemplateRepository.findById(templateId).orElseThrow(
                () -> new FormNotFoundException("no form with id " + templateId));
            if (!template.isActive())
                throw new FormNotActiveException("form " + templateId + " is not active anymore");
            taskOrder.setTemplateId(templateId);
        }

        TaskModel order = taskRepository.save(taskOrder);

        // creating an event of task creation : nothing -> ASSIGNED
        TaskEvent taskEvent = TaskEvent.statusChanged(order.getId(), order.getEquipmentId(),
                manager.getName(), null, TaskStatus.ASSIGNED, null, null, Instant.now());

        taskEventRepository.save(taskEvent);
        
        return order.getId();
    }

    // A check task for an alert (CheckService), created like any task: ASSIGNED, with its creation in the
    // history under the name of whoever sent it. That is the manager, or the technician himself when he
    // starts the check on site (selfAssigned): the task then names his team's manager, who reviews it.
    // No checklist: the check report (CheckReport) is its report.
    @Transactional
    public TaskModel createCheckTask(String title, String technicianEmail, String managerEmail, String createdBy,
                                     String equipmentId, String instructions, LocalDate dueDate,
                                     TaskPriority priority, long alertNumber, boolean selfAssigned)
    {
        User technician = userService.getUserByEmail(technicianEmail);
        if (technician.getRole() != UserRole.USER)
            throw new InvalidRoleException("user " + technicianEmail + " is not a technician");

        TaskModel task = new TaskModel(title, TaskType.VERIFICATION, technician.getEmail(), managerEmail,
                equipmentId, instructions, dueDate);
        task.setStatus(TaskStatus.ASSIGNED);
        if (priority != null)
            task.setPriority(priority);
        task.setAlertNumber(alertNumber);
        task.setSelfAssigned(selfAssigned);
        TaskModel saved = taskRepository.save(task);

        taskEventRepository.save(TaskEvent.statusChanged(saved.getId(), saved.getEquipmentId(), createdBy,
                null, TaskStatus.ASSIGNED, null, null, Instant.now()));
        return saved;
    }

    // techincian declining a task
    @Transactional
    public String declineTask(String taskId, Authentication technician, StatusReason reason, String comment)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
    
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
            throw new AccessDeniedException("task not assigned to this technician");   
        if (!task.getStatus().equals(TaskStatus.ASSIGNED))
            throw new InvalidTaskException("a task in status " + task.getStatus() + " can't be declined");

        Instant now = Instant.now();
        
        TaskEvent taskEvent = TaskEvent.statusChanged(taskId, task.getEquipmentId(), technicianEmail,
                TaskStatus.ASSIGNED, TaskStatus.DECLINED, reason, comment, now);

        task.setStatus(TaskStatus.DECLINED);

        task.setStatusReason(reason);
        task.setStatusComment(comment);

        taskRepository.save(task);
        TaskEvent saved = taskEventRepository.save(taskEvent);
        // a declined check: its alert is back to "À vérifier" (CheckService)
        events.publishEvent(new TaskDeclinedEvent(taskId, technicianEmail, comment, now));
        return saved.getId();
    }
    // techncian Starting a task
    // techincian gets shown a task : bottom of it start, decline.
    // the task gets shown from the backend so its field should be valid.
    @Transactional
    public String startTask(String taskId, Authentication technician)
    {
        // check for task validity. 
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");
        // only these statuses can move to STARTED : first start, resume after a block,
        // or rework after the manager returned the report. Anything else is refused.
        if (!CAN_START_FROM.contains(task.getStatus()))
            throw new InvalidTaskException("a task in status " + task.getStatus() + " can't be started");

        Instant now = Instant.now();
        
        TaskEvent taskEvent = TaskEvent.statusChanged(taskId,task.getEquipmentId() , technicianEmail, task.getStatus(), TaskStatus.STARTED, null, null, now);

        task.setStatus(TaskStatus.STARTED);

        // only the very first start : a resume after BLOCKED / RETURNED keeps the original time
        if (task.getFirstStartedAt() == null)
            task.setFirstStartedAt(now);

        task.setActiveSince(now);

        // the reason of the previous status (BLOCKED, RETURNED) no longer applies
        task.setStatusReason(null);
        task.setStatusComment(null);

        taskRepository.save(task);
        
        TaskEvent saved = taskEventRepository.save(taskEvent);
        
        return saved.getId();
    }

    @Transactional
    // TASK BLOCKED THE MANAGER SHOULD GET NOTIFIED.
    public String blockTask(String taskId, Authentication technician, StatusReason reason, String comment)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

        if (!task.getStatus().equals(TaskStatus.STARTED))
            throw new InvalidTaskException("a task in status " + task.getStatus() + " can't be blocked");

        
        Instant now = Instant.now();
        
        if (task.getActiveSince() != null)
        {
            long periodSeconds = Duration.between(task.getActiveSince(), now).getSeconds();
            task.setWorkedSeconds(task.getWorkedSeconds() + periodSeconds);
            task.setActiveSince(null);
        }

        TaskEvent taskEvent = TaskEvent.statusChanged(taskId,task.getEquipmentId() , technicianEmail, task.getStatus(), TaskStatus.BLOCKED, reason, comment, now);
    
        task.setStatus(TaskStatus.BLOCKED);

        task.setStatusReason(reason);
        
        task.setStatusComment(comment);

        taskRepository.save(task);
        
        TaskEvent saved = taskEventRepository.save(taskEvent);
        
        return saved.getId();
    }

    // technician sending the task's report: STARTED -> SUBMITTED.
    // Called by SubmissionService inside its own transaction, so a refused submission
    // leaves the task untouched and a refused task leaves no submission behind.
    // submissionId : the report just saved, kept on the task for the manager's review queue
    @Transactional
    public void submitTask(String taskId, String technicianEmail, String templateId, String submissionId)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));

        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

        // the report is sent while working: a BLOCKED or RETURNED task is started again first
        if (!task.getStatus().equals(TaskStatus.STARTED))
            throw new InvalidTaskException("a task in status " + task.getStatus() + " can't be submitted");

        // a task created with a checklist only accepts that checklist
        if (task.getTemplateId() != null && !task.getTemplateId().equals(templateId))
            throw new InvalidTaskException("task " + taskId + " expects form " + task.getTemplateId());

        Instant now = Instant.now();

        // close the current work period, like blockTask
        if (task.getActiveSince() != null)
        {
            long periodSeconds = Duration.between(task.getActiveSince(), now).getSeconds();
            task.setWorkedSeconds(task.getWorkedSeconds() + periodSeconds);
            task.setActiveSince(null);
        }

        TaskEvent taskEvent = TaskEvent.statusChanged(taskId, task.getEquipmentId(), technicianEmail,
                TaskStatus.STARTED, TaskStatus.SUBMITTED, null, null, now);

        task.setStatus(TaskStatus.SUBMITTED);
        task.setSubmittedAt(now);
        task.setLatestSubmissionId(submissionId);

        taskRepository.save(task);
        taskEventRepository.save(taskEvent);

        // a workshop task: its intervention moves on to the review step (InterventionService)
        events.publishEvent(new TaskSubmittedEvent(taskId, technicianEmail, now));
    }

    // ---------- the review of a sent report (SUBMITTED) ----------

    // A manager approves a report: the task is closed (APPROVED). Usually the one who sent the task;
    // any manager may when he is away, and the history keeps who did. A non-conforming report needs what
    // is done about it (« Suite donnée »), kept with the validation and printed on the report.
    // A workshop task is approved by validating its intervention's review step instead.
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public String approveTask(String taskId, Authentication manager, String comment)
    {
        TaskModel task = findSubmitted(taskId);
        // a workshop task is reviewed from its intervention's page, not with /approve or /return
        if (task.getInterventionId() != null)
            throw new InvalidTaskException("task " + taskId + " is reviewed from its workshop intervention");
        // a check task, from its alert: approved when the manager acts on its report (approveCheck)
        if (task.getTaskType() == TaskType.VERIFICATION)
            throw new InvalidTaskException("task " + taskId + " is a check: it is reviewed from its alert");
        String followUp = comment == null || comment.isBlank() ? null : comment.strip();
        if (followUp == null && isNonConforming(task))
            throw new IllegalArgumentException("Ce rapport est non conforme : indiquez la suite donnée avant de le valider.");
        return approve(task, manager.getName(), followUp);
    }

    // the latest report found a critical point bad
    private boolean isNonConforming(TaskModel task)
    {
        return task.getLatestSubmissionId() != null
            && submissionRepository.findById(task.getLatestSubmissionId())
                .map(report -> report.getStatus() == SubmissionStatus.NON_CONFORME).orElse(false);
    }

    // a manager sends the report back to the technician (RETURNED), saying what to redo;
    // the technician starts it again and sends a new report
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public String returnTask(String taskId, Authentication manager, StatusReason reason, String comment)
    {
        TaskModel task = findSubmitted(taskId);
        if (task.getInterventionId() != null)
            throw new InvalidTaskException("task " + taskId + " is reviewed from its workshop intervention");
        if (task.getTaskType() == TaskType.VERIFICATION)
            throw new InvalidTaskException("task " + taskId + " is a check: it is reviewed from its alert");
        return sendBack(task, manager.getName(), reason, comment);
    }

    // ---------- a task that will not be done as sent ----------

    // A manager cancels a task: sent to the wrong person, a duplicate, no longer needed. Not a report
    // already sent (it is validated or sent back). A check is canceled from its alert, a workshop
    // task from its intervention.
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public String cancelTask(String taskId, Authentication manager, StatusReason reason, String comment)
    {
        TaskModel task = plainTask(taskId, "annulée");
        if (!CANCELABLE.contains(task.getStatus()))
            throw new InvalidTaskException(task.getStatus() == TaskStatus.SUBMITTED
                ? "Son rapport est envoyé : validez-le ou renvoyez-le."
                : "Cette tâche est déjà close.");
        String why = comment == null ? null : comment.strip();
        if (why == null || why.isEmpty())
            throw new IllegalArgumentException("Dites pourquoi la tâche est annulée : le technicien le verra.");
        StatusReason cause = reason == null ? StatusReason.OTHER : reason;
        if (!CANCEL_REASONS.contains(cause))
            throw new IllegalArgumentException("Une tâche ne s'annule pas avec le motif " + cause + ".");

        Instant now = Instant.now();
        if (task.getActiveSince() != null)
        {
            task.setWorkedSeconds(task.getWorkedSeconds() + Duration.between(task.getActiveSince(), now).getSeconds());
            task.setActiveSince(null);
        }
        TaskStatus from = task.getStatus();
        task.setStatus(TaskStatus.CANCELED);
        task.setStatusReason(cause);
        task.setStatusComment(why);
        task.setReturnComment(null);
        task.setClosedAt(now);
        taskRepository.save(task);
        formDraftRepository.deleteByTaskId(taskId);
        String eventId = taskEventRepository.save(TaskEvent.statusChanged(taskId, task.getEquipmentId(), manager.getName(),
                from, TaskStatus.CANCELED, cause, why, now)).getId();
        events.publishEvent(new TaskCanceledEvent(taskId, task.getAlertNumber(), task.getTitle(), why, manager.getName(), now));
        return eventId;
    }

    // A manager gives a task to another technician: one nobody worked on yet (ASSIGNED), or one its
    // technician declined. It is ASSIGNED again, for the new one to accept.
    @PreAuthorize("hasAnyRole('MANAGER', 'ADMIN')")
    @Transactional
    public String reassignTask(String taskId, Authentication manager, String technicianEmail, String comment)
    {
        TaskModel task = plainTask(taskId, "réaffectée");
        if (!REASSIGNABLE.contains(task.getStatus()))
            throw new InvalidTaskException("Cette tâche est " + (task.getStatus() == TaskStatus.SUBMITTED ? "envoyée" : "commencée ou close")
                + " : elle ne peut plus changer de technicien. Annulez-la et créez-en une autre si besoin.");
        User technician = userService.getUserByEmail(technicianEmail.strip());
        if (technician.getRole() != UserRole.USER)
            throw new InvalidRoleException("user " + technicianEmail + " is not a technician");
        String previous = task.getTechnicianEmail();
        if (previous.equals(technician.getEmail()) && task.getStatus() == TaskStatus.ASSIGNED)
            throw new InvalidTaskException("Cette tâche est déjà chez " + technician.getName() + ".");

        Instant now = Instant.now();
        task.setTechnicianEmail(technician.getEmail());
        task.setStatus(TaskStatus.ASSIGNED);
        task.setStatusReason(null);
        task.setStatusComment(null);
        task.setClosedAt(null);
        taskRepository.save(task);
        formDraftRepository.deleteByTaskId(taskId);
        String note = comment == null || comment.isBlank() ? null : comment.strip();
        String eventId = taskEventRepository.save(TaskEvent.reassigned(taskId, task.getEquipmentId(), manager.getName(),
                TaskStatus.ASSIGNED, previous, technician.getEmail(), note, now)).getId();
        events.publishEvent(new TaskReassignedEvent(taskId, task.getAlertNumber(), previous, technician.getEmail(),
                manager.getName(), now));
        return eventId;
    }

    // a manager's own task: not a check (levée de doute) nor a workshop task, which have their own paths
    private TaskModel plainTask(String taskId, String what)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        if (task.getTaskType() == TaskType.VERIFICATION)
            throw new InvalidTaskException("Une levée de doute est " + what + " depuis son alerte.");
        if (task.getInterventionId() != null)
            throw new InvalidTaskException("Une tâche d'atelier est " + what + " depuis son intervention.");
        return task;
    }

    // the same two, for InterventionService's review step (9 / 17): the caller was checked there
    // (the step's role, who took it); the task still has to be SUBMITTED
    @Transactional
    public void approveForIntervention(String taskId, String reviewerEmail)
    {
        approve(findSubmitted(taskId), reviewerEmail, null);
    }

    @Transactional
    public void returnForIntervention(String taskId, String reviewerEmail, String comment)
    {
        sendBack(findSubmitted(taskId), reviewerEmail, StatusReason.OTHER, comment);
    }

    // the same, for a check task, from its alert (CheckService): any manager acting on the alert settles
    // it, since alerts are shared. Approved once the manager acts on its report; returned for more details
    @Transactional
    public void approveCheck(String taskId, String reviewerEmail)
    {
        approve(findSubmitted(taskId), reviewerEmail, null);
    }

    @Transactional
    public void returnCheck(String taskId, String reviewerEmail, String comment)
    {
        sendBack(findSubmitted(taskId), reviewerEmail, StatusReason.MISSING_INFO, comment);
    }

    // a check nobody needs any more (the manager sends someone else): an open task is CANCELED,
    // its current work period counted like a block
    @Transactional
    public void cancelCheck(String taskId, String managerEmail, String comment)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        if (!ACTIVE_STATUSES.contains(task.getStatus()))
            throw new InvalidTaskException("a task in status " + task.getStatus() + " can't be canceled");

        Instant now = Instant.now();
        if (task.getActiveSince() != null)
        {
            task.setWorkedSeconds(task.getWorkedSeconds() + Duration.between(task.getActiveSince(), now).getSeconds());
            task.setActiveSince(null);
        }
        TaskStatus from = task.getStatus();
        task.setStatus(TaskStatus.CANCELED);
        task.setStatusReason(StatusReason.OTHER);
        task.setStatusComment(comment);
        task.setClosedAt(now);
        taskRepository.save(task);
        taskEventRepository.save(TaskEvent.statusChanged(taskId, task.getEquipmentId(), managerEmail,
                from, TaskStatus.CANCELED, StatusReason.OTHER, comment, now));
    }

    private TaskModel findSubmitted(String taskId)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        if (task.getStatus() != TaskStatus.SUBMITTED)
            throw new InvalidTaskException("a task in status " + task.getStatus() + " has no report to review");
        return task;
    }

    // followUp: what the reviewer wrote when validating (« Suite donnée »), kept on the validation step
    private String approve(TaskModel task, String reviewerEmail, String followUp)
    {
        Instant now = Instant.now();
        task.setStatus(TaskStatus.APPROVED);
        task.setStatusReason(null);
        task.setStatusComment(null);
        task.setReturnComment(null);
        task.setClosedAt(now);
        taskRepository.save(task);
        // the report is final: the state kept to reopen it if it came back isn't needed any more
        formDraftRepository.deleteByTaskId(task.getId());
        return taskEventRepository.save(TaskEvent.statusChanged(task.getId(), task.getEquipmentId(), reviewerEmail,
                TaskStatus.SUBMITTED, TaskStatus.APPROVED, null, followUp, now)).getId();
    }

    private String sendBack(TaskModel task, String reviewerEmail, StatusReason reason, String comment)
    {
        String what = comment == null ? null : comment.strip();
        if (what == null || what.isEmpty())
            throw new InvalidTaskException("a returned report needs a comment saying what to redo");
        StatusReason why = reason == null ? StatusReason.OTHER : reason;
        if (!RETURN_REASONS.contains(why))
            throw new InvalidTaskException("a report can't be returned with reason " + why);

        Instant now = Instant.now();
        task.setStatus(TaskStatus.RETURNED);
        task.setStatusReason(why);
        task.setStatusComment(what);
        // kept above his form while he corrects (statusComment goes when he resumes)
        task.setReturnComment(what);
        taskRepository.save(task);
        return taskEventRepository.save(TaskEvent.statusChanged(task.getId(), task.getEquipmentId(), reviewerEmail,
                TaskStatus.SUBMITTED, TaskStatus.RETURNED, why, what, now)).getId();
    }

    /*
    @Transactional
    // TODO THIS requires a lot of work.
    
    public String submitTask(String taskId, Authentication technician)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

    }
    
    @Transactional
    public String declineTask(String taskId, Authentication technician)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

    }

    @Transactional
    public String cancelTask(String taskId, Authentication technician)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

    }
    */
}
