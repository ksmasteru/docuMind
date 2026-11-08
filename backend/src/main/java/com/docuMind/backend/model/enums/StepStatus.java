package com.docuMind.backend.model.enums;

// the status of the intervention's current step: the status table of the PDF (fix_workshop.md)
public enum StepStatus {
    A_TRAITER,  // waiting in the role's queue, nobody took it
    EN_COURS,   // taken by someone of the role ("Prendre en charge")
    EN_ATTENTE, // later: waiting for a document, an approval, a part or a decision
    BLOQUE,     // later: safety or compliance condition not met (quarantine), steps with canBlock only
    A_CORRIGER, // later: sent back by a later step ("Renvoyer"), with a comment
    VALIDE      // done; only in the history: the intervention has moved to the next step
}
