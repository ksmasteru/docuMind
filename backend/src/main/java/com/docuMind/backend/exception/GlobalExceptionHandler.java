package com.docuMind.backend.exception;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.security.access.AccessDeniedException;

import com.fasterxml.jackson.databind.exc.InvalidFormatException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    // handling the custom exception we made
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorFormat> handleUserNotFoundException(
        UserNotFoundException ex, WebRequest request) {

    ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
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

    // no submission with the requested id, or not one of the caller's
    @ExceptionHandler(SubmissionNotFoundException.class)
    public ResponseEntity<ErrorFormat> handleSubmissionNotFoundException(SubmissionNotFoundException ex,
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

    // a login link that can't sign anyone in (unknown, expired, revoked)
    @ExceptionHandler(InvalidLoginLinkException.class)
    public ResponseEntity<ErrorFormat> handleInvalidLoginLinkException(InvalidLoginLinkException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.UNAUTHORIZED);
    }

    // a registration endpoint received a role it doesn't handle
    @ExceptionHandler(InvalidRoleException.class)
    public ResponseEntity<ErrorFormat> handleInvalidRoleException(InvalidRoleException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.BAD_REQUEST);
    }

        // @PreAuthorize refused the call (e.g. a technician calling an admin endpoint)
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorFormat> handleAccessDeniedException(AccessDeniedException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            "Access denied",
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.FORBIDDEN);
    }

    // no task with the requested id
    @ExceptionHandler(TaskNotFoundException.class)
    public ResponseEntity<ErrorFormat> handleTaskNotFoundException(TaskNotFoundException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.NOT_FOUND);
    }

    // no image with the requested id
    @ExceptionHandler(ImageNotFoundException.class)
    public ResponseEntity<ErrorFormat> handleImageNotFoundException(ImageNotFoundException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.NOT_FOUND);
    }

    // the image is already used by another report
    @ExceptionHandler(ImageAlreadyAttachedException.class)
    public ResponseEntity<ErrorFormat> handleImageAlreadyAttachedException(ImageAlreadyAttachedException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.CONFLICT);
    }

    // the task can't move to the requested status (e.g. starting an approved task)
    @ExceptionHandler(InvalidTaskException.class)
    public ResponseEntity<ErrorFormat> handleInvalidTaskException(InvalidTaskException ex,
        WebRequest request)
    {
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            ex.getMessage(),
            request.getDescription(false));
        return new ResponseEntity<>(errorFormat, HttpStatus.CONFLICT);
    }

    // the JSON body can't be read : broken JSON, unknown enum value ("taskType": "CORRECTI"),
    // wrong date format ("dueDate": "24-10-2026")...
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorFormat> handleHttpMessageNotReadableException(HttpMessageNotReadableException ex,
        WebRequest request)
    {
        String message = "malformed request body";
        if (ex.getCause() instanceof InvalidFormatException invalid && !invalid.getPath().isEmpty())
        {
            String field = invalid.getPath().get(invalid.getPath().size() - 1).getFieldName();
            message = field + ": '" + invalid.getValue() + "' is not valid";
            Class<?> target = invalid.getTargetType();
            if (target != null && target.isEnum())
                message += ". Accepted values: " + Arrays.toString(target.getEnumConstants());
        }
        ErrorFormat errorFormat = new ErrorFormat(
            LocalDateTime.now(),
            message,
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