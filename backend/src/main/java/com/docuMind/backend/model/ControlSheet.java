package com.docuMind.backend.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

/*
What templates/control-sheet.html reads: a quality control sheet (FormLayout.CONTROL_SHEET) laid out
like PHOVA's paper sheet. The questions' labels say where they go, "Rubrique : Champ" (as in the
wizard), so each rubrique becomes a block of the sheet, in the form's order:
  - short answers as label / value lines, side by side
  - long ones (comments, observations) as a paragraph
  - a TABLE as a table, its result column green or red
  - photos as a grid with their titles
Built from the SubmissionReport, so the PDF and the review screen read the same values.
*/
public record ControlSheet(
    String title,
    String reference,       // "EN-PFD-MIC-01"; null when the form has none
    String edition,         // "2.0"
    String date,            // "29/03/2024": the paper sheet's own date, not the report's
    String instructions,    // printed under the header (the certificate's statement)
    String submissionId,
    String inspector,
    String inspectionDate,
    String submittedAt,
    String status,          // "CONFORME" | "NON_CONFORME"
    boolean graded,         // false: no critical question (a complaint, a certificate), no result printed
    String remarks,
    List<Section> sections
)
{
    public record Section(String name, List<Field> fields) {}

    // kind: "text" (short, label / value), "long" (a paragraph), "table", "photos"
    public record Field(String label, String kind, String value, List<String> columns, List<List<Cell>> rows,
                        List<String> photos, List<SubmissionReport.Caption> captions) {}

    // tone: "ok" / "bad" for a result cell (« Conforme » / « Non conforme »), null otherwise
    public record Cell(String text, String tone) {}

    public static ControlSheet of(SubmissionReport report)
    {
        Map<String, List<Field>> sections = new LinkedHashMap<>();
        for (SubmissionReport.ReportRow row : report.answers())
        {
            String label = row.labelFr();
            int at = label.indexOf(" : ");
            String section = at < 0 ? "Informations" : label.substring(0, at).strip();
            String field = at < 0 ? label : label.substring(at + 3).strip();
            sections.computeIfAbsent(section, s -> new ArrayList<>()).add(field(field, row));
        }
        List<Section> list = new ArrayList<>();
        sections.forEach((name, fields) -> list.add(new Section(name, fields)));
        SubmissionReport.Paper paper = report.paper();
        return new ControlSheet(report.title(),
                paper == null ? null : paper.reference(),
                paper == null ? null : paper.edition(),
                paper == null ? null : paper.date(),
                report.instructions(), report.submissionId(), report.inspector(), report.inspectionDate(),
                report.submittedAt(), report.status(), paper != null && paper.graded(), report.remarks(), list);
    }

    private static Field field(String label, SubmissionReport.ReportRow row)
    {
        if ("TABLE".equals(row.answerType()) && row.data() != null)
        {
            List<String> columns = new ArrayList<>();
            List<Boolean> results = new ArrayList<>();
            for (JsonNode column : row.data().path("columns"))
            {
                columns.add(column.path("label").asText());
                results.add("result".equals(column.path("type").asText()));
            }
            List<List<Cell>> rows = new ArrayList<>();
            for (JsonNode line : row.data().path("rows"))
            {
                List<Cell> cells = new ArrayList<>();
                for (int i = 0; i < columns.size(); i++)
                {
                    JsonNode cell = line.get(i);
                    String text = cell == null || cell.isNull() ? null : cell.asText();
                    String tone = !results.get(i) || text == null ? null
                            : text.equals("Conforme") ? "ok" : "bad";
                    cells.add(new Cell(text, tone));
                }
                rows.add(cells);
            }
            return new Field(label, "table", null, columns, rows, List.of(), List.of());
        }
        if ("IMAGE".equals(row.answerType()))
            return new Field(label, "photos", row.value(), List.of(), List.of(), row.photos(), row.captions());
        String value = row.value();
        boolean long_ = value != null && (value.length() > 60 || value.contains("\n"))
                || label.toLowerCase().matches(".*(comment|observation|remarque|description|recommandation|traitement|demande).*");
        return new Field(label, long_ ? "long" : "text", value, List.of(), List.of(), List.of(), List.of());
    }
}
