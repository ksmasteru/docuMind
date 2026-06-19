package com.docuMind.backend.exception;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ErrorFormat{

    private LocalDateTime timeStamp;
    private String message;
    private String details;
    private Map<String, String> Errors;

    public ErrorFormat(LocalDateTime time, String message, String details){
        this. timeStamp = time;
        this.message = message;
        this.details = details;
        this.Errors = new HashMap<>();
    }

    public ErrorFormat(LocalDateTime time, String message, String details, Map<String, String> Errors){
        this.timeStamp = time;
        this.message = message;
        this.details = details;
        this.Errors = Errors;
    }

    public String getMessage()
    {
        return this.message;
    }

    public String getdetails()
    {
        return this.details;
    }

    public LocalDateTime getTimestap()
    {
        return this.timeStamp;
    }

    public Map<String, String> getErrors()
    {
        return this.Errors;
    }
}