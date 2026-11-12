package com.docuMind.backend.model;

/*
One line of GET /api/v1/submissions/shared: a report the caller's role may read because its form
says so (CheckListTemplate.readRoles), e.g. the control sheets for Quality, Sales and the workshop leads,
and the caller's own quality forms.
{ "id": "…", "title": "Fiche de contrôle usinage", "paperReference": "EN-PFD-MIC-01",
  "equipment": "PHB2-0412", "inspectionDate": "06/10/2026", "inspector": "Sara Alami",
  "submittedAt": "06/10/2026 14:32", "status": "NON_CONFORME" }
*/
public record SharedReport(
    String id,
    String title,
    String paperReference,  // null when the form has none
    String equipment,       // what the sheet is about: a serial number, a batch
    String inspectionDate,  // "06/10/2026"
    String inspector,       // the user's name, or their email when it has none
    String submittedAt,     // "06/10/2026 14:32", site time
    String status,          // "CONFORME" | "NON_CONFORME"
    boolean graded          // the form has a critical question: without one (a complaint) the status means nothing
) {}
