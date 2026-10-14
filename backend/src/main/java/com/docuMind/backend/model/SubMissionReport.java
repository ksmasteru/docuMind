   /*
    5. Flatten it into a record, for example SubmissionReport,
    with a nested ReportRow(position, labelFr, labelAr, critical,
    value, comment). Sort the rows by question position. 
    This keeps the template simple: it only reads plain values, never entities. 
    It's also the same "build the inner records first, 
    then the parent" pattern from your response records. */

    // why do we have to nest inner record like this cannot it jut be defined
    // inside its own file ?
package com.docuMind.backend.model;
import java.util.List;

    public record SubMissionReport(
        String tempalteId,
        String submissionId,
        List<ReportRow> answers
    )
    {
    public record ReportRow(
        int position,
        String labelFr,
        String labelAr,
        boolean critical,
        String value,
        String comment
    )
    {}
}