package com.docuMind.backend.model;

import java.time.LocalDate;

import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskType;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

// body of POST /api/v1/interventions/{id}/assign: the Workshop Lead's task order at step 7 / 15,
// the same fields as a manager's TaskCreationDto. No equipmentId: the task is on the intervention's pump
public record InterventionAssignDto(
    @NotBlank(message = "technicianEmail must not be blank")
    @Email(message = "technicianEmail must be valid")
    String technicianEmail,

    @NotBlank(message = "title must not be blank")
    String title,

    @NotNull(message = "taskType must not be null")
    TaskType taskType,

    // optional : NORMAL when missing
    TaskPriority priority,

    // the report the technician fills (e.g. "Rapport d'expertise (démontage)" at step 7); must be an active form
    @NotBlank(message = "templateId must not be blank")
    String templateId,

    // optional
    LocalDate dueDate,

    String instructions
)
{}
