package com.docuMind.backend.exception;

// a form sent to POST /api/v1/forms/ whose questions don't hold together (options missing or
// malformed for their answer type): 400
public class InvalidFormException extends RuntimeException{
    public InvalidFormException()
    {
        super();
    }

    public InvalidFormException(String message)
    {
        super(message);
    }

    public InvalidFormException(String message, Throwable cause) {
        super(message, cause);
    }
}
