package com.docuMind.backend.exception;

public class InvalidAnswerSizeException extends RuntimeException{
    public InvalidAnswerSizeException()
    {
        super();
    }

    public InvalidAnswerSizeException(String message)
    {
        super(message);
    }

    public InvalidAnswerSizeException(String message, Throwable cause) {
        super(message, cause);
    }
}
