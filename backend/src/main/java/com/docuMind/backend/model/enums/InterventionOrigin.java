package com.docuMind.backend.model.enums;

// the two ways into the workshop loop; both start at COMPLETER_DEMANDE with Sales
public enum InterventionOrigin {
    CLIENT, // the client asked Sales (by phone or e-mail); Sales created the request
    ALERT   // a manager sent the pump from an alert ("Envoyer en atelier")
}
