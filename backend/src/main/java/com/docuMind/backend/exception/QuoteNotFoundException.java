package com.docuMind.backend.exception;

// no quote with the requested id
public class QuoteNotFoundException extends RuntimeException{
    public QuoteNotFoundException()
    {
        super();
    }

    public QuoteNotFoundException(String message)
    {
        super(message);
    }

    public QuoteNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
