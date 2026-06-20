package com.docuMind.backend.controller;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.RequestMapping;
import com.docuMind.backend.model.DocumentResponse;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.services.DocumentService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import com.docuMind.backend.model.FileRequest;
import java.util.List;

@RestController
@RequestMapping("/files")
public class  DocumentController {
    private final DocumentService documentService;
    public DocumentController(DocumentService documentsService)
    {
        this.documentService = documentsService;
    }

    @GetMapping("/id/{id}")
    public ResponseEntity<DocumentResponse> getFile(
        @PathVariable String id)
    {
        // returns a file or a lot of file
        DocumentResponse response = new DocumentResponse(documentService.getFile(id));
        return ResponseEntity.status(HttpStatus.OK)
            .body(response);
    }
    
    @PostMapping("/")
    public ResponseEntity<DocumentResponse> uploadFile(
        @RequestParam MultipartFile file)
    {
        DocumentResponse response = null;
        try{
            response = documentService.uploadFile(file);
        }
        catch (IOException e) {
            System.err.println("Failed to read the file: " + e.getMessage());
            e.printStackTrace();
        }
        return ResponseEntity.status(HttpStatus.OK)
                .body(response);
    }
}