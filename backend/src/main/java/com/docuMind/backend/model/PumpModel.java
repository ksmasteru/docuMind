package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.PumpType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// one row per pump model PHOVA works on (OTW, PHB3…). Its documents (spec sheet, manuals, comparable pumps')
// are linked by model type in PumpModelDocument (table pump_model_document, plan_pump_manuals.md part B), which
// replaced the many-to-many `manuals` here (table pump_model_manuals): never used, and it couldn't say what a
// document is to the model.
@Entity
@Table(name = "pump_models")
public class PumpModel {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // !!! saving this an enum will cause a redoply if i want to add a new pump :)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, unique = true)
    private PumpType type;

    public PumpModel() {}

    public PumpModel(PumpType type) {
        this.type = type;
    }

    public String getId()                           { return id; }
    public void setId(String id)                    { this.id = id; }
    public PumpType getType()                       { return type; }
    public void setType(PumpType type)              { this.type = type; }
}
