package com.docuMind.backend.exception;

// the button can't be pressed on the intervention as it is (e.g. validating a step nobody took)
public class InvalidInterventionException extends RuntimeException{
    public InvalidInterventionException()
    {
        super();
    }

    public InvalidInterventionException(String message)
    {
        super(message);
    }

    public InvalidInterventionException(String message, Throwable cause) {
        super(message, cause);
    }
}
