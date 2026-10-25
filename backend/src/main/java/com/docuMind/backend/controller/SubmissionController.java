package com.docuMind.backend.controller;

import java.util.Base64;
import java.util.List;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.SubmissionPreview;
import com.docuMind.backend.model.SubmissionReport;
import com.docuMind.backend.model.SubmissionRequest;
import com.docuMind.backend.model.SubmissionResponse;
import com.docuMind.backend.services.SubmissionPdfService;
import com.docuMind.backend.services.SubmissionService;

import jakarta.validation.Valid;

// technicians send their filled checklists here
@RestController
@RequestMapping("/api/v1/submissions")
public class SubmissionController {
    private final SubmissionService submissionService;
    private final SubmissionPdfService submissionPdfService;

    public SubmissionController(SubmissionService submissionService,
                                SubmissionPdfService submissionPdfService)
    {
        this.submissionService = submissionService;
        this.submissionPdfService = submissionPdfService;
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

    // GET /api/v1/submissions/{id} — a sent sheet as data, for the app to draw it itself
    // (the review screen). The same SubmissionReport the PDF is built from, so both always
    // agree; same access as /pdf: its author or the manager of its task, else 404.
    @GetMapping("/{id}")
    public ResponseEntity<SubmissionReport> report(@PathVariable String id, Authentication authentication)
    {
        return ResponseEntity.ok(submissionService.getReport(id, authentication.getName()));
    }

    // GET /api/v1/submissions/{id}/pdf — the filled sheet as a PDF download, rebuilt from the
    // saved submission (nothing is stored). 404 for an unknown id, or for anyone but its
    // author and the manager of its task.
    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String id, Authentication authentication)
    {
        SubmissionReport report = submissionService.getReport(id, authentication.getName());
        byte[] pdf = submissionPdfService.render(report);
        // fileName() is plain ASCII, so a simple filename="…" is enough for every client
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(fileName(report))
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(pdf);
    }

    // GET /api/v1/submissions/{id}/preview — the same PDF as one base64 PNG per page, for
    // the mobile app, which has no PDF viewer to show the file itself.
    @GetMapping("/{id}/preview")
    public ResponseEntity<SubmissionPreview> preview(@PathVariable String id, Authentication authentication)
    {
        SubmissionReport report = submissionService.getReport(id, authentication.getName());
        byte[] pdf = submissionPdfService.render(report);
        List<String> pages = submissionPdfService.renderPages(pdf).stream()
                .map(Base64.getEncoder()::encodeToString)
                .toList();
        return ResponseEntity.ok(new SubmissionPreview(pages));
    }

    // "checklist-MP1-12-10-2026.pdf": what a technician would recognise in their downloads
    private static String fileName(SubmissionReport report)
    {
        String equipment = report.equipment().replaceAll("[^A-Za-z0-9_-]+", "-");
        String day = report.inspectionDate().replace('/', '-');
        return "checklist-" + equipment + "-" + day + ".pdf";
    }
}
