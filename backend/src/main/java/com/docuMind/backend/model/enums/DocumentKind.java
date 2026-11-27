package com.docuMind.backend.model.enums;

// What a document is to a pump model (PumpModelDocument, plan_pump_manuals.md §6–7):
//   SPEC        its spec sheet (« Fiche technique OTW »): at most one per model, installed by the app from
//               resources/specs/, then kept up to date by the admin on « Fiches techniques »
//   OWN         a PHOVA document about this model (a PHOVA manual, a procedure for it)
//   COMPARABLE  the manual of a similar pump used as reference (AHLSTAR for the OTW): its figures are not this
//               model's, and the chat says so
public enum DocumentKind {
    SPEC,
    OWN,
    COMPARABLE
}
