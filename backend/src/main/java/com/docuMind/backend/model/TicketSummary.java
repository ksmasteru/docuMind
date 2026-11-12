package com.docuMind.backend.model;

import java.time.Instant;

/*
One line of « Fiches en cours » (GET /api/v1/drafts/tickets): a control sheet opened outside a task and
saved to finish later, like a ticket. Resumed by its id (GET /api/v1/drafts/{id}).
{ "id": "…", "templateId": "…", "title": "Fiche de réclamation client", "paperReference": "EN-PNC-QU-02",
  "label": "Pompe OTW-12 · 08/11/2026", "updatedAt": "2026-11-10T09:12:44Z" }
*/
public record TicketSummary(
    String id,
    String templateId,
    String title,
    String paperReference,  // null when the form has none
    String label,           // what it's about, written by the app; null until the form has it
    Instant updatedAt
) {}
