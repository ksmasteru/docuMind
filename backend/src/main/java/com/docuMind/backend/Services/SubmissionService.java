package com.docuMind.backend.services;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;


import com.docuMind.backend.exception.CommentRequiredException;
import com.docuMind.backend.exception.FormNotActiveException;
import com.docuMind.backend.exception.FormNotFoundException;
import com.docuMind.backend.exception.ImageAlreadyAttachedException;
import com.docuMind.backend.exception.ImageNotFoundException;
import com.docuMind.backend.exception.IncompleteAnswersException;
import com.docuMind.backend.exception.InvalidAnswerSizeException;
import com.docuMind.backend.exception.InvalidResponseException;
import com.docuMind.backend.exception.SubmissionNotFoundException;
import com.docuMind.backend.model.CheckListAnswer;
import com.docuMind.backend.model.CheckListItem;
import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.ImageEntity;
import com.docuMind.backend.model.SubmissionReport;
import com.docuMind.backend.model.SubmissionRequest;
import com.docuMind.backend.model.SubmissionRequest.AnswerItem;
import com.docuMind.backend.model.SubmissionResponse;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.AnswerType;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.repository.CheckListTemplateRepository;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.UserRepository;

import jakarta.transaction.Transactional;

@Service
@Transactional
public class SubmissionService {

    // rejection happens when not all questions are answered
    // NON_CONFORME : A CRTICAL SECTION IS MAUVAIS
    // saves and reads submissions (answers are saved by cascade)
    private final SubmissionRepository submissionRepository;

    // needed to load the template being answered and its questions (checks ① to ④)
    private final CheckListTemplateRepository checkListTemplateRepository;

    // the inspector's name on the PDF (a submission only keeps their email)
    private final UserRepository userRepository;

    private final ImageService imageService;

    // moves the task a report answers to SUBMITTED
    private final TaskService taskService;

    // PDF dates are written like on the paper sheets, in the sites' time: the server may
    // run in UTC (Docker), which would put "submitted at" an hour off in Morocco.
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final ZoneId SITE_ZONE = ZoneId.of("Africa/Casablanca");

    public SubmissionService(SubmissionRepository submissionRepository,
                             CheckListTemplateRepository checkListTemplateRepository,
                             UserRepository userRepository,
                            ImageService imageService,
                            TaskService taskService)
    {
        this.submissionRepository = submissionRepository;
        this.checkListTemplateRepository = checkListTemplateRepository;
        this.userRepository = userRepository;
        this.imageService = imageService;
        this.taskService = taskService;
    }

    // The PDF's content for a saved submission. Rebuilt on every call: nothing about the PDF
    // is stored. Readable by its author, and by the manager of the task it answers (to review it).
    public SubmissionReport getReport(String submissionId, String userId)
    {
        CheckListSubmission submission = submissionRepository.findById(submissionId)
                .filter(s -> canRead(s, userId))
                .orElseThrow(() -> new SubmissionNotFoundException("no submission with id " + submissionId));
        CheckListTemplate template = submission.getTemplate();

        // the template expects the rows in sheet order
        List<SubmissionReport.ReportRow> rows = submission.getAnswers().stream()
                .sorted(Comparator.comparingInt((CheckListAnswer a) -> a.getItem().getPosition()))
                .map(this::toReportRow)
                .toList();

        String inspector = userRepository.findByEmail(submission.getUserId())
                .map(User::getName)
                .filter(name -> name != null && !name.isBlank())
                .orElse(submission.getUserId());

        return new SubmissionReport(
                template.getTitle(),
                switch (template.getCheckListType()) {
                    case INSPECTION -> "Inspection";
                    case PERMIT -> "Permis de travail";
                },
                template.getVersion(),
                template.getInstructions(),
                submission.getId(),
                submission.getEquipment(),
                submission.getInspectionDate() == null ? "" : submission.getInspectionDate().format(DAY),
                inspector,
                submission.getSubmittedAt() == null ? "" : submission.getSubmittedAt().atZone(SITE_ZONE).format(DAY_TIME),
                submission.getStatus().name(),
                submission.getRemarks(),
                rows);
    }

