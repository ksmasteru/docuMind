package com.docuMind.backend.controller;

import org.springframework.web.bind.annotation.RestController;

@RestController
public class  DocumentController {
    private final doucmentService documentService;
    public DocumentController(documentService documentsService)
    {
        this.documentService = documentsService;
    }
}
