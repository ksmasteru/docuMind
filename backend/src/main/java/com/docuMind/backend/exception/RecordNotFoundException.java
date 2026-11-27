package com.docuMind.backend.exception;

// no client, pump or spare part with the requested id (404)
public class RecordNotFoundException extends RuntimeException {
    public RecordNotFoundException(String message)
    {
        super(message);
    }
}
