package com.docuMind.backend.controller;

import java.io.IOException;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.model.ImageData;
import com.docuMind.backend.model.ImageEntity;
import com.docuMind.backend.model.ImageUploadResponse;
import com.docuMind.backend.model.enums.FixType;
import com.docuMind.backend.services.ImageService;

// technicians upload report photos here, before submitting the checklist
@RestController
@RequestMapping("/api/v1/images")
public class ImageController {
    private final ImageService imageService;

    public ImageController(ImageService imageService)
    {
        this.imageService = imageService;
    }

    // POST /api/v1/images  (multipart: image, equipementId?, fix?)
    // 201 { imageId, name, contentType, size }; 400 for a non JPEG/PNG/WebP file
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImageUploadResponse> upload(
        @RequestParam("image") MultipartFile image,
        @RequestParam(value = "equipementId", required = false) String equipementId,
        @RequestParam(value = "fix", required = false) FixType fix,
        Authentication authentication) throws IOException
    {
        // uploadedBy must be authentication.getName(): SubmissionService compares it
        // with the submitting user's id to check the photo belongs to them
        ImageEntity saved = imageService.uploadImage(image, authentication.getName(), equipementId, fix);

        ImageUploadResponse response = new ImageUploadResponse(saved.getId(), saved.getName(),
            saved.getContentType(), saved.getSize());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // GET /api/v1/images/{id} — the photo itself, shown inline in the browser.
    // Any logged-in user can view it, whatever their role. 404 for an unknown id
    @GetMapping("/{id}")
    public ResponseEntity<byte[]> view(@PathVariable String id)
    {
        ImageEntity metaData = imageService.getImageMetaData(id);
        ImageData imageData = imageService.getImageData(id);

        return ResponseEntity.status(HttpStatus.OK)
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
            .contentType(MediaType.parseMediaType(metaData.getContentType()))
            .contentLength(imageData.getData().length)
            .body(imageData.getData());
    }
}
