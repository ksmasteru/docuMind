package com.docuMind.backend.services;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.docuMind.backend.exception.InvalidFormException;
import com.docuMind.backend.exception.InvalidResponseException;
import com.docuMind.backend.model.CheckListItem;
import com.docuMind.backend.model.SubmissionRequest;
import com.docuMind.backend.model.enums.AnswerType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

// The v2 expertise reports' answers (report_ui.md): findings ticked from a list, a recommendation,
// several readings of a measure, photos with titles, the parts summary, and parts added by the
// technician. Their questions carry JSON options (CheckListItem.options) and their answers are JSON
// in CheckListAnswer.value. This class checks a form's options when it's created, checks and
// normalizes each answer when a report is sent, and turns a saved answer back into readable text
// (for the PDF) and data (for the review page).
//
// Options, by answer type (all optional unless said):
//   every type      group: "Client / dossier"     fields shown together on their page
//                   meta: "equipment" | "inspectionDate"   copied into the report's equipment / date
//   SINGLE_CHOICE   choices: [..] (required), allowOther, nonConforming: [..] (critical: comment + NON_CONFORME),
//                   remark: true (a remark beside the choice, in the answer's comment)
//   MULTI_CHOICE    choices: [..] (required), allowOther, exclusive: "Bon état" (excludes every other finding)
//   MEASURE         unit: "mm", drawing: "/expertise/x.png", maxReadings (default 50)
//                   answer { readings: [..], out: true }: out, the technician marked the measure « hors tolérance »
//                   (option A of the tolerances: no limit is stored yet; the flag is the technician's judgement)
//   IMAGE           maxPhotos (default 30 on v2 forms, 4 on the others), photoComments: true
//   PARTS_SUMMARY   recommendations / decisions / remarks: [..] (required): each column's suggestions
//   TABLE           columns: [{ key, label, type, … }] (required), maxRows (default 200), rows: n (empty rows shown)
//                   column type: "text" | "number" | "date" | "choice" (choices: [..], nonConforming: [..])
//                            | "result" (computed by the server from tolerance, never sent)
//                   tolerance: { measured, nominal, min, max }: the keys of four number columns. A row is
//                   « Conforme » when nominal + min ≤ measured ≤ nominal + max: min and max are signed
//                   deviations (TOL INF −0,05 / TOL SUP +0,02), as on the drawing
@Component
public class StructuredAnswers {

    // the v2 forms ("Rapport d'expertise V2 (démontage)"…): blanks allowed, photos with titles, extra parts
    public static final String V2_PREFIX = "rapport d'expertise v2";

    public static boolean isV2(String title)
    {
        return title != null && title.strip().toLowerCase().startsWith(V2_PREFIX);
    }

    // the forms answered like the v2 reports (blanks allowed, photos with titles): the v2 reports, told
    // apart by their title, and the forms created with a layout (the quality control sheets). Added
    // parts stay the v2 reports' own (isV2)
    public static boolean usesV2Answers(com.docuMind.backend.model.CheckListTemplate template)
    {
        return isV2(template.getTitle()) || template.getLayout() == com.docuMind.backend.model.enums.FormLayout.CONTROL_SHEET;
    }

    public static final String CONFORME = "Conforme";
    public static final String NON_CONFORME = "Non conforme";
    private static final Set<String> COLUMN_TYPES = Set.of("text", "number", "date", "choice", "result");
    private static final int MAX_COLUMNS = 12;

    public static final int LEGACY_MAX_PHOTOS = 4;
    private static final int V2_MAX_PHOTOS = 30;
    private static final int MAX_CHOICES = 60;
    private static final int MAX_READINGS = 50;
    private static final int MAX_ROWS = 200;
    private static final int MAX_EXTRA_PARTS = 50;
    private static final int SHORT = 255;
    private static final int LONG = 5000;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final ObjectMapper mapper;

    public StructuredAnswers(ObjectMapper mapper)
    {
        this.mapper = mapper;
    }

    // ===================================================================== the form's options

