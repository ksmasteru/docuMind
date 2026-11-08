package com.docuMind.backend.controller;

import java.util.List;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.QuoteCreationDto;
import com.docuMind.backend.model.QuoteDetails;
import com.docuMind.backend.model.QuoteLinesDto;
import com.docuMind.backend.services.QuoteService;

import jakarta.validation.Valid;

// the devis of the workshop interventions (Quote, step 10 onwards)
@RestController
@RequestMapping("/api/v1/quotes")
public class QuoteController {
    private final QuoteService quoteService;

    public QuoteController(QuoteService quoteService)
    {
        this.quoteService = quoteService;
    }

    // "Générer le devis": the draft of the intervention, created or the one already open.
    // 403 for another role, 409 when the caller hasn't taken step 10
    @PostMapping
    public ResponseEntity<QuoteDetails> createDraft(@Valid @RequestBody QuoteCreationDto request, Authentication caller)
    {
        return ResponseEntity.status(HttpStatus.CREATED).body(quoteService.createDraft(request.interventionId().strip(), caller));
    }

    // "Valider" on the devis page: the parts, replacing the saved ones. 400 for an empty list or a
    // bad line, 409 when the quote isn't the caller's draft
    @PutMapping("/{id}/lines")
    public ResponseEntity<QuoteDetails> saveLines(@PathVariable String id, @Valid @RequestBody QuoteLinesDto request, Authentication caller)
    {
        return ResponseEntity.ok(quoteService.saveLines(id, request, caller));
    }

    // one quote; 404 for an unknown id
    @GetMapping("/{id}")
    public ResponseEntity<QuoteDetails> getQuote(@PathVariable String id, Authentication caller)
    {
        return ResponseEntity.ok(quoteService.getQuote(id, caller));
    }

    // ?interventionId=… : the intervention's quotes, newest version first
    @GetMapping
    public ResponseEntity<Map<String, Object>> getQuotesOf(@RequestParam String interventionId, Authentication caller)
    {
        List<QuoteDetails> quotes = quoteService.getQuotesOf(interventionId, caller);
        return ResponseEntity.ok(Map.of("quotes", quotes, "quotesCount", quotes.size()));
    }
}
