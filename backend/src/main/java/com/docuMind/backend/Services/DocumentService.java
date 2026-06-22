package com.docuMind.backend.services;

import com.docuMind.backend.model.UploadFile;

import java.io.IOException;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.FileNotFoundException;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.model.DocumentResponse;
import com.docuMind.backend.model.FileEntity;
import java.util.List;
// talks with repsose
@Service
public class DocumentService {
    public static final String RED = "\u001B[31m";
    public static final String RESET = "\u001B[0m";
    private final DocumentRepository documentRepository;
    
    public DocumentService(DocumentRepository documentRepository)
    {
        this.documentRepository = documentRepository;
    }

    public List<FileEntity> getFile(String name)
    {
        List<FileEntity> returnFile = documentRepository.findByNameContainingIgnoreCase(name);
        return returnFile;
    }

    public DocumentResponse uploadFile(MultipartFile file) throws IOException
    {
        System.out.println(RED + "---original file name is : " + file.getOriginalFilename() + RESET);
        FileEntity fileToSave = new FileEntity(file.getOriginalFilename(), 
            file.getContentType(), file.getSize(), file.getBytes());
        FileEntity returnFile = documentRepository.save(fileToSave);
        return new DocumentResponse(returnFile);
    }

    public void deleteFile(String Id)
    {
        List<FileEntity> fileToDelete = documentRepository.findByNameContainingIgnoreCase(Id);
        if (!fileToDelete.isEmpty())
            documentRepository.delete(fileToDelete.get(0));
        else
            throw new FileNotFoundException("file not found with name : " + Id);  
    }
}