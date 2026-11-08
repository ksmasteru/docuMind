// ONE LINE OF A DEVIS: a part to change, how many, and its unit price. Saved with its quote
// (cascade), in the order the Chef de projet entered them. The line's total is quantity × unit price.
package com.docuMind.backend.model;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "quote_line")
public class QuoteLine {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quote_id", nullable = false)
    private Quote quote;

    @Column(nullable = false) // 1, 2, 3… set by Quote.setLines
    private int position;

    @Column(nullable = false) // the part: "Garniture mécanique", "Roulement 6309"…
    private String designation;

    @Column(nullable = false) // at least 1
    private int quantity;

    // in the quote's currency (MAD), 2 decimals. Nullable in the table only for the lines saved
    // before prices existed; every "Valider" sends one (QuoteLinesDto)
    @Column(precision = 12, scale = 2)
    private BigDecimal unitPrice;

    protected QuoteLine() {} // for JPA

    public QuoteLine(String designation, int quantity, BigDecimal unitPrice)
    {
        this.designation = designation;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
    }

    public String getId()                       { return id; }
    public Quote getQuote()                     { return quote; }
    void setQuote(Quote quote)                  { this.quote = quote; }
    public int getPosition()                    { return position; }
    void setPosition(int position)              { this.position = position; }
    public String getDesignation()              { return designation; }
    public int getQuantity()                    { return quantity; }
    public BigDecimal getUnitPrice()            { return unitPrice; }

    // quantity × unit price, null while the line has no price
    public BigDecimal getLineTotal()
    {
        return unitPrice == null ? null : unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}
