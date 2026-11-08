package com.docuMind.backend.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.docuMind.backend.model.enums.QuoteStatus;

// response for one quote: what the devis page shows
public record QuoteDetails(
    String id,
    String number,              // "DV-00001-1": the intervention's number, then the version
    String interventionId,
    String interventionNumber,  // "AT-00001"
    String equipmentId,
    String client,
    int version,
    QuoteStatus status,
    String createdBy,
    String notes,
    Instant createdAt,
    Instant updatedAt,
    Instant validatedAt,        // the last "Valider" on the devis page, null before
    Instant sentAt,
    List<Line> lines,
    boolean vatApplicable,      // TVA applied (the default)
    BigDecimal vatRate,         // percent, 20.00
    BigDecimal subtotalAmount,  // HT: the lines' totals added up
    BigDecimal vatAmount,       // the TVA, 0.00 when not applicable
    BigDecimal totalAmount,     // TTC: HT + TVA. The three amounts are null while a line has no price
    String currency,            // "MAD"
    boolean canEdit)            // the caller may change the lines (Chef de projet, step 10 taken, DRAFT)
{
    // unitPrice / lineTotal: null for a line saved before prices existed
    public record Line(String id, int position, String designation, int quantity,
                       BigDecimal unitPrice, BigDecimal lineTotal) {
        public static Line from(QuoteLine line) {
            return new Line(line.getId(), line.getPosition(), line.getDesignation(), line.getQuantity(),
                    line.getUnitPrice(), line.getLineTotal());
        }
    }

    public static QuoteDetails from(Quote quote, Intervention intervention, boolean canEdit) {
        Long operation = intervention.getOperationNumber();
        String number = operation == null ? null : String.format("DV-%05d-%d", operation, quote.getVersion());
        return new QuoteDetails(quote.getId(), number, quote.getInterventionId(), InterventionDetails.number(intervention),
                intervention.getEquipmentId(), intervention.getClient(), quote.getVersion(), quote.getStatus(),
                quote.getCreatedBy(), quote.getNotes(), quote.getCreatedAt(), quote.getUpdatedAt(), quote.getValidatedAt(),
                quote.getSentAt(), quote.getLines().stream().map(Line::from).toList(),
                quote.isVatApplicable(), quote.getVatRate(), quote.getSubtotalAmount(), quote.getVatAmount(),
                quote.getTotalAmount(), quote.getCurrency(), canEdit);
    }
}
