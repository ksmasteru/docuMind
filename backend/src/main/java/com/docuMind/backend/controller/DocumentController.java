package com.docuMind.backend.controller;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import com.docuMind.backend.exception.FileNotSupportedException;

import com.docuMind.backend.model.FileResponse;
import com.docuMind.backend.model.FileResponse.FileInfo;

import com.docuMind.backend.model.DocumentResponse;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.services.DocumentService;

@RestController
@RequestMapping("/files")
public class  DocumentController {
    private final DocumentService documentService;
    public DocumentController(DocumentService documentsService)
    {
        this.documentService = documentsService;
    }


    @GetMapping("/api/v1/search/{name}")
    public ResponseEntity<FileResponse> searchFile(@PathVariable String name)
    {
        // looking by generated name.
        List<FileEntity> fileList = documentService.searchFile(name);
        List<FileInfo> files = fileList.stream()
            .map(file -> new FileInfo(file.getName(), file.getSize(), file.getUserId()))
            .toList();
        FileResponse response = new FileResponse(files, files.size());
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }

    @GetMapping("/api/v1/filter/{keyword}")
    public ResponseEntity<FileResponse> filter(@PathVariable String keyword) {
        List<FileEntity> fileList = documentService.filter(keyword);
        List<FileInfo> files = fileList.stream()
            .map(file -> new FileInfo(file.getName(), file.getSize(), file.getUserId()))
            .toList();
        FileResponse response = new FileResponse(files, files.size());
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }

    @GetMapping("/id/{id}")
    public ResponseEntity<ByteArrayResource> getFile(@PathVariable String id) {
    
        List<FileEntity> fileList = documentService.getFile(id);
        
        if (fileList == null || fileList.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        
        FileEntity fileEntity = fileList.get(0);
        byte[] data = fileEntity.getData();
        ByteArrayResource resource = new ByteArrayResource(data);
        
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileEntity.getGeneratedName() + "\"");
        headers.setContentLength(fileEntity.getSize());
        
        return ResponseEntity.status(HttpStatus.OK)
            .headers(headers)
            .contentType(MediaType.parseMediaType(fileEntity.getContentType())) 
            .body(resource);
    }
    
    @PostMapping(value = "/api/v1/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileResponse> uploadFile(
        @RequestParam MultipartFile file,
        @RequestParam(value = "title", required = false) String title,
        @RequestParam(value = "userId", required = true) String userId)
        throws IOException
    {
        FileEntity uploadedFile =  documentService.uploadFile(file, title, userId);
        FileInfo fileInfo = new FileInfo(uploadedFile.getName(), uploadedFile.getSize(), uploadedFile.getUserId());
        FileResponse response =  new FileResponse(List.of(fileInfo), 1 );
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }   


    @DeleteMapping("/id/{id}")
    public ResponseEntity<Void> deleteFile(
        @PathVariable String id)
    {

        documentService.deleteFile(id);
        return ResponseEntity.noContent().build();
    }
}