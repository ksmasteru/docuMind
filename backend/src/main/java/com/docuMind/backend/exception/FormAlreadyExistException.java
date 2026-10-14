package com.docuMind.backend.exception;

public class FormAlreadyExistException extends RuntimeException{
    public FormAlreadyExistException()
    {
        super();
    }

    public FormAlreadyExistException(String message)
    {
        super(message);
    }

    public FormAlreadyExistException(String message, Throwable cause) {
        super(message, cause);
    }
}
