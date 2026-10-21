package com.docuMind.backend.model;

import java.util.List;

/*
Everything templates/submission-report.html reads, flattened from a saved
CheckListSubmission: plain, already-formatted values, never entities, so the
template has no logic beyond showing them. Built by SubmissionService.getReport.

ReportRow could live in its own file; nesting it says it only exists as part
of a report (SubmissionReport.ReportRow), the same way the response records nest
their items.
*/
public record SubmissionReport(
    String title,
    String type,             // "Inspection" | "Permis de travail"
    int version,
    String instructions,
    String submissionId,
    String equipment,
    String inspectionDate,   // "06/10/2026"
    String inspector,        // the user's name, or their email when it has none
    String submittedAt,      // "06/10/2026 14:32", site time
    String status,           // "CONFORME" | "NON_CONFORME"
    String remarks,
    List<ReportRow> answers  // sorted by position
)
{
    public record ReportRow(
        int position,
        String labelFr,
        String labelAr,
        boolean critical,
        String value,        // "bon" / "mauvais" (stored lowercase), or a text answer
        String comment
    )
    {}
}
