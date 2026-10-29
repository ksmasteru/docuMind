package com.docuMind.backend.exception;

// a login link that doesn't exist, has expired, was revoked, or no longer points at a technician
public class InvalidLoginLinkException extends RuntimeException{
    public InvalidLoginLinkException()
    {
        super();
    }

    public InvalidLoginLinkException(String message)
    {
        super(message);
    }

    public InvalidLoginLinkException(String message, Throwable cause) {
        super(message, cause);
    }
}