    // checked when a form is created: the options its answer type needs, in the right shape.
    // Returns them as JSON for CheckListItem.options, or null when there are none
    public String checkOptions(AnswerType type, JsonNode options, int position)
    {
        boolean required = type == AnswerType.SINGLE_CHOICE || type == AnswerType.MULTI_CHOICE
                || type == AnswerType.PARTS_SUMMARY || type == AnswerType.TABLE;
        if (options == null || options.isNull())
        {
            if (required)
                throw new InvalidFormException("item " + position + " (" + type + ") needs options");
            return null;
        }
        if (!options.isObject())
            throw new InvalidFormException("item " + position + ": options must be an object");

        optionalString(options, "group", position);
        String meta = optionalString(options, "meta", position);
        if (meta != null && !meta.equals("equipment") && !meta.equals("inspectionDate"))
            throw new InvalidFormException("item " + position + ": meta is \"equipment\" or \"inspectionDate\"");

        switch (type)
        {
            case SINGLE_CHOICE, MULTI_CHOICE -> {
                List<String> choices = stringList(options.get("choices"), "item " + position + " choices", MAX_CHOICES);
                if (choices.isEmpty())
                    throw new InvalidFormException("item " + position + ": choices can't be empty");
                optionalBoolean(options, "allowOther", position);
                if (type == AnswerType.MULTI_CHOICE)
                {
                    String exclusive = optionalString(options, "exclusive", position);
                    if (exclusive != null && !choices.contains(exclusive))
                        throw new InvalidFormException("item " + position + ": exclusive \"" + exclusive + "\" isn't a choice");
                }
                else
                {
                    optionalBoolean(options, "remark", position);
                    if (options.has("nonConforming")
                            && !choices.containsAll(stringList(options.get("nonConforming"), "item " + position + " nonConforming", MAX_CHOICES)))
                        throw new InvalidFormException("item " + position + ": nonConforming must be among the choices");
                }
            }
            case MEASURE -> {
                optionalString(options, "unit", position);
                optionalString(options, "drawing", position);
                optionalInt(options, "maxReadings", 1, MAX_READINGS, position);
            }
            case IMAGE -> {
                optionalInt(options, "maxPhotos", 1, 50, position);
                optionalBoolean(options, "photoComments", position);
            }
            case PARTS_SUMMARY -> {
                for (String column : List.of("recommendations", "decisions", "remarks"))
                    stringList(options.get(column), "item " + position + " " + column, MAX_CHOICES);
            }
            case TABLE -> checkTableOptions(options, position);
            default -> { }
        }
        return write(options);
    }

    // a question's options, an empty object when it has none
    public JsonNode readOptions(String json)
    {
        if (json == null || json.isBlank())
            return mapper.createObjectNode();
        try {
            return mapper.readTree(json);
        } catch (JsonProcessingException e) {
            return mapper.createObjectNode();
        }
    }

    // ===================================================================== an answer, when sent

    // value: what to store (null = left blank); nonConforming: a critical choice says the work isn't
    // right; photos: the IMAGE answer's photos, whose ownership the caller checks
    public record Normalized(String value, boolean nonConforming, List<PhotoRef> photos) {
        public boolean blank() { return value == null; }
    }

    public record PhotoRef(String imageId, String title, String comment) {}

