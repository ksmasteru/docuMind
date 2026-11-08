package com.docuMind.backend.services;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
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
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.ReviewTask;
import com.docuMind.backend.model.TaskCreationDto;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.TaskSubmittedEvent;
import com.docuMind.backend.model.User;
import java.util.List;
import com.docuMind.backend.model.enums.StatusReason;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.CheckListTemplateRepository;
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

    // the reasons a report may be returned with
    private static final Set<StatusReason> RETURN_REASONS =
            EnumSet.of(StatusReason.MISSING_INFO, StatusReason.WRONG_MEASUREMENT, StatusReason.OTHER);

    // statuses a task may be started from (see maintenace_loop_servicetohandle.md)
    private static final Set<TaskStatus> CAN_START_FROM =
            EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.BLOCKED, TaskStatus.RETURNED);

    private static final Set<TaskStatus> ACTIVE_STATUSES =
        EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.STARTED, TaskStatus.BLOCKED, TaskStatus.RETURNED);

    public TaskService(TaskRepository taskRepository, TaskEventRepository taskEventRepository,
        UserService userService, CheckListTemplateRepository checkListTemplateRepository,
        ApplicationEventPublisher events
    )
    {
        this.events = events;
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

    // true when this user created the task, false for an unknown task.
    // Lets the manager read the reports sent for his tasks (SubmissionService.getReport)
    // a workshop intervention's task (démontage or montage), whichever step the intervention is on now
    public boolean isWorkshopTask(String taskId)
    {
        return taskRepository.findById(taskId).map(task -> task.getInterventionId() != null).orElse(false);
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

    @Transactional
    //@PreAuthorize('hasRole')
    // managerEmail and technicianEmail store the users' emails (what the JWT holds)
    public String createNewTask(TaskCreationDto task, Authentication manager)
    {
        // test if the user actualy exist and is a technician.
        // users are identified by their email (unique, and it's what the JWT holds)
        // getUserByEmail throws UserNotFoundException (404) if the email doesn't exist
        User technician = userService.getUserByEmail(task.technicianEmail());
        if (technician.getRole() != UserRole.USER)
            throw new InvalidRoleException("user " + task.technicianEmail() + " is not a technician");

        TaskModel taskOrder = new TaskModel(task.title(), task.taskType(), technician.getEmail(),
                manager.getName(), task.equipmentId(), task.instructions(), task.dueDate()
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

    // the manager who sent the task approves its report: the task is closed (APPROVED).
    // A workshop task is approved by validating its intervention's review step instead.
    @Transactional
    public String approveTask(String taskId, Authentication manager)
    {
        TaskModel task = reviewable(taskId, manager.getName());
        // a workshop task is reviewed from its intervention's page, not with /approve or /return
        if (task.getInterventionId() != null)
            throw new InvalidTaskException("task " + taskId + " is reviewed from its workshop intervention");
        return approve(task, manager.getName());
    }

    // the manager sends the report back to the technician (RETURNED), saying what to redo;
    // the technician starts it again and sends a new report
    @Transactional
    public String returnTask(String taskId, Authentication manager, StatusReason reason, String comment)
    {
        TaskModel task = reviewable(taskId, manager.getName());
        if (task.getInterventionId() != null)
            throw new InvalidTaskException("task " + taskId + " is reviewed from its workshop intervention");
        return sendBack(task, manager.getName(), reason, comment);
    }

    // the same two, for InterventionService's review step (9 / 17): the caller was checked there
    // (the step's role, who took it); the task still has to be SUBMITTED
    @Transactional
    public void approveForIntervention(String taskId, String reviewerEmail)
    {
        approve(findSubmitted(taskId), reviewerEmail);
    }

    @Transactional
    public void returnForIntervention(String taskId, String reviewerEmail, String comment)
    {
        sendBack(findSubmitted(taskId), reviewerEmail, StatusReason.OTHER, comment);
    }

    private TaskModel reviewable(String taskId, String managerEmail)
    {
        TaskModel task = findSubmitted(taskId);
        if (!task.getManagerEmail().equals(managerEmail))
            throw new AccessDeniedException("only the manager who sent the task reviews its report");
        return task;
    }

    private TaskModel findSubmitted(String taskId)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        if (task.getStatus() != TaskStatus.SUBMITTED)
            throw new InvalidTaskException("a task in status " + task.getStatus() + " has no report to review");
        return task;
    }

    private String approve(TaskModel task, String reviewerEmail)
    {
        Instant now = Instant.now();
        task.setStatus(TaskStatus.APPROVED);
        task.setStatusReason(null);
        task.setStatusComment(null);
        task.setClosedAt(now);
        taskRepository.save(task);
        return taskEventRepository.save(TaskEvent.statusChanged(task.getId(), task.getEquipmentId(), reviewerEmail,
                TaskStatus.SUBMITTED, TaskStatus.APPROVED, null, null, now)).getId();
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
