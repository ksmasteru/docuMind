package com.docuMind.backend.services;

import com.docuMind.backend.model.UploadFile;

import java.io.IOException;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.FileNotFoundException;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.model.DocumentResponse;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.model.FileRequest;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import java.util.List;
// talks with repsose
@Service
public class DocumentService {
    private final DocumentRepository documentRepository;
    
    public DocumentService(DocumentRepository documentRepository)
    {
        this.documentRepository = documentRepository;
    }

    public List<FileEntity> getFile(String name)
    {
        // we should return all the files saved with the same name 
        List<FileEntity> returnFile = documentRepository.findByNameContainingIgnoreCase(name);
        return returnFile;
    }

    public DocumentResponse uploadFile(MultipartFile file) throws IOException
    {
        FileEntity fileToSave = new FileEntity(file.getOriginalFilename(), 
            file.getContentType(), file.getSize(), file.getBytes());
        FileEntity returnFile = documentRepository.save(fileToSave);
        return new DocumentResponse(returnFile);
    }
}