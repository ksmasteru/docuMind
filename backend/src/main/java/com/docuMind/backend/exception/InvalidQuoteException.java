package com.docuMind.backend.exception;

// a quote action that the intervention's state doesn't allow (409)
public class InvalidQuoteException extends RuntimeException{
    public InvalidQuoteException()
    {
        super();
    }

    public InvalidQuoteException(String message)
    {
        super(message);
    }

    public InvalidQuoteException(String message, Throwable cause) {
        super(message, cause);
    }
}
