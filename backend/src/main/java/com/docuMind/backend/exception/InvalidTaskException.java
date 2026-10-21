package com.docuMind.backend.exception;

// the task can't move to the requested status (e.g. starting an approved task)
public class InvalidTaskException extends RuntimeException{
    public InvalidTaskException()
    {
        super();
    }

    public InvalidTaskException(String message)
    {
        super(message);
    }

    public InvalidTaskException(String message, Throwable cause) {
        super(message, cause);
    }
}
