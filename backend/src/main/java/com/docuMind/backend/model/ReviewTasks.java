package com.docuMind.backend.model;

import java.util.List;

// response for the manager's review queue, same envelope as ActiveTasks
public record ReviewTasks(
    List<ReviewTask> tasks,
    int tasksCount)
{
    public static ReviewTasks from(List<ReviewTask> tasks) {
        return new ReviewTasks(tasks, tasks.size());
    }
}
