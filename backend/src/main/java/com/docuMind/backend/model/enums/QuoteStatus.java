package com.docuMind.backend.model.enums;

// where a quote (devis) is. All declared now, like UserRole: Hibernate writes the column's check
// constraint once, from the values of the day the table is created, and never updates it.
public enum QuoteStatus {
    DRAFT,      // the Chef de projet is preparing it (step 10)
    SENT,       // sent to Sales for the client (step 10 validated)
    ACCEPTED,   // the client accepted it (step 11, entered by Sales)
    REFUSED,    // the client refused it (step 11)
    CANCELED    // replaced by a newer version, or the intervention was cancelled
}
