package com.docuMind.backend.controller;

import com.docuMind.backend.model.TicketSummary;

import org.springframework.web.bind.annotation.PostMapping;

import org.springframework.web.bind.annotation.PathVariable;

import org.springframework.http.HttpStatus;

import java.util.List;

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
// per form and task, only ever their own. The control sheets opened outside a task are tickets instead:
// several per form, each found by its id (FormDraftService.isTicket)
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

    // ---------------------------------------------------------------- tickets (control sheets outside a task)

    // GET /api/v1/drafts/tickets → the caller's « Fiches en cours », last edited first
    @GetMapping("/tickets")
    public ResponseEntity<List<TicketSummary>> tickets(Authentication caller)
    {
        return ResponseEntity.ok(formDraftService.tickets(caller.getName()));
    }

    // POST /api/v1/drafts/tickets { templateId, payload, label } → 201 the new ticket (its id)
    @PostMapping("/tickets")
    public ResponseEntity<FormDraftDto> createTicket(@RequestBody FormDraftSaveDto draft, Authentication caller)
    {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(formDraftService.createTicket(caller.getName(), draft.templateId(), draft.payload(), draft.label()));
    }

    // GET /api/v1/drafts/{id} → one of the caller's tickets; 404 for anyone else's
    @GetMapping("/{id}")
    public ResponseEntity<FormDraftDto> ticket(@PathVariable String id, Authentication caller)
    {
        return ResponseEntity.ok(formDraftService.ticket(caller.getName(), id));
    }

    // PUT /api/v1/drafts/{id} { payload, label } → 200 the saved ticket
    @PutMapping("/{id}")
    public ResponseEntity<FormDraftDto> updateTicket(@PathVariable String id, @RequestBody FormDraftSaveDto draft, Authentication caller)
    {
        return ResponseEntity.ok(formDraftService.updateTicket(caller.getName(), id, draft.payload(), draft.label()));
    }

    // DELETE /api/v1/drafts/{id} → 204, whether it existed or not
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTicket(@PathVariable String id, Authentication caller)
    {
        formDraftService.deleteTicket(caller.getName(), id);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- one draft per form and task

    // DELETE /api/v1/drafts?templateId=…&taskId=… → 204, whether there was one or not
    @DeleteMapping
    public ResponseEntity<Void> delete(@RequestParam String templateId, @RequestParam(required = false) String taskId,
                                       Authentication caller)
    {
        formDraftService.delete(caller.getName(), templateId, taskId);
        return ResponseEntity.noContent().build();
    }
}
