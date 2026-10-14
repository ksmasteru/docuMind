package com.docuMind.backend.controller;

import org.apache.tomcat.util.http.parser.MediaType;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.SubmissionRequest;
import com.docuMind.backend.model.SubmissionResponse;
import com.docuMind.backend.services.SubmissionService;

import jakarta.validation.Valid;

// technicians send their filled checklists here
@RestController
@RequestMapping("/api/v1/submissions")
public class SubmissionController {
    private final SubmissionService submissionService;

    public SubmissionController(SubmissionService submissionService)
    {
        this.submissionService = submissionService;
    }

    // POST /api/v1/submissions  (no trailing slash needed)
    // 201 { id, status } on success; 400 / 404 from the service's exceptions
    @PostMapping
    // Authentication is filled by Spring Security from the bearer token:
    // the user comes from the token, never from the request body
    public ResponseEntity<SubmissionResponse> submit(@Valid @RequestBody SubmissionRequest request,
                                                     Authentication authentication)
    {
        SubmissionResponse response = submissionService.validateSubmission(request, authentication.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // PREVIEW (disabled) // POST /preview validates the sumbission DOESNT UPLOAD IT AND return a previeable PDF
    // PREVIEW (disabled) public ResponseEntity<ByteArrayResource> preview(@Valid @RequestBody SubmissionRequest request,
    // PREVIEW (disabled) Authentication authentication)
    // PREVIEW (disabled) {
    // PREVIEW (disabled) BytesArrayRessource response = submissionService.previewSubmission(request, authentication.getName());
        
    // PREVIEW (disabled) return ResponseEntity.status(HttpStatus.OK)
    // PREVIEW (disabled) .headers(headers)
    // PREVIEW (disabled) .contentType(MediaType.parseMediaType("pdf")) // what should be the input type for a pdf file
    // PREVIEW (disabled) .body(response);
    // PREVIEW (disabled) }
}
