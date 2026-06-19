package com.docuMind.backend.services;

// talks with repsose
public class DocumentService {
    private final documentRepository documentrRepository;
    
    public DocumentService(documentRepository documentRepository)
    {
        this.documentrRepository = documentrRepository;
    }
    
}