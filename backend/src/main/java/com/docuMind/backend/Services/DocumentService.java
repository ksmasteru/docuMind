package com.docuMind.backend.services;

import com.docuMind.backend.model.UploadFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.FileNotFoundException;
import com.docuMind.backend.exception.FileNotSupportedException;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.model.DocumentResponse;
import com.docuMind.backend.model.FileEntity;
import java.util.List;
import java.util.UUID;
import org.springframework.util.StringUtils;

// talks with repsose
@Service
public class DocumentService {
    List<String> allowedExtensions = List.of("pdf", "md", "txt");
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

    public List<FileEntity> searchFile(String name)
    {
        List<FileEntity> seachedfiles = documentRepository.findByGeneratedNameContainingIgnoreCase(name);
        System.out.println(seachedfiles);
        return seachedfiles;
    }

    public List<FileEntity> filter(String keyword)
    {
        List<FileEntity> filtersearch = documentRepository.findByContentContainingIgnoreCase(keyword);
        return filtersearch;
    }

    public FileEntity uploadFile(MultipartFile file,
         String title, String userId) throws IOException
    {
        String fileExtension = MediaType.parseMediaType(file.getContentType()).getSubtype();
        if (!allowedExtensions.contains(fileExtension))
            throw new FileNotSupportedException("Unsupported file type---");
        String content = null;
        if (fileExtension.equals("pdf"))
        {
            PDDocument pdf = PDDocument.load(file.getInputStream()); 
            PDFTextStripper stripper = new PDFTextStripper();
            content = stripper.getText(pdf);
        }
        else
            content = new String(file.getBytes(),StandardCharsets.UTF_8);
        System.out.println(content);
        FileEntity fileToSave = new FileEntity(file.getOriginalFilename(), 
            file.getContentType(), file.getSize(), file.getBytes(), userId, content);
        FileEntity returnFile = documentRepository.save(fileToSave);
        return returnFile;
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