package com.docuMind.backend.controller;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.model.AiResponse;
import com.docuMind.backend.model.AiResponse.chatAnswer;
import com.docuMind.backend.model.AskRequest;
import com.docuMind.backend.services.AskService;

@RestController
@RequestMapping("/api/v1/ask")
public class AskController {
    
    private final AskService askService;
    public AskController(AskService askService)
    {
        this.askService = askService;
    }

    
    @PostMapping("/image")
    public ResponseEntity<AiResponse>askImage(
           @RequestParam("image") MultipartFile file, Authentication authentication) 
    {
        String answer = askService.answerImageQuestions(file, authentication.getName());
        List<chatAnswer> answers = Arrays.stream(answer.split("\\r?\\n|\\r"))
            .filter(line -> !line.isBlank())
            .map(singleAnswer -> singleAnswer.split("\\.\\s*", 2))
            // A line the model wrote without a leading "N." splits into one part,
            // so guard on the length: the lone part is the answer, not a key.
            .map(parts -> parts.length > 1
                ? new chatAnswer(parts[0].trim(), parts[1].trim())
                : new chatAnswer("-", parts[0].trim()))
            .collect(Collectors.toList());
        AiResponse response = new AiResponse(answers, answers.size());
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }

   @PostMapping
   public ResponseEntity<AiResponse>ask(
        @RequestBody AskRequest request,
        Authentication authentication)
   {
        String answer = askService.answerWithAiRag(request, authentication.getName());
        chatAnswer chatAnswer = new chatAnswer("-", answer);
        AiResponse response = new AiResponse(List.of(chatAnswer), 1);
        return ResponseEntity.status(HttpStatus.OK).body(response);
   }

    // using ai transcribe an audio to text
    @PostMapping("/transcribe")
    public ResponseEntity<AiResponse>transcribe(
        @RequestParam("audio") MultipartFile file, Authentication authentication)
    {
        String answer = askService.transcribe(file, authentication.getName());
        // Same AiResponse envelope as /ask: the transcript is one answer keyed
        // "-", so the client parses every endpoint the same way.
        chatAnswer chatAnswer = new chatAnswer("-", answer);
        AiResponse response = new AiResponse(List.of(chatAnswer), 1);
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }
}