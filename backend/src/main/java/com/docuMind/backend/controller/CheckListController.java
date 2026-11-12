package com.docuMind.backend.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.FormCreationDto;
import com.docuMind.backend.services.CheckListTemplateService;
import com.docuMind.backend.model.FormOptionsResponse;
import com.docuMind.backend.model.InspectionFormResponse;
import jakarta.validation.Valid;

// !!!!IMPORTANT SHOULD ADD A SECURITY LAYER TO THIS LATER
// SO ONLY ADMIN CAN CREATE FORMS
@RestController
@RequestMapping("/api/v1/forms")
public class CheckListController{
    private final CheckListTemplateService checkListService;
    
    public CheckListController(CheckListTemplateService checkListService)
    {
        this.checkListService = checkListService;
    }

    // exposing an endpoint through which admin can make new forms
    @PostMapping("/")
    public ResponseEntity<Map<String, String>> makeNewForm(
        @Valid @RequestBody FormCreationDto form)
    {
        String response = checkListService.createNewForm(form);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", response));
    }

    // there should be an id attached or idk.
    @GetMapping("/inspectionForm/{id}")
    public ResponseEntity<InspectionFormResponse>getInspectionForm(@PathVariable String id, Authentication authentication)
    {
        InspectionFormResponse response = checkListService.getInspectionForm(id, authentication.getName());
        return ResponseEntity.ok(response);
    }

    // reutrn [{type, title, id}, ...] of the ACTIVE FORMS the caller's role may fill
    @GetMapping("/options")
    public ResponseEntity<FormOptionsResponse>getFormOptions(Authentication authentication)
    {
        FormOptionsResponse response = checkListService.getFormOptions(authentication.getName());
        return ResponseEntity.ok(response);
    }

    // deletes a form by id. Open to every logged-in user for now (no role check).
    // 204 on success, 404 if no form has this id, 409 if submissions already answer it
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteForm(@PathVariable String id)
    {
        checkListService.deleteForm(id);
        return ResponseEntity.noContent().build();
    }
}