// THE DEVIS OF A WORKSHOP INTERVENTION (fix_workshop.md, step 10 "Valider besoins + envoyer devis").
// The Chef de projet prepares it from the technician's report, Sales gets the client's answer at
// step 11. An intervention may get several versions (a revised quote): version 1, 2, 3…
// It lists the parts to change with their prices (QuoteLine); its totals are kept here, in MAD:
// HT (the lines), the TVA (20 % unless the Chef de projet turned it off) and TTC.
package com.docuMind.backend.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.docuMind.backend.model.enums.QuoteStatus;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "quote",
    uniqueConstraints = @UniqueConstraint(name = "uk_quote_intervention_version", columnNames = {"intervention_id", "version"}),
    indexes = @Index(name = "idx_quote_intervention", columnList = "intervention_id, version"))
public class Quote {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false) // the Intervention it prices
    private String interventionId;

    @Column(nullable = false) // 1 for the first quote of the intervention, then 2, 3… for revisions
    private int version;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private QuoteStatus status = QuoteStatus.DRAFT;

    @Column(nullable = false) // the Chef de projet's email
    private String createdBy;

    @Column(columnDefinition = "TEXT")
    private String notes;

    // the parts, in order; replaced all at once by "Valider" (setLines)
    @OneToMany(mappedBy = "quote", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<QuoteLine> lines = new ArrayList<>();

    @Column // when the Chef de projet last pressed "Valider" on the devis page, null before
    private Instant validatedAt;

    // the standard Moroccan TVA, applied unless the Chef de projet turns it off for this quote.
    // The column defaults fill the rows that existed before VAT
    public static final BigDecimal DEFAULT_VAT_RATE = new BigDecimal("20.00");

    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean vatApplicable = true;

    @Column(nullable = false, precision = 5, scale = 2, columnDefinition = "numeric(5,2) default 20.00") // percent
    private BigDecimal vatRate = DEFAULT_VAT_RATE;

    // the three amounts below are recomputed from the lines (computeTotals); null while a line has no
    // price (the lines saved before prices existed)
    @Column(precision = 14, scale = 2) // HT: the lines' totals added up
    private BigDecimal subtotalAmount;

    @Column(precision = 14, scale = 2) // the TVA on the HT, 0 when not applicable
    private BigDecimal vatAmount;

    @Column(precision = 14, scale = 2) // TTC: HT + TVA, what the client pays
    private BigDecimal totalAmount;

    // ISO 4217 code of every amount of this quote. Always MAD for now; the default fills the rows
    // that existed before the column
    @Column(nullable = false, length = 3, columnDefinition = "varchar(3) default 'MAD'")
    private String currency = "MAD";

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;

    @Column // when it left DRAFT for Sales
    private Instant sentAt;

    protected Quote() {} // for JPA

    public Quote(String interventionId, int version, String createdBy)
    {
        this.interventionId = interventionId;
        this.version = version;
        this.createdBy = createdBy;
    }

    public String getId()                           { return id; }
    public String getInterventionId()               { return interventionId; }
    public int getVersion()                         { return version; }

    public QuoteStatus getStatus()                  { return status; }
    public void setStatus(QuoteStatus status)       { this.status = status; }

    public String getCreatedBy()                    { return createdBy; }

    public String getNotes()                        { return notes; }
    public void setNotes(String notes)              { this.notes = notes; }

    public Instant getCreatedAt()                   { return createdAt; }
    public Instant getUpdatedAt()                   { return updatedAt; }

    public Instant getValidatedAt()                 { return validatedAt; }
    public void setValidatedAt(Instant validatedAt) { this.validatedAt = validatedAt; }

    public List<QuoteLine> getLines()               { return Collections.unmodifiableList(lines); }
    // replaces every line, numbered 1, 2, 3… in the given order; same list object for orphanRemoval.
    // The total follows the lines
    public void setLines(List<QuoteLine> newLines)
    {
        lines.clear();
        for (QuoteLine line : newLines)
        {
            line.setQuote(this);
            line.setPosition(lines.size() + 1);
            lines.add(line);
        }
        computeTotals();
    }

    public void setVatApplicable(boolean vatApplicable)
    {
        this.vatApplicable = vatApplicable;
        computeTotals();
    }

    // HT = the lines' totals, TVA = HT × rate / 100 rounded to the centime (half up), TTC = HT + TVA.
    // All null if a line has no price
    private void computeTotals()
    {
        BigDecimal subtotal = BigDecimal.ZERO;
        for (QuoteLine line : lines)
        {
            BigDecimal lineTotal = line.getLineTotal();
            if (lineTotal == null)
            {
                subtotalAmount = vatAmount = totalAmount = null;
                return;
            }
            subtotal = subtotal.add(lineTotal);
        }
        subtotalAmount = subtotal.setScale(2, RoundingMode.HALF_UP);
        vatAmount = vatApplicable
            ? subtotalAmount.multiply(vatRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO.setScale(2);
        totalAmount = subtotalAmount.add(vatAmount);
    }

    public boolean isVatApplicable()                { return vatApplicable; }
    public BigDecimal getVatRate()                  { return vatRate; }
    public BigDecimal getSubtotalAmount()           { return subtotalAmount; }
    public BigDecimal getVatAmount()                { return vatAmount; }
    public BigDecimal getTotalAmount()              { return totalAmount; }
    public String getCurrency()                     { return currency; }

    public Instant getSentAt()                      { return sentAt; }
    public void setSentAt(Instant sentAt)           { this.sentAt = sentAt; }
}
