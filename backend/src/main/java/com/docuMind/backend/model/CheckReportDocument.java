package com.docuMind.backend.model;

import java.util.List;

// What templates/check-report.html prints: one round of a check report (levée de doute), every value
// already in French and formatted (CheckPdfService). Photos are JPEG data URIs; a photo the PDF can't
// read (WebP) is left out and counted in missingPhotos.
public record CheckReportDocument(
    String heading,        // "Rapport de levée de doute" | "Signalement de panne"
    long alertNumber,
    String alert,          // what the alert said ("Température palier élevée"), null if nothing
    String pumpId,
    String site,           // null when unknown
    String technician,     // his name, his email when he has none
    boolean selfAssigned,  // he started it himself
    String sentAt,         // "12/11/2026 14:32", site time
    int round,             // 1, or more when it was sent back and sent again
    String arrival,        // "En marche", null if not said
    String timeOnSite,     // "1 h 05", null when no time was counted
    Verdict verdict,
    List<Measure> measures,
    List<Point> points,
    List<Section> sections,
    NextStep next,         // null unless the alert is confirmed
    int missingPhotos,
    String reference)      // the report's id
{
    // tone: "ok" | "warn" | "crit", the template's colours
    public record Verdict(String label, String tone, String why, boolean urgentStop, String comment) {}

    // a measure point: the system's reading against the one taken on site
    public record Measure(String label, String unit, String twin, String site, String limits, String tone) {}

    public record Point(int number, String label, String result, String tone, String reading, String comment,
                        List<String> photos) {}

    public record Section(String title, String comment, List<String> photos) {}

    // canHandle: he can do the repair (estimate, parts); otherwise why not
    public record NextStep(boolean canHandle, String message, String estimate, String parts, String reason,
                           String reasonComment) {}
}
