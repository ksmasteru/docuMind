package com.docuMind.backend.model;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.docuMind.backend.model.SubmissionReport.ReportRow;

/*
The "Rapport d'expertise complet" laid out like PHOVA's paper expertise report (Rapport_ass.pdf),
for templates/expertise-report.html. Built from a SubmissionReport by of().

The template's questions are labelled "Section : Champ" ("Roue : Commentaires"), and this class
knows the paper report's sections by those names. The web form writes the same labels
(my-react-app/src/expertiseComplet.js) and so does the JSON that creates the template;
the three must agree. A question this class doesn't place lands in others, at the end of the
PDF, so a label changed on the server never drops an answer.

A Commentaires / Recommandations answer: its value is what the technician dictated, its comment
the paper report's tick boxes, one per line, "☒ Bon état" / "☐ Corrosion" (the web form fills
them in from the dictation and lets the technician correct them).
A measurement the technician marked out of tolerance has the comment "Hors tolérance": its cell
is red, as on the paper report.
*/
public record ExpertiseReport(
    String submissionId,
    String submittedAt,
    String inspector,
    String remarks,
    List<Field> infos,              // Informations générales, in the paper report's order
    Part reception,                 // Pompe à la réception
    List<List<Part>> inspection,    // the pump's parts, two side by side like the paper report
    List<Measure> geometric,        // Contrôles géométriques
    List<String> dimensionKeys,     // Contrôles dimensionnels arbre/palier: J, X, J5…C5
    List<Value> dimensionDismantled,
    List<Value> dimensionMounted,
    List<Field> sealInfo,           // Garniture mécanique: fabricant, type, n° de plan
    List<String> sealPhotos,
    List<List<Part>> sealParts,     // faces, chemise, couvercle: two side by side
    List<PartLine> parts,           // the parts table
    Part changedParts,              // Pièces changées: photos and their description
    Part extra,                     // Commentaires supplémentaires
    List<String> assembledPhotos,   // Pompe assemblée
    String salesOrder,
    String mountDate,
    List<Check> mountChecks,        // Liste de contrôle « Montage pompe »
    List<Field> others              // answers no section above takes
)
{
    public record Field(String label, String value) {}

    public record Choice(String label, boolean checked) {}

    // one inspected part: its photos, its ticked comments and recommendations, and what was dictated
    public record Part(String name, List<String> photos,
                       List<Choice> comments, String commentText,
                       List<Choice> recommendations, String recommendationText) {}

    // a measured value; out: marked out of tolerance by the technician
    public record Value(String value, boolean out) {}

    public record Measure(String label, Value dismantled, Value mounted) {}

    public record PartLine(String quantity, String description, String code,
                           String recommendation, String decision, String remark) {}

    // status: "bon", "mauvais", or null when not answered
    public record Check(int number, String label, String status, String remark) {}

    public static final String TITLE = "Rapport d'expertise complet";

    // "Roue : Commentaires"
    private static final String SEP = " : ";

    private static final String INFO = "Informations générales";
    // the paper report's rows; null = the sheet's own field (emplacement / date du contrôle)
    private static final List<String> INFO_FIELDS = List.of(
        "Client", "Adresse client", "Entité", "N° de commande client", "N° d'opération",
        "Matricule équipement", "Type", "Fabricant", "Fluide pompé", "Raison de la demande d'expertise",
        "Repère géographique", "Date de réception", "Date d'expertise",
        "Auteur rapport démontage", "Date de montage", "Auteur rapport montage");
    private static final String EQUIPMENT_ROW = "Repère géographique";
    private static final String DATE_ROW = "Date d'expertise";

    private static final String RECEPTION = "Pompe à la réception";
    private static final List<String> INSPECTION_PARTS = List.of(
        "Corps de la pompe", "Roue", "Fond", "Palier", "Roulements", "Arbre",
        "Flasques côté PPE", "Flasques côté CDE", "Déflecteur");

    private static final String GEOMETRIC = "Contrôles géométriques";
    private static final List<String> GEOMETRIC_MEASURES = List.of(
        "Concentricité de l'arbre", "Déplacement axial", "Déplacement radial",
        "Perpendicularité", "Concentricité de la boîte à garniture");

    private static final String DIMENSIONAL = "Contrôles dimensionnels arbre/palier";
    private static final List<String> DIMENSION_KEYS = List.of(
        "J", "X", "J5", "J6", "J7", "J8", "C1", "C2", "C3", "C4", "C5");

    private static final String SEAL = "Garniture mécanique";
    private static final List<String> SEAL_FIELDS = List.of("Fabricant", "Type", "N° de plan");
    private static final List<String> SEAL_PARTS = List.of(
        "Face rotative côté process", "Face stationnaire côté process", "Chemise", "Couvercle et boîte à GM");

    private static final String PARTS = "Pièces";
    private static final String CHANGED = "Pièces changées";
    private static final String EXTRA = "Commentaires supplémentaires";
    private static final String ASSEMBLED = "Pompe assemblée";
    private static final String MOUNT = "Montage pompe";
    private static final String SALES_ORDER = "Sales order (OT)";

    private static final String PHOTOS = "Photos";
    // the comment of a measurement marked out of tolerance, compared lower case
    private static final String OUT_OF_TOLERANCE = "hors tolérance";
    private static final String COMMENTS = "Commentaires";
    private static final String RECOMMENDATIONS = "Recommandations";

    // "☒ Bon état" / "☐ Corrosion"
    private static final Pattern CHOICE = Pattern.compile("^\\s*([☒☐])\\s*(.+?)\\s*$");
    // "3. Contrôle du serrage…" → "Contrôle du serrage…"
    private static final Pattern NUMBERED = Pattern.compile("^\\d+\\s*[.)]\\s*");

    public static boolean isFor(String title)
    {
        return title != null && title.trim().equalsIgnoreCase(TITLE);
    }

    public static ExpertiseReport of(SubmissionReport report)
    {
        Rows rows = new Rows(report.answers());

        List<Field> infos = new ArrayList<>();
        for (String field : INFO_FIELDS) {
            String value = switch (field) {
                case EQUIPMENT_ROW -> report.equipment();
                case DATE_ROW -> report.inspectionDate();
                default -> rows.text(INFO, field);
            };
            infos.add(new Field(field, value));
        }

        List<Measure> geometric = GEOMETRIC_MEASURES.stream()
            .map(m -> new Measure(m, rows.value(GEOMETRIC, m + " au démontage"), rows.value(GEOMETRIC, m + " au remontage")))
            .toList();

        List<Value> dismantled = DIMENSION_KEYS.stream().map(k -> rows.value(DIMENSIONAL, k + " au démontage")).toList();
        List<Value> mounted = DIMENSION_KEYS.stream().map(k -> rows.value(DIMENSIONAL, k + " au montage")).toList();

        List<Field> sealInfo = SEAL_FIELDS.stream().map(f -> new Field(f, rows.text(SEAL, f))).toList();
        List<String> sealPhotos = rows.photos(SEAL);

        Part reception = rows.part(RECEPTION);
        List<List<Part>> inspection = pairs(INSPECTION_PARTS.stream().map(rows::part).toList());
        List<List<Part>> sealParts = pairs(SEAL_PARTS.stream().map(rows::part).toList());

        List<PartLine> parts = partLines(rows.text(PARTS, "Liste des pièces"));
        Part changedParts = rows.part(CHANGED);
        Part extra = rows.part(EXTRA);
        List<String> assembledPhotos = rows.photos(ASSEMBLED);

        String salesOrder = rows.text(MOUNT, SALES_ORDER);
        List<Check> mountChecks = new ArrayList<>();
        for (ReportRow row : rows.inSection(MOUNT)) {
            String field = Rows.field(row.labelFr());
            if (field.equals(SALES_ORDER))
                continue;
            rows.use(row);
            String status = row.value() == null ? null : row.value().trim().toLowerCase();
            mountChecks.add(new Check(mountChecks.size() + 1, NUMBERED.matcher(field).replaceFirst(""),
                status, clean(row.comment())));
        }

        return new ExpertiseReport(
            report.submissionId(), report.submittedAt(), report.inspector(), clean(report.remarks()),
            infos, reception, inspection, geometric,
            DIMENSION_KEYS, dismantled, mounted,
            sealInfo, sealPhotos, sealParts,
            parts, changedParts, extra, assembledPhotos,
            salesOrder, rows.text(INFO, "Date de montage"), mountChecks,
            rows.leftovers());
    }

    // two parts per row of the PDF; an odd one out is alone on its row
    private static List<List<Part>> pairs(List<Part> parts)
    {
        List<List<Part>> pairs = new ArrayList<>();
        for (int i = 0; i < parts.size(); i += 2)
            pairs.add(parts.subList(i, Math.min(i + 2, parts.size())));
        return pairs;
    }

    // One part per line. "2 ; 6313 ; ; Changer ; Changer par OCP ; …" fills the columns in order
    // (quantité, description, code, recommandation, décision client, remarque); a line without
    // ";" (dictated) goes whole into the description.
    private static List<PartLine> partLines(String text)
    {
        List<PartLine> lines = new ArrayList<>();
        if (text == null)
            return lines;
        for (String line : text.split("\\R")) {
            if (line.isBlank())
                continue;
            if (!line.contains(";")) {
                lines.add(new PartLine("", line.strip(), "", "", "", ""));
                continue;
            }
            String[] c = line.split(";", -1);
            lines.add(new PartLine(col(c, 0), col(c, 1), col(c, 2), col(c, 3), col(c, 4), col(c, 5)));
        }
        return lines;
    }

    private static String col(String[] cells, int i)
    {
        return i < cells.length ? cells[i].strip() : "";
    }

    private static String clean(String text)
    {
        return text == null || text.isBlank() ? null : text.strip();
    }

    // the report's answers by label, remembering which ones a section took
    private static final class Rows {
        private final List<ReportRow> all;
        private final Map<String, ReportRow> byLabel = new HashMap<>();
        private final Set<ReportRow> used = new HashSet<>();

        Rows(List<ReportRow> rows)
        {
            this.all = rows;
            for (ReportRow row : rows)
                byLabel.put(row.labelFr().strip(), row);
        }

        static String section(String label)
        {
            int at = label.indexOf(SEP);
            return at < 0 ? "" : label.substring(0, at).strip();
        }

        static String field(String label)
        {
            int at = label.indexOf(SEP);
            return at < 0 ? label.strip() : label.substring(at + SEP.length()).strip();
        }

        ReportRow row(String section, String field)
        {
            ReportRow row = byLabel.get(section + SEP + field);
            if (row != null)
                used.add(row);
            return row;
        }

        void use(ReportRow row)
        {
            used.add(row);
        }

        String text(String section, String field)
        {
            ReportRow row = row(section, field);
            return row == null || row.value() == null ? "" : row.value().strip();
        }

        // a measurement and whether the technician marked it out of tolerance
        Value value(String section, String field)
        {
            ReportRow row = row(section, field);
            if (row == null)
                return new Value("", false);
            boolean out = row.comment() != null && row.comment().strip().toLowerCase().startsWith(OUT_OF_TOLERANCE);
            return new Value(row.value() == null ? "" : row.value().strip(), out);
        }

        List<String> photos(String section)
        {
            ReportRow row = row(section, PHOTOS);
            return row == null || row.photos() == null ? List.of() : row.photos();
        }

        List<ReportRow> inSection(String section)
        {
            return all.stream().filter(r -> section(r.labelFr()).equals(section)).toList();
        }

        Part part(String section)
        {
            ReportRow comments = row(section, COMMENTS);
            ReportRow recommendations = row(section, RECOMMENDATIONS);
            return new Part(section, photos(section),
                choices(comments), dictated(comments),
                choices(recommendations), dictated(recommendations));
        }

        // what no section took, as label / answer, in sheet order
        List<Field> leftovers()
        {
            List<Field> rest = new ArrayList<>();
            for (ReportRow row : all) {
                if (used.contains(row))
                    continue;
                String value = row.value() == null ? "" : row.value().strip();
                if (row.photos() != null && !row.photos().isEmpty())
                    value = row.photos().size() + " photo(s)";
                rest.add(new Field(row.labelFr(), value));
            }
            return rest;
        }

        private static String dictated(ReportRow row)
        {
            return row == null ? null : clean(row.value());
        }

        private static List<Choice> choices(ReportRow row)
        {
            List<Choice> choices = new ArrayList<>();
            if (row == null || row.comment() == null)
                return choices;
            for (String line : row.comment().split("\\R")) {
                Matcher m = CHOICE.matcher(line);
                if (m.matches())
                    choices.add(new Choice(m.group(2), m.group(1).equals("☒")));
            }
            return choices;
        }
    }
}
