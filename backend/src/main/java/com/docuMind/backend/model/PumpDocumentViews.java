package com.docuMind.backend.model;

import java.time.Instant;
import java.util.List;

import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.LinkOrigin;
import com.docuMind.backend.model.enums.PumpType;

// What the « Importer », « Documents », « Fiches techniques » and pump pages read and send about the documents
// tied to pump models (PumpDocumentService, SpecSheetService; plan_pump_manuals.md part B).
public final class PumpDocumentViews {
    private PumpDocumentViews() {}

    // one model a document is ticked for, and what the document is to it
    public record ModelLink(PumpType model, DocumentKind kind)
    {
        public static ModelLink of(PumpModelDocument link)
        {
            return new ModelLink(link.getModel(), link.getKind());
        }
    }

    // one document of a model, for the pump page's « Documentation » tab
    public record ModelDocument(String fileId, String title, long size, String contentType, DocumentKind kind)
    {
        public static ModelDocument of(FileEntity file, DocumentKind kind)
        {
            return new ModelDocument(file.getId(), file.getName(), file.getSize(), file.getContentType(), kind);
        }
    }

    // a model's spec sheet. Without one, everything but `model` is null.
    // text: the sheet itself for a .txt / .md one; null for a PDF, which the page opens by fileId instead.
    public record SpecSheet(PumpType model, String fileId, String title, String contentType, String text,
                            LinkOrigin origin, String changedBy, Instant changedAt)
    {
        public static SpecSheet none(PumpType model)
        {
            return new SpecSheet(model, null, null, null, null, null, null, null);
        }
    }

    // where a model comes from for an equipment: REGISTRY (the registered pump's model) or CODE (the model its
    // code starts with, « OTW-JORF-01 »); model null when neither says
    public record ResolvedModel(String equipment, PumpType model, String source) {}

    // PUT /api/admin/files/{id}/models: the models ticked, and whether the document is PHOVA's (OWN) or a
    // comparable pump's manual (COMPARABLE). An empty list unties it from every model (spec sheets aside).
    public record ModelLinksForm(List<String> models, String kind) {}

    // PUT /api/admin/specs/{model}: the new text of the sheet
    public record SpecTextForm(String text) {}
}
