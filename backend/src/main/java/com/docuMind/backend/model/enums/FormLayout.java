package com.docuMind.backend.model.enums;

// How a form is filled and printed, set when it's created (CheckListTemplate.layout).
// Null for the forms made before it existed: they're still told apart by their title
// (StructuredAnswers.isV2, ExpertiseReport.isFor).
public enum FormLayout {
    // PHOVA's quality control sheets and certificates (EN-CPE-QU-01, EN-PFD-MIC-01/03/04):
    // filled in the section wizard with the v2 answer types, printed with the paper sheet's
    // reference, edition and date (templates/control-sheet.html)
    CONTROL_SHEET
}
