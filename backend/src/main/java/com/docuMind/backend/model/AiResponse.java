package com.docuMind.backend.model;

import java.util.List;

// sources: the documents the answer took facts from, built by the server from the excerpts the model cited
// (« [2] » in its text, prompt 2.2), never from a list the model writes. generalPractice: part of the answer
// (or all of it) comes from general practice, which no document confirms.
// scope, pumpModel (plan_pump_manuals.md part C): what the answer was searched in (MANUALS, NO_MANUAL, NO_MODEL)
// for which model (null when not known). warnings: the labels the server puts on the answer, whatever the model
// wrote: another pump's figures, figures found in no document.
// All of these are empty for the endpoints that only transcribe (/ask/image, /transcribe), which keep the
// three-field constructor.
public record AiResponse(
    List<chatAnswer> answer,
    String askInteractionId,
    int answerCount,
    List<Source> sources,
    boolean generalPractice,
    String scope,
    String pumpModel,
    List<Warning> warnings
)
{
    public AiResponse(List<chatAnswer> answer, String askInteractionId, int answerCount)
    {
        this(answer, askInteractionId, answerCount, List.of(), false, null, null, List.of());
    }

    public AiResponse(List<chatAnswer> answer, String askInteractionId, int answerCount, List<Source> sources,
        boolean generalPractice)
    {
        this(answer, askInteractionId, answerCount, sources, generalPractice, null, null, List.of());
    }

    public record chatAnswer(
        String key,
        String answer
   ){}

    // fileId opens the document (GET /api/v1/files/id/{fileId}); title is the document's name in the library.
    // kind: what it is to the pump asked about: SPEC (its spec sheet), OWN (a PHOVA document on it), COMPARABLE (a
    // comparable pump's manual), OTHER (another model's documentation: models says which), GENERAL (no model).
    public record Source(
        String fileId,
        String title,
        String kind,
        List<String> models
    ){}

    // kind COMPARABLE / OTHER: figures (possibly none, for a procedure) taken from a document that isn't the pump's
    // own; document, fileId and models say which. UNDOCUMENTED: figures found in none of the excerpts sent.
    // linkKind, for OTHER: what the document is to those models (SPEC, OWN, COMPARABLE), so a comparable pump's manual
    // isn't shown as that model's documentation; null otherwise.
    public record Warning(
        String kind,
        List<String> figures,
        String document,
        String fileId,
        List<String> models,
        String linkKind
    ){
        public Warning(String kind, List<String> figures, String document, String fileId, List<String> models)
        {
            this(kind, figures, document, fileId, models, null);
        }
    }
}
