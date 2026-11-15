package com.docuMind.backend.model.enums;

// where the manager is with an alert case; only he moves it (a technician can't close it)
public enum AlertStatus {
    NEW,
    ACKNOWLEDGED,
    IN_PROGRESS,
    RESOLVED
}
