package com.docuMind.backend.model;

import java.util.ArrayList;
import java.util.List;

import com.docuMind.backend.model.enums.PumpType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;

// one row per pump model PHOVA works on (OTW, PHB3…), with its manuals
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

    // a manual can serve several models, and a model has several manuals,
    // so the link lives in its own table: pump_model_manuals(pump_model_id, file_id)
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "pump_model_manuals",
        joinColumns = @JoinColumn(name = "pump_model_id"),
        inverseJoinColumns = @JoinColumn(name = "file_id")
    )
    private List<FileEntity> manuals = new ArrayList<>();

    public PumpModel() {}

    public PumpModel(PumpType type) {
        this.type = type;
    }

    public String getId()                           { return id; }
    public void setId(String id)                    { this.id = id; }
    public PumpType getType()                       { return type; }
    public void setType(PumpType type)              { this.type = type; }
    public List<FileEntity> getManuals()            { return manuals; }
    public void setManuals(List<FileEntity> manuals) { this.manuals = manuals; }
}
