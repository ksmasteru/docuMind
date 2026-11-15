package com.docuMind.backend.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.PumpHistoryView;
import com.docuMind.backend.services.AlertService;

// The pumps' own pages. Their readings come from the twin; what is stored about them is here.
@RestController
@RequestMapping("/api/v1/pumps")
public class PumpController {

    private final AlertService alertService;

    public PumpController(AlertService alertService)
    {
        this.alertService = alertService;
    }

    // GET /api/v1/pumps/{pumpId}/history: the alerts it showed and the maintenance made on it (manager)
    @GetMapping("/{pumpId}/history")
    public PumpHistoryView history(@PathVariable String pumpId)
    {
        return alertService.pumpHistory(pumpId);
    }
}
