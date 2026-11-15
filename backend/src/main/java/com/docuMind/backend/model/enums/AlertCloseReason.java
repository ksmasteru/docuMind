package com.docuMind.backend.model.enums;

// why an alert was closed (AlertService.close)
public enum AlertCloseReason {
    FALSE_ALARM,            // the check found nothing, the manager agreed
    FIXED,                  // the work order or the workshop fixed it
    REPAIRED_BY_THIRD_PARTY,
    PLANNED_SHUTDOWN,       // to be done at the next planned stop
    RISK_ACCEPTED,
    OTHER                   // needs a comment
}
