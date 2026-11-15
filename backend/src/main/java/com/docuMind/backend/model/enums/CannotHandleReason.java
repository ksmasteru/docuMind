package com.docuMind.backend.model.enums;

// why the technician who confirmed the alert can't fix it himself
public enum CannotHandleReason {
    SKILLS,         // needs an electrician, a specialist
    TOOLS_LIFTING,  // tools or lifting gear he does not have
    PARTS,          // parts to order first
    WORKSHOP,       // the pump has to go to the workshop
    OTHER           // needs a comment
}
