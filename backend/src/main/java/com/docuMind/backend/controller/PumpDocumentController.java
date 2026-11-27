package com.docuMind.backend.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.PumpDocumentViews.ModelDocument;
import com.docuMind.backend.model.PumpDocumentViews.ResolvedModel;
import com.docuMind.backend.model.PumpDocumentViews.SpecSheet;
import com.docuMind.backend.model.enums.PumpType;
import com.docuMind.backend.services.PumpDocumentService;
import com.docuMind.backend.services.SpecSheetService;

// What everyone reads about the documents of the pump models (plan_pump_manuals.md part B); any logged-in user.
// The changes are the admin's, under /api/admin (AdminDocumentController).
@RestController
public class PumpDocumentController {

    private final PumpDocumentService pumpDocuments;
    private final SpecSheetService specSheets;

    public PumpDocumentController(PumpDocumentService pumpDocuments, SpecSheetService specSheets)
    {
        this.pumpDocuments = pumpDocuments;
        this.specSheets = specSheets;
    }

    // GET /api/v1/pump-models: the models a document can be ticked for (« Importer », « Documents »)
    @GetMapping("/api/v1/pump-models")
    public List<PumpType> models()
    {
        return pumpDocuments.models();
    }

    // GET /api/v1/pump-models/{model}/documents: its sheet, PHOVA's documents, the comparable pumps' manuals
    // (the pump page's « Documentation » tab)
    @GetMapping("/api/v1/pump-models/{model}/documents")
    public List<ModelDocument> documents(@PathVariable String model)
    {
        return pumpDocuments.documentsOf(PumpDocumentService.parseModel(model));
    }

    // GET /api/v1/pump-models/resolve?equipment=PHB3-J-07: the model of a task's equipment
    @GetMapping("/api/v1/pump-models/resolve")
    public ResolvedModel resolve(@RequestParam String equipment)
    {
        return pumpDocuments.resolve(equipment);
    }

    // GET /api/v1/specs: every model's spec sheet (« Fiches techniques »), one entry per model even without one
    @GetMapping("/api/v1/specs")
    public List<SpecSheet> specs()
    {
        return specSheets.all();
    }

    // GET /api/v1/specs/{model}: one model's (the pump page's « Fiche » tab, the task page's chip)
    @GetMapping("/api/v1/specs/{model}")
    public SpecSheet spec(@PathVariable String model)
    {
        return specSheets.of(PumpDocumentService.parseModel(model));
    }
}