    // the answer to one question of a type other than BON_MAUVAIS / TEXT, checked and in its stored
    // form. v2: the form is a v2 report (photos stored with their titles)
    public Normalized normalize(CheckListItem item, String raw, boolean v2)
    {
        String where = "invalid answer for question " + item.getPosition() + ": ";
        JsonNode options = readOptions(item.getOptions());
        if (raw == null || raw.isBlank())
            return new Normalized(null, false, List.of());

        return switch (item.getAnswerType())
        {
            case IMAGE -> {
                List<PhotoRef> photos = photoRefs(raw, where);
                int max = options.path("maxPhotos").asInt(v2 ? V2_MAX_PHOTOS : LEGACY_MAX_PHOTOS);
                if (photos.size() > max)
                    throw new InvalidResponseException(where + "at most " + max + " photos");
                if (photos.isEmpty())
                    yield new Normalized(null, false, List.of());
                // old forms keep "id1,id2"; v2 keeps each photo's title and comment
                String value = v2 ? write(photosJson(photos))
                        : String.join(",", photos.stream().map(PhotoRef::imageId).toList());
                yield new Normalized(value, false, photos);
            }
            case DATE -> {
                try {
                    yield new Normalized(LocalDate.parse(raw.strip()).toString(), false, List.of());
                } catch (DateTimeParseException e) {
                    throw new InvalidResponseException(where + "a date is YYYY-MM-DD");
                }
            }
            case SINGLE_CHOICE -> {
                JsonNode answer = readAnswer(raw, where);
                List<String> choices = stringList(options.get("choices"), "choices", MAX_CHOICES);
                String selected = text(answer.get("selected"), SHORT, where + "selected");
                String other = text(answer.get("other"), LONG, where + "other");
                if (selected != null && selected.equalsIgnoreCase("Autre"))
                    selected = null;
                if (selected == null && other == null)
                    yield new Normalized(null, false, List.of());
                if (selected != null && !choices.contains(selected))
                    throw new InvalidResponseException(where + "\"" + selected + "\" isn't one of the choices");
                if (selected == null && !options.path("allowOther").asBoolean(false))
                    throw new InvalidResponseException(where + "pick one of the choices");
                ObjectNode stored = mapper.createObjectNode();
                stored.put("selected", selected);
                stored.put("other", selected == null ? other : null);
                boolean bad = selected != null
                        && stringList(options.get("nonConforming"), "nonConforming", MAX_CHOICES).contains(selected);
                yield new Normalized(write(stored), bad, List.of());
            }
            case MULTI_CHOICE -> {
                JsonNode answer = readAnswer(raw, where);
                List<String> choices = stringList(options.get("choices"), "choices", MAX_CHOICES);
                Set<String> picked = new LinkedHashSet<>(stringList(answer.get("selected"), where + "selected", MAX_CHOICES));
                picked.remove("Autre");
                String other = text(answer.get("other"), LONG, where + "other");
                for (String finding : picked)
                    if (!choices.contains(finding))
                        throw new InvalidResponseException(where + "\"" + finding + "\" isn't one of the choices");
                if (other != null && !options.path("allowOther").asBoolean(false))
                    throw new InvalidResponseException(where + "this question has no « Autre »");
                String exclusive = options.path("exclusive").asText(null);
                if (exclusive != null && picked.contains(exclusive) && (picked.size() > 1 || other != null))
                    throw new InvalidResponseException(where + "« " + exclusive + " » excludes every other finding");
                if (picked.isEmpty() && other == null)
                    yield new Normalized(null, false, List.of());
                ObjectNode stored = mapper.createObjectNode();
                ArrayNode selected = stored.putArray("selected");
                choices.stream().filter(picked::contains).forEach(selected::add); // the form's order
                stored.put("other", other);
                yield new Normalized(write(stored), false, List.of());
            }
            case MEASURE -> {
                JsonNode answer = readAnswer(raw, where);
                JsonNode readings = answer.get("readings");
                if (readings == null || readings.isNull() || (readings.isArray() && readings.isEmpty()))
                    yield new Normalized(null, false, List.of());
                if (!readings.isArray())
                    throw new InvalidResponseException(where + "readings is a list of numbers");
                int max = options.path("maxReadings").asInt(MAX_READINGS);
                if (readings.size() > max)
                    throw new InvalidResponseException(where + "at most " + max + " readings");
                JsonNode out = answer.get("out");
                if (out != null && !out.isNull() && !out.isBoolean())
                    throw new InvalidResponseException(where + "out is true or false");
                ObjectNode stored = mapper.createObjectNode();
                ArrayNode values = stored.putArray("readings");
                for (JsonNode reading : readings)
                    values.add(number(reading, where));
                // only a measure with readings can be out of tolerance; false isn't stored
                if (out != null && out.asBoolean(false))
                    stored.put("out", true);
                yield new Normalized(write(stored), false, List.of());
            }
            case PARTS_SUMMARY -> {
                JsonNode answer = readAnswer(raw, where);
                JsonNode rows = answer.get("rows");
                if (rows == null || rows.isNull() || (rows.isArray() && rows.isEmpty()))
                    yield new Normalized(null, false, List.of());
                if (!rows.isArray() || rows.size() > MAX_ROWS)
                    throw new InvalidResponseException(where + "rows is a list of at most " + MAX_ROWS + " parts");
                ObjectNode stored = mapper.createObjectNode();
                ArrayNode out = stored.putArray("rows");
                int n = 0;
                for (JsonNode row : rows)
                {
                    n++;
                    String line = where + "row " + n + " ";
                    String description = text(row.get("description"), SHORT, line + "description");
                    if (description == null)
                        throw new InvalidResponseException(line + "needs a description");
                    ObjectNode clean = out.addObject();
                    JsonNode quantity = row.get("quantity");
                    if (quantity == null || quantity.isNull() || quantity.asText().isBlank())
                        clean.putNull("quantity");
                    else
                    {
                        if (!quantity.canConvertToInt() && !quantity.asText().strip().matches("\\d{1,6}"))
                            throw new InvalidResponseException(line + "quantity is a whole number");
                        int q = quantity.isNumber() ? quantity.asInt() : Integer.parseInt(quantity.asText().strip());
                        if (q < 0 || q > 100000)
                            throw new InvalidResponseException(line + "quantity is between 0 and 100000");
                        clean.put("quantity", q);
                    }
                    clean.put("description", description);
                    for (String field : List.of("code", "recommendation", "decision", "remark"))
                        clean.put(field, text(row.get(field), SHORT, line + field));
                }
                yield new Normalized(write(stored), false, List.of());
            }
            case TABLE -> normalizeTable(options, raw, where);
            default -> throw new IllegalArgumentException("not a structured answer type: " + item.getAnswerType());
        };
    }