    // An IMAGE answer's value is the image id: the PDF shows the photo, never the id.
    // The renderer can't call the authenticated /images endpoint, so the photo goes in as a
    // data URI. A photo that can't be read becomes a note instead of failing the whole PDF.
    private SubmissionReport.ReportRow toReportRow(CheckListAnswer a)
    {
        CheckListItem item = a.getItem();
        String value = a.getValue();
        String photo = null;
        if (item.getAnswerType() == AnswerType.IMAGE)
        {
            photo = imageService.getPhotoDataUri(value);
            value = photo == null ? "Photo non disponible" : null;
        }
        return new SubmissionReport.ReportRow(item.getPosition(), item.getLabelFr(), item.getLabelAr(),
                item.isCritical(), value, a.getComment(), photo);
    }

    // the author, or the manager who sent the task this report answers.
    // Anyone else gets the same 404 as an unknown id, so ids can't be probed.
    // The task is only looked up when the caller isn't the author.
    private boolean canRead(CheckListSubmission submission, String userId)
    {
        if (submission.getUserId().equals(userId))
            return true;
        return submission.getTaskId() != null && taskService.isTaskManager(submission.getTaskId(), userId);
    }

    private SubmissionStatus checkSumbSubmissionStatus(SubmissionRequest request, CheckListTemplate template)
    {
        List<CheckListItem> questions = template.getQuestions();
        SubmissionStatus status = SubmissionStatus.CONFORME;
        // gettings answers out of request
        List<AnswerItem> answers = request.answers();

        if (questions.size() != answers.size())
            throw new InvalidAnswerSizeException("expected " + questions.size()
                    + " answers, received " + answers.size());
        // extracting questionsid from request
        List<String> answersId = answers.stream()
                                    .map(q -> q.itemId())
                                    .collect(Collectors.toList());
        
        for (CheckListItem question : questions)
        {
            if (answersId.contains(question.getId()))
            {
                // dependon collect preseving the order.
                int index = answersId.indexOf(question.getId());
                AnswerItem answer = answers.get(index);
                // now we check if the answer is valid.
                if (question.isCritical() && question.getAnswerType() == AnswerType.BON_MAUVAIS && answer.value().trim().toLowerCase().equals("mauvais"))
                {
                    if (answer.comment() == null || answer.comment().isBlank())
                        throw new CommentRequiredException("comment required for question " + question.getPosition());
                    status = SubmissionStatus.NON_CONFORME;
                }
                // checking the correct type of answer
                AnswerType type = question.getAnswerType();
                if (type.equals(AnswerType.BON_MAUVAIS))
                {
                    if (!answer.value().trim().toLowerCase().equals("bon")
                            && !answer.value().trim().toLowerCase().equals("mauvais"))
                    {
                        throw new InvalidResponseException("invalid answer for question " + question.getPosition()
                                + ": expected BON or MAUVAIS");
                    }
                }
            }
            else
            {
                throw new IncompleteAnswersException("question " + question.getPosition() + " is not answered");
            }
        }
        return status;
    }

