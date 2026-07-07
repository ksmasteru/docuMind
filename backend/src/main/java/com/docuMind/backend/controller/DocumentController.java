package com.docuMind.backend.controller;

import java.io.IOException;
import java.util.List;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.model.FileContent;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.model.FileResponse;
import com.docuMind.backend.model.FileResponse.FileInfo;
import com.docuMind.backend.services.DocumentService;
import java.util.UUID;


@RestController
@RequestMapping("/api/v1/files")
public class  DocumentController {
    private final DocumentService documentService;
    public DocumentController(DocumentService documentsService)
    {
        this.documentService = documentsService;
    }

    @GetMapping("/{name}")
    public ResponseEntity<FileResponse> searchFile(@PathVariable String name)
    {
        // looking by generated name.
        System.out.println("received a new request!!");
        List<FileEntity> fileList = documentService.searchFile(name);
        List<FileInfo> files = fileList.stream()
            .map(file -> new FileInfo(file.getId(), file.getName(), file.getSize(), file.getUserId()))
            .toList();
        FileResponse response = new FileResponse(files, files.size());
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }

    @GetMapping("/filter/{keyword}")
    public ResponseEntity<FileResponse> filter(@PathVariable String keyword) {
        List<FileEntity> fileList = documentService.filter(keyword);
        List<FileInfo> files = fileList.stream()
            .map(file -> new FileInfo(file.getId(), file.getName(), file.getSize(), file.getUserId()))
            .toList();
        FileResponse response = new FileResponse(files, files.size());
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }

    @GetMapping("/id/{id}")
    public ResponseEntity<ByteArrayResource> getFile(@PathVariable String id)
    {     
        FileEntity file = documentService.getFileMetaData(id);
        FileContent fileData = documentService.getFileData(id);
        
        byte[] data = fileData.getData();
        
        ByteArrayResource resource = new ByteArrayResource(data);
        
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.getGeneratedName() + "\"");
        headers.setContentLength(file.getSize());
        
        return ResponseEntity.status(HttpStatus.OK)
            .headers(headers)
            .contentType(MediaType.parseMediaType(file.getContentType())) 
            .body(resource);
    }
    
    @GetMapping("/preview/id/{id}")
    public ResponseEntity<ByteArrayResource> previewFile(@PathVariable String id)
    {
        FileEntity fileEntity = documentService.getFileMetaData(id);
        
        FileContent fileData = documentService.getFileData(id);
        
        byte[] data = fileData.getData();
        
        ByteArrayResource resource = new ByteArrayResource(data);
        
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.CONTENT_DISPOSITION, "inline");
        headers.setContentLength(fileEntity.getSize());
        
        return ResponseEntity.status(HttpStatus.OK)
            .headers(headers)
            .contentType(MediaType.parseMediaType(fileEntity.getContentType()))
            .body(resource);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileResponse> uploadFile(
        @RequestParam MultipartFile file,
        @RequestParam(value = "title", required = false) String title)
        throws IOException
    {
        
        System.out.println("receveid a request for uplloading file");
        
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        
        String userId = authentication.getName();

        System.out.println("received an upload from user : " + userId);
        
        FileEntity uploadedFile =  documentService.uploadFile(file, title, userId);
        
        FileInfo fileInfo = new FileInfo(uploadedFile.getId(), uploadedFile.getName(), uploadedFile.getSize(), uploadedFile.getUserId());
    
        FileResponse response =  new FileResponse(List.of(fileInfo), 1 );

        return ResponseEntity.status(HttpStatus.OK).body(response);
    }

    // returns the files uploaded by the user of id : email
    @GetMapping("/user/{id}")
    public ResponseEntity<FileResponse> getfilesUploadedByUser(
        @PathVariable String id
    )
    {
        System.out.println("received getfilesUploadedByUser : " + id);
        
        List<FileEntity> userFiles = documentService.getUserFiles(id);
        
        List<FileInfo> files = userFiles.stream()
                        .map(file -> new FileInfo(file.getId(), file.getName(), file.getSize(), file.getUserId()))
                        .toList();
        
        FileResponse response = new FileResponse(files, files.size());
        
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