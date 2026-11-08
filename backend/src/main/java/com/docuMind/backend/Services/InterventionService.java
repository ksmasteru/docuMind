package com.docuMind.backend.services;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.event.EventListener;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

import com.docuMind.backend.exception.CommentRequiredException;
import com.docuMind.backend.exception.FormNotFoundException;
import com.docuMind.backend.exception.InterventionNotFoundException;
import com.docuMind.backend.exception.InvalidInterventionException;
import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.Intervention;
import com.docuMind.backend.model.InterventionAssignDto;
import com.docuMind.backend.model.InterventionCreationDto;
import com.docuMind.backend.model.InterventionDetails;
import com.docuMind.backend.model.InterventionEvent;
import com.docuMind.backend.model.InterventionFollowUp;
import com.docuMind.backend.model.InterventionRequestDto;
import com.docuMind.backend.model.TaskCreationDto;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.TaskSubmittedEvent;
import com.docuMind.backend.model.enums.InterventionAction;
import com.docuMind.backend.model.enums.InterventionOrigin;
import com.docuMind.backend.model.enums.InterventionStatus;
import com.docuMind.backend.model.enums.StepStatus;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.model.enums.WorkshopStep;
import com.docuMind.backend.repository.CheckListTemplateRepository;
import com.docuMind.backend.repository.InterventionEventRepository;
import com.docuMind.backend.repository.InterventionRepository;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.TaskRepository;

import jakarta.transaction.Transactional;

// The workshop loop (fix_workshop.md). Like TaskService, one method changes the state (perform):
// it checks the role, the assignee and the step's status and flags, updates the intervention
// and writes the event in the same transaction.
//
// Done so far: the request (step 1, Sales) from both routes, the generic Prendre en charge /
// Valider / Annuler on every step that isn't the technician's, and the Workshop Lead assigning
// the technician's task (step 7 / 15, assignTechnician). The technician's step (8 / 16) doesn't
// move on yet when the task is done.
@Service
public class InterventionService {
    private final InterventionRepository interventionRepository;
    private final InterventionEventRepository interventionEventRepository;
    // the technician's steps run as tasks: created here at step 7 / 15, read for the page
    private final TaskService taskService;
    private final TaskRepository taskRepository;
    // step 7 / 15 only sends a "Rapport d'expertise" (complet, démontage, montage…)
    private final CheckListTemplateRepository checkListTemplateRepository;
    // the reports of the intervention's tasks, for its page
    private final SubmissionRepository submissionRepository;

    private static final String EXPERTISE_TITLE_PREFIX = "rapport d'expertise";

    public InterventionService(InterventionRepository interventionRepository,
        InterventionEventRepository interventionEventRepository, TaskService taskService, TaskRepository taskRepository,
        CheckListTemplateRepository checkListTemplateRepository, SubmissionRepository submissionRepository)
    {
        this.submissionRepository = submissionRepository;
        this.interventionRepository = interventionRepository;
        this.interventionEventRepository = interventionEventRepository;
        this.taskService = taskService;
        this.taskRepository = taskRepository;
        this.checkListTemplateRepository = checkListTemplateRepository;
    }

    // a manager sends a pump from an alert, or Sales takes a client's request.
    // Both start at COMPLETER_DEMANDE: the manager's waits in the Sales queue, while Sales is
    // already working on the one it created.
    // saveAndFlush: the insert runs now, so the database's operationNumber is read back for the answer
    @Transactional
    @PreAuthorize("hasAnyRole('MANAGER', 'SALES')")
    public Intervention createIntervention(InterventionCreationDto request, Authentication caller)
    {
        boolean sales = roleOf(caller) == UserRole.SALES;
        if (!sales && request.alertNumber() == null)
            throw new InvalidInterventionException("a manager sends a pump to the workshop from an alert: alertNumber is required");

        Intervention intervention = new Intervention(
            sales ? InterventionOrigin.CLIENT : InterventionOrigin.ALERT,
            sales ? null : request.alertNumber(),
            caller.getName(), request.equipmentId().trim(), request.fault().trim(), request.urgent());
        intervention.setClient(clean(request.client()));
        intervention.setCustomerOrderNumber(clean(request.customerOrderNumber()));

        if (sales)
        {
            intervention.setStepStatus(StepStatus.EN_COURS);
            intervention.setStepAssignee(caller.getName());
        }

        Intervention saved = interventionRepository.saveAndFlush(intervention);

        // creating an event of creation : nothing -> A_TRAITER (manager) or EN_COURS (Sales)
        interventionEventRepository.save(new InterventionEvent(saved.getId(), saved.getCurrentStep(),
                InterventionAction.CREATE, caller.getName(), null, saved.getStepStatus(), null, Instant.now()));

        return saved;
    }

