package com.docuMind.backend.model.enums;

// what a notification is about, for its icon in the bell. All declared now, like UserRole: Hibernate
// writes the column's check constraint once, when the table is created
public enum NotificationKind {
    TASK,       // a task sent, declined, put on hold, cancelled, given to someone else
    REVIEW,     // a report to review, validated, sent back, rejected
    WORKSHOP,   // an intervention waiting at a step of the caller's role, finished, cancelled
    STOCK,      // a spare part at or under its minimum
    INFO        // anything else
}
