package com.docuMind.backend.controller;

import java.util.List;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.AlertCaseView;
import com.docuMind.backend.model.AlertForms;
import com.docuMind.backend.model.TaskCreationDto;
import com.docuMind.backend.services.AlertService;

import jakarta.validation.Valid;

// The alert cases, shared by the manager and the technicians (AlertService). Every change answers
// with the case as it is now; the sync answers with the caller's whole list.
//
//   GET  /api/v1/alerts                         the manager: every case; a technician: his site's open ones and his reports
//   GET  /api/v1/alerts/{number}
//   POST /api/v1/alerts/sync                    the twin's live alerts (the browsers running it)
//   POST /api/v1/alerts/{number}/status         {status}          manager
//   POST /api/v1/alerts/{number}/priority       {priority}        manager
//   POST /api/v1/alerts/{number}/comments       {text}            manager
//   POST /api/v1/alerts/{number}/orders         {taskId, title}   manager (a work order made from it)
//   POST /api/v1/alerts/{number}/interventions  {id, number}      the workshop request made from it
//   POST /api/v1/alerts/{number}/verifications  {verdict, comment}  technician
//   POST /api/v1/alerts/{number}/requests       {message}         technician: asks to intervene
//   POST /api/v1/alerts/reports                 a technician's fault report → a new case (201)
//   POST /api/v1/alerts/requests/{id}/accept    the task (TaskCreationDto) → created for him, linked
//   POST /api/v1/alerts/requests/{id}/refuse    {comment}
@RestController
@RequestMapping("/api/v1/alerts")
public class AlertController {

    private final AlertService alertService;

    public AlertController(AlertService alertService)
    {
        this.alertService = alertService;
    }

    @GetMapping
    public List<AlertCaseView> list(Authentication auth)
    {
        return alertService.list(auth);
    }

    @GetMapping("/{number}")
    public AlertCaseView get(@PathVariable long number, Authentication auth)
    {
        return alertService.get(number, auth);
    }

    @PostMapping("/sync")
    public List<AlertCaseView> sync(@Valid @RequestBody AlertForms.Sync body, Authentication auth)
    {
        try {
            alertService.sync(body);
        }
        catch (DataIntegrityViolationException e) {
            // another browser opened the same case at the same moment: its case stands
        }
        return alertService.list(auth);
    }

    @PostMapping("/{number}/status")
    public AlertCaseView status(@PathVariable long number, @Valid @RequestBody AlertForms.Status body, Authentication auth)
    {
        return alertService.setStatus(number, body.status(), auth);
    }

    @PostMapping("/{number}/priority")
    public AlertCaseView priority(@PathVariable long number, @Valid @RequestBody AlertForms.Priority body, Authentication auth)
    {
        return alertService.setPriority(number, body.priority(), auth);
    }

    @PostMapping("/{number}/comments")
    public AlertCaseView comment(@PathVariable long number, @Valid @RequestBody AlertForms.Comment body, Authentication auth)
    {
        return alertService.addComment(number, body.text(), auth);
    }

    @PostMapping("/{number}/orders")
    public AlertCaseView order(@PathVariable long number, @Valid @RequestBody AlertForms.Order body, Authentication auth)
    {
        return alertService.linkOrder(number, body, auth);
    }

    @PostMapping("/{number}/interventions")
    public AlertCaseView intervention(@PathVariable long number, @Valid @RequestBody AlertForms.Intervention body, Authentication auth)
    {
        return alertService.linkIntervention(number, body, auth);
    }

    // ---------- the check (levée de doute) ----------

    @PostMapping("/{number}/checks")
    public AlertCaseView orderCheck(@PathVariable long number, @Valid @RequestBody AlertForms.CheckOrder body, Authentication auth)
    {
        return alertService.orderCheck(number, body, auth);
    }

    // a technician starts it himself: { taskId, alert }
    @PostMapping("/{number}/checks/self")
    public ResponseEntity<AlertService.SelfCheck> selfCheck(@PathVariable long number, @Valid @RequestBody AlertForms.SelfCheck body, Authentication auth)
    {
        return ResponseEntity.status(HttpStatus.CREATED).body(alertService.selfCheck(number, body, auth));
    }

    @PostMapping("/{number}/check/cancel")
    public AlertCaseView cancelCheck(@PathVariable long number, Authentication auth)
    {
        return alertService.cancelCheck(number, auth);
    }

    @PostMapping("/{number}/check/return")
    public AlertCaseView returnCheck(@PathVariable long number, @Valid @RequestBody AlertForms.CheckReturn body, Authentication auth)
    {
        return alertService.returnCheck(number, body.comment(), auth);
    }

    @PostMapping("/{number}/close")
    public AlertCaseView close(@PathVariable long number, @Valid @RequestBody AlertForms.Close body, Authentication auth)
    {
        return alertService.close(number, body, auth);
    }

    @PostMapping("/reports")
    public ResponseEntity<AlertCaseView> report(@Valid @RequestBody AlertForms.FieldReport body, Authentication auth)
    {
        return ResponseEntity.status(HttpStatus.CREATED).body(alertService.report(body, auth));
    }

    @PostMapping("/requests/{id}/accept")
    public AlertCaseView accept(@PathVariable String id, @Valid @RequestBody TaskCreationDto body, Authentication auth)
    {
        return alertService.acceptRequest(id, body, auth);
    }

    @PostMapping("/requests/{id}/refuse")
    public AlertCaseView refuse(@PathVariable String id, @Valid @RequestBody AlertForms.Refusal body, Authentication auth)
    {
        return alertService.refuseRequest(id, body.comment(), auth);
    }
}
