package com.docuMind.backend.model.enums;

// the conclusion of a check report
public enum CheckVerdict {
    CONFIRMED,
    FALSE_ALARM,    // with its cause
    INCONCLUSIVE    // with its reason and a comment
}
