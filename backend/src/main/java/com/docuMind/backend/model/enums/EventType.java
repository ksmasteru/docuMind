package com.docuMind.backend.model.enums;

// what happened to a task
public enum EventType {
    STATUS_CHANGED, // fromStatus -> toStatus (task creation : null -> ASSIGNED)
    REASSIGNED,     // the manager gave the task to another technician
    COMMENTED       // a comment without any status change
}
