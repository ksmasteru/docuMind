package com.docuMind.backend.model;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import com.docuMind.backend.model.SubmissionReport.ReportRow;
import com.docuMind.backend.services.StructuredAnswers;
import com.fasterxml.jackson.databind.JsonNode;

/*
A v2 expertise report ("Rapport d'expertise V2 …", report_ui.md) as its PDF shows it (templates/expertise/…,
report_pdf.md), built from a SubmissionReport by of():

  page 1   the verdict (what the reader must know first), key figures, the parts' states, the pump's
           identification, the photo of the pump
  then     one section per rubrique of the form, in its order and numbering: a card per part (photos on the
           left; findings, recommendation, comment on the right; its state as a coloured label), the
           geometric checks as one table, the dimensional checks as measurement sheets, the montage checklist
  last     remarks and traceability (who wrote it, who checked it, the intervention, the version)

Labels give the structure, as in the web form: "Rubrique : Champ" or "Rubrique > Sous-page : Champ". A page
left blank isn't drawn: it's listed in one line under its section ("Non renseignés : Palier, Arbre").
The parts the technician added are cards of "Inspection des pièces".

A part's state comes from its recommendation (Remplacement → à remplacer, réparation / rodage / polissage →
à réparer, nettoyage / réutilisation → réutilisable); without one, from its findings (Bon état, or anomalies).
*/
public record ExpertiseReportV2(
    String kind,              // DEMONTAGE | MONTAGE | COMPLET
    String kindLabel,         // "Démontage et expertise"
    String title,             // the form's title
    String submissionId,
    String submittedAt,
    String inspector,
    String equipment,
    String inspectionDate,
    String status,            // "CONFORME" | "NON_CONFORME"
    String remarks,
    List<FieldGroup> identity,  // Informations générales: the answered fields, by group
    Summary summary,
    List<Section> sections,
    Trace trace)
{
    // ------------------------------------------------------------------ what the template reads

    public record FieldGroup(String name, List<Field> fields) {}

    public record Field(String label, String value) {}

    public record Photo(String src, String title, String comment, String number) {}

    // tone: replace | repair | reuse | warn | info | none — the colour of a state, a tile, a verdict
    public record Tile(String value, String label, String tone) {}

    public record PartState(String anchor, String name, String rubrique, String state, String tone,
                            String findings, String recommendation) {}

    // coverPhotos: the cover's two photos (the pump at reception, or assembled; else a part's), with their label
    public record Summary(String verdict, String verdictDetail, String tone, List<Tile> tiles,
                          List<PartState> parts, List<String> notInspected, List<String> receptionAnomalies,
                          List<Check> openChecks, Photo hero, String heroLabel, int checks, int checksOk,
                          List<CoverPhoto> coverPhotos, List<OutMeasure> outOfTolerance) {}

    // a measure the technician marked « hors tolérance »: where it is, its average, the page of its table
    public record OutMeasure(String place, String mark, String average, String unit, String anchor) {}

    public record CoverPhoto(Photo photo, String label) {}

    // phase: "au démontage" when every page of the section had it (it's then left out of their names)
    // intro: one line under the chapter's title ("8 pièces expertisées : 2 à remplacer, 6 réutilisables")
    public record Section(String number, String name, String anchor, String phase, List<Card> cards,
                          List<GeometryRow> geometry, int geometryColumns, String geometryUnit,
                          List<String> blankPages, String intro) {}

    // a page of the form: a part, a check, a group of measures. state / tone null when it has none
    public record Card(String anchor, String name, String state, String tone, List<Photo> photos,
                       List<Block> blocks, boolean added) {}

    // kind: fields | text | choices | decision | measures | summary | checklist
    public record Block(String kind, String label, List<Field> fields, String text,
                        List<String> checked, List<String> unchecked, String chosen, String tone,
                        List<MeasureLine> measures, int columns, String unit, List<String> drawings,
                        List<SummaryLine> rows, List<Check> checks) {}

    // a mark of a measurement sheet: "J5", its readings (blank cells up to the sheet's columns), the average
    // out: marked « hors tolérance » by the technician (no limit is stored yet)
    public record MeasureLine(String mark, List<String> readings, String list, String average, boolean empty, boolean out) {}

    // a geometric check: its drawing as a thumbnail, its readings, the average, the technician's comment
    public record GeometryRow(String control, String drawing, List<String> readings, String list, String average,
                              String comment, boolean empty, boolean out) {}

    public record SummaryLine(String quantity, String description, String code, String recommendation, String tone,
                              String decision, String remark) {}

    // bad: a status that makes the report non conforme (« Non conforme », « À reprendre »)
    public record Check(String number, String label, String status, String remark, boolean bad, String tone) {}

    // Where the report sits in the workshop loop, when it answers an intervention's task; none() otherwise.
    // version / versions: "Version 2 sur 2" once a returned report was corrected and sent again
    // preview: the report isn't sent yet (« Aperçu du PDF »): said on the cover and in the header
    public record Trace(String interventionNumber, String taskTitle, int version, int versions,
                        String reviewer, String reviewedAt, String reviewStep, String quoteNumber, String generatedAt,
                        boolean preview)
    {
        public static Trace none(String generatedAt) { return new Trace(null, null, 1, 1, null, null, null, null, generatedAt, false); }

        public Trace asPreview() { return new Trace(interventionNumber, taskTitle, version, versions, null, null, reviewStep, quoteNumber, generatedAt, true); }
    }

    // ------------------------------------------------------------------ building it

    static final String IDENTITY = "Informations générales";
    static final String INSPECTION = "Inspection des pièces";
    static final String SEAL = "Garniture mécanique";
    public static final String RECEPTION = "Pompe réceptionnée";
    public static final String ASSEMBLED = "Pompe assemblée";

    // more readings than this, and a sheet lists them in one cell instead of a column each
    static final int MAX_COLUMNS = 5;

    // a comment, an observation: a paragraph, not a row of a table of fields
    private static final Pattern LONG_TEXT = Pattern.compile("(?i).*(comment|observation|remarque).*");
    // "01. Contrôle général de la propreté" → "01", "Contrôle général de la propreté"
    private static final Pattern NUMBERED = Pattern.compile("^(\\d+)\\.\\s*(.*)$");
    private static final Pattern PHASE = Pattern.compile("^(.*?)\\s+(au démontage|au remontage)$");

    public static ExpertiseReportV2 of(SubmissionReport report, Map<String, String> drawings)
    {
        return of(report, drawings, Trace.none(null));
    }

    public static ExpertiseReportV2 of(SubmissionReport report, Map<String, String> drawings, Trace trace)
    {
        String kind = kindOf(report.title());

        // rubrique → page → its rows, in the form's order
        Map<String, Map<String, List<ReportRow>>> layout = new LinkedHashMap<>();
        for (ReportRow row : report.answers())
        {
            String[] place = place(row.labelFr());
            layout.computeIfAbsent(place[0], k -> new LinkedHashMap<>())
                  .computeIfAbsent(place[1], k -> new ArrayList<>())
                  .add(row);
        }

        List<FieldGroup> identity = List.of();
        List<Section> sections = new ArrayList<>();
        int[] photoCount = { 0 };
        int number = 0;
        for (Map.Entry<String, Map<String, List<ReportRow>>> rubrique : layout.entrySet())
        {
            number++;
            String name = rubrique.getKey();
            if (name.equals(IDENTITY))
            {
                identity = identityOf(rubrique.getValue());
                continue;
            }
            sections.add(section(String.format("%02d", number), name, rubrique.getValue(), drawings, photoCount,
                    name.equals(INSPECTION) ? report.extraParts() : List.of()));
        }
        return new ExpertiseReportV2(kind, kindLabel(kind), report.title(), report.submissionId(), report.submittedAt(),
                report.inspector(), report.equipment(), report.inspectionDate(), report.status(), blankToNull(report.remarks()),
                identity, summary(kind, report.status(), sections), sections, trace);
    }

    public static String kindOf(String title)
    {
        String t = title == null ? "" : title.toLowerCase(Locale.ROOT);
        if (t.contains("démontage") || t.contains("demontage")) return "DEMONTAGE";
        if (t.contains("montage")) return "MONTAGE";
        return "COMPLET";
    }

    public static String kindLabel(String kind)
    {
        return switch (kind) {
            case "DEMONTAGE" -> "Démontage et expertise";
            case "MONTAGE" -> "Montage et essais";
            default -> "Expertise complète";
        };
    }

    // "Inspection des pièces > Corps de pompe : Photos" → { rubrique, page ("" if none), field }
    static String[] place(String label)
    {
        int at = label.indexOf(" : ");
        String head = at == -1 ? label : label.substring(0, at);
        String field = at == -1 ? label : label.substring(at + 3);
        int sub = head.indexOf(" > ");
        return new String[] {
            (sub == -1 ? head : head.substring(0, sub)).strip(),
            sub == -1 ? "" : head.substring(sub + 3).strip(),
            field.strip()
        };
    }

    // Informations générales: the answered fields, by their group in the form, in its order
    private static List<FieldGroup> identityOf(Map<String, List<ReportRow>> pages)
    {
        Map<String, List<Field>> groups = new LinkedHashMap<>();
        for (List<ReportRow> rows : pages.values())
            for (ReportRow row : rows)
                if (!blank(row))
                    groups.computeIfAbsent(row.group() == null ? "Informations" : row.group(), k -> new ArrayList<>())
                          .add(new Field(place(row.labelFr())[2], row.value()));
        return groups.entrySet().stream().map(e -> new FieldGroup(e.getKey(), List.copyOf(e.getValue()))).toList();
    }

    // the value of one identification field ("Type", "Client"), null when blank
    public String identityValue(String label)
    {
        for (FieldGroup group : identity)
            for (Field field : group.fields())
                if (field.label().equalsIgnoreCase(label))
                    return field.value();
        return null;
    }

    // ------------------------------------------------------------------ a section

    private static Section section(String number, String name, Map<String, List<ReportRow>> pages,
                                   Map<String, String> drawings, int[] photoCount, List<SubmissionReport.ExtraPart> extraParts)
    {
        String anchor = "s" + number;
        // the phase every page shares ("au démontage"), left out of their names
        String phase = commonPhase(pages.keySet());

        // a rubrique whose pages each hold one measure (the geometric checks): one table, a row per page
        if (isGeometry(pages))
        {
            List<GeometryRow> rows = new ArrayList<>();
            int most = 0;
            String unit = null;
            for (List<ReportRow> page : pages.values())
            {
                ReportRow measure = measureOf(page);
                most = Math.max(most, readingsOf(measure).size());
                if (unit == null && measure.data() != null) unit = measure.data().path("unit").asText(null);
            }
            int columns = most > MAX_COLUMNS ? 0 : Math.max(most, 1);
            for (Map.Entry<String, List<ReportRow>> page : pages.entrySet())
            {
                ReportRow measure = measureOf(page.getValue());
                String comment = page.getValue().stream().filter(r -> !"MEASURE".equals(r.answerType()) && !blank(r))
                        .map(ReportRow::value).reduce((a, b) -> a + " " + b).orElse(null);
                List<String> readings = readingsOf(measure);
                rows.add(new GeometryRow(withoutPhase(page.getKey(), phase), drawingOf(measure, drawings),
                        pad(readings, columns), String.join("  ·  ", readings), averageOf(measure), comment, readings.isEmpty(),
                        outOf(measure)));
            }
            // nothing measured: the section is only named, like a blank one
            if (rows.stream().allMatch(GeometryRow::empty))
                return new Section(number, name, anchor, phase, List.of(), List.of(), 0, unit, List.of(name), null);
            long measured = rows.stream().filter(r -> !r.empty()).count();
            long out = rows.stream().filter(GeometryRow::out).count();
            return new Section(number, name, anchor, phase, List.of(), rows, columns, unit, List.of(),
                    measured + " contrôle" + (measured > 1 ? "s relevés" : " relevé") + (phase != null ? " " + phase : "")
                    + (out > 0 ? ", dont " + out + " hors tolérance" : "")
                    + (unit != null ? " — moyenne des prises, en " + unit : "") + ".");
        }

        List<Card> cards = new ArrayList<>();
        List<String> blankPages = new ArrayList<>();
        int index = 0;
        for (Map.Entry<String, List<ReportRow>> page : pages.entrySet())
        {
            index++;
            String pageName = page.getKey().isEmpty() ? null : withoutPhase(page.getKey(), phase);
            List<ReportRow> rows = page.getValue();
            if (rows.stream().allMatch(ExpertiseReportV2::blank))
            {
                blankPages.add(pageName == null ? name : pageName);
                continue;
            }
            cards.add(card(anchor + "-" + index, pageName, rows, drawings, photoCount));
        }
        for (SubmissionReport.ExtraPart part : extraParts)
            cards.add(extraCard(anchor + "-x" + (++index), part, photoCount));
        return new Section(number, name, anchor, phase, cards, List.of(), 0, null, blankPages, introOf(name, phase, cards));
    }

    // the line under a chapter's title: what the section holds, counted
    private static String introOf(String name, String phase, List<Card> cards)
    {
        if (name.equals(RECEPTION)) return "État de la pompe à son arrivée à l'atelier.";
        if (name.equals(ASSEMBLED)) return "La pompe remontée, prête pour l'essai.";
        List<Check> checks = cards.stream().flatMap(c -> c.blocks().stream()).filter(b -> b.kind().equals("checklist"))
                .flatMap(b -> b.checks().stream()).toList();
        if (!checks.isEmpty())
        {
            long ok = checks.stream().filter(c -> "reuse".equals(c.tone())).count();
            long bad = checks.stream().filter(Check::bad).count();
            long na = checks.size() - ok - bad;
            return checks.size() + " contrôles : " + ok + " conforme" + (ok > 1 ? "s" : "")
                    + (bad > 0 ? ", " + bad + " à reprendre" : "") + (na > 0 ? ", " + na + " non applicable" + (na > 1 ? "s" : "") : "") + ".";
        }
        long parts = cards.stream().filter(c -> c.state() != null).count();
        if (parts > 0)
        {
            long replace = cards.stream().filter(c -> "replace".equals(c.tone())).count();
            long repair = cards.stream().filter(c -> "repair".equals(c.tone())).count();
            long reuse = cards.stream().filter(c -> "reuse".equals(c.tone())).count();
            List<String> counts = new ArrayList<>();
            if (replace > 0) counts.add(replace + " à remplacer");
            if (repair > 0) counts.add(repair + " à réparer");
            if (reuse > 0) counts.add(reuse + " réutilisable" + (reuse > 1 ? "s" : ""));
            return parts + " pièce" + (parts > 1 ? "s expertisées" : " expertisée") + (counts.isEmpty() ? "." : " : " + String.join(", ", counts) + ".");
        }
        boolean measures = cards.stream().flatMap(c -> c.blocks().stream()).anyMatch(b -> b.kind().equals("measures"));
        long out = cards.stream().flatMap(c -> c.blocks().stream()).filter(b -> b.kind().equals("measures"))
                .flatMap(b -> b.measures().stream()).filter(MeasureLine::out).count();
        if (measures) return "Jeux et cotes relevés" + (phase != null ? " " + phase : "") + ", repère par repère, en plusieurs prises"
                + (out > 0 ? " ; " + out + " repère" + (out > 1 ? "s" : "") + " hors tolérance." : ".");
        return null;
    }

    // the cover's identification: who the pump is, where it sits, who wrote and checked the report
    public List<Field> coverFacts()
    {
        List<Field> facts = new ArrayList<>();
        addFact(facts, "Client", identityValue("Client"));
        addFact(facts, "Site / entité", identityValue("Entité"));
        addFact(facts, "Équipement", equipment);
        addFact(facts, "Type de pompe", identityValue("Type"));
        addFact(facts, "Fabricant", identityValue("Fabricant"));
        addFact(facts, "Fluide pompé", identityValue("Fluide pompé"));
        addFact(facts, "N° de commande", identityValue("N° de commande"));
        addFact(facts, "N° d'opération", identityValue("N° d'opération"));
        addFact(facts, kind.equals("MONTAGE") ? "Date du montage" : "Date d'expertise", inspectionDate);
        addFact(facts, "Rédigé par", inspector);
        addFact(facts, "Vérifié par", trace.reviewer() != null ? trace.reviewer() + " · " + trace.reviewedAt() : "En attente de validation");
        addFact(facts, "Version", trace.versions() > 1 ? trace.version() + " sur " + trace.versions() : String.valueOf(trace.version()));
        return facts;
    }

    private static void addFact(List<Field> facts, String label, String value)
    {
        if (value != null && !value.isBlank()) facts.add(new Field(label, value));
    }

    private static ReportRow measureOf(List<ReportRow> page)
    {
        return page.stream().filter(r -> "MEASURE".equals(r.answerType())).findFirst().orElseThrow();
    }

    private static boolean isGeometry(Map<String, List<ReportRow>> pages)
    {
        if (pages.size() < 2)
            return false;
        for (Map.Entry<String, List<ReportRow>> page : pages.entrySet())
        {
            if (page.getKey().isEmpty()) return false;
            long measures = page.getValue().stream().filter(r -> "MEASURE".equals(r.answerType())).count();
            boolean onlyText = page.getValue().stream().allMatch(r -> "MEASURE".equals(r.answerType()) || "TEXT".equals(r.answerType()));
            if (measures != 1 || !onlyText) return false;
        }
        return true;
    }

    private static String commonPhase(Iterable<String> pages)
    {
        String phase = null;
        for (String page : pages)
        {
            var m = PHASE.matcher(page);
            if (!m.matches()) return null;
            if (phase == null) phase = m.group(2);
            else if (!phase.equals(m.group(2))) return null;
        }
        return phase;
    }

    public static String withoutPhase(String page, String phase)
    {
        if (page == null) return null;
        var m = PHASE.matcher(page);
        if (phase == null) return page;
        return m.matches() ? m.group(1) : page;
    }

    // "Concentricité de l'arbre au remontage" → "Concentricité de l'arbre", whatever the phase
    public static String anyPhaseRemoved(String page)
    {
        if (page == null) return null;
        var m = PHASE.matcher(page);
        return m.matches() ? m.group(1) : page;
    }

    // ------------------------------------------------------------------ a card

    private static Card card(String anchor, String name, List<ReportRow> rows, Map<String, String> drawings, int[] photoCount)
    {
        List<Photo> photos = new ArrayList<>();
        List<Block> blocks = new ArrayList<>();
        List<Field> fields = new ArrayList<>();
        List<Check> checks = new ArrayList<>();
        List<ReportRow> run = new ArrayList<>();    // measures one after the other, of the same group
        String state = null, tone = null, findingsState = null, findingsTone = null;

        for (ReportRow row : rows)
        {
            String type = row.answerType() == null ? "TEXT" : row.answerType();
            String field = place(row.labelFr())[2];
            JsonNode data = row.data();
            boolean checklistRow = type.equals("SINGLE_CHOICE") && data != null && data.path("remark").asBoolean(false);
            boolean shortField = (type.equals("TEXT") && !LONG_TEXT.matcher(field).matches()) || type.equals("DATE") || type.equals("BON_MAUVAIS");

            if (!run.isEmpty() && !(type.equals("MEASURE") && same(groupOf(run.get(0)), groupOf(row))))
            {
                blocks.add(measuresBlock(run, drawings));
                run = new ArrayList<>();
            }
            if (!shortField && !fields.isEmpty()) { blocks.add(fieldsBlock(fields)); fields = new ArrayList<>(); }
            if (!checklistRow && !checks.isEmpty()) { blocks.add(checklistBlock(checks)); checks = new ArrayList<>(); }

            switch (type)
            {
                case "IMAGE" -> {
                    for (int i = 0; i < row.photos().size(); i++)
                    {
                        SubmissionReport.Caption caption = i < row.captions().size() ? row.captions().get(i) : null;
                        photos.add(new Photo(row.photos().get(i), caption == null ? null : blankToNull(caption.title()),
                                caption == null ? null : blankToNull(caption.comment()), String.valueOf(++photoCount[0])));
                    }
                }
                case "MEASURE" -> run.add(row);
                case "MULTI_CHOICE" -> {
                    if (blank(row)) continue;
                    List<String> checked = picked(data);
                    List<String> unchecked = new ArrayList<>();
                    for (JsonNode c : data.path("choices"))
                        if (!checked.contains(c.asText())) unchecked.add(c.asText());
                    blocks.add(new Block("choices", field, null, null, checked, unchecked, null, null, null, 0, null, null, null, null));
                    boolean good = checked.size() == 1 && checked.get(0).toLowerCase(Locale.ROOT).startsWith("bon");
                    findingsState = good ? "Bon état" : "Anomalies";
                    findingsTone = good ? "reuse" : "warn";
                }
                case "SINGLE_CHOICE" -> {
                    if (checklistRow)
                    {
                        var numbered = NUMBERED.matcher(field);
                        String status = data.path("selected").asText(null);
                        if (status == null) status = data.path("other").asText(null);
                        boolean bad = false;
                        for (JsonNode n : data.path("nonConforming"))
                            if (n.asText().equals(status)) bad = true;
                        checks.add(new Check(numbered.matches() ? numbered.group(1) : "", numbered.matches() ? numbered.group(2) : field,
                                status, blankToNull(row.comment()), bad, checkTone(status, bad)));
                        continue;
                    }
                    if (blank(row)) continue;
                    String chosen = data.path("selected").asText(null);
                    if (chosen == null) chosen = data.path("other").asText(null);
                    List<String> others = new ArrayList<>();
                    for (JsonNode c : data.path("choices"))
                        if (!c.asText().equals(chosen)) others.add(c.asText());
                    String chosenTone = toneOf(chosen);
                    blocks.add(new Block("decision", field, null, null, null, others, chosen, chosenTone, null, 0, null, null, null, null));
                    if (field.toLowerCase(Locale.ROOT).startsWith("recommandation"))
                    {
                        state = stateLabel(chosenTone, chosen);
                        tone = chosenTone;
                    }
                }
                case "PARTS_SUMMARY" -> {
                    List<SummaryLine> lines = new ArrayList<>();
                    if (data != null)
                        for (JsonNode r : data.path("rows"))
                        {
                            String rec = textOf(r, "recommendation");
                            lines.add(new SummaryLine(textOf(r, "quantity"), textOf(r, "description"), textOf(r, "code"),
                                    rec, rec == null ? "none" : toneOf(rec), textOf(r, "decision"), textOf(r, "remark")));
                        }
                    if (!lines.isEmpty())
                        blocks.add(new Block("summary", field, null, null, null, null, null, null, null, 0, null, null, lines, null));
                }
                default -> {
                    if (blank(row)) continue;
                    if (shortField) fields.add(new Field(field, row.value()));
                    else blocks.add(new Block("text", field, null, row.value(), null, null, null, null, null, 0, null, null, null, null));
                }
            }
        }
        if (!run.isEmpty()) blocks.add(measuresBlock(run, drawings));
        if (!fields.isEmpty()) blocks.add(fieldsBlock(fields));
        if (!checks.isEmpty()) blocks.add(checklistBlock(checks));
        if (state == null && findingsState != null) { state = findingsState; tone = findingsTone; }
        return new Card(anchor, name, state, tone, photos, blocks, false);
    }

    // a part the technician added: the same card as the others
    private static Card extraCard(String anchor, SubmissionReport.ExtraPart part, int[] photoCount)
    {
        List<Photo> photos = new ArrayList<>();
        for (int i = 0; i < part.photos().size(); i++)
        {
            SubmissionReport.Caption caption = i < part.captions().size() ? part.captions().get(i) : null;
            photos.add(new Photo(part.photos().get(i), caption == null ? null : blankToNull(caption.title()),
                    caption == null ? null : blankToNull(caption.comment()), String.valueOf(++photoCount[0])));
        }
        List<Block> blocks = new ArrayList<>();
        if (part.findings() != null)
            blocks.add(new Block("choices", "Constats", null, null, List.of(part.findings().split(",\\s*")), List.of(), null, null, null, 0, null, null, null, null));
        String state = null, tone = null;
        if (part.recommendation() != null)
        {
            tone = toneOf(part.recommendation());
            state = stateLabel(tone, part.recommendation());
            blocks.add(new Block("decision", "Recommandation", null, null, null, List.of(), part.recommendation(), tone, null, 0, null, null, null, null));
        }
        if (part.comment() != null)
            blocks.add(new Block("text", "Commentaire", null, part.comment(), null, null, null, null, null, 0, null, null, null, null));
        return new Card(anchor, part.name(), state, tone, photos, blocks, true);
    }

    private static Block fieldsBlock(List<Field> fields)
    {
        return new Block("fields", null, List.copyOf(fields), null, null, null, null, null, null, 0, null, null, null, null);
    }

    private static Block checklistBlock(List<Check> checks)
    {
        return new Block("checklist", null, null, null, null, null, null, null, null, 0, null, null, null, List.copyOf(checks));
    }

    // a run of measures as one sheet: its drawings on top, a row per mark, a column per reading, the average
    private static Block measuresBlock(List<ReportRow> run, Map<String, String> drawings)
    {
        List<String> pictures = new ArrayList<>();
        int most = 0;
        String unit = null;
        for (ReportRow row : run)
        {
            String picture = drawingOf(row, drawings);
            if (picture != null && !pictures.contains(picture)) pictures.add(picture);
            most = Math.max(most, readingsOf(row).size());
            if (unit == null && row.data() != null) unit = row.data().path("unit").asText(null);
        }
        int columns = most > MAX_COLUMNS ? 0 : Math.max(most, 1);
        List<MeasureLine> lines = new ArrayList<>();
        for (ReportRow row : run)
        {
            List<String> readings = readingsOf(row);
            lines.add(new MeasureLine(place(row.labelFr())[2], pad(readings, columns), String.join("  ·  ", readings),
                    averageOf(row), readings.isEmpty(), outOf(row)));
        }
        return new Block("measures", groupOf(run.get(0)), null, null, null, null, null, null, lines, columns, unit, pictures, null, null);
    }

    // ------------------------------------------------------------------ page 1

    private static Summary summary(String kind, String status, List<Section> sections)
    {
        List<PartState> parts = new ArrayList<>();
        List<String> notInspected = new ArrayList<>();
        List<String> reception = new ArrayList<>();
        List<Check> allChecks = new ArrayList<>();
        Photo receptionPhoto = null, assembledPhoto = null, anyPhoto = null;

        for (Section section : sections)
        {
            for (Card card : section.cards())
            {
                if (anyPhoto == null && !card.photos().isEmpty()) anyPhoto = card.photos().get(0);
                if (section.name().equals(RECEPTION))
                {
                    if (receptionPhoto == null && !card.photos().isEmpty()) receptionPhoto = card.photos().get(0);
                    card.blocks().stream().filter(b -> b.kind().equals("choices")).forEach(b -> reception.addAll(b.checked()));
                }
                if (section.name().equals(ASSEMBLED) && assembledPhoto == null && !card.photos().isEmpty())
                    assembledPhoto = card.photos().get(0);
                card.blocks().stream().filter(b -> b.kind().equals("checklist")).forEach(b -> allChecks.addAll(b.checks()));

                // a part: a card with a recommendation, or findings
                boolean isPart = !section.name().equals(RECEPTION)
                        && card.blocks().stream().anyMatch(b -> b.kind().equals("decision") || b.kind().equals("choices"));
                if (isPart && card.state() != null)
                {
                    String findings = card.blocks().stream().filter(b -> b.kind().equals("choices"))
                            .flatMap(b -> b.checked().stream()).reduce((a, b) -> a + ", " + b).orElse(null);
                    String recommendation = card.blocks().stream().filter(b -> b.kind().equals("decision"))
                            .map(Block::chosen).findFirst().orElse(null);
                    parts.add(new PartState(card.anchor(), card.name() == null ? section.name() : card.name(), section.name(),
                            card.state(), card.tone(), findings, recommendation));
                }
            }
            // a part page left blank: not inspected (only in the rubriques of parts)
            if (section.name().equals(INSPECTION) || section.name().equals(SEAL))
                section.blankPages().stream().filter(p -> !p.equals("Identification")).forEach(notInspected::add);
        }
        parts.sort(Comparator.comparingInt(p -> severity(p.tone())));

        long replace = parts.stream().filter(p -> "replace".equals(p.tone())).count();
        long repair = parts.stream().filter(p -> "repair".equals(p.tone())).count();
        long reuse = parts.stream().filter(p -> "reuse".equals(p.tone())).count();
        long ok = allChecks.stream().filter(c -> "reuse".equals(c.tone())).count();
        long bad = allChecks.stream().filter(Check::bad).count();
        long na = allChecks.stream().filter(c -> "none".equals(c.tone()) && c.status() != null).count();
        List<Check> open = allChecks.stream().filter(Check::bad).toList();
        List<OutMeasure> outs = new ArrayList<>();
        for (Section section : sections)
        {
            for (GeometryRow g : section.geometry())
                if (g.out()) outs.add(new OutMeasure(section.name(), g.control(), g.average(), section.geometryUnit(), section.anchor()));
            for (Card card : section.cards())
                for (Block b : card.blocks())
                    if (b.kind().equals("measures"))
                        for (MeasureLine m : b.measures())
                            if (m.out())
                                outs.add(new OutMeasure(b.label() != null ? b.label() : card.name() != null ? card.name() : section.name(),
                                        m.mark(), m.average(), b.unit(), card.anchor()));
        }
        long measured = sections.stream().mapToLong(s -> s.geometry().stream().filter(g -> !g.empty()).count()
                + s.cards().stream().flatMap(c -> c.blocks().stream()).filter(b -> b.kind().equals("measures"))
                    .flatMap(b -> b.measures().stream()).filter(m -> !m.empty()).count()).sum();

        String verdict, detail, tone;
        List<Tile> tiles = new ArrayList<>();
        if (kind.equals("MONTAGE"))
        {
            boolean conform = "CONFORME".equals(status);
            verdict = conform ? "Montage conforme" : "Montage non conforme";
            tone = conform ? "reuse" : "replace";
            detail = allChecks.isEmpty() ? "Aucun contrôle de montage renseigné."
                    : plural(ok, "contrôle conforme", "contrôles conformes") + " sur " + allChecks.size()
                      + (bad > 0 ? " · " + plural(bad, "point à reprendre", "points à reprendre") : "")
                      + (na > 0 ? " · " + na + " non applicable" + (na > 1 ? "s" : "") : "");
            tiles.add(new Tile(ok + "/" + allChecks.size(), "contrôles conformes", "reuse"));
            tiles.add(new Tile(String.valueOf(bad), bad > 1 ? "non conformes" : "non conforme", bad > 0 ? "replace" : "none"));
            tiles.add(new Tile(String.valueOf(na), na > 1 ? "non applicables" : "non applicable", "none"));
            tiles.add(new Tile(String.valueOf(measured), "mesures relevées", "info"));
        }
        else
        {
            if (replace > 0) { verdict = "Remise en état nécessaire"; tone = "replace"; }
            else if (repair > 0) { verdict = "Réparations à prévoir"; tone = "repair"; }
            else if (!parts.isEmpty()) { verdict = "Pièces en bon état"; tone = "reuse"; }
            else { verdict = "Aucune pièce expertisée"; tone = "info"; }
            detail = parts.isEmpty() ? "Aucune pièce n'a été inspectée dans ce rapport."
                    : plural(replace, "pièce à remplacer", "pièces à remplacer") + " · " + repair + " à réparer · "
                      + reuse + " réutilisable" + (reuse > 1 ? "s" : "");
            if (kind.equals("COMPLET") && !allChecks.isEmpty())
                detail += " · montage : " + ok + "/" + allChecks.size() + " contrôles conformes";
            tiles.add(new Tile(String.valueOf(parts.size()), parts.size() > 1 ? "pièces expertisées" : "pièce expertisée", "info"));
            tiles.add(new Tile(String.valueOf(replace), "à remplacer", replace > 0 ? "replace" : "none"));
            tiles.add(new Tile(String.valueOf(repair), "à réparer", repair > 0 ? "repair" : "none"));
            tiles.add(kind.equals("COMPLET") && !allChecks.isEmpty()
                    ? new Tile(ok + "/" + allChecks.size(), "contrôles conformes", "reuse")
                    : new Tile(String.valueOf(reuse), reuse > 1 ? "réutilisables" : "réutilisable", reuse > 0 ? "reuse" : "none"));
        }

        if (!outs.isEmpty())
        {
            tiles.add(new Tile(String.valueOf(outs.size()), outs.size() > 1 ? "mesures hors tolérance" : "mesure hors tolérance", "replace"));
            detail += " · " + plural(outs.size(), "mesure hors tolérance", "mesures hors tolérance");
        }

        Photo hero = kind.equals("MONTAGE") ? (assembledPhoto != null ? assembledPhoto : anyPhoto)
                : (receptionPhoto != null ? receptionPhoto : anyPhoto);

        // the cover: two photos of the pump at reception (démontage) or assembled (montage), else of its parts
        List<CoverPhoto> cover = new ArrayList<>();
        String first = kind.equals("MONTAGE") ? ASSEMBLED : RECEPTION;
        for (Section section : sections)
            if (section.name().equals(first))
                for (Card card : section.cards())
                    for (Photo photo : card.photos())
                        if (cover.size() < 2) cover.add(new CoverPhoto(photo, kind.equals("MONTAGE") ? "Pompe assemblée" : "À la réception"));
        for (Section section : sections)
            if (!section.name().equals(first))
                for (Card card : section.cards())
                    for (Photo photo : card.photos())
                        if (cover.size() < 2) cover.add(new CoverPhoto(photo, card.name() != null ? card.name() : section.name()));
        String heroLabel = hero == null ? null
                : hero == assembledPhoto ? "Pompe assemblée" : hero == receptionPhoto ? "Pompe à la réception" : "Photo du rapport";
        return new Summary(verdict, detail, tone, tiles, parts, notInspected, reception, open, hero, heroLabel,
                allChecks.size(), (int) ok, cover, outs);
    }

    private static int severity(String tone)
    {
        return switch (tone == null ? "" : tone) {
            case "replace" -> 0;
            case "repair" -> 1;
            case "warn" -> 2;
            case "info" -> 3;
            case "reuse" -> 4;
            default -> 5;
        };
    }

    // ------------------------------------------------------------------ states and tones

    // what a recommendation means for the part
    public static String toneOf(String recommendation)
    {
        String r = recommendation == null ? "" : recommendation.toLowerCase(Locale.ROOT);
        if (r.matches(".*(remplac|changement|changer|nouveau|neuf|nouvelle).*")) return "replace";
        if (r.matches(".*(répar|repar|rodage|polissage|recharg|usinage|rectif|reprise).*")) return "repair";
        if (r.matches(".*(nettoyage|réutilis|reutilis|garder|conserv).*")) return "reuse";
        return "info";
    }

    public static String stateLabel(String tone, String recommendation)
    {
        return switch (tone) {
            case "replace" -> "À remplacer";
            case "repair" -> "À réparer";
            case "reuse" -> "Réutilisable";
            default -> recommendation;
        };
    }

    private static String checkTone(String status, boolean bad)
    {
        if (status == null) return "none";
        if (bad) return "replace";
        return status.toLowerCase(Locale.ROOT).startsWith("conforme") ? "reuse" : "none";
    }

    // ------------------------------------------------------------------ small helpers

    private static boolean blank(ReportRow row)
    {
        return (row.value() == null || row.value().isBlank()) && (row.photos() == null || row.photos().isEmpty());
    }

    private static List<String> picked(JsonNode data)
    {
        List<String> picked = new ArrayList<>();
        if (data == null) return picked;
        if (data.path("selected").isArray()) data.path("selected").forEach(s -> picked.add(s.asText()));
        else if (data.path("selected").isTextual()) picked.add(data.path("selected").asText());
        picked.addAll(StructuredAnswers.typed(data.path("other").asText(null)));
        return picked;
    }

    private static String groupOf(ReportRow row)
    {
        return row.data() == null ? null : row.data().path("group").asText(null);
    }

    private static boolean same(String a, String b)
    {
        return a == null ? b == null : a.equals(b);
    }

    // marked « hors tolérance » by the technician
    static boolean outOf(ReportRow row)
    {
        return row.data() != null && row.data().path("out").asBoolean(false);
    }

    static List<String> readingsOf(ReportRow row)
    {
        List<String> readings = new ArrayList<>();
        if (row.data() != null)
            row.data().path("readings").forEach(r -> readings.add(french(r.asText())));
        return readings;
    }

    static String averageOf(ReportRow row)
    {
        JsonNode average = row.data() == null ? null : row.data().path("average");
        return average == null || average.isNull() || average.isMissingNode() ? null : french(average.asText());
    }

    private static List<String> pad(List<String> readings, int columns)
    {
        if (columns == 0) return List.of();
        List<String> cells = new ArrayList<>(readings);
        while (cells.size() < columns) cells.add(null);
        return cells;
    }

    // the measure's drawing as a data URI, by its file name ("/expertise/arbre-palier.png" → "arbre-palier")
    private static String drawingOf(ReportRow row, Map<String, String> drawings)
    {
        String path = row.data() == null ? null : row.data().path("drawing").asText(null);
        return path == null ? null : drawings.get(path.replaceAll(".*/", "").replaceAll("\\.[^.]*$", ""));
    }

    private static String textOf(JsonNode node, String field)
    {
        JsonNode v = node.path(field);
        return v.isNull() || v.isMissingNode() || v.asText().isBlank() ? null : v.asText();
    }

    private static String blankToNull(String text)
    {
        return text == null || text.isBlank() ? null : text.strip();
    }

    public static String french(String number)
    {
        return number == null ? null : number.replace('.', ',');
    }

    // "0,05" → 0.05; null if it isn't a number
    public static BigDecimal number(String french)
    {
        if (french == null) return null;
        try { return new BigDecimal(french.replace(',', '.').strip()); }
        catch (NumberFormatException e) { return null; }
    }

    private static String plural(long n, String one, String many)
    {
        return n + " " + (n > 1 ? many : one);
    }
}
