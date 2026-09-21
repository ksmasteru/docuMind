package com.docuMind.backend.model;

// fileId comes from the data visualizer page — the id of whichever file is
// currently selected there. Optional: when absent, retrieval falls back to
// searching across all of the user's documents.
public record AskRequest(String question, String fileId) {}
