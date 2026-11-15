package com.docuMind.backend.exception;

// no such alert case, or one outside what the caller may see (a technician: the open cases of his site
// and his own reports); the same 404 either way, so numbers can't be probed
public class AlertNotFoundException extends RuntimeException {
    public AlertNotFoundException(String message)
    {
        super(message);
    }
}