    public SubmissionResponse validateSubmission(SubmissionRequest request, String userId)
    {
        // get the template these questions are derived from.
        String templateId = request.templateId();

        
        CheckListTemplate template = checkListTemplateRepository.findById(templateId).orElseThrow(
            () -> new FormNotFoundException("no form with id " + templateId)
        );
        if (!template.isActive())
            throw new FormNotActiveException("form " + templateId + " is not active anymore");
        
        SubmissionStatus status = this.checkSumbSubmissionStatus(request, template);

        // used by the save loop below
        List<CheckListItem> questions = template.getQuestions();
        List<AnswerItem> answers = request.answers();
        /*
        List<CheckListItem> questions = template.getQuestions();
        
        List<AnswerItem> answers = request.answers();

        if (questions.size() != answers.size())
            throw new InvalidAnswerSizeException("expected " + questions.size()
                    + " answers, received " + answers.size());
        // extracting questionsid from request
        List<String> answersId = answers.stream()
                                    .map(q -> q.itemId())
                                    .collect(Collectors.toList());
        
        
        for (CheckListItem question : questions)
        {
            if (answersId.contains(question.getId()))
            {
                // dependon collect preseving the order.
                int index = answersId.indexOf(question.getId());
                AnswerItem answer = answers.get(index);
                // now we check if the answer is valid.
                if (question.isCritical() && question.getAnswerType() == AnswerType.BON_MAUVAIS && answer.value().trim().toLowerCase().equals("mauvais"))
                {
                    if (answer.comment() == null || answer.comment().isBlank())
                        throw new CommentRequiredException("comment required for question " + question.getPosition());
                    status = SubmissionStatus.NON_CONFORME;
                }
                // checking the correct type of answer
                AnswerType type = question.getAnswerType();
                if (type.equals(AnswerType.BON_MAUVAIS))
                {
                    if (!answer.value().trim().toLowerCase().equals("bon")
                            && !answer.value().trim().toLowerCase().equals("mauvais"))
                    {
                        throw new InvalidResponseException("invalid answer for question " + question.getPosition()
                                + ": expected BON or MAUVAIS");
                    }
                }
            }
            else
            {
                throw new IncompleteAnswersException("question " + question.getPosition() + " is not answered");
            }
        }
        */
        CheckListSubmission checkListSubmission = new CheckListSubmission();
        
        checkListSubmission.setTemplate(template);
        
        checkListSubmission.setEquipment(request.equipment());

        checkListSubmission.setInspectionDate(request.inspectionDate());
        
        checkListSubmission.setUserId(userId);
        
        checkListSubmission.setStatus(status);
        
        checkListSubmission.setRemarks(request.remarks());
        
        List<CheckListAnswer> _answers = new ArrayList<>();

        // images used by this submission: attached once the submission has its id
        List<ImageEntity> images = new ArrayList<>();
        // catches the same image sent for two questions (reportId is still null for both)
        Set<String> usedImageIds = new HashSet<>();

        for (AnswerItem answer : answers)
        {
            // create a new answer item based on the request answers.
            CheckListAnswer checkAnswer = new CheckListAnswer();
            checkAnswer.setSubmission(checkListSubmission);
            // the question this answer belongs to, taken from the template's own questions
            CheckListItem item = questions.stream()
                    .filter(q -> q.getId().equals(answer.itemId()))
                    .findFirst()
                    .orElseThrow(() -> new IncompleteAnswersException(
                            "answer for unknown question " + answer.itemId()));
            checkAnswer.setItem(item);
            if (item.getAnswerType().equals(AnswerType.BON_MAUVAIS))
                checkAnswer.setValue(answer.value().trim().toLowerCase());
            else if (item.getAnswerType().equals(AnswerType.IMAGE))
            {
                String imageId = answer.value().trim();
                // a wrong id is a bad request body, not a missing resource
                ImageEntity imageEntity;
                try {
                    imageEntity = imageService.getImageMetaData(imageId);
                } catch (ImageNotFoundException e) {
                    throw new InvalidResponseException("invalid answer for question " + item.getPosition()
                            + ": no image with id " + imageId);
                }
                // only the technician who uploaded the photo can use it
                if (!imageEntity.getUploadedBy().equals(userId))
                    throw new AccessDeniedException("image " + imageId + " does not belong to you");
                if (imageEntity.getReportId() != null || !usedImageIds.add(imageId))
                    throw new ImageAlreadyAttachedException("image " + imageId + " is already attached to a report");
                images.add(imageEntity);
                checkAnswer.setValue(imageId);
            }
            else
                checkAnswer.setValue(answer.value());
            checkAnswer.setComment(answer.comment());
            _answers.add(checkAnswer);
        }
        
        checkListSubmission.setAnswers(_answers);

        String taskId = (request.taskId() == null || request.taskId().isBlank()) ? null : request.taskId().trim();
        checkListSubmission.setTaskId(taskId);

        submissionRepository.save(checkListSubmission);

        // a report for a task: check the task and move it to SUBMITTED. After the save because
        // the task keeps the submission's id; a refused task still undoes the save, since both
        // run in this transaction
        if (taskId != null)
            taskService.submitTask(taskId, userId, templateId, checkListSubmission.getId());

        // the id exists only after save. The images are managed entities,
        // so the transaction writes reportId without an explicit save
        for (ImageEntity image : images)
            image.setReportId(checkListSubmission.getId());

        return new SubmissionResponse(checkListSubmission.getId(), status);
    }
}