    // the caller's queue: the open interventions at one of his role's steps that nobody took,
    // and the ones he took himself, the oldest first. 403 for a role with no workshop step
    public List<Intervention> getQueue(Authentication caller)
    {
        List<WorkshopStep> steps = WorkshopStep.forRole(roleOf(caller));
        if (steps.isEmpty())
            throw new AccessDeniedException("this role has no workshop step");

        String email = caller.getName();
        return interventionRepository.findByStatusAndCurrentStepInOrderByCreatedAtAsc(InterventionStatus.EN_COURS, steps)
            .stream()
            .filter(i -> i.getStepAssignee() == null || i.getStepAssignee().equals(email))
            .toList();
    }

    // the Suivi tab of the Chef de projet and the Workshop Lead: every intervention they acted on
    // (took or validated a step, assigned a technician), open or closed, with the technician's tasks
    @PreAuthorize("hasAnyRole('PROJECT_LEAD', 'WORKSHOP_LEAD')")
    public InterventionFollowUp getFollowed(Authentication caller)
    {
        List<String> ids = interventionEventRepository.findInterventionIdsByActor(caller.getName());
        if (ids.isEmpty())
            return InterventionFollowUp.from(List.of(), Map.of());

        List<Intervention> interventions = interventionRepository.findByIdInOrderByUpdatedAtDesc(ids);
        List<String> taskIds = interventions.stream().map(Intervention::getTaskId).filter(id -> id != null).toList();
        Map<String, TaskModel> tasks = taskRepository.findAllById(taskIds).stream()
            .collect(Collectors.toMap(TaskModel::getId, Function.identity()));
        return InterventionFollowUp.from(interventions, tasks);
    }

    // one intervention's page. Open to who launched it, to every workshop role (the file goes
    // from one to the next, each needs to read what the others did), and to admins
    public InterventionDetails getIntervention(String interventionId, Authentication caller)
    {
        Intervention intervention = find(interventionId);
        UserRole role = roleOf(caller);
        String email = caller.getName();

        boolean allowed = intervention.getLaunchedBy().equals(email)
            || role == UserRole.ADMIN
            || !WorkshopStep.forRole(role).isEmpty();
        if (!allowed)
            throw new AccessDeniedException("not allowed to read this intervention");

        List<InterventionEvent> events = interventionEventRepository.findByInterventionIdOrderByOccurredAtAsc(interventionId);
        TaskModel task = intervention.getTaskId() == null ? null : taskRepository.findById(intervention.getTaskId()).orElse(null);
        return InterventionDetails.from(intervention, events, availableActions(intervention, email, role),
                canEditRequest(intervention, email), canAssign(intervention, email, role),
                role == UserRole.PROJECT_LEAD && QuoteService.canQuote(intervention, email), task, workshopTasks(interventionId));
    }

    // every task of the intervention with its reports (two queries, whatever the number of tasks)
    private List<InterventionDetails.WorkshopTask> workshopTasks(String interventionId)
    {
        List<TaskModel> tasks = taskRepository.findByInterventionIdOrderByCreatedAtAsc(interventionId);
        if (tasks.isEmpty())
            return List.of();
        Map<String, List<CheckListSubmission>> reports = submissionRepository
            .findByTaskIdInOrderBySubmittedAtAsc(tasks.stream().map(TaskModel::getId).toList()).stream()
            .collect(Collectors.groupingBy(CheckListSubmission::getTaskId));
        return tasks.stream()
            .map(t -> InterventionDetails.WorkshopTask.from(t, reports.getOrDefault(t.getId(), List.of())))
            .toList();
    }

