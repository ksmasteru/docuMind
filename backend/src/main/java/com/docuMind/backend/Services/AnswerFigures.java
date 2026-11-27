package com.docuMind.backend.services;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// The figures an answer states, to be found in the excerpts it was sent (plan_pump_manuals.md §6): the server
// labels a figure taken from another pump's manual, or found in no excerpt, whatever the model wrote (the
// 2026-11-24 baseline: 7 answers out of 40 gave another pump's figure as this one's, 2 a « typical » one).
// A figure is what a technician would apply: a number with a unit (« 70 °C », « 0,05 mm », « 4 000 h »), or a
// decimal. A bare count (« 3 mesures », « étape 2 ») isn't checked: it would only raise false alarms.
final class AnswerFigures {

    private AnswerFigures() {}

    // shown: as the answer wrote it, with its unit; value: the number as compared (« 4 000 » -> 4000, « 0,05 » -> 0.05)
    record Figure(String shown, String value) {}

    // longest first, so « mm/s » wins over « mm » and « m3/h » over « m »
    private static final String UNIT = "(?:mm/s|m3/h|m³/h|l/min|l/s|l/h|tr/min|r/min|rpm|mbar|bar|kpa|mpa|psi|"
        + "°\\s?c|°\\s?f|°|µm|um|mm|cm|m3|m³|m|kw|kv|hz|n\\.m|nm|dan\\.m|kg|cst|ssu|db|ppm|%|heures?|hours?|h|min|s)";
    // a number not glued to a word or another number (« PHB3 », « M12 », « 2.4.1 » are not figures);
    // « 4 000 » or « 4 000 » (thin space) is one number
    private static final Pattern NUMBER = Pattern.compile(
        "(?<![\\p{L}\\d.,/-])(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+(?![\\d])|\\d+(?:[.,]\\d+)?)");
    private static final Pattern UNIT_AFTER = Pattern.compile("^[ \\u00a0\\u202f]?" + UNIT + "(?![\\p{L}\\d])",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern THOUSANDS = Pattern.compile("(\\d)[ \\u00a0\\u202f](\\d{3})(?!\\d)");

    // the figures of `text`, each once, leaving out those whose value appears in `known` (the question and the
    // equipment: « pression 6 bar ? » answered « 6 bar » isn't the answer's own figure)
    static List<Figure> in(String text, String known)
    {
        List<String> knownValues = valuesIn(known == null ? "" : known);
        Map<String, Figure> found = new LinkedHashMap<>();
        Matcher number = NUMBER.matcher(text);
        while (number.find())
        {
            String raw = number.group(1);
            Matcher unit = UNIT_AFTER.matcher(text.substring(number.end()));
            boolean hasUnit = unit.find(); // anchored at the start: a unit right after the number, or none
            boolean decimal = raw.matches("\\d+[.,]\\d+");
            if (!hasUnit && !decimal)
                continue;
            String value = valueOf(raw);
            if (knownValues.contains(value) || found.containsKey(value))
                continue;
            String shown = hasUnit ? raw + unit.group() : raw;
            found.put(value, new Figure(shown.replaceAll("[ \\u00a0\\u202f]+", " ").strip(), value));
        }
        return new ArrayList<>(found.values());
    }

    // whether an excerpt states this value (« 4000 », « 4 000 », « 4,000 » in an English table? no: a comma
    // between digits is a decimal mark here, as in the French and ISO documents)
    static boolean states(String excerpt, Figure figure)
    {
        String normalized = normalize(excerpt);
        return Pattern.compile("(?<![\\d.])" + Pattern.quote(figure.value()) + "(?!\\d|\\.\\d)").matcher(normalized).find();
    }

    private static List<String> valuesIn(String text)
    {
        List<String> values = new ArrayList<>();
        Matcher number = NUMBER.matcher(text);
        while (number.find())
            values.add(valueOf(number.group(1)));
        return values;
    }

    private static String valueOf(String raw)
    {
        return raw.replaceAll("[ \\u00a0\\u202f]", "").replace(',', '.');
    }

    private static String normalize(String text)
    {
        String joined = text;
        String previous;
        do {
            previous = joined;
            joined = THOUSANDS.matcher(joined).replaceAll("$1$2");
        } while (!joined.equals(previous));
        return joined.replaceAll("(\\d),(\\d)", "$1.$2");
    }
}
