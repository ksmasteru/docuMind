package com.docuMind.backend.services;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.docuMind.backend.model.Intervention;
import com.docuMind.backend.model.InterventionDetails;
import com.docuMind.backend.model.InterventionEvent;
import com.docuMind.backend.model.Notification;
import com.docuMind.backend.model.NotificationRequest;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.EventType;
import com.docuMind.backend.model.enums.InterventionAction;
import com.docuMind.backend.model.enums.InterventionStatus;
import com.docuMind.backend.model.enums.NotificationKind;
import com.docuMind.backend.model.enums.StepStatus;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.model.enums.WorkshopStep;
import com.docuMind.backend.repository.InterventionRepository;
import com.docuMind.backend.repository.NotificationRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.UserRepository;

// The notifications (plan_notifications_registry_stock_signatures.md, §1): who is told what, and the bell.
//
// Where they come from: every action on a task or an intervention already writes its history row
// (TaskEvent, InterventionEvent). Spring Data publishes each row when it is saved (@DomainEvents on the
// two classes), and this service reads it once the action's transaction has committed
// (@TransactionalEventListener AFTER_COMMIT), in a transaction of its own (REQUIRES_NEW). So:
//   - a refused action, rolled back, never notifies anyone;
//   - a notification that fails is only logged: it can never undo the action;
//   - TaskService and InterventionService need no call to this class.
// The state read here (the task, the intervention) is the one after the action.
//
// A notification never goes to the person who did the action. Each one also goes out by e-mail
// when an SMTP account is set (NotificationMailer).
@Service
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final TaskRepository taskRepository;
    private final InterventionRepository interventionRepository;
    private final NotificationMailer mailer;

    public NotificationService(NotificationRepository notificationRepository, UserRepository userRepository,
                               TaskRepository taskRepository, InterventionRepository interventionRepository,
                               NotificationMailer mailer)
    {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.taskRepository = taskRepository;
        this.interventionRepository = interventionRepository;
        this.mailer = mailer;
    }

    // ------------------------------------------------------------------ the bell

    // the caller's 50 newest, read or not
    public List<Notification> latest(String email)
    {
        return notificationRepository.findTop50ByRecipientEmailOrderByCreatedAtDesc(email);
    }

    public long unreadCount(String email)
    {
        return notificationRepository.countByRecipientEmailAndReadAtIsNull(email);
    }

    // false when the id isn't one of the caller's notifications (404)
    @Transactional
    public boolean markRead(String id, String email)
    {
        return notificationRepository.findByIdAndRecipientEmail(id, email)
            .map(n -> {
                if (n.getReadAt() == null)
                    n.setReadAt(Instant.now());
                return true;
            })
            .orElse(false);
    }

    @Transactional
    public int markAllRead(String email)
    {
        return notificationRepository.markAllRead(email, Instant.now());
    }

    // ------------------------------------------------------------------ a task changed

    // fallbackExecution: a row saved outside any transaction is still read (none is today)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onTaskEvent(TaskEvent event)
    {
        try {
            taskRepository.findById(event.getTaskId()).ifPresent(task -> send(forTask(task, event)));
        }
        catch (RuntimeException e) {
            log.warn("notifications for task event {} not sent", event.getId(), e);
        }
    }

    // What a task's history row tells whom. A workshop task's report sent, or the task declined, is told
    // by its intervention's own row (the Workshop Lead's queue), so not twice here.
    List<Notification> forTask(TaskModel task, TaskEvent event)
    {
        List<Notification> out = new ArrayList<>();
        String actor = event.getActorEmail();
        String technician = task.getTechnicianEmail();
        String manager = task.getManagerEmail();
        boolean workshop = task.getInterventionId() != null;
        boolean check = task.getTaskType() == TaskType.VERIFICATION;
        String title = task.getTitle();
        String pump = task.getEquipmentId();
        // a check is worked from its alert (FieldAlerts.jsx, AlertDetail.jsx), the other tasks from their page
        String technicianPage = check && task.getAlertNumber() != null ? "/terrain/" + task.getAlertNumber() : "/tasks/" + task.getId();
        String managerPage = check && task.getAlertNumber() != null ? "/alerts/" + task.getAlertNumber() : "/orders";
        // a report validated or rejected has left his active tasks: his sent report shows the verdict
        String sentReportPage = check ? technicianPage
            : task.getLatestSubmissionId() != null ? "/tasks/rapport/" + task.getLatestSubmissionId() : "/tasks?vue=envoyes";
        // a report the technician filed on his own (the report platform's OwnReportService): a task he started himself
        boolean ownReport = task.isSelfAssigned() && !check;

        if (event.getEventType() == EventType.REASSIGNED)
        {
            add(out, event.getNewTechnicianEmail(), actor, NotificationKind.TASK, "Nouvelle tâche : " + title,
                    about(pump, "confiée par " + nameOf(actor)), technicianPage);
            add(out, event.getPreviousTechnicianEmail(), actor, NotificationKind.TASK, "Tâche retirée : " + title,
                    about(pump, "confiée à " + nameOf(event.getNewTechnicianEmail())), null);
            return out;
        }
        if (event.getEventType() != EventType.STATUS_CHANGED)
            return out;

        // created: the technician gets his order; a check he started himself is his manager's news. A report he
        // filed on his own opens a task too: its « Rapport à valider » follows at once, so nothing here
        if (event.getFromStatus() == null)
        {
            if (!actor.equals(technician))
                add(out, technician, actor, NotificationKind.TASK,
                        (check ? "Vérification à faire : " : "Nouvelle tâche : ") + title,
                        about(pump, "envoyée par " + nameOf(actor), task.getDueDate() == null ? null : "pour le " + task.getDueDate()),
                        technicianPage);
            else if (check)
                add(out, manager, actor, NotificationKind.TASK, nameOf(technician) + " a démarré une vérification",
                        about(pump, title), managerPage);
            return out;
        }

        String comment = event.getComment();
        switch (event.getToStatus())
        {
            case DECLINED -> { if (!workshop) add(out, manager, actor, NotificationKind.TASK, "Tâche refusée : " + title,
                    about(pump, nameOf(actor), inQuotes(comment)), "/orders"); }
            case BLOCKED -> { if (!workshop) add(out, manager, actor, NotificationKind.TASK, "Tâche en attente : " + title,
                    about(pump, nameOf(actor), inQuotes(comment)), managerPage); }
            case SUBMITTED -> { if (!workshop) add(out, manager, actor, NotificationKind.REVIEW,
                    (check ? "Rapport de vérification reçu : " : "Rapport à valider : ") + title,
                    about(pump, nameOf(actor), ownReport ? "rempli à son initiative" : null), check ? managerPage : "/review"); }
            case APPROVED -> add(out, technician, actor, NotificationKind.REVIEW, "Rapport validé : " + title,
                    about(pump, "par " + nameOf(actor)), sentReportPage);
            case RETURNED -> add(out, technician, actor, NotificationKind.REVIEW, "Rapport à corriger : " + title,
                    about(pump, inQuotes(comment)), technicianPage);
            case REJECTED -> add(out, technician, actor, NotificationKind.REVIEW, "Rapport rejeté : " + title,
                    about(pump, inQuotes(comment)), sentReportPage);
            case CANCELED -> add(out, technician, actor, NotificationKind.TASK, "Tâche annulée : " + title,
                    about(pump, inQuotes(comment)), null);
            default -> { } // STARTED, and the others: nobody waits for them
        }
        return out;
    }

    // ------------------------------------------------------------------ an intervention moved

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onInterventionEvent(InterventionEvent event)
    {
        try {
            interventionRepository.findById(event.getInterventionId()).ifPresent(i -> send(forIntervention(i, event)));
        }
        catch (RuntimeException e) {
            log.warn("notifications for intervention event {} not sent", event.getId(), e);
        }
    }

    // What an intervention's history row tells whom:
    //   finished or cancelled          who launched it (the manager from his alert, or Sales)
    //   now at a step « À traiter » or  every user of the step's role: it waits in their queue.
    //   « À corriger »                 A technician's step (8 / 16) is told by his task instead
    List<Notification> forIntervention(Intervention intervention, InterventionEvent event)
    {
        List<Notification> out = new ArrayList<>();
        String actor = event.getActorEmail();
        String label = InterventionDetails.number(intervention) + " · " + intervention.getEquipmentId();
        String page = "/atelier/" + intervention.getId();

        if (intervention.getStatus() != InterventionStatus.EN_COURS)
        {
            boolean closedNow = event.getAction() == InterventionAction.CANCEL
                || (event.getAction() == InterventionAction.VALIDATE && event.getStep().next() == null);
            if (closedNow)
            {
                boolean cancelled = intervention.getStatus() == InterventionStatus.ANNULEE;
                add(out, intervention.getLaunchedBy(), actor, NotificationKind.WORKSHOP,
                        label + (cancelled ? " annulée" : " terminée"),
                        cancelled ? "Annulée à l'étape " + event.getStep().number() + quoted(intervention.getStatusComment())
                                  : "La facturation est validée.",
                        page);
            }
            return out;
        }

        WorkshopStep step = intervention.getCurrentStep();
        StepStatus status = intervention.getStepStatus();
        if (event.getAction() == InterventionAction.TAKE || step.isTask()
            || (status != StepStatus.A_TRAITER && status != StepStatus.A_CORRIGER))
            return out;

        String title = (status == StepStatus.A_CORRIGER ? "À corriger · " : "À traiter · ") + step.number() + ". " + step.getLabel();
        String body = label + (intervention.isUrgent() ? " · urgente" : "") + quoted(event.getComment());
        for (User user : userRepository.findByRole(step.getRole()))
            add(out, user.getEmail(), actor, NotificationKind.WORKSHOP, title, body, page);
        return out;
    }

    // ------------------------------------------------------------------ asked for by another service

    // the stock's low-stock warning (StockService): sent once its transaction commits
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onRequest(NotificationRequest request)
    {
        try {
            List<Notification> out = new ArrayList<>();
            if (request.email() != null)
                add(out, request.email(), request.exceptEmail(), request.kind(), request.title(), request.body(), request.link());
            if (request.role() != null)
                for (User user : userRepository.findByRole(request.role()))
                    add(out, user.getEmail(), request.exceptEmail(), request.kind(), request.title(), request.body(), request.link());
            send(out);
        }
        catch (RuntimeException e) {
            log.warn("notification \"{}\" not sent", request.title(), e);
        }
    }

    // ------------------------------------------------------------------ helpers

    // saved, then e-mailed (in the background, when e-mail is on)
    private void send(List<Notification> notifications)
    {
        if (notifications.isEmpty())
            return;
        List<Notification> saved = notificationRepository.saveAll(notifications);
        mailer.send(saved);
    }

    // one notification, unless there is nobody to tell or it would tell the actor about his own action
    private static void add(List<Notification> out, String to, String actor, NotificationKind kind, String title,
                            String body, String link)
    {
        if (to == null || to.isBlank() || to.equals(actor))
            return;
        out.add(new Notification(to, kind, title, body, link));
    }

    private String nameOf(String email)
    {
        if (email == null)
            return "—";
        return userRepository.findByEmail(email).map(User::getName)
            .filter(name -> name != null && !name.isBlank()).orElse(email);
    }

    // " · « the comment »", or nothing
    private static String quoted(String comment)
    {
        return comment == null || comment.isBlank() ? "" : " · « " + comment.strip() + " »";
    }

    // "« the comment »", or null
    private static String inQuotes(String comment)
    {
        return comment == null || comment.isBlank() ? null : "« " + comment.strip() + " »";
    }

    // a task's line: the pump, when it has one (it is optional on the report platform), then the rest,
    // joined with " · "; null when there is nothing to say
    static String about(String pump, String... rest)
    {
        StringJoiner line = new StringJoiner(" · ");
        if (pump != null && !pump.isBlank())
            line.add(pump.strip());
        for (String part : rest)
            if (part != null && !part.isBlank())
                line.add(part);
        return line.length() == 0 ? null : line.toString();
    }
}
