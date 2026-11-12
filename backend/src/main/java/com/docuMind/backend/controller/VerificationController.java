package com.docuMind.backend.controller;

import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.SubmissionPreview;
import com.docuMind.backend.model.SubmissionReport;
import com.docuMind.backend.services.ExpertiseDossierService;
import com.docuMind.backend.services.StructuredAnswers;
import com.docuMind.backend.services.SubmissionPdfService;
import com.docuMind.backend.services.SubmissionService;
import com.docuMind.backend.services.VerificationService;

import jakarta.servlet.http.HttpServletRequest;

// Public: whoever holds a printed report scans its QR code and lands on the frontend's
// /verify/{code} page, which calls this. No login (clients have none): the code printed on the
// paper is the access. The verdict only returns what the paper shows; the report itself can be
// previewed and downloaded so it can be compared page by page with the copy in hand.
// Each address gets a limited number of calls per minute.
@RestController
@RequestMapping("/api/public/verify")
public class VerificationController {
    private final VerificationService verificationService;
    private final SubmissionService submissionService;
    private final SubmissionPdfService submissionPdfService;
    private final ExpertiseDossierService expertiseDossierService;
    private final StringRedisTemplate redis;
    private final int maxPerMinute;

    public VerificationController(VerificationService verificationService,
                                  SubmissionService submissionService,
                                  SubmissionPdfService submissionPdfService,
                                  ExpertiseDossierService expertiseDossierService,
                                  StringRedisTemplate redis,
                                  @Value("${app.verify.max-per-minute:30}") int maxPerMinute)
    {
        this.verificationService = verificationService;
        this.submissionService = submissionService;
        this.submissionPdfService = submissionPdfService;
        this.expertiseDossierService = expertiseDossierService;
        this.redis = redis;
        this.maxPerMinute = maxPerMinute;
    }

    // GET /api/public/verify/{code} — 200 VerificationResponse; 404 for an unknown code;
    // 429 past the limit. The code may come with or without dashes, in any case.
    @GetMapping("/{code}")
    public ResponseEntity<?> verify(@PathVariable String code, HttpServletRequest request)
    {
        if (overLimit(request.getRemoteAddr()))
            return tooMany();
        return verificationService.verify(code)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(VerificationController::unknown);
    }

    // GET /api/public/verify/{code}/pdf — the report's PDF, as the app downloads it, rebuilt from the
    // saved report (with its QR code). An altered report is still served: the page says not to trust it.
    @GetMapping("/{code}/pdf")
    public ResponseEntity<?> pdf(@PathVariable String code, HttpServletRequest request)
    {
        if (overLimit(request.getRemoteAddr()))
            return tooMany();
        return submissionService.getReportByVerificationCode(code)
                .<ResponseEntity<?>>map(report -> ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_PDF)
                        .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                                .filename(SubmissionController.fileName(report)).build().toString())
                        .body(pdfOf(report)))
                .orElseGet(VerificationController::unknown);
    }

    // GET /api/public/verify/{code}/preview — the same PDF as one base64 PNG per page, to read it on
    // the page itself (phones often have no PDF viewer)
    @GetMapping("/{code}/preview")
    public ResponseEntity<?> preview(@PathVariable String code, HttpServletRequest request)
    {
        if (overLimit(request.getRemoteAddr()))
            return tooMany();
        return submissionService.getReportByVerificationCode(code)
                .<ResponseEntity<?>>map(report -> {
                    List<String> pages = submissionPdfService.renderPages(pdfOf(report)).stream()
                            .map(Base64.getEncoder()::encodeToString)
                            .toList();
                    return ResponseEntity.ok(new SubmissionPreview(pages));
                })
                .orElseGet(VerificationController::unknown);
    }

    // like SubmissionController.pdfOf: a v2 expertise report also says where it sits in the workshop loop
    private byte[] pdfOf(SubmissionReport report)
    {
        return StructuredAnswers.isV2(report.title())
                ? submissionPdfService.render(report, expertiseDossierService.traceOf(report.submissionId()))
                : submissionPdfService.render(report);
    }

    private static ResponseEntity<?> unknown()
    {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "aucun rapport avec ce code"));
    }

    private static ResponseEntity<?> tooMany()
    {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(Map.of("error", "trop de vérifications, réessayez dans une minute"));
    }

    // a counter per address and minute in Redis, shared by the three calls. Codes can't be guessed
    // anyway (80 random bits): this keeps the endpoint, and the PDF rendering behind it, from being
    // hammered. Behind a proxy every client shares the proxy's address, so the limit is then global.
    // If Redis is down, calls are let through: a check on site matters more than the limit.
    private boolean overLimit(String address)
    {
        String key = "verify:rate:" + address + ":" + (System.currentTimeMillis() / 60_000);
        try {
            Long count = redis.opsForValue().increment(key);
            if (count != null && count == 1)
                redis.expire(key, Duration.ofMinutes(2));
            return count != null && count > maxPerMinute;
        } catch (RuntimeException redisDown) {
            return false;
        }
    }
}
