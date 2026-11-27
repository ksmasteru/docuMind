package com.docuMind.backend.controller;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.FileNotFoundException;
import com.docuMind.backend.exception.RecordNotFoundException;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.model.FileResponse.FileInfo;
import com.docuMind.backend.model.PumpDocumentViews.ModelLinksForm;
import com.docuMind.backend.model.PumpDocumentViews.SpecSheet;
import com.docuMind.backend.model.PumpDocumentViews.SpecTextForm;
import com.docuMind.backend.services.DocumentService;
import com.docuMind.backend.services.PumpDocumentService;
import com.docuMind.backend.services.SpecSheetService;

// The admin's changes to the documents of the pump models (plan_pump_manuals.md part B). Everything under
// /api/admin is refused to other roles by SecurityConfig.
@RestController
@RequestMapping("/api/admin")
public class AdminDocumentController {

    private final DocumentService documentService;
    private final PumpDocumentService pumpDocuments;
    private final SpecSheetService specSheets;

    public AdminDocumentController(DocumentService documentService, PumpDocumentService pumpDocuments,
        SpecSheetService specSheets)
    {
        this.documentService = documentService;
        this.pumpDocuments = pumpDocuments;
        this.specSheets = specSheets;
    }

    // PUT /api/admin/files/{id}/models { models: ["OTW"], kind: "COMPARABLE" }: the models a document serves, as
    // ticked on « Documents »; its spec-sheet links stay as they are
    @PutMapping("/files/{id}/models")
    public FileInfo setModels(@PathVariable String id, @RequestBody ModelLinksForm form, Authentication caller)
    {
        FileEntity file;
        try {
            file = documentService.getFileMetaData(id);
        }
        catch (FileNotFoundException ex) {
            throw new RecordNotFoundException("Document introuvable : " + id);
        }
        var links = pumpDocuments.setModels(id, pumpDocuments.parseModels(form.models() == null ? List.of() : form.models()),
            PumpDocumentService.parseKind(form.kind()), caller.getName());
        return new FileInfo(file.getId(), file.getName(), file.getSize(), file.getUserId(), links);
    }

    // PUT /api/admin/specs/{model} { text }: a new text for the model's sheet (« Modifier », or « Ajouter » for a
    // model without one)
    @PutMapping("/specs/{model}")
    public SpecSheet saveSpecText(@PathVariable String model, @RequestBody SpecTextForm form, Authentication caller)
    {
        return specSheets.saveText(PumpDocumentService.parseModel(model), form.text(), caller.getName());
    }

    // POST /api/admin/specs/{model}/file: a .txt, .md or .pdf in place of the sheet (« Remplacer »)
    @PostMapping(value = "/specs/{model}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SpecSheet replaceSpecFile(@PathVariable String model, @RequestParam("file") MultipartFile file,
        Authentication caller)
    {
        return specSheets.replaceWithFile(PumpDocumentService.parseModel(model), file, caller.getName());
    }
}
