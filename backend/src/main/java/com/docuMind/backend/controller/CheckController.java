package com.docuMind.backend.controller;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.AlertCaseView;
import com.docuMind.backend.model.AlertForms;
import com.docuMind.backend.model.CheckView;
import com.docuMind.backend.services.AlertService;
import com.docuMind.backend.services.CheckPdfService;
import com.docuMind.backend.services.CheckService;

import jakarta.validation.Valid;

// a check task (levée de doute): what to check and every round of its report (CheckService)
@RestController
@RequestMapping("/api/v1/checks")
public class CheckController {

    private final CheckService checkService;
    private final AlertService alertService;
    private final CheckPdfService checkPdfService;

    public CheckController(CheckService checkService, AlertService alertService, CheckPdfService checkPdfService)
    {
        this.checkService = checkService;
        this.alertService = alertService;
        this.checkPdfService = checkPdfService;
    }

    // its technician, or a manager
    @PreAuthorize("hasAnyRole('USER', 'MANAGER', 'ADMIN')")
    @GetMapping("/{taskId}")
    public CheckView get(@PathVariable String taskId, Authentication auth)
    {
        return checkService.view(taskId, auth);
    }

    // the check behind a work order (its repair task): the one that confirmed the alert it was made from.
    // Its technician, or a manager. 204 when it has none
    @PreAuthorize("hasAnyRole('USER', 'MANAGER', 'ADMIN')")
    @GetMapping("/for/{taskId}")
    public ResponseEntity<CheckView> behind(@PathVariable String taskId, Authentication auth)
    {
        return checkService.behind(taskId, auth).map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    // one round of the report as a PDF (the latest without ?round=), with its verification QR code.
    // A manager, its technician, or the technician of a work order made from the same alert
    @PreAuthorize("hasAnyRole('USER', 'MANAGER', 'ADMIN')")
    @GetMapping("/{taskId}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String taskId, @RequestParam(required = false) Integer round,
                                      Authentication auth)
    {
        CheckPdfService.PdfFile file = checkPdfService.pdf(taskId, round, auth);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.name()).build().toString())
            .body(file.bytes());
    }

    // its technician sends his report: the alert as it is now
    @PostMapping("/{taskId}/report")
    public AlertCaseView report(@PathVariable String taskId, @Valid @RequestBody AlertForms.CheckReportForm body, Authentication auth)
    {
        return alertService.submitCheck(taskId, body, auth);
    }
}
