package com.docuMind.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.ReportStats;
import com.docuMind.backend.services.ReportStatsService;

// the manager's « Tableau de bord » of reports (plan_report_stats.md)
@RestController
@RequestMapping("/api/v1/stats")
public class StatsController {
    private final ReportStatsService reportStatsService;

    public StatsController(ReportStatsService reportStatsService)
    {
        this.reportStatsService = reportStatsService;
    }

    // GET /api/v1/stats/reports?days=30[&manager=…]: the last 7, 30 or 90 days, or 0 for everything.
    // A manager: his reports (manager is ignored). The super admin: every manager's, or manager's. 403 otherwise
    @GetMapping("/reports")
    public ResponseEntity<ReportStats> reports(@RequestParam(defaultValue = "30") int days,
                                               @RequestParam(required = false) String manager,
                                               Authentication caller)
    {
        if (days < 0 || days > 366)
            throw new IllegalArgumentException("days: from 0 (everything) to 366");
        return ResponseEntity.ok(reportStatsService.stats(caller.getName(), days, manager));
    }
}
