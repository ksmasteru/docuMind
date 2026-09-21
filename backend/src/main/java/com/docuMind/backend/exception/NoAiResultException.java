package com.docuMind.backend.exception;

public class NoAiResultException extends RuntimeException{
    public NoAiResultException()
    {
        super();
    }

    public NoAiResultException(String message)
    {
        super(message);
    }

    public NoAiResultException(String message, Throwable cause) {
        super(message, cause);
    }
}
