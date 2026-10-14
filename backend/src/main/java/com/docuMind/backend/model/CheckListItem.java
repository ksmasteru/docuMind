package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.AnswerType;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
// this represents the question on the checklist form
@Entity
public class CheckListItem{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // this is the foreign key that links this to a checkListTemplate
    // i need to tell hibernate 
    @ManyToOne(fetch = FetchType.LAZY)
    //@ManyToOne means many items belong to one template 
    // You read it from the item's point of view: 
    // "many of me, one of you".
    @JoinColumn(name = "template_id", nullable=false)
    //@JoinColumn(name = "template_id") tells Hibernate 
    //to create the template_id column from Step 1 in this table.
    @JsonIgnore // prevents infinite loop when sending JSON.
    private CheckListTemplate template;

    @Column(nullable=false)
    private int position;
    
    @Column
    private String labelAr;
    
    @Column
    private String labelFr;

    @Column
    private boolean critical = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable=false)
    private AnswerType answerType;

    public String getId()                           { return id; }
    public void setId(String id)                    { this.id = id; }

    public CheckListTemplate getTemplate()          { return template; }
    public void setTemplate(CheckListTemplate template) { this.template = template; }

    public int getPosition()                        { return position; }
    public void setPosition(int position)              { this.position = position; }

    public String getLabelAr()                      { return labelAr; }
    public void setLabelAr(String labelAr)          { this.labelAr = labelAr; }

    public String getLabelFr()                      { return labelFr; }
    public void setLabelFr(String labelFr)          { this.labelFr = labelFr; }

    public boolean isCritical()                     { return critical; }
    public void setCritical(boolean critical)       { this.critical = critical; }

    public AnswerType getAnswerType()               { return answerType; }
    public void setAnswerType(AnswerType answerType) { this.answerType = answerType; }
}