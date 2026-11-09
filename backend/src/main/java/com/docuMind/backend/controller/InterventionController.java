package com.docuMind.backend.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.Intervention;
import com.docuMind.backend.model.InterventionActionDto;
import com.docuMind.backend.model.InterventionAssignDto;
import com.docuMind.backend.model.InterventionCreationDto;
import com.docuMind.backend.model.InterventionDetails;
import com.docuMind.backend.model.InterventionFollowUp;
import com.docuMind.backend.model.InterventionQueue;
import com.docuMind.backend.model.InterventionRequestDto;
import com.docuMind.backend.model.ExpertiseDossier;
import com.docuMind.backend.services.ExpertiseDossierService;
import com.docuMind.backend.services.InterventionService;
import com.docuMind.backend.services.SubmissionPdfService;

import jakarta.validation.Valid;

// the workshop loop (fix_workshop.md)
@RestController
@RequestMapping("/api/v1/interventions")
public class InterventionController {
    private final InterventionService interventionService;
    private final ExpertiseDossierService expertiseDossierService;
    private final SubmissionPdfService submissionPdfService;

    public InterventionController(InterventionService interventionService, ExpertiseDossierService expertiseDossierService,
                                  SubmissionPdfService submissionPdfService)
    {
        this.interventionService = interventionService;
        this.expertiseDossierService = expertiseDossierService;
        this.submissionPdfService = submissionPdfService;
    }

    // GET /api/v1/interventions/{id}/dossier/pdf — the final file: cover, synthèse, avant / après, devis,
    // the démontage and montage reports, the history. Rebuilt on every call; same readers as the intervention
    @GetMapping("/{id}/dossier/pdf")
    public ResponseEntity<byte[]> dossierPdf(@PathVariable String id, Authentication caller)
    {
        ExpertiseDossier dossier = expertiseDossierService.dossier(id, caller);
        byte[] pdf = submissionPdfService.renderDossier(dossier);
        String name = "dossier-" + (dossier.interventionNumber() == null ? id : dossier.interventionNumber())
                + "-" + dossier.equipment().replaceAll("[^A-Za-z0-9_-]", "") + ".pdf";
        return ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.APPLICATION_PDF)
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                        org.springframework.http.ContentDisposition.inline().filename(name).build().toString())
                .body(pdf);
    }

    // a manager from an alert, or Sales for a client. 403 for the other roles
    @PostMapping
    public ResponseEntity<?> createIntervention(@Valid @RequestBody InterventionCreationDto request, Authentication caller)
    {
        Intervention intervention = interventionService.createIntervention(request, caller);
        // not Map.of: it refuses a null number, and the intervention is already saved at this point
        Map<String, String> body = new HashMap<>();
        body.put("id", intervention.getId());
        body.put("number", InterventionDetails.number(intervention));
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    // the interventions waiting at one of the caller's steps. 403 for a role with no workshop step
    @GetMapping("/queue")
    public ResponseEntity<InterventionQueue> getQueue(Authentication caller)
    {
        return ResponseEntity.ok(InterventionQueue.from(interventionService.getQueue(caller)));
    }

    // the interventions the caller worked on, and where each is now. Chef de projet and Workshop Lead, 403 for the others
    // (declared before /{id} for readability; Spring prefers the literal path either way)
    @GetMapping("/followed")
    public ResponseEntity<InterventionFollowUp> getFollowed(Authentication caller)
    {
        return ResponseEntity.ok(interventionService.getFollowed(caller));
    }

    // the file, its history, and the buttons the caller may press
    @GetMapping("/{id}")
    public ResponseEntity<InterventionDetails> getIntervention(@PathVariable String id, Authentication caller)
    {
        return ResponseEntity.ok(interventionService.getIntervention(id, caller));
    }

    // Sales completing the request (step 1)
    @PutMapping("/{id}/request")
    public ResponseEntity<?> updateRequest(@PathVariable String id, @Valid @RequestBody InterventionRequestDto request,
        Authentication caller)
    {
        interventionService.updateRequest(id, request, caller);
        return ResponseEntity.ok(Map.of("id", id));
    }

    // one button of the current step: TAKE, VALIDATE, CANCEL
    @PostMapping("/{id}/actions")
    public ResponseEntity<?> perform(@PathVariable String id, @Valid @RequestBody InterventionActionDto action,
        Authentication caller)
    {
        String eventId = interventionService.perform(id, action.action(), action.comment(), caller);
        return ResponseEntity.ok(Map.of("id", eventId));
    }

    // the Workshop Lead's task order at step 7 / 15: the technician gets the task, the
    // intervention moves to step 8 / 16. 409 when the step isn't his to assign, 404 / 400 from the task
    @PostMapping("/{id}/assign")
    public ResponseEntity<?> assignTechnician(@PathVariable String id, @Valid @RequestBody InterventionAssignDto order,
        Authentication caller)
    {
        String taskId = interventionService.assignTechnician(id, order, caller);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("taskId", taskId));
    }
}
