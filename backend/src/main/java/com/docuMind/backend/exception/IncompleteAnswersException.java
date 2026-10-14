package com.docuMind.backend.exception;

public class IncompleteAnswersException extends RuntimeException{
    public IncompleteAnswersException()
    {
        super();
    }

    public IncompleteAnswersException(String message)
    {
        super(message);
    }

    public IncompleteAnswersException(String message, Throwable cause) {
        super(message, cause);
    }
}
