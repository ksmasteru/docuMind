package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.ExpertiseReportV2.Field;
import com.docuMind.backend.model.ExpertiseReportV2.Photo;
import com.docuMind.backend.model.ExpertiseReportV2.Tile;

/*
The intervention's final file (step 18 / 19, "Dossier final"), templates/expertise-dossier.html: one PDF
the client keeps, built by ExpertiseDossierService from the intervention, its démontage and montage
reports and its devis (report_pdf.md, idea 7):

  cover        the pump before and after, the intervention's identity, the verdict
  contents
  1 Synthèse   key figures, what was done to each part, the milestones
  2 Avant / après   the photos side by side, the measures at démontage against those at remontage
  3 Devis
  4 Rapport de démontage, 5 Rapport de montage   the two reports, as their own PDFs lay them out
  6 Historique et validation   every step's decision, the signatures

A report or the devis may be missing (the file is generated before the montage, say): its part then says so.
*/
public record ExpertiseDossier(
    String interventionNumber,     // "AT-00002"
    String equipment,
    String pumpType,
    String client,
    String generatedAt,
    String currentStep,            // "19 · Dossier final + livraison"
    String verdict,
    String verdictDetail,
    String tone,                   // the verdict's colour (ExpertiseReportV2 tones)
    List<Field> facts,             // the cover's identity table
    List<Tile> tiles,
    Photo before,                  // the cover: the pump at reception / once assembled
    Photo after,
    List<PhotoPair> beforeAfter,
    List<Photo> changedParts,      // the montage's « Pièces changées / réparées »
    String changedPartsComment,
    List<PartWork> work,
    List<ComparisonGroup> comparisons,
    QuoteView quote,               // null without a devis
    ExpertiseReportV2 dismantling, // null without a démontage report
    ExpertiseReportV2 mounting,    // null without a montage report
    List<Milestone> milestones,
    List<TimelineRow> timeline,
    List<Signature> signatures)
{
    public record PhotoPair(Photo before, Photo after) {}

    // a part: its state at the démontage, what was recommended, the client's decision (synthèse)
    public record PartWork(String name, String state, String tone, String findings, String recommendation, String decision) {}

    public record ComparisonGroup(String name, String unit, List<ComparisonRow> rows) {}

    // trend: up | down | same | none (one of the two is missing); beforeOut / afterOut: marked « hors tolérance »
    public record ComparisonRow(String mark, String before, String after, String delta, String trend,
                                boolean beforeOut, boolean afterOut) {}

    public record QuoteView(String number, String status, String validatedAt, List<QuoteLineView> lines,
                            String subtotal, String vatRate, String vat, String total, String currency,
                            boolean vatApplicable, String notes) {}

    public record QuoteLineView(int position, String designation, int quantity, String unitPrice, String total) {}

    public record Milestone(String label, String date, String actor, boolean done) {}

    // tone: reuse (validated), replace (returned / cancelled), info (created, assigned)
    public record TimelineRow(String date, String step, String action, String actor, String comment, String tone) {}

    public record Signature(String role, String name, String date) {}
}
