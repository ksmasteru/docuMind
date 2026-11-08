package com.docuMind.backend.exception;

// the form can't be deleted: submissions still point at it (template_id is a non-null FK)
public class FormInUseException extends RuntimeException{
    public FormInUseException()
    {
        super();
    }

    public FormInUseException(String message)
    {
        super(message);
    }

    public FormInUseException(String message, Throwable cause) {
        super(message, cause);
    }
}
