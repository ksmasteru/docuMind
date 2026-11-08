package com.docuMind.backend.model;

import java.time.Instant;
import java.util.List;

import com.docuMind.backend.model.enums.InterventionAction;
import com.docuMind.backend.model.enums.InterventionOrigin;
import com.docuMind.backend.model.enums.InterventionStatus;
import com.docuMind.backend.model.enums.StepStatus;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.model.enums.WorkshopStep;

// response for one intervention's page: the file, its history, and what the caller may do on it
public record InterventionDetails(
    String id,
    String number,        // "AT-00012", the N° d'opération
    InterventionOrigin origin,
    Integer alertNumber,
    String launchedBy,
    String equipmentId,
    String fault,
    boolean urgent,
    String client,
    String customerOrderNumber,
    InterventionStatus status,
    String statusComment,
    Step currentStep,
    Step nextStep,              // who gets it after "Valider", null on the last step
    StepStatus stepStatus,
    String stepAssignee,
    Instant createdAt,
    Instant closedAt,
    List<InterventionAction> availableActions, // the buttons to draw for the caller
    boolean canEditRequest,                     // the caller is completing the request (Sales, step 1, taken)
    boolean canAssign,                          // the caller assigns the technician (Workshop Lead, step 7 / 15, taken)
    boolean canQuote,                           // the caller generates the devis (Chef de projet, step 10, taken)
    Task task,                                  // the technician's current task, null before step 8
    String quoteId,                             // the validated devis, null until step 10's "Valider" on the devis page
    List<WorkshopTask> tasks,                   // every technician task of the intervention, oldest first, with its reports
    List<Event> events)                         // oldest first
{
    // a step as the page shows it: "1 · Compléter la demande", done by SALES
    public record Step(String code, int number, String label, UserRole role) {
        public static Step from(WorkshopStep step) {
            return new Step(step.name(), step.number(), step.getLabel(), step.getRole());
        }
    }

    public record Event(Step step, InterventionAction action, String actorEmail,
                        StepStatus fromStatus, StepStatus toStatus, String comment, Instant occurredAt) {
        public static Event from(InterventionEvent event) {
            return new Event(Step.from(event.getStep()), event.getAction(), event.getActorEmail(),
                    event.getFromStatus(), event.getToStatus(), event.getComment(), event.getOccurredAt());
        }
    }

    // the technician's task as the page shows it; status is the task's own TaskStatus
    // submissionId: the last report he sent (the review step's "Voir le rapport"), null before;
    // statusComment: what to redo once the report was sent back
    public record Task(String id, String title, String technicianEmail, TaskStatus status,
                       String submissionId, String statusComment) {
        public static Task from(TaskModel task) {
            return task == null ? null : new Task(task.getId(), task.getTitle(), task.getTechnicianEmail(), task.getStatus(),
                    task.getLatestSubmissionId(), task.getStatusComment());
        }
    }

    // one technician task of the intervention (démontage at step 8, montage at 16, or one cancelled /
    // declined before), and every report sent for it, oldest first: a report sent back is followed by
    // its corrected version
    public record WorkshopTask(String id, Step step, String title, String technicianEmail, TaskStatus status,
                               String statusComment, Instant createdAt, List<Report> reports) {
        public record Report(String submissionId, Instant submittedAt, int version) {}

        public static WorkshopTask from(TaskModel task, List<CheckListSubmission> submissions) {
            List<Report> reports = new java.util.ArrayList<>();
            for (CheckListSubmission s : submissions)
                reports.add(new Report(s.getId(), s.getSubmittedAt(), reports.size() + 1));
            return new WorkshopTask(task.getId(), task.getInterventionStep() == null ? null : Step.from(task.getInterventionStep()),
                    task.getTitle(), task.getTechnicianEmail(), task.getStatus(), task.getStatusComment(), task.getCreatedAt(), reports);
        }
    }

    // "AT-00012"; the format is a placeholder until PHOVA's own numbering is known
    public static String number(Intervention intervention) {
        return intervention.getOperationNumber() == null ? null : String.format("AT-%05d", intervention.getOperationNumber());
    }

    public static InterventionDetails from(Intervention i, List<InterventionEvent> events,
                                           List<InterventionAction> availableActions, boolean canEditRequest,
                                           boolean canAssign, boolean canQuote, TaskModel task, List<WorkshopTask> tasks) {
        return new InterventionDetails(i.getId(), number(i), i.getOrigin(), i.getAlertNumber(), i.getLaunchedBy(),
                i.getEquipmentId(), i.getFault(), i.isUrgent(), i.getClient(), i.getCustomerOrderNumber(),
                i.getStatus(), i.getStatusComment(), Step.from(i.getCurrentStep()),
                i.getCurrentStep().next() == null ? null : Step.from(i.getCurrentStep().next()), i.getStepStatus(),
                i.getStepAssignee(), i.getCreatedAt(), i.getClosedAt(), availableActions, canEditRequest,
                canAssign, canQuote, Task.from(task), i.getQuoteId(), tasks, events.stream().map(Event::from).toList());
    }
}
