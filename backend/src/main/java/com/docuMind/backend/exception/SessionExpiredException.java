package com.docuMind.backend.exception;

public class SessionExpiredException extends RuntimeException{
    public SessionExpiredException()
    {
        super();
    }

    public SessionExpiredException(String message)
    {
        super(message);
    }
    
    public SessionExpiredException(String message, Throwable cause) {
        super(message, cause);
    }
}
