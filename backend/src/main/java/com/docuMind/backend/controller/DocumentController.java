package com.docuMind.backend.controller;

import java.io.IOException;
import java.util.List;
import java.util.Map;

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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.model.DataAnalysis;
import com.docuMind.backend.model.FileContent;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.model.FileResponse;
import com.docuMind.backend.model.FileResponse.FileInfo;
import com.docuMind.backend.repository.DataAnalysisRepository;
import com.docuMind.backend.services.DataAnalysisService;
import com.docuMind.backend.services.DocumentService;
import com.docuMind.backend.services.PumpDocumentService;

@RestController
@RequestMapping("/api/v1/files")
public class  DocumentController {
    private final DocumentService documentService;
    private final DataAnalysisService dataAnalysisService;
    private final DataAnalysisRepository dataAnalysisRepository;
    // the pump models each document is ticked for (plan_pump_manuals.md part B)
    private final PumpDocumentService pumpDocumentService;

    public DocumentController(DocumentService documentsService, DataAnalysisRepository dataAnalysisRepository
        ,DataAnalysisService dataAnalysisService, PumpDocumentService pumpDocumentService)
    {
        this.documentService = documentsService;
        this.dataAnalysisService = dataAnalysisService;
        this.dataAnalysisRepository =dataAnalysisRepository;
        this.pumpDocumentService = pumpDocumentService;
    }

    // the files as the pages show them, each with the pump models it is ticked for
    private FileResponse withModels(List<FileEntity> fileList)
    {
        var links = pumpDocumentService.linksOf(fileList.stream().map(FileEntity::getId).toList());
        List<FileInfo> files = fileList.stream()
            .map(file -> new FileInfo(file.getId(), file.getName(), file.getSize(), file.getUserId(),
                links.getOrDefault(file.getId(), List.of())))
            .toList();
        return new FileResponse(files, files.size());
    }

    @GetMapping("/{fileId}/analysis")
    public ResponseEntity<DataAnalysis> getAnalysis(@PathVariable String fileId) {
        DataAnalysis analysis = dataAnalysisService.getAnalysis(fileId);
        return ResponseEntity.status(HttpStatus.OK).body(analysis);
    }

    // GET /api/v1/files: every document, sorted by name, for every signed-in role (« Documents »,
    // plan_documents_list.md). Uploading and deleting stay the admin's (SecurityConfig).
    @GetMapping
    public ResponseEntity<FileResponse> allFiles()
    {
        return ResponseEntity.ok(withModels(documentService.allFiles()));
    }

    @GetMapping("/{name}")
    public ResponseEntity<FileResponse> searchFile(@PathVariable String name)
    {
        System.out.println("received a new request!!");
        List<FileEntity> fileList = documentService.searchFile(name);
        return ResponseEntity.status(HttpStatus.OK).body(withModels(fileList));
    }

    @GetMapping("/filter/{keyword}")
    public ResponseEntity<FileResponse> filter(@PathVariable String keyword) {
        List<FileEntity> fileList = documentService.filter(keyword);
        return ResponseEntity.status(HttpStatus.OK).body(withModels(fileList));
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

    // models (repeatable, optional): the pump models the document serves, ticked on « Importer »; kind: OWN (a
    // PHOVA document, the default) or COMPARABLE (a similar pump's manual). Checked before anything is stored.
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileResponse> uploadFile(
        @RequestParam MultipartFile file,
        @RequestParam(value = "title", required = false) String title,
        @RequestParam(value = "models", required = false) List<String> models,
        @RequestParam(value = "kind", required = false) String kind)
        throws IOException
    {
        var ticked = pumpDocumentService.parseModels(models);
        var documentKind = PumpDocumentService.parseKind(kind);

        System.out.println("receveid a request for uplloading file");
        
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        
        String userId = authentication.getName();

        System.out.println("received an upload from user : " + userId);
    
        FileEntity uploadedFile =  documentService.uploadFile(file, title, userId);
        if (!ticked.isEmpty())
            pumpDocumentService.setModels(uploadedFile.getId(), ticked, documentKind, userId);

        return ResponseEntity.status(HttpStatus.OK).body(withModels(List.of(uploadedFile)));
    }

    @PostMapping(value = "/scan")
    public ResponseEntity<FileResponse> scanDocument(
        @RequestBody Map<String, String> text)throws IOException
    {
        System.out.println("received a request for uploading scanned document");
        
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        
        String userId = authentication.getName();

        String scannedText = text.get("text");
            
        FileEntity uploadedFile = documentService.uploadScannedText(scannedText, userId);

        FileInfo fileInfo = new FileInfo(uploadedFile.getId(), uploadedFile.getName(), uploadedFile.getSize(), uploadedFile.getUserId());

        FileResponse response = new FileResponse(List.of(fileInfo), 1);

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
        
        return ResponseEntity.status(HttpStatus.OK).body(withModels(userFiles));
    }

    @PostMapping("/ask")
    public ResponseEntity<Map<String, String>> answer(@RequestBody Map<String, String> map)
    {
        String question = map.get("question");

        String theAnswer = documentService.answer(question);
    
        return ResponseEntity.status(HttpStatus.OK).body(Map.of("response", theAnswer)); 
    }

    // outdated
    @DeleteMapping("/delete/id/{id}")
    public ResponseEntity<Void> deleteFile(
        @PathVariable String id)
    {
        documentService.deleteFile(id);
        
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/delete/{name}")
    public ResponseEntity<Void> deleteFileByName(
        @PathVariable String name)
    {
        documentService.deleteFileByName(name);
        return ResponseEntity.noContent().build();
    }
}