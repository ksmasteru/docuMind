package com.docuMind.backend.exception;

// an alert action that doesn't fit the case as it is now (409): asking twice, deciding a request
// already decided, acting on a resolved case
public class AlertException extends RuntimeException {
    public AlertException(String message)
    {
        super(message);
    }
}
