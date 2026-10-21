package com.docuMind.backend.model.enums;

// why a task is in its current status; the service checks the reason fits the status
public enum StatusReason {
    // DECLINED : by technician, before starting
    ON_LEAVE,
    WRONG_TASK,
    NO_ISSUE_FOUND,

    // BLOCKED : by technician, after starting
    MISSING_PART,
    NO_ACCESS,
    SAFETY_ISSUE,

    // RETURNED : by manager, report needs corrections
    MISSING_INFO,
    WRONG_MEASUREMENT,

    // REJECTED : by manager, task closed
    INCOMPLETE_WORK,

    // CANCELED : by manager, task closed
    WRONG_ASSIGNMENT,
    DUPLICATE,

    // any status : a comment is then required
    OTHER
}
