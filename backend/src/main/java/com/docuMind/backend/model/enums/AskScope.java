package com.docuMind.backend.model.enums;

// What a chat question was answered from, by what is known of the pump (plan_pump_manuals.md part C, §3):
//   MANUALS    the pump's model is known and has documents ticked for it: its spec sheet, those documents and the
//              general documentation
//   NO_MANUAL  the model is known but nothing but (maybe) its spec sheet is ticked for it: its spec sheet, then the
//              whole library; the technician is told
//   NO_MODEL   no model from the screen nor the equipment: the whole library; the technician is told
public enum AskScope {
    MANUALS,
    NO_MANUAL,
    NO_MODEL
}