    // ===================================================================== tables (control sheets)

    private void checkTableOptions(JsonNode options, int position)
    {
        String where = "item " + position + ": ";
        JsonNode columns = options.get("columns");
        if (columns == null || !columns.isArray() || columns.isEmpty() || columns.size() > MAX_COLUMNS)
            throw new InvalidFormException(where + "a TABLE needs 1 to " + MAX_COLUMNS + " columns");
        Set<String> keys = new LinkedHashSet<>();
        Set<String> numbers = new LinkedHashSet<>();
        boolean result = false;
        for (JsonNode column : columns)
        {
            String key = text(column.get("key"), 40, where + "column key");
            String label = text(column.get("label"), SHORT, where + "column label");
            String type = column.path("type").asText("text");
            if (key == null || !key.matches("[A-Za-z][A-Za-z0-9_]*") || label == null)
                throw new InvalidFormException(where + "each column needs a key (letters, digits, _) and a label");
            if (!keys.add(key))
                throw new InvalidFormException(where + "column \"" + key + "\" appears twice");
            if (!COLUMN_TYPES.contains(type))
                throw new InvalidFormException(where + "column \"" + key + "\" type is one of " + COLUMN_TYPES);
            if (type.equals("number"))
                numbers.add(key);
            if (type.equals("choice"))
            {
                List<String> choices = stringList(column.get("choices"), where + "column " + key + " choices", MAX_CHOICES);
                if (choices.isEmpty())
                    throw new InvalidFormException(where + "column \"" + key + "\" needs choices");
                if (column.has("nonConforming") && !choices.containsAll(
                        stringList(column.get("nonConforming"), where + "column " + key + " nonConforming", MAX_CHOICES)))
                    throw new InvalidFormException(where + "column \"" + key + "\" nonConforming must be among its choices");
            }
            if (type.equals("result"))
            {
                if (result)
                    throw new InvalidFormException(where + "a TABLE has at most one result column");
                result = true;
            }
        }
        JsonNode tolerance = options.get("tolerance");
        if (result && (tolerance == null || !tolerance.isObject()))
            throw new InvalidFormException(where + "a result column needs a tolerance");
        if (tolerance != null && !tolerance.isNull())
            for (String role : List.of("measured", "nominal", "min", "max"))
                if (!numbers.contains(tolerance.path(role).asText("")))
                    throw new InvalidFormException(where + "tolerance." + role + " must name a number column");
        optionalInt(options, "maxRows", 1, MAX_ROWS, position);
        optionalInt(options, "rows", 0, MAX_ROWS, position);
    }

