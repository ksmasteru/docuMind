package com.docuMind.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.FormDraftDto;
import com.docuMind.backend.model.FormDraftSaveDto;
import com.docuMind.backend.services.FormDraftService;

// the forms a technician started but hasn't sent (form-draft-persistence.md): one draft per technician
// per form and task, only ever their own
@RestController
@RequestMapping("/api/v1/drafts")
public class DraftController {
    private final FormDraftService formDraftService;

    public DraftController(FormDraftService formDraftService)
    {
        this.formDraftService = formDraftService;
    }

    // GET /api/v1/drafts?templateId=…&taskId=… → 200 the draft, 204 when there's none
    @GetMapping
    public ResponseEntity<FormDraftDto> find(@RequestParam String templateId, @RequestParam(required = false) String taskId,
                                             Authentication caller)
    {
        FormDraftDto draft = formDraftService.findActiveFormDraft(caller.getName(), taskId, templateId);
        return draft == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(draft);
    }

    // PUT /api/v1/drafts { templateId, taskId, payload } → 200 the saved draft (its updatedAt)
    @PutMapping
    public ResponseEntity<FormDraftDto> save(@RequestBody FormDraftSaveDto draft, Authentication caller)
    {
        return ResponseEntity.ok(formDraftService.save(caller.getName(), draft.templateId(), draft.taskId(), draft.payload()));
    }

    // DELETE /api/v1/drafts?templateId=…&taskId=… → 204, whether there was one or not
    @DeleteMapping
    public ResponseEntity<Void> delete(@RequestParam String templateId, @RequestParam(required = false) String taskId,
                                       Authentication caller)
    {
        formDraftService.delete(caller.getName(), templateId, taskId);
        return ResponseEntity.noContent().build();
    }
}
