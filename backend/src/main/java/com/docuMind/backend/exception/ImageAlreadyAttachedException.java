package com.docuMind.backend.exception;

public class ImageAlreadyAttachedException extends RuntimeException{
    public ImageAlreadyAttachedException()
    {
        super();
    }

    public ImageAlreadyAttachedException(String message)
    {
        super(message);
    }

    public ImageAlreadyAttachedException(String message, Throwable cause) {
        super(message, cause);
    }
}
