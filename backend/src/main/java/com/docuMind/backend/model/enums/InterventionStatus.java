package com.docuMind.backend.model.enums;

// the whole intervention; where it stands inside the loop is its current step and StepStatus
public enum InterventionStatus {
    EN_COURS,   // somewhere between step 1 and step 20
    TERMINEE,   // FACTURATION validated
    ANNULEE     // a final no on a step with canCancel (request refused, quote refused, back to the client)
}
