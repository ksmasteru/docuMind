package com.docuMind.backend.services;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Prompt 2.2: the model follows each fact it takes from an excerpt with that excerpt's number in brackets,
// « Vidanger toutes les 4000 heures [2]. ». This reads those numbers, takes them out of the text, and says
// which excerpts the answer used; the sources shown under the answer are built from them, never from a list
// the model writes (2026-11-24 baseline: 9 answers out of 40 copied the prompt's « sources : fichier1 »
// template, 13 marked excerpts as used while saying « connaissances générales »).
final class AnswerCitations {

    private AnswerCitations() {}

    // [2], [2][5], [2, 5], [2; 5]: digits only, so « [à compléter] » or « [0,05 mm] » stay as they are
    private static final Pattern MARKER = Pattern.compile("[ \\t]?\\[(\\d{1,3}(?:\\s*[,;]\\s*\\d{1,3})*)\\]");
    // the closing lines prompt 2.1 asked for: a model that still writes them doesn't get them shown
    private static final Pattern CLOSING_LINE = Pattern.compile("^\\s*(sources?|chunks?)\\s*:(.*)$", Pattern.CASE_INSENSITIVE);

    // text: the answer without the markers and the closing lines.
    // cited: the excerpts cited, 0-based, in the order they're first cited.
    // modelSources: what the model wrote on a « sources : » line, or null; only a fallback when it cited nothing.
    record Parsed(String text, List<Integer> cited, String modelSources) {}

    // excerptCount: how many excerpts were sent, numbered [1]..[excerptCount]. A bracket holding a number
    // outside that range isn't a citation and stays in the text.
    static Parsed parse(String answer, int excerptCount)
    {
        List<String> lines = new ArrayList<>(List.of(answer.strip().split("\\R", -1)));
        String modelSources = null;
        // the closing lines, from the bottom up, blank lines between them included
        while (!lines.isEmpty())
        {
            String last = lines.get(lines.size() - 1);
            Matcher closing = CLOSING_LINE.matcher(last);
            if (last.isBlank())
                lines.remove(lines.size() - 1);
            else if (closing.matches())
            {
                if (closing.group(1).toLowerCase().startsWith("source") && modelSources == null)
                    modelSources = closing.group(2).strip();
                lines.remove(lines.size() - 1);
            }
            else
                break;
        }

        Set<Integer> cited = new LinkedHashSet<>();
        List<String> cleaned = new ArrayList<>();
        for (String line : lines)
        {
            int indent = 0;
            while (indent < line.length() && Character.isWhitespace(line.charAt(indent)))
                indent++;
            String body = line.substring(indent);
            Matcher marker = MARKER.matcher(body);
            StringBuilder out = new StringBuilder();
            boolean removed = false;
            while (marker.find())
            {
                List<Integer> numbers = numbersIn(marker.group(1));
                boolean allValid = numbers.stream().allMatch(n -> n >= 1 && n <= excerptCount);
                if (allValid)
                {
                    numbers.forEach(n -> cited.add(n - 1));
                    marker.appendReplacement(out, "");
                    removed = true;
                }
                else
                    marker.appendReplacement(out, Matcher.quoteReplacement(marker.group()));
            }
            marker.appendTail(out);
            String text = out.toString();
            if (removed)
                // « heures [2]. » -> « heures. », and no double or trailing space left by a marker
                text = text.replaceAll("[ \\t]+([.,;:!?)])", "$1").replaceAll("(\\S)[ \\t]{2,}", "$1 ").strip();
            cleaned.add(line.substring(0, indent) + text);
        }
        return new Parsed(String.join("\n", cleaned).strip(), new ArrayList<>(cited), modelSources);
    }

    private static List<Integer> numbersIn(String group)
    {
        List<Integer> numbers = new ArrayList<>();
        for (String part : group.split("\\s*[,;]\\s*"))
            numbers.add(Integer.parseInt(part.strip()));
        return numbers;
    }
}
