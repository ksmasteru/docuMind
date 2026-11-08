package com.docuMind.backend.model;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.docuMind.backend.model.InterventionDetails.Step;
import com.docuMind.backend.model.InterventionDetails.Task;
import com.docuMind.backend.model.enums.InterventionStatus;
import com.docuMind.backend.model.enums.StepStatus;
import com.docuMind.backend.model.enums.WorkshopStep;

// response for /followed: the interventions the caller worked on (a step taken, validated, a
// technician assigned…), with where each one is now. The Chef de projet's and Workshop Lead's
// Suivi tab, like the manager's Ordres.
public record InterventionFollowUp(
    List<Line> interventions,
    int interventionsCount,
    int stepsCount)              // 20: for "étape 8 / 20"
{
    // one card of the list
    public record Line(
        String id,
        String number,
        String equipmentId,
        String fault,
        boolean urgent,
        String client,
        Step currentStep,
        StepStatus stepStatus,
        String stepAssignee,
        InterventionStatus status,
        Task task,               // the technician's task on step 8 / 16, else null
        Instant createdAt,
        Instant updatedAt,
        Instant closedAt
    ){
        public static Line from(Intervention i, TaskModel task) {
            return new Line(i.getId(), InterventionDetails.number(i), i.getEquipmentId(), i.getFault(), i.isUrgent(),
                    i.getClient(), Step.from(i.getCurrentStep()), i.getStepStatus(), i.getStepAssignee(), i.getStatus(),
                    Task.from(task), i.getCreatedAt(), i.getUpdatedAt(), i.getClosedAt());
        }
    }

    // tasks: by id, the ones the interventions point to
    public static InterventionFollowUp from(List<Intervention> interventions, Map<String, TaskModel> tasks) {
        List<Line> lines = interventions.stream()
            .map(i -> Line.from(i, i.getTaskId() == null ? null : tasks.get(i.getTaskId())))
            .toList();
        return new InterventionFollowUp(lines, lines.size(), WorkshopStep.values().length);
    }
}
