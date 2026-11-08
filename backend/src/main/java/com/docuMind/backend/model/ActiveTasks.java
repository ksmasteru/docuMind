package com.docuMind.backend.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.docuMind.backend.model.enums.TaskPriority;
import com.docuMind.backend.model.enums.TaskStatus;

// response for a task list: the technician's (/mine) or the manager's (/assigned)
public record ActiveTasks(
    List<Task> tasks,
    int tasksCount)
{
    // one line of the list : what the card shows, instructions included for the expanded view
    public record Task(
        String id,
        String title,
        String location,      // null until the Equipment entity exists
        String equipmentId,
        LocalDate dueDate,
        TaskPriority priority,
        TaskStatus status,
        String instructions,
        String templateId,    // the form to open for this task, null if none
        String technicianEmail, // who the task is assigned to, for the manager's list
        long workedSeconds,     // time worked in the closed periods
        Instant activeSince,    // start of the period running now, null when not working: the task page's timer
        String statusComment    // why it's BLOCKED, or what to redo once RETURNED
    ){
        public static Task from(TaskModel task) {
            return new Task(task.getId(), task.getTitle(), null, task.getEquipmentId(),
                    task.getDueDate(), task.getPriority(), task.getStatus(), task.getInstructions(),
                    task.getTemplateId(), task.getTechnicianEmail(), task.getWorkedSeconds(), task.getActiveSince(), task.getStatusComment());
        }
    }

    public static ActiveTasks from(List<TaskModel> tasks) {
        List<Task> lines = tasks.stream().map(Task::from).toList();
        return new ActiveTasks(lines, lines.size());
    }
}
