package com.docuMind.backend.services;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;


import com.docuMind.backend.exception.CommentRequiredException;
import com.docuMind.backend.exception.FormNotActiveException;
import com.docuMind.backend.exception.FormNotFoundException;
import com.docuMind.backend.exception.IncompleteAnswersException;
import com.docuMind.backend.exception.InvalidAnswerSizeException;
import com.docuMind.backend.exception.InvalidResponseException;
import com.docuMind.backend.model.CheckListAnswer;
import com.docuMind.backend.model.CheckListItem;
import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.SubmissionRequest;
import com.docuMind.backend.model.SubmissionRequest.AnswerItem;
import com.docuMind.backend.model.SubmissionResponse;
import com.docuMind.backend.model.enums.AnswerType;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.SubMissionReport;
import com.docuMind.backend.repository.CheckListTemplateRepository;
import com.docuMind.backend.repository.SubmissionRepository;

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

    public SubmissionService(SubmissionRepository submissionRepository,
                             CheckListTemplateRepository checkListTemplateRepository)
    {
        this.submissionRepository = submissionRepository;
        this.checkListTemplateRepository = checkListTemplateRepository;
    }

    /* 
    public ByteArrayResource previewSubmission(SubmissionRequest request,
                                                     authentication)
    {
        // check the data validity.

        // if valid make a pdf out of that data

        // store that pdf inside a new table with a reconizble name

        // return that pdf to preview .

        // later return the id of pdf file to frontend to allow downloading.
        String templateId = request.templateId();
        
        CheckListTemplate template = checkListTemplateRepository.findById(templateId).orElseThrow(
            () -> new FormNotFoundException("no form with id " + templateId)
        );
        if (!template.isActive())
            throw new FormNotActiveException("form " + templateId + " is not active anymore");
        SubmissionStatus status = this.checkSumbSubmissionStatus(request, template);
        
        CheckListSubmission checkListSubmission = new CheckListSubmission();

        checkListSubmission.setTemplate(template);
        
        checkListSubmission.setEquipment(request.equipment());

        checkListSubmission.setInspectionDate(request.inspectionDate());
        
        checkListSubmission.setUserId(userId);
        
        checkListSubmission.setStatus(status);
        
        checkListSubmission.setRemarks(request.remarks());
        
        List<CheckListAnswer> _answers = new ArrayList<>();
        
        // logic of preview can be implemented jut here.
        List<SubMissionReport.ReportRow> __answers = new ArrayList<>();
        for (AnswerItem answer : answers)
        {
            // create a new answer item based on the request answers.
            CheckListAnswer checkAnswer = new CheckListAnswer();
            //SubMissionReport.ReportRow reportRow = new SubMissionReport.ReportRow();
            checkAnswer.setSubmission(checkListSubmission);
            // the question this answer belongs to, taken from the template's own questions
            CheckListItem item = questions.stream()
                    .filter(q -> q.getId().equals(answer.itemId()))
                    .findFirst()
                    .orElseThrow(() -> new IncompleteAnswersException(
                            "answer for unknown question " + answer.itemId()));
            checkAnswer.setItem(item);
            // filling report row questions section
            SubMissionReport.ReportRow reportRow = new SubMissionReport.ReportRow(item.getPosition(),
                    item.getLabelFr(), item.getLabelAr(), item.isCritical(), answer.value(), answer.comment());

            // done
            if (item.getAnswerType().equals(AnswerType.BON_MAUVAIS))
                checkAnswer.setValue(answer.value().trim().toLowerCase());
            else
                checkAnswer.setValue(answer.value());
            checkAnswer.setComment(answer.comment());
            _answers.add(checkAnswer);
            __answers.add(reportRow);
        }
        checkListSubmission.setAnswers(_answers);
        SubmissionReport report = new SubmissionReport(templateId, checkListSubmission.getId(), __answers);
        // make a pdf file out of the checkListsubmission
        BytesArrayRessource pdfFile = this.buildReport(report);
        
        // here we can optionnaly store it with a unique name "user@type@data.pdf"
        // {id, bytesArrayRessource} to allow futur download ?
        return pdfFile;
    }
    /*
    5. Flatten it into a record, for example SubmissionReport,
    with a nested ReportRow(position, labelFr, labelAr, critical,
    value, comment). Sort the rows by question position. 
    This keeps the template simple: it only reads plain values, never entities. 
    It's also the same "build the inner records first, 
    then the parent" pattern from your response records. */
    
    // PREVIEW (disabled) @Transactional(readOnly = true)
    // PREVIEW (disabled) public SubmissionReport buildReport(SubmissionReport report)
    // PREVIEW (disabled) {
    // PREVIEW (disabled) // every row represnt question + answer.
         
    // PREVIEW (disabled) }
    // PREVIEW (disabled) // we will use HTML template because PDFBOX wont accept arabic.
    // PREVIEW (disabled) public ByteArrayResource makeSubmissionPdfFile(CheckListSubmission checkListSubmission)
    // PREVIEW (disabled) {
    // PREVIEW (disabled) /*
    // PREVIEW (disabled) Header: PHOVA logo, form title, type and version, instructions.
    // PREVIEW (disabled) Metadata: equipment, inspection date, inspector, submission time and status (Conforme or Non conforme).
    // PREVIEW (disabled) A table of answers, one row per question: number, French and Arabic labels, a critical marker, the answer, and the comment.
    // PREVIEW (disabled) Remarks, and a visa line.
    // PREVIEW (disabled) */
    // PREVIEW (disabled) // the tempalte is already verified by previous methods.

    // PREVIEW (disabled) }

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
            else
                checkAnswer.setValue(answer.value());
            checkAnswer.setComment(answer.comment());
            _answers.add(checkAnswer);
        }
        
        checkListSubmission.setAnswers(_answers);

        submissionRepository.save(checkListSubmission);
        
        return new SubmissionResponse(checkListSubmission.getId(), status);
    }
}
