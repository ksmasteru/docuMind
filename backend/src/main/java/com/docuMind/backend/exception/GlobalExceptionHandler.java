package com.docuMind.backend.exception;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;

@RestControllerAdvice
public class GlobalExceptionHandler {

    // handling the custom exception we made
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorFormat> handleUserNotFoundException(
        UserNotFoundException ex, WebRequest request) {

    ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            "lol",
            request.getDescription(false)
    );
    return new ResponseEntity<>(errorFormat, HttpStatus.NOT_FOUND);
}
    //handling standard java expcetion
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorFormat> handleIllegalArgumentException(
        IllegalArgumentException ex, WebRequest request)
        {
            ErrorFormat errorFormat = new ErrorFormat(
                LocalDateTime.now(),
                ex.getMessage(),
                request.getDescription(false)
            );
            return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST);
        }


    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorFormat> handleMethodArgumentNotValidException(
        MethodArgumentNotValidException ex, WebRequest request)
    {
        Map<String, String> errorResults = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                    .collect(Collectors.toMap(
                FieldError::getField,
                FieldError::getDefaultMessage
        ));
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            "validation failed",
            request.getDescription(false),
            errorResults
        );
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorFormat> handleException(
        Exception ex, WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
             LocalDateTime.now(),
             ex.getMessage(),
             request.getDescription(false)
        );
        return new ResponseEntity<>(errorFormat, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}