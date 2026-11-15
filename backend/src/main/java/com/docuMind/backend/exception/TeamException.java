package com.docuMind.backend.exception;

// a team change that conflicts with what is there (409): the technician is in another
// manager's team, the e-mail of a new account is already used
public class TeamException extends RuntimeException {
    public TeamException(String message)
    {
        super(message);
    }
}
