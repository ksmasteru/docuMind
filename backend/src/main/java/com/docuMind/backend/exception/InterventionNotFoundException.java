package com.docuMind.backend.exception;

// no workshop intervention with the requested id
public class InterventionNotFoundException extends RuntimeException{
    public InterventionNotFoundException()
    {
        super();
    }

    public InterventionNotFoundException(String message)
    {
        super(message);
    }

    public InterventionNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