    // Sales changes the request's fields while completing it (step 1, taken by him)
    @Transactional
    public void updateRequest(String interventionId, InterventionRequestDto request, Authentication caller)
    {
        Intervention intervention = find(interventionId);
        if (!canEditRequest(intervention, caller.getName()))
            throw new InvalidInterventionException("the request can only be changed by the Sales person completing it");

        intervention.setEquipmentId(request.equipmentId().trim());
        intervention.setFault(request.fault().trim());
        intervention.setUrgent(request.urgent());
        intervention.setClient(clean(request.client()));
        intervention.setCustomerOrderNumber(clean(request.customerOrderNumber()));

        interventionRepository.save(intervention);
    }

    // one button pressed on the current step. Returns the event's id, like TaskService
    @Transactional
    public String perform(String interventionId, InterventionAction action, String comment, Authentication caller)
    {
        Intervention intervention = find(interventionId);
        WorkshopStep step = intervention.getCurrentStep();
        UserRole role = roleOf(caller);
        String email = caller.getName();

        if (step.getRole() != role)
            throw new AccessDeniedException("step " + step + " is done by " + step.getRole());
        // the same check as the buttons the page draws: status, assignee, the step's flags
        if (!availableActions(intervention, email, role).contains(action))
            throw new InvalidInterventionException("action " + action + " can't be done on step " + step
                    + " (" + intervention.getStepStatus() + ") by this user");

        Instant now = Instant.now();
        StepStatus fromStatus = intervention.getStepStatus();
        StepStatus toStatus;
        String cleanComment = clean(comment);

        switch (action)
        {
            case TAKE -> {
                intervention.setStepStatus(StepStatus.EN_COURS);
                intervention.setStepAssignee(email);
                toStatus = StepStatus.EN_COURS;
            }
            case VALIDATE -> {
                // the client is needed by the next steps and the report; the order number is
                // the Contract Admin's check (step 3), so it may still be missing here
                if (step == WorkshopStep.COMPLETER_DEMANDE && intervention.getClient() == null)
                    throw new InvalidInterventionException("the request can't be validated without the client");
                // step 10 hands the devis to Sales: there has to be one, validated on the devis page
                if (step == WorkshopStep.VALIDER_BESOINS_DEVIS && intervention.getQuoteId() == null)
                    throw new InvalidInterventionException("L'étape " + step.number() + " ne peut pas être validée avant que le devis soit rempli et validé.");

                // the review of the technician's report (9 / 17): validating it approves the task
                if (reviewsTask(step))
                    taskService.approveForIntervention(requireTask(intervention), email);

                WorkshopStep next = step.next();
                // never reached: availableActions doesn't offer VALIDATE before a technician's step
                if (next != null && next.isTask())
                    throw new InvalidInterventionException("step " + step + " is validated by assigning a technician");
                if (next == null)
                {
                    intervention.setStepStatus(StepStatus.VALIDE);
                    intervention.setStatus(InterventionStatus.TERMINEE);
                    intervention.setClosedAt(now);
                }
                else
                {
                    // the next step waits in its role's queue
                    intervention.setCurrentStep(next);
                    intervention.setStepStatus(StepStatus.A_TRAITER);
                    intervention.setStepAssignee(null);
                }
                toStatus = StepStatus.VALIDE;
            }
            // the report goes back to the technician: his task is RETURNED with the comment, the
            // intervention waits at his step (8 / 16), À corriger, until he sends a new report
            case RETURN -> {
                if (cleanComment == null)
                    throw new CommentRequiredException("a comment is required to send the report back");
                String taskId = requireTask(intervention);
                taskService.returnForIntervention(taskId, email, cleanComment);
                intervention.setCurrentStep(step.getRefuseTo());
                intervention.setStepStatus(StepStatus.A_CORRIGER);
                intervention.setStepAssignee(taskRepository.findById(taskId).map(TaskModel::getTechnicianEmail).orElse(null));
                toStatus = StepStatus.A_CORRIGER;
            }
            case CANCEL -> {
                if (cleanComment == null)
                    throw new CommentRequiredException("a comment is required to cancel the intervention");
                intervention.setStatus(InterventionStatus.ANNULEE);
                intervention.setStatusComment(cleanComment);
                intervention.setClosedAt(now);
                toStatus = fromStatus;
            }
            // never reached: availableActions doesn't offer the others yet
            default -> throw new InvalidInterventionException("action " + action + " is not available yet");
        }

        interventionRepository.save(intervention);
        InterventionEvent saved = interventionEventRepository.save(new InterventionEvent(interventionId, step, action,
                email, fromStatus, toStatus, cleanComment, now));
        return saved.getId();
    }

