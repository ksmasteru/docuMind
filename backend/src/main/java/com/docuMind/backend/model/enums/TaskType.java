// MAITENANCE : ROUTINE (B7AL VISITE TECHNIQUE)
// PREVENTIVE : WS3. NEW
// CORRECTIVE : DEJA KAYNA 
package com.docuMind.backend.model.enums;
public enum TaskType{
    MAINTENANCE,
    PREVENTIVE,
    CORRECTIVE,
    VERIFICATION // the check of an alert before acting on it (levée de doute): sent from its alert, never from /task/new
}