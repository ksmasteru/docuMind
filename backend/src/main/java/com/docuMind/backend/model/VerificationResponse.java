package com.docuMind.backend.model;

/*
What the public verification page shows for a scanned report (GET /api/public/verify/{code}):
{
  "result": "AUTHENTIC",
  "current": true,
  "review": "APPROVED",
  "code": "7K3F-9QXM-2B4C-8DHN",
  "title": "Rapport d'expertise complet",
  "version": 2,
  "equipment": "MP1",
  "inspectionDate": "06/10/2026",
  "inspector": "Youssef Guettahi",
  "submittedAt": "06/10/2026 14:32",
  "status": "NON_CONFORME",
  "replacedAt": null
}
Only what the paper already shows: no answers, photos, emails or internal ids. Anyone with the
code can read it, without logging in.
*/
public record VerificationResponse(
    Result result,
    // false when the manager sent the report back and a newer version replaced it
    boolean current,
    // the task's status, when the report answers one: SUBMITTED, APPROVED, RETURNED, REJECTED,
    // CANCELED…; null for a standalone checklist
    String review,
    String code,
    String title,
    int version,
    String equipment,
    String inspectionDate,  // "06/10/2026"
    String inspector,       // the user's name, "—" when they have none (never their email)
    String submittedAt,     // "06/10/2026 14:32", site time
    String status,          // "CONFORME" | "NON_CONFORME"
    String replacedAt       // when the newer version was sent, if current is false
)
{
    public enum Result {
        AUTHENTIC, // the saved report is unchanged since it was sent
        ALTERED    // its content no longer matches the fingerprint taken when it was sent
    }
}
