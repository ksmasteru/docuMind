package com.docuMind.backend.model.enums;

// computed by the server, never sent by the client
public enum SubmissionStatus {
    DRAFT,          // later: saved but not sent
    CONFORME,       // no critical item answered MAUVAIS
    NON_CONFORME,   // at least one critical item answered MAUVAIS
    VALIDATED       // later: permit co-signed by a supervisor
}
