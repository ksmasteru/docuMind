package com.docuMind.backend.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<InspectionFormResponse>getInspectionForm(@PathVariable String id)
    {
        InspectionFormResponse response = checkListService.getInspectionForm(id);
        return ResponseEntity.ok(response);
    }

    // reutrn [{type, title, id}, ...] of all ACTIVE FORM
    @GetMapping("/options")
    public ResponseEntity<FormOptionsResponse>getFormOptions()
    {
        FormOptionsResponse response = checkListService.getFormOptions();
        return ResponseEntity.ok(response);
    }
}