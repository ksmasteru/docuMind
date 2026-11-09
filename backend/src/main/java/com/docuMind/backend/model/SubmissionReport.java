package com.docuMind.backend.model;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;

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
    List<ReportRow> answers, // sorted by position
    List<ExtraPart> extraParts // v2 expertise reports: the parts the technician added; empty otherwise
)
{
    // a report without added parts (every form but the v2 expertise reports)
    public SubmissionReport(String title, String type, int version, String instructions, String submissionId,
                            String equipment, String inspectionDate, String inspector, String submittedAt,
                            String status, String remarks, List<ReportRow> answers)
    {
        this(title, type, version, instructions, submissionId, equipment, inspectionDate, inspector,
             submittedAt, status, remarks, answers, List.of());
    }

    public record ReportRow(
        int position,
        String labelFr,
        String labelAr,
        boolean critical,
        String value,        // "bon" / "mauvais" (stored lowercase), a text answer, null for a photo; for the
                             // v2 types (choices, readings, parts summary) a readable text, as the PDF shows it
        String comment,
        String photo,        // IMAGE answers: the first photo as a data URI; null otherwise or when unreadable
        List<String> photos, // IMAGE answers: every photo, as data URIs
        String answerType,   // AnswerType's name
        JsonNode data,       // the v2 types' structure for the review page (selected choices, readings and
                             // their average, the summary rows); null for the others
        List<Caption> captions, // each photo's title and comment, in the order of photos (v2); empty otherwise
        String group            // v2: the question's group on its page (options.group: "Identification pompe"), else null
    )
    {
        // a row with at most one photo (the checklists)
        public ReportRow(int position, String labelFr, String labelAr, boolean critical,
                         String value, String comment, String photo)
        {
            this(position, labelFr, labelAr, critical, value, comment, photo,
                 photo == null ? List.of() : List.of(photo));
        }

        // a row of the original forms: no structure, no captions
        public ReportRow(int position, String labelFr, String labelAr, boolean critical,
                         String value, String comment, String photo, List<String> photos)
        {
            this(position, labelFr, labelAr, critical, value, comment, photo, photos, null, null, List.of(), null);
        }
    }

    // a photo's title and comment; either may be null
    public record Caption(String title, String comment) {}

    // a part the technician added to a v2 report, readable
    public record ExtraPart(
        String name,
        String findings,        // "Corrosion, Autre : …", null when none
        String comment,
        String recommendation,
        List<String> photos,    // data URIs
        List<Caption> captions  // in the order of photos
    ) {}
}
