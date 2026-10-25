package com.docuMind.backend.model;

import java.time.LocalDate;

import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskType;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

// body sent by a manager to create a task
// no managerEmail here : the controller takes it from the logged-in user's token
public record TaskCreationDto(
    @NotBlank(message = "title must not be blank")
    String title,

    @NotNull(message = "taskType must not be null")
    TaskType taskType,

    // users are identified by their email
    @NotBlank(message = "technicianEmail must not be blank")
    @Email(message = "technicianEmail must be valid")
    String technicianEmail,

    @NotBlank(message = "equipmentId must not be blank")
    String equipmentId,

    String instructions,

    // optional : not every task has a deadline
    LocalDate dueDate,

    // optional : the service uses NORMAL when it's missing
    TaskPriority priority,

    // optional : the checklist the technician fills for this task; must be an active form
    String templateId
)
{}
