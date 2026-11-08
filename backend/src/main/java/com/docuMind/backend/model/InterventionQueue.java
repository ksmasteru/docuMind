package com.docuMind.backend.model;

import java.time.Instant;
import java.util.List;

import com.docuMind.backend.model.InterventionDetails.Step;
import com.docuMind.backend.model.enums.InterventionOrigin;
import com.docuMind.backend.model.enums.StepStatus;

// response for a role's queue (/queue): the interventions waiting at one of its steps
public record InterventionQueue(
    List<Line> interventions,
    int interventionsCount)
{
    // one card of the list
    public record Line(
        String id,
        String number,
        InterventionOrigin origin,
        Integer alertNumber,
        String equipmentId,
        String fault,
        boolean urgent,
        String client,
        Step currentStep,
        StepStatus stepStatus,
        String stepAssignee,
        Instant createdAt
    ){
        public static Line from(Intervention i) {
            return new Line(i.getId(), InterventionDetails.number(i), i.getOrigin(), i.getAlertNumber(),
                    i.getEquipmentId(), i.getFault(), i.isUrgent(), i.getClient(),
                    Step.from(i.getCurrentStep()), i.getStepStatus(), i.getStepAssignee(), i.getCreatedAt());
        }
    }

    public static InterventionQueue from(List<Intervention> interventions) {
        List<Line> lines = interventions.stream().map(Line::from).toList();
        return new InterventionQueue(lines, lines.size());
    }
}
