package com.docuMind.backend.exception;

public class CommentRequiredException extends RuntimeException{
    public CommentRequiredException()
    {
        super();
    }

    public CommentRequiredException(String message)
    {
        super(message);
    }

    public CommentRequiredException(String message, Throwable cause) {
        super(message, cause);
    }
}
