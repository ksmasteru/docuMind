// AnalysisServiceClient.java
package com.docuMind.backend.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import com.docuMind.backend.model.AnalysisResult;

@Service
public class AnalysisServiceClient {

    private final RestTemplate restTemplate;

    @Value("${analysis.service.url}")
    private String analysisServiceUrl;

    public AnalysisServiceClient() {
        this.restTemplate = new RestTemplate();
    }

    public AnalysisResult analyse(byte[] fileBytes, String originalFilename) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        // Plain ByteArrayResource has no filename by default, and analysis-service
        // (FastAPI) needs one to know it's dealing with an UploadFile part at all
        // and to pick .csv vs .xlsx parsing — hence the override. Built from the
        // in-memory bytes captured on the original request thread, not a
        // MultipartFile: that object's backing temp file on disk is gone by the
        // time this runs, since ingestion happens asynchronously after the
        // upload request has already completed.
        ByteArrayResource fileResource = new ByteArrayResource(fileBytes) {
            @Override
            public String getFilename() {
                return originalFilename;
            }
        };

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", fileResource);

        HttpEntity<MultiValueMap<String, Object>> request =
            new HttpEntity<>(body, headers);

        ResponseEntity<AnalysisResult> response = restTemplate.postForEntity(
            analysisServiceUrl + "/analyse",
            request,
            AnalysisResult.class
        );

        return response.getBody();
    }
}