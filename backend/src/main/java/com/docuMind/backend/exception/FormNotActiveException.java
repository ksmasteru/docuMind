package com.docuMind.backend.exception;

public class FormNotActiveException extends RuntimeException{
    public FormNotActiveException()
    {
        super();
    }

    public FormNotActiveException(String message)
    {
        super(message);
    }

    public FormNotActiveException(String message, Throwable cause) {
        super(message, cause);
    }
}
