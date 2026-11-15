package com.docuMind.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.TeamResponse;
import com.docuMind.backend.model.TeamTechnicianForm;
import com.docuMind.backend.model.TechnicianProfile;
import com.docuMind.backend.services.TeamService;

import jakarta.validation.Valid;

// The logged-in manager's team, the web app's Techniciens page (TeamService). 403 for any other role.
// Every change answers with the whole team, so the page shows it as it is now.
@RestController
@RequestMapping("/api/v1/team")
public class TeamController {

    private final TeamService teamService;

    public TeamController(TeamService teamService)
    {
        this.teamService = teamService;
    }

    // GET /api/v1/team: his technicians with their task counts, and the ones in no team yet
    @GetMapping
    public ResponseEntity<TeamResponse> team(Authentication manager)
    {
        return ResponseEntity.ok(teamService.getTeam(manager.getName()));
    }

    // POST /api/v1/team/technicians {name, email, password, worksite?}: a new technician account
    // in his team. 409 when the e-mail is already used
    @PostMapping("/technicians")
    public ResponseEntity<TeamResponse> createTechnician(@Valid @RequestBody TeamTechnicianForm form, Authentication manager)
    {
        return ResponseEntity.status(HttpStatus.CREATED).body(teamService.createTechnician(manager.getName(), form));
    }

    // PUT /api/v1/team/technicians/{id}: an existing technician joins his team.
    // 409 when he is in another manager's team, 400 when the user isn't a technician
    @PutMapping("/technicians/{id}")
    public ResponseEntity<TeamResponse> addTechnician(@PathVariable String id, Authentication manager)
    {
        return ResponseEntity.ok(teamService.addTechnician(manager.getName(), id));
    }

    // DELETE /api/v1/team/technicians/{id}: he leaves the team (his account and tasks stay)
    @DeleteMapping("/technicians/{id}")
    public ResponseEntity<TeamResponse> removeTechnician(@PathVariable String id, Authentication manager)
    {
        return ResponseEntity.ok(teamService.removeTechnician(manager.getName(), id));
    }

    // GET /api/v1/team/technicians/{id}: one of his technicians, profile, performance and task history.
    // 403 when he isn't in the team
    @GetMapping("/technicians/{id}")
    public ResponseEntity<TechnicianProfile> profile(@PathVariable String id, Authentication manager)
    {
        return ResponseEntity.ok(teamService.getProfile(manager.getName(), id));
    }
}
