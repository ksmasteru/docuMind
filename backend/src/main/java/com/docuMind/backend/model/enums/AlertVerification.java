package com.docuMind.backend.model.enums;

// where the check before acting (levée de doute) stands on an alert (AlertCase.getVerification)
public enum AlertVerification {
    TO_CHECK,       // nobody has checked the pump yet
    CHECK_ORDERED,  // a check task is open: sent by the manager, or started by a technician
    CONFIRMED,      // the check found the fault: a mission for the manager
    FALSE_ALARM,    // the check found nothing: the manager reads the report and closes
    INCONCLUSIVE    // the check could not conclude: the manager sends another
}