    // The rows kept: blank rows dropped, numbers as numbers ("0,05" → 0.05), choices among their list,
    // the result column computed here (whatever was sent in it). nonConforming: a row « Non conforme »
    // or a choice listed as non conforming.
    private Normalized normalizeTable(JsonNode options, String raw, String where)
    {
        JsonNode answer = readAnswer(raw, where);
        JsonNode rows = answer.get("rows");
        if (rows == null || rows.isNull() || (rows.isArray() && rows.isEmpty()))
            return new Normalized(null, false, List.of());
        int max = options.path("maxRows").asInt(MAX_ROWS);
        if (!rows.isArray() || rows.size() > max)
            throw new InvalidResponseException(where + "rows is a list of at most " + max + " rows");
        JsonNode tolerance = options.path("tolerance");
        ObjectNode stored = mapper.createObjectNode();
        ArrayNode out = stored.putArray("rows");
        boolean bad = false;
        int n = 0;
        for (JsonNode row : rows)
        {
            n++;
            String line = where + "row " + n + " ";
            if (!row.isObject())
                throw new InvalidResponseException(line + "is an object of the columns' values");
            ObjectNode clean = mapper.createObjectNode();
            boolean any = false;
            String resultKey = null;
            for (JsonNode column : options.get("columns"))
            {
                String key = column.get("key").asText();
                String type = column.path("type").asText("text");
                JsonNode cell = row.get(key);
                String label = line + column.path("label").asText(key);
                switch (type)
                {
                    case "result" -> resultKey = key;
                    case "number" -> {
                        String typed = cell == null || cell.isNull() ? null : cell.asText().strip();
                        if (typed == null || typed.isEmpty()) { clean.putNull(key); continue; }
                        // "−0,05" typed with the minus sign of a phone keyboard, "+0,02" with its plus
                        String plain = typed.replace(" ", "").replace('\u2212', '-');
                        clean.put(key, number(mapper.getNodeFactory().textNode(plain), label + ": "));
                        any = true;
                    }
                    case "date" -> {
                        String typed = text(cell, SHORT, label);
                        if (typed == null) { clean.putNull(key); continue; }
                        try {
                            clean.put(key, LocalDate.parse(typed).toString());
                        } catch (DateTimeParseException e) {
                            throw new InvalidResponseException(label + ": a date is YYYY-MM-DD");
                        }
                        any = true;
                    }
                    case "choice" -> {
                        String typed = text(cell, SHORT, label);
                        if (typed == null) { clean.putNull(key); continue; }
                        if (!stringList(column.get("choices"), "choices", MAX_CHOICES).contains(typed))
                            throw new InvalidResponseException(label + ": \"" + typed + "\" isn't one of the choices");
                        clean.put(key, typed);
                        if (stringList(column.get("nonConforming"), "nonConforming", MAX_CHOICES).contains(typed))
                            bad = true;
                        any = true;
                    }
                    default -> {
                        String typed = text(cell, SHORT, label);
                        clean.put(key, typed);
                        any = any || typed != null;
                    }
                }
            }
            if (!any)
                continue;
            if (resultKey != null)
            {
                String result = conformity(clean, tolerance, line);
                clean.put(resultKey, result);
                bad = bad || NON_CONFORME.equals(result);
            }
            out.add(clean);
        }
        if (out.isEmpty())
            return new Normalized(null, false, List.of());
        return new Normalized(write(stored), bad, List.of());
    }

    // « Conforme » / « Non conforme » once the four numbers are there, else null (not measured yet)
    private static String conformity(JsonNode row, JsonNode tolerance, String line)
    {
        JsonNode measured = row.get(tolerance.path("measured").asText());
        JsonNode nominal = row.get(tolerance.path("nominal").asText());
        JsonNode min = row.get(tolerance.path("min").asText());
        JsonNode max = row.get(tolerance.path("max").asText());
        if (isMissing(measured) || isMissing(nominal) || isMissing(min) || isMissing(max))
            return null;
        if (min.decimalValue().compareTo(max.decimalValue()) > 0)
            throw new InvalidResponseException(line + "TOL INF is above TOL SUP: write them signed (−0,05 / +0,02)");
        BigDecimal low = nominal.decimalValue().add(min.decimalValue());
        BigDecimal high = nominal.decimalValue().add(max.decimalValue());
        BigDecimal value = measured.decimalValue();
        return value.compareTo(low) >= 0 && value.compareTo(high) <= 0 ? CONFORME : NON_CONFORME;
    }

    private static boolean isMissing(JsonNode node)
    {
        return node == null || node.isNull() || !node.isNumber();
    }

    // the photos of an IMAGE answer, as stored or sent: "id1,id2" (old forms) or [{ imageId, title, comment }]
    public List<PhotoRef> photoRefs(String raw)
    {
        return photoRefs(raw, "photos: ");
    }

    private List<PhotoRef> photoRefs(String raw, String where)
    {
        if (raw == null || raw.isBlank())
            return List.of();
        String value = raw.strip();
        if (!value.startsWith("["))
            return Arrays.stream(value.split(",")).map(String::trim).filter(id -> !id.isEmpty())
                    .map(id -> new PhotoRef(id, null, null)).toList();
        JsonNode list = readAnswer(value, where);
        List<PhotoRef> photos = new ArrayList<>();
        for (JsonNode photo : list)
        {
            String id = text(photo.get("imageId"), SHORT, where + "imageId");
            if (id == null)
                throw new InvalidResponseException(where + "each photo needs its imageId");
            photos.add(new PhotoRef(id, text(photo.get("title"), SHORT, where + "title"), text(photo.get("comment"), LONG, where + "comment")));
        }
        return photos;
    }

    // ===================================================================== parts added by the technician

