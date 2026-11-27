package com.docuMind.backend.model.enums;

// Who made a document ↔ model link (PumpModelDocument):
//   INSTALLED  the app, from a sheet bundled in resources/specs/ (SpecSheetService): a newer bundled sheet
//              replaces it at the next start
//   ADMIN      a person (an upload, a tick on « Documents », an edit on « Fiches techniques »): never replaced
//              by the app
public enum LinkOrigin {
    INSTALLED,
    ADMIN
}
