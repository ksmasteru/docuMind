package com.docuMind.backend.model.enums;


// USER == TECHNICIAN .
// The roles after USER act in the workshop loop (fix_workshop.md); each person has one role.
// All of them are declared now: Hibernate's check constraint on users.role only knows the values
// of the day the table was created, so every new value means dropping it by hand once.
public enum  UserRole {
    ADMIN,
    MANAGER,
    USER,
    SALES,          // Client / Sales: takes the client's or the manager's request, the client's decision on the quote
    BUSINESS_OPS,   // Business Operations Manager
    CONTRACT_ADMIN, // Contract Admin
    PROJECT_LEAD,   // Chef de projet / Préparateur
    WORKSHOP_LEAD,  // Pumps Maintenance Lead (not the field MANAGER)
    HSE,
    STOREKEEPER,    // Magasinier
    QUALITY,        // Quality & Reliability Team
    BILLING         // Responsable facturation
}
