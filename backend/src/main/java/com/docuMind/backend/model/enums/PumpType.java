package com.docuMind.backend.model.enums;

// finish all the pumps phova have here
public enum PumpType{
    OTW,
    OTC,
    OTS,
    PHB2,
    PHB3,
    PHH
    // HDX was here until 2026-11-24: it is the Flowserve pump behind the PHB2, not a PHOVA model
    // (plan_pump_manuals.md, question 1; scripts/hdx_removed.sql moves what the database still says)
}