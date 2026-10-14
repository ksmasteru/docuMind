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

    @ExceptionHandler(FileNotSupportedException.class)
    public ResponseEntity<ErrorFormat> handleFileNotsupportedException(
        FileNotSupportedException ex, WebRequest request
    )
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false)
        );
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(SessionExpiredException.class)
    public ResponseEntity<ErrorFormat> handleSessionExpiredException(SessionExpiredException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST); // should be 401 : unauthorized 
    }

    @ExceptionHandler(NoChunksException.class)
    public ResponseEntity<ErrorFormat> handleNoChunksException(NoChunksException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(NoAiResultException.class)
    public ResponseEntity<ErrorFormat> handleNoAiResultException(NoAiResultException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_GATEWAY);
    }

    // a checklist form with this title is already active, or the same title + version was saved concurrently
    @ExceptionHandler(FormAlreadyExistException.class)
    public ResponseEntity<ErrorFormat> handleFormAlreadyExistException(FormAlreadyExistException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.CONFLICT);
    }

    // no checklist form with the requested id
    @ExceptionHandler(FormNotFoundException.class)
    public ResponseEntity<ErrorFormat> handleFormNotFoundException(FormNotFoundException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.NOT_FOUND);
    }

    // the submitted form is an old (inactive) version
    @ExceptionHandler(FormNotActiveException.class)
    public ResponseEntity<ErrorFormat> handleFormNotActiveException(FormNotActiveException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST);
    }

    // a critical question answered MAUVAIS has no comment
    @ExceptionHandler(CommentRequiredException.class)
    public ResponseEntity<ErrorFormat> handleCommentRequiredException(CommentRequiredException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST);
    }

    // the answers don't match the form's questions
    @ExceptionHandler(IncompleteAnswersException.class)
    public ResponseEntity<ErrorFormat> handleIncompleteAnswersException(IncompleteAnswersException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST);
    }

    // the number of answers differs from the number of questions
    @ExceptionHandler(InvalidAnswerSizeException.class)
    public ResponseEntity<ErrorFormat> handleInvalidAnswerSizeException(InvalidAnswerSizeException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST);
    }

    // an answer's value doesn't fit its question's answer type (e.g. "peut-être" for BON_MAUVAIS)
    @ExceptionHandler(InvalidResponseException.class)
    public ResponseEntity<ErrorFormat> handleInvalidResponseException(InvalidResponseException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
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