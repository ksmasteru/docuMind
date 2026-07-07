package com.docuMind.backend.services;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.FileNotFoundException;
import com.docuMind.backend.exception.FileNotSupportedException;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.repository.FileContentRepository;

import org.springframework.transaction.annotation.Transactional;

import com.docuMind.backend.model.FileContent;
// talks with repsose
@Service
public class DocumentService {
    List<String> allowedExtensions = List.of("pdf", "md", "txt");
    private final DocumentRepository documentRepository;
    private final FileContentRepository fileContentRepository;
    
    public DocumentService(DocumentRepository documentRepository, FileContentRepository fileContentRepository)
    {
        this.documentRepository = documentRepository;
        this.fileContentRepository = fileContentRepository;
    }

    // changed from List<FileEntity> to FileEntity
    // we want this to 
    
    public FileContent getFileData(String id)
    {        
        FileContent fileContent = fileContentRepository.findById(id)
                                .orElseThrow(() -> new FileNotFoundException(""));        
        return fileContent;
    }

    public FileEntity getFileMetaData(String id)
    {
        FileEntity returnFile = documentRepository.findById(id)
                                .orElseThrow(() -> new FileNotFoundException(""));
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

    @Transactional
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
        FileEntity fileToSave = new FileEntity(title != null ? title : file.getOriginalFilename(), 
            file.getContentType(), file.getSize(), userId, content);
        
        FileEntity returnFile = documentRepository.save(fileToSave);
        
        FileContent fileContent = new FileContent(returnFile.getId(), file.getBytes());
        
        fileContentRepository.save(fileContent);
        
        return returnFile;
    }

    @Transactional
    public void deleteFile(String Id)
    {
        List<FileEntity> fileToDelete = documentRepository.findByNameContainingIgnoreCase(Id);
        if (!fileToDelete.isEmpty())
            documentRepository.delete(fileToDelete.get(0));
        else
           throw new FileNotFoundException("file not found with name : " + Id);  
    }

    public List<FileEntity> getUserFiles(String userId)
    {
        List<FileEntity> files = documentRepository.findByUserId(userId);
        return files;
    }

}