    // the parts the technician added (« + Ajouter une pièce »), checked, as JSON for
    // CheckListSubmission.extraParts; null when there are none. Their photos are returned for the
    // ownership check through photosOf
    public String normalizeExtraParts(List<SubmissionRequest.ExtraPart> parts)
    {
        if (parts == null || parts.isEmpty())
            return null;
        if (parts.size() > MAX_EXTRA_PARTS)
            throw new InvalidResponseException("at most " + MAX_EXTRA_PARTS + " added parts");
        ArrayNode out = mapper.createArrayNode();
        int n = 0;
        for (SubmissionRequest.ExtraPart part : parts)
        {
            n++;
            String where = "added part " + n + ": ";
            ObjectNode clean = out.addObject();
            clean.put("name", part.name().strip());
            List<PhotoRef> photos = part.photos() == null ? List.of() : part.photos().stream()
                    .map(p -> new PhotoRef(p.imageId().strip(), blankToNull(p.title()), blankToNull(p.comment()))).toList();
            if (photos.size() > V2_MAX_PHOTOS)
                throw new InvalidResponseException(where + "at most " + V2_MAX_PHOTOS + " photos");
            clean.set("photos", photosJson(photos));
            ArrayNode findings = clean.putArray("findings");
            if (part.findings() != null)
                for (String f : new LinkedHashSet<>(part.findings()))
                    if (f != null && !f.isBlank())
                        findings.add(cut(f.strip(), SHORT, where + "finding"));
            clean.put("findingsOther", cut(blankToNull(part.findingsOther()), LONG, where + "other finding"));
            clean.put("comment", cut(blankToNull(part.comment()), LONG, where + "comment"));
            clean.put("recommendation", cut(blankToNull(part.recommendation()), SHORT, where + "recommendation"));
            clean.put("recommendationOther", cut(blankToNull(part.recommendationOther()), LONG, where + "other recommendation"));
        }
        return write(out);
    }

    public record ExtraPartData(String name, List<PhotoRef> photos, String findings, String comment, String recommendation) {}

    // the saved added parts, readable (findings and recommendation as text)
    public List<ExtraPartData> readExtraParts(String json)
    {
        if (json == null || json.isBlank())
            return List.of();
        List<ExtraPartData> parts = new ArrayList<>();
        for (JsonNode part : readOptions(json))
        {
            List<String> findings = new ArrayList<>();
            part.path("findings").forEach(f -> findings.add(f.asText()));
            String other = part.path("findingsOther").asText(null);
            findings.addAll(typed(other));
            String recommendation = part.path("recommendation").asText(null);
            String recommendationOther = part.path("recommendationOther").asText(null);
            parts.add(new ExtraPartData(part.path("name").asText(), photoRefs(part.path("photos").toString()),
                    findings.isEmpty() ? null : String.join(", ", findings),
                    part.path("comment").asText(null),
                    recommendation != null ? recommendation : recommendationOther));
        }
        return parts;
    }

    // ===================================================================== a saved answer, read back

    // text: one readable line or a few, for the PDF; data: the structure, for the review page
    public record Readable(String text, JsonNode data) {}

    // The data of a choice also lists every choice (the PDF draws each box, ticked or not) and, for a
    // single choice, whether it's a checklist row (remark) and which choices are non conforming; a
    // measure's carries its unit and drawing. A blank answer still gets them: a part partly filled in
    // shows its empty boxes, like the paper report.
    public Readable describe(CheckListItem item, String stored)
    {
        JsonNode options = readOptions(item.getOptions());
        boolean blank = stored == null || stored.isBlank();
        AnswerType type = item.getAnswerType();
        if (blank)
            return switch (type)
            {
                case SINGLE_CHOICE, MULTI_CHOICE -> new Readable(null, withChoices(mapper.createObjectNode(), options, type));
                case MEASURE -> {
                    ObjectNode empty = mapper.createObjectNode();
                    empty.putArray("readings");
                    empty.putNull("average");
                    empty.put("unit", options.path("unit").asText(null));
                    empty.put("drawing", options.path("drawing").asText(null));
                    empty.put("group", options.path("group").asText(null));
                    yield new Readable(null, empty);
                }
                case TABLE -> new Readable(null, tableData(mapper.createObjectNode().putArray("rows"), options));
                default -> new Readable(null, null);
            };
        return switch (type)
        {
            case DATE -> {
                try {
                    yield new Readable(LocalDate.parse(stored).format(DAY), mapper.getNodeFactory().textNode(stored));
                } catch (DateTimeParseException e) {
                    yield new Readable(stored, null);
                }
            }
            case SINGLE_CHOICE -> {
                JsonNode answer = readOptions(stored);
                String selected = answer.path("selected").asText(null);
                String other = answer.path("other").asText(null);
                yield new Readable(selected != null ? selected : other,
                        withChoices(answer.deepCopy(), options, type));
            }
            case MULTI_CHOICE -> {
                JsonNode answer = readOptions(stored);
                List<String> parts = new ArrayList<>();
                answer.path("selected").forEach(s -> parts.add(s.asText()));
                String other = answer.path("other").asText(null);
                parts.addAll(typed(other));
                yield new Readable(String.join(", ", parts), withChoices(answer.deepCopy(), options, type));
            }
            case MEASURE -> {
                ObjectNode answer = (ObjectNode) readOptions(stored).deepCopy();
                List<BigDecimal> readings = new ArrayList<>();
                answer.path("readings").forEach(r -> readings.add(r.decimalValue()));
                String unit = options.path("unit").asText(null);
                BigDecimal average = average(readings);
                answer.put("average", average);
                answer.put("unit", unit);
                answer.put("drawing", options.path("drawing").asText(null));
                answer.put("group", options.path("group").asText(null));
                boolean out = answer.path("out").asBoolean(false);
                answer.put("out", out);
                String suffix = unit == null ? "" : " " + unit;
                String list = String.join(" / ", readings.stream().map(StructuredAnswers::french).toList());
                yield new Readable(readings.isEmpty() ? null
                        : list + suffix + (readings.size() > 1 ? " — moyenne " + french(average) + suffix : "")
                          + (out ? " — hors tolérance" : ""), answer);
            }
            case PARTS_SUMMARY -> {
                JsonNode answer = readOptions(stored);
                List<String> lines = new ArrayList<>();
                for (JsonNode row : answer.path("rows"))
                {
                    StringBuilder line = new StringBuilder();
                    if (!row.path("quantity").isNull() && row.has("quantity"))
                        line.append(row.path("quantity").asInt()).append(" × ");
                    line.append(row.path("description").asText());
                    if (!row.path("code").isNull() && row.has("code"))
                        line.append(" (").append(row.path("code").asText()).append(")");
                    for (String field : List.of("recommendation", "decision", "remark"))
                        if (!row.path(field).isNull() && row.has(field))
                            line.append(" — ").append(row.path(field).asText());
                    lines.add(line.toString());
                }
                yield new Readable(String.join("\n", lines), answer);
            }
            case TABLE -> {
                JsonNode rows = readOptions(stored).path("rows");
                List<String> lines = new ArrayList<>();
                for (JsonNode row : rows)
                {
                    List<String> cells = new ArrayList<>();
                    for (JsonNode column : options.path("columns"))
                    {
                        String cell = cellText(row.get(column.path("key").asText()), column);
                        if (cell != null)
                            cells.add(column.path("label").asText() + " : " + cell);
                    }
                    lines.add(String.join(" — ", cells));
                }
                yield new Readable(String.join("\n", lines), tableData(rows, options));
            }
            default -> new Readable(stored, null);
        };
    }

    // a table for the PDF and the review page: { columns: [{ key, label, type }], rows: [[cell text, …]] },
    // each cell already as shown ("0,05", "06/10/2026"), in the columns' order
    private JsonNode tableData(JsonNode rows, JsonNode options)
    {
        ObjectNode data = mapper.createObjectNode();
        ArrayNode columns = data.putArray("columns");
        for (JsonNode column : options.path("columns"))
        {
            ObjectNode c = columns.addObject();
            c.put("key", column.path("key").asText());
            c.put("label", column.path("label").asText());
            c.put("type", column.path("type").asText("text"));
        }
        ArrayNode cells = data.putArray("rows");
        for (JsonNode row : rows)
        {
            ArrayNode line = cells.addArray();
            for (JsonNode column : options.path("columns"))
                line.add(cellText(row.get(column.path("key").asText()), column));
        }
        data.put("group", options.path("group").asText(null));
        return data;
    }

    // one cell as printed: numbers with a comma, dates as dd/MM/yyyy, null when empty
    private static String cellText(JsonNode cell, JsonNode column)
    {
        if (cell == null || cell.isNull() || cell.asText().isBlank())
            return null;
        String type = column.path("type").asText("text");
        if (type.equals("number") && cell.isNumber())
            return french(cell.decimalValue().stripTrailingZeros().scale() < 0
                    ? cell.decimalValue().setScale(0) : cell.decimalValue().stripTrailingZeros());
        if (type.equals("date"))
            try {
                return LocalDate.parse(cell.asText()).format(DAY);
            } catch (DateTimeParseException e) {
                return cell.asText();
            }
        return cell.asText();
    }

    // The values typed with « + Autre »: the web form ticks each like a listed choice and sends them as
    // one "other", joined by "; ". Read back, they're shown as choices of their own, ticked.
    public static List<String> typed(String other)
    {
        if (other == null || other.isBlank())
            return List.of();
        return java.util.Arrays.stream(other.split(";")).map(String::strip).filter(t -> !t.isEmpty()).toList();
    }

    // the question's choices, added to an answer's data: choices, and for a single choice remark / nonConforming
    private JsonNode withChoices(JsonNode data, JsonNode options, AnswerType type)
    {
        ObjectNode out = (ObjectNode) data;
        out.set("choices", options.path("choices").isArray() ? options.get("choices").deepCopy() : mapper.createArrayNode());
        out.put("allowOther", options.path("allowOther").asBoolean(false));
        if (type == AnswerType.SINGLE_CHOICE)
        {
            out.put("remark", options.path("remark").asBoolean(false));
            out.set("nonConforming", options.path("nonConforming").isArray() ? options.get("nonConforming").deepCopy() : mapper.createArrayNode());
        }
        return out;
    }

    // the mean of the readings, 3 decimals at most; null without readings
    static BigDecimal average(List<BigDecimal> readings)
    {
        if (readings.isEmpty())
            return null;
        BigDecimal sum = readings.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal mean = sum.divide(BigDecimal.valueOf(readings.size()), 3, RoundingMode.HALF_UP).stripTrailingZeros();
        return mean.scale() < 0 ? mean.setScale(0) : mean;
    }

    // "0,055": the site writes decimals with a comma
    private static String french(BigDecimal number)
    {
        return number == null ? "" : number.toPlainString().replace('.', ',');
    }

    // ===================================================================== small helpers

    private ArrayNode photosJson(List<PhotoRef> photos)
    {
        ArrayNode out = mapper.createArrayNode();
        for (PhotoRef p : photos)
        {
            ObjectNode node = out.addObject();
            node.put("imageId", p.imageId());
            node.put("title", p.title());
            node.put("comment", p.comment());
        }
        return out;
    }

    private JsonNode readAnswer(String raw, String where)
    {
        try {
            return mapper.readTree(raw);
        } catch (JsonProcessingException e) {
            throw new InvalidResponseException(where + "malformed answer");
        }
    }

    private BigDecimal number(JsonNode reading, String where)
    {
        if (reading.isNumber())
            return reading.decimalValue();
        String text = reading.asText("").strip().replace(',', '.');
        try {
            return new BigDecimal(text);
        } catch (NumberFormatException e) {
            throw new InvalidResponseException(where + "\"" + reading.asText() + "\" isn't a number");
        }
    }

    // a text field of an answer: stripped, null when blank, refused when too long
    private static String text(JsonNode node, int max, String what)
    {
        if (node == null || node.isNull())
            return null;
        return cut(blankToNull(node.asText()), max, what);
    }

    private static String cut(String value, int max, String what)
    {
        if (value != null && value.length() > max)
            throw new InvalidResponseException(what + " is longer than " + max + " characters");
        return value;
    }

    private static String blankToNull(String value)
    {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private List<String> stringList(JsonNode node, String what, int max)
    {
        if (node == null || node.isNull())
            return List.of();
        if (!node.isArray() || node.size() > max)
            throw new InvalidFormException(what + " must be a list of at most " + max + " texts");
        List<String> out = new ArrayList<>();
        for (JsonNode n : node)
        {
            if (!n.isTextual() || n.asText().isBlank())
                throw new InvalidFormException(what + " must only hold texts");
            out.add(n.asText().strip());
        }
        return out;
    }

    private static String optionalString(JsonNode options, String key, int position)
    {
        JsonNode node = options.get(key);
        if (node == null || node.isNull())
            return null;
        if (!node.isTextual())
            throw new InvalidFormException("item " + position + ": " + key + " must be a text");
        return node.asText();
    }

    private static void optionalBoolean(JsonNode options, String key, int position)
    {
        JsonNode node = options.get(key);
        if (node != null && !node.isNull() && !node.isBoolean())
            throw new InvalidFormException("item " + position + ": " + key + " must be true or false");
    }

    private static void optionalInt(JsonNode options, String key, int min, int max, int position)
    {
        JsonNode node = options.get(key);
        if (node != null && !node.isNull() && (!node.canConvertToInt() || node.asInt() < min || node.asInt() > max))
            throw new InvalidFormException("item " + position + ": " + key + " must be a whole number from " + min + " to " + max);
    }

    private String write(JsonNode node)
    {
        try {
            return mapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
