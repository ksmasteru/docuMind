package com.docuMind.backend.exception;

public class NoChunksException extends RuntimeException{
    public NoChunksException()
    {
        super();
    }

    public NoChunksException(String message)
    {
        super(message);
    }

    public NoChunksException(String message, Throwable cause) {
        super(message, cause);
    }
}
