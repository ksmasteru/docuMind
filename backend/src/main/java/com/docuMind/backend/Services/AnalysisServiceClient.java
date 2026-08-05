// AnalysisServiceClient.java
package com.docuMind.backend.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.model.AnalysisResult;

@Service
public class AnalysisServiceClient {

    private final RestTemplate restTemplate;

    @Value("${analysis.service.url:http://localhost:8001}")
    private String analysisServiceUrl;

    public AnalysisServiceClient() {
        this.restTemplate = new RestTemplate();
    }

    public AnalysisResult analyse(MultipartFile file) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        // MultipartFile#getResource() already carries the original filename
        // through, so no custom Resource wrapper is needed here.
        body.add("file", file.getResource());

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