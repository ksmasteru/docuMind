package com.docuMind.backend.exception;

public class  FileNotSupportedException extends RuntimeException{
    public FileNotSupportedException()
    {
        super();
    }

    public FileNotSupportedException(String message)
    {
        super(message);
    }
    
    public FileNotSupportedException(String message, Throwable cause) {
        super(message, cause);
    }
}
