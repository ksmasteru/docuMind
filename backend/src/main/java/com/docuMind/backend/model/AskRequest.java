package com.docuMind.backend.model;

// fileId comes from the data visualizer page — the id of whichever file is
// currently selected there. Optional: when absent, retrieval falls back to
// searching across all of the user's documents.
// equipment: the equipment of the task the question is asked from (the task page's « Ask » tab): its model
// (registry, else the model its code starts with) picks the pump's documents (plan_pump_manuals.md part C).
// pumpModel: the model chosen on the « Assistant » page (OTW, PHB3…); it wins over the equipment's.
// Both optional: without either, the whole library is searched and the answer says the pump isn't known.
public record AskRequest(String question, String fileId, String equipment, String pumpModel)
{
    public AskRequest(String question, String fileId, String equipment)
    {
        this(question, fileId, equipment, null);
    }
}
