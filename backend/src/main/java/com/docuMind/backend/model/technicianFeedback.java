package com.docuMind.backend.model;

public record technicianFeedback(
    String interactionId,
    String verdict,
    String correction
){}