    // A technician sent the report of his task (TaskService.submitTask, same transaction). If the task
    // is a workshop intervention's step 8 / 16, that step is done: the intervention waits at the
    // review step (9 / 17) in the Workshop Lead's queue. The history says the technician sent it.
    // A manager's task has no intervention and nothing happens.
    @EventListener
    public void onTaskSubmitted(TaskSubmittedEvent submitted)
    {
        interventionRepository.findByTaskId(submitted.taskId())
            .filter(i -> i.getStatus() == InterventionStatus.EN_COURS && i.getCurrentStep().isTask())
            .ifPresent(intervention -> {
                WorkshopStep step = intervention.getCurrentStep();
                StepStatus fromStatus = intervention.getStepStatus();
                intervention.setCurrentStep(step.next());
                intervention.setStepStatus(StepStatus.A_TRAITER);
                intervention.setStepAssignee(null);
                interventionRepository.save(intervention);
                interventionEventRepository.save(new InterventionEvent(intervention.getId(), step, InterventionAction.VALIDATE,
                        submitted.technicianEmail(), fromStatus, StepStatus.VALIDE, "Rapport envoyé", submitted.submittedAt()));
            });
    }

    // the Workshop Lead who took step 7 (Affecter équipe) or 15 (Autoriser montage) sends the
    // technician his task, like a manager's order: the task is created for the intervention's pump,
    // step 7 / 15 is validated, and the intervention waits at step 8 / 16 with that technician.
    // Same transaction: a refused task (not a technician, inactive form) leaves the step as it was.
    // Returns the task's id
    @Transactional
    public String assignTechnician(String interventionId, InterventionAssignDto order, Authentication caller)
    {
        Intervention intervention = find(interventionId);
        WorkshopStep step = intervention.getCurrentStep();
        UserRole role = roleOf(caller);
        String email = caller.getName();

        if (step.getRole() != role)
            throw new AccessDeniedException("step " + step + " is done by " + step.getRole());
        if (!canAssign(intervention, email, role))
            throw new InvalidInterventionException("a technician can't be assigned on step " + step
                    + " (" + intervention.getStepStatus() + ") by this user");

        // the workshop's technician steps are filled in with one of the expertise reports
        String templateId = order.templateId().strip();
        CheckListTemplate template = checkListTemplateRepository.findById(templateId).orElseThrow(
            () -> new FormNotFoundException("no form with id " + templateId));
        if (!template.getTitle().strip().toLowerCase().startsWith(EXPERTISE_TITLE_PREFIX))
            throw new InvalidInterventionException("the workshop's technician gets a \"Rapport d'expertise\" form, not \""
                    + template.getTitle() + "\"");

        // createNewTask checks the technician's role and the form; the manager is the Workshop Lead
        String taskId = taskService.createNewTask(new TaskCreationDto(order.title().strip(), order.taskType(),
                order.technicianEmail().strip(), intervention.getEquipmentId(), clean(order.instructions()),
                order.dueDate(), order.priority(), order.templateId().strip()), caller);

        // the task belongs to the intervention's next step (8 / 16), for good: the intervention's taskId
        // moves on at step 15, this link doesn't
        TaskModel created = taskRepository.findById(taskId).orElseThrow();
        created.linkToIntervention(interventionId, step.next());
        taskRepository.save(created);

        Instant now = Instant.now();
        StepStatus fromStatus = intervention.getStepStatus();
        String technician = order.technicianEmail().strip();

        intervention.setCurrentStep(step.next());
        intervention.setStepStatus(StepStatus.A_TRAITER); // the task is ASSIGNED
        intervention.setStepAssignee(technician);
        intervention.setTaskId(taskId);
        interventionRepository.save(intervention);

        interventionEventRepository.save(new InterventionEvent(interventionId, step, InterventionAction.VALIDATE,
                email, fromStatus, StepStatus.VALIDE, "Tâche « " + order.title().strip() + " » assignée à " + technician, now));
        return taskId;
    }

    // the buttons the caller may press on the current step: only the step's role, only while the
    // intervention is open; a step waiting in the queue can be taken, a taken step is validated
    // (or cancelled, canCancel steps) by the one who took it. The technician's steps run as tasks.
    private static List<InterventionAction> availableActions(Intervention intervention, String email, UserRole role)
    {
        WorkshopStep step = intervention.getCurrentStep();
        if (intervention.getStatus() != InterventionStatus.EN_COURS || step.isTask() || step.getRole() != role)
            return List.of();

        return switch (intervention.getStepStatus()) {
            case A_TRAITER, A_CORRIGER -> List.of(InterventionAction.TAKE);
            case EN_COURS -> !email.equals(intervention.getStepAssignee()) ? List.of()
                // before a technician's step the step is validated by assigning him (canAssign)
                : leadsToTask(step) ? (step.canCancel() ? List.of(InterventionAction.CANCEL) : List.of())
                // the report's review (9 / 17): validate it, or send it back to the technician
                : reviewsTask(step) ? List.of(InterventionAction.VALIDATE, InterventionAction.RETURN)
                : step.canCancel() ? List.of(InterventionAction.VALIDATE, InterventionAction.CANCEL)
                : List.of(InterventionAction.VALIDATE);
            // later: EN_ATTENTE (RESUME), BLOQUE (UNBLOCK)
            default -> List.of();
        };
    }

    // step 7 / 15 taken by the caller: the page shows the task order instead of "Valider"
    private static boolean canAssign(Intervention intervention, String email, UserRole role)
    {
        WorkshopStep step = intervention.getCurrentStep();
        return intervention.getStatus() == InterventionStatus.EN_COURS
            && step.getRole() == role
            && leadsToTask(step)
            && intervention.getStepStatus() == StepStatus.EN_COURS
            && email.equals(intervention.getStepAssignee());
    }

    private static boolean leadsToTask(WorkshopStep step)
    {
        return step.next() != null && step.next().isTask();
    }

    // 9 / 17: the step after a technician's, where his report is reviewed; Renvoyer goes back to him
    private static boolean reviewsTask(WorkshopStep step)
    {
        return step.getRefuseTo() != null && step.getRefuseTo().isTask();
    }

    private static String requireTask(Intervention intervention)
    {
        if (intervention.getTaskId() == null)
            throw new InvalidInterventionException("intervention " + intervention.getId() + " has no technician's task to review");
        return intervention.getTaskId();
    }

    private static boolean canEditRequest(Intervention intervention, String email)
    {
        return intervention.getStatus() == InterventionStatus.EN_COURS
            && intervention.getCurrentStep() == WorkshopStep.COMPLETER_DEMANDE
            && intervention.getStepStatus() == StepStatus.EN_COURS
            && email.equals(intervention.getStepAssignee());
    }

    private Intervention find(String interventionId)
    {
        return interventionRepository.findById(interventionId)
            .orElseThrow(() -> new InterventionNotFoundException("no intervention found with id :" + interventionId));
    }

    // the token holds one authority, "ROLE_SALES" (JwtAuthenticationFilter)
    private static UserRole roleOf(Authentication caller)
    {
        return caller.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .filter(authority -> authority.startsWith("ROLE_"))
            .map(authority -> UserRole.valueOf(authority.substring("ROLE_".length())))
            .findFirst()
            .orElseThrow(() -> new AccessDeniedException("no role in the token"));
    }

    // a blank text field is stored as null
    private static String clean(String text)
    {
        return text == null || text.isBlank() ? null : text.strip();
    }
}
