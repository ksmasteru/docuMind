package com.docuMind.backend.exception;

// also thrown for someone else's submission, so its existence isn't revealed
public class SubmissionNotFoundException extends RuntimeException{
    public SubmissionNotFoundException()
    {
        super();
    }

    public SubmissionNotFoundException(String message)
    {
        super(message);
    }

    public SubmissionNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
