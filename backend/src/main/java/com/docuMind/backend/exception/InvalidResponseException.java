package com.docuMind.backend.exception;

public class InvalidResponseException extends RuntimeException{
    public InvalidResponseException()
    {
        super();
    }

    public InvalidResponseException(String message)
    {
        super(message);
    }

    public InvalidResponseException(String message, Throwable cause) {
        super(message, cause);
    }
}
