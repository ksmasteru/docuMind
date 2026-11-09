package com.docuMind.backend.services;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.HashMap;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
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
import com.docuMind.backend.model.ExpertiseReport;
import com.docuMind.backend.model.ImageEntity;
import com.docuMind.backend.model.SubmissionReport;
import com.docuMind.backend.model.SubmissionRequest;
import com.docuMind.backend.model.SubmissionRequest.AnswerItem;
import com.docuMind.backend.model.SubmissionResponse;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.AnswerType;
import com.docuMind.backend.model.enums.SubmissionStatus;
import com.docuMind.backend.model.enums.WorkshopStep;
import com.docuMind.backend.repository.CheckListTemplateRepository;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.FormDraftRepository;
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

    // the v2 expertise reports' answers: choices, readings, photos with titles, added parts
    private final StructuredAnswers structuredAnswers;

    // the form's draft goes once the report is sent (form-draft-persistence.md)
    private final FormDraftRepository formDraftRepository;

    public SubmissionService(SubmissionRepository submissionRepository,
                             CheckListTemplateRepository checkListTemplateRepository,
                             UserRepository userRepository,
                            ImageService imageService,
                            TaskService taskService,
                            StructuredAnswers structuredAnswers,
                            FormDraftRepository formDraftRepository)
    {
        this.structuredAnswers = structuredAnswers;
        this.formDraftRepository = formDraftRepository;
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
        return toReport(submission, submission.getId());
    }

    // a submission, saved or not (previewReport), as the PDF reads it; id: the reference printed on it
    private SubmissionReport toReport(CheckListSubmission submission, String id)
    {
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
                id,
                submission.getEquipment(),
                submission.getInspectionDate() == null ? "" : submission.getInspectionDate().format(DAY),
                inspector,
                submission.getSubmittedAt() == null ? "" : submission.getSubmittedAt().atZone(SITE_ZONE).format(DAY_TIME),
                submission.getStatus().name(),
                submission.getRemarks(),
                rows,
                structuredAnswers.readExtraParts(submission.getExtraParts()).stream()
                    .map(part -> {
                        Gallery gallery = gallery(part.photos());
                        return new SubmissionReport.ExtraPart(part.name(), part.findings(), part.comment(),
                                part.recommendation(), gallery.photos(), gallery.captions());
                    })
                    .toList());
    }

    // the photos that could be read, as data URIs, and their captions in the same order
    private record Gallery(List<String> photos, List<SubmissionReport.Caption> captions, boolean missing) {}

    private Gallery gallery(List<StructuredAnswers.PhotoRef> refs)
    {
        List<String> photos = new ArrayList<>();
        List<SubmissionReport.Caption> captions = new ArrayList<>();
        for (StructuredAnswers.PhotoRef ref : refs)
        {
            String uri = imageService.getPhotoDataUri(ref.imageId());
            if (uri == null)
                continue;
            photos.add(uri);
            captions.add(new SubmissionReport.Caption(ref.title(), ref.comment()));
        }
        return new Gallery(photos, captions, photos.size() < refs.size());
    }

    // An IMAGE answer's value is its image ids ("id1,id2", or null for no photo): the PDF shows
    // the photos, never the ids. The renderer can't call the authenticated /images endpoint, so
    // each photo goes in as a data URI. A photo that can't be read becomes a note instead of
    // failing the whole PDF.
    // An IMAGE answer is stored as "id1,id2" (old forms) or [{ imageId, title, comment }] (v2); the v2
    // types (choices, readings, parts summary) as JSON, read back as a line of text for the PDF and
    // their structure for the review page (StructuredAnswers.describe).
    private SubmissionReport.ReportRow toReportRow(CheckListAnswer a)
    {
        CheckListItem item = a.getItem();
        String value = a.getValue();
        List<String> photos = List.of();
        List<SubmissionReport.Caption> captions = List.of();
        com.fasterxml.jackson.databind.JsonNode data = null;
        AnswerType type = item.getAnswerType();
        if (type == AnswerType.IMAGE)
        {
            Gallery gallery = gallery(structuredAnswers.photoRefs(value));
            photos = gallery.photos();
            captions = gallery.captions();
            value = gallery.missing() ? "Photo non disponible" : null;
        }
        else if (isStructured(type))
        {
            StructuredAnswers.Readable readable = structuredAnswers.describe(item, value);
            value = readable.text();
            data = readable.data();
        }
        String group = item.getOptions() == null ? null : structuredAnswers.readOptions(item.getOptions()).path("group").asText(null);
        return new SubmissionReport.ReportRow(item.getPosition(), item.getLabelFr(), item.getLabelAr(),
                item.isCritical(), value, a.getComment(), photos.isEmpty() ? null : photos.get(0), photos,
                type.name(), data, captions, group);
    }

    // the answer types checked and stored by StructuredAnswers (JSON, or the photos' ids)
    private static boolean isStructured(AnswerType type)
    {
        return type != AnswerType.BON_MAUVAIS && type != AnswerType.TEXT;
    }

    // the author, the manager who sent the task this report answers, or, when that task is a
    // workshop intervention's (step 8 / 16), any workshop role: the file goes from one to the next,
    // like the intervention itself (the Chef de projet prices the parts from it).
    // Anyone else gets the same 404 as an unknown id, so ids can't be probed.
    // The task is only looked up when the caller isn't the author.
    private boolean canRead(CheckListSubmission submission, String userId)
    {
        if (submission.getUserId().equals(userId))
            return true;
        String taskId = submission.getTaskId();
        if (taskId == null)
            return false;
        if (taskService.isTaskManager(taskId, userId))
            return true;
        return taskService.isWorkshopTask(taskId)
            && userRepository.findByEmail(userId)
                .map(user -> user.getRole() != null && !WorkshopStep.forRole(user.getRole()).isEmpty())
                .orElse(false);
    }

    // The full expertise report is the paper report: much of it can stay empty (a part with no
    // photo, a measure not taken), and so can the v2 reports (a part not inspected, report_ui.md).
    // Every other form needs every answer.
    private static boolean allowsBlank(CheckListTemplate template)
    {
        return ExpertiseReport.isFor(template.getTitle()) || StructuredAnswers.isV2(template.getTitle());
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
                // the v2 types are checked here (choices among the options, readings are numbers…);
                // "{ selected: [] }" counts as blank like an empty text
                StructuredAnswers.Normalized structured = isStructured(question.getAnswerType())
                        ? structuredAnswers.normalize(question, answer.value(), StructuredAnswers.isV2(template.getTitle()))
                        : null;
                boolean blank = structured != null ? structured.blank()
                        : answer.value() == null || answer.value().isBlank();
                // an empty answer: only where the form allows it, and never for Bon / Mauvais
                if (blank)
                {
                    if (question.getAnswerType() == AnswerType.BON_MAUVAIS || !allowsBlank(template))
                        throw new IncompleteAnswersException("question " + question.getPosition() + " is not answered");
                    continue;
                }
                // a critical choice that says the work isn't right (« Non conforme », « À reprendre »):
                // like a critical Mauvais, it needs a comment and makes the report non conforme
                if (structured != null && structured.nonConforming() && question.isCritical())
                {
                    if (answer.comment() == null || answer.comment().isBlank())
                        throw new CommentRequiredException("comment required for question " + question.getPosition());
                    status = SubmissionStatus.NON_CONFORME;
                }
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
        boolean v2 = StructuredAnswers.isV2(template.getTitle());

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
            else if (isStructured(item.getAnswerType()))
            {
                // already checked by checkSumbSubmissionStatus; normalized again for the stored form.
                // Photos: "id1,id2" on the old forms (up to 4), [{ imageId, title, comment }] on v2
                StructuredAnswers.Normalized normalized = structuredAnswers.normalize(item, answer.value(), v2);
                for (StructuredAnswers.PhotoRef photo : normalized.photos())
                    images.add(ownImage(photo.imageId(), "question " + item.getPosition(), userId, usedImageIds));
                checkAnswer.setValue(normalized.value());
            }
            else
                checkAnswer.setValue(answer.value() == null || answer.value().isBlank() ? null : answer.value());
            checkAnswer.setComment(answer.comment());
            _answers.add(checkAnswer);
        }
        
        checkListSubmission.setAnswers(_answers);

        // the parts the technician added: only on the v2 reports, their photos checked like the answers'
        if (request.extraParts() != null && !request.extraParts().isEmpty())
        {
            if (!v2)
                throw new InvalidResponseException("form " + template.getTitle() + " doesn't take added parts");
            checkListSubmission.setExtraParts(structuredAnswers.normalizeExtraParts(request.extraParts()));
            for (SubmissionRequest.ExtraPart part : request.extraParts())
                if (part.photos() != null)
                    for (SubmissionRequest.PhotoItem photo : part.photos())
                        images.add(ownImage(photo.imageId().strip(), "added part « " + part.name().strip() + " »", userId, usedImageIds));
        }

        String taskId = (request.taskId() == null || request.taskId().isBlank()) ? null : request.taskId().trim();
        checkListSubmission.setTaskId(taskId);

        submissionRepository.save(checkListSubmission);

        // the report is sent: its draft goes (in this transaction, so a refused report keeps it)
        formDraftRepository.findByUserIdAndTemplateIdAndTaskId(userId, templateId, taskId).ifPresent(formDraftRepository::delete);

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

    // ------------------------------------------------------------------------ before sending

    // The PDF of a report not sent yet, as it stands (« Aperçu du PDF » on the wizard's last page): built from
    // the request like validateSubmission, but nothing is saved and nothing is refused for being incomplete.
    // An answer the server would refuse (a reading that isn't a number…) is left out of the preview.
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public SubmissionReport previewReport(SubmissionRequest request, String userId)
    {
        CheckListTemplate template = checkListTemplateRepository.findById(request.templateId()).orElseThrow(
            () -> new FormNotFoundException("no form with id " + request.templateId()));
        boolean v2 = StructuredAnswers.isV2(template.getTitle());
        CheckListSubmission preview = new CheckListSubmission();
        preview.setTemplate(template);
        preview.setEquipment(request.equipment() == null || request.equipment().isBlank() ? "—" : request.equipment().trim());
        preview.setInspectionDate(request.inspectionDate());
        preview.setUserId(userId);
        preview.setRemarks(request.remarks());
        SubmissionStatus status = SubmissionStatus.CONFORME;
        List<CheckListAnswer> answers = new ArrayList<>();
        Map<String, AnswerItem> byItem = new HashMap<>();
        if (request.answers() != null)
            for (AnswerItem a : request.answers())
                if (a != null && a.itemId() != null) byItem.put(a.itemId(), a);
        for (CheckListItem item : template.getQuestions())
        {
            AnswerItem sent = byItem.get(item.getId());
            CheckListAnswer answer = new CheckListAnswer();
            answer.setItem(item);
            answer.setSubmission(preview);
            String value = sent == null ? null : sent.value();
            if (value != null && !value.isBlank() && isStructured(item.getAnswerType()))
            {
                try {
                    StructuredAnswers.Normalized normalized = structuredAnswers.normalize(item, value, v2);
                    value = normalized.value();
                    if (normalized.nonConforming() && item.isCritical()) status = SubmissionStatus.NON_CONFORME;
                } catch (RuntimeException refused) {
                    value = null;
                }
            }
            answer.setValue(value == null || value.isBlank() ? null : value);
            answer.setComment(sent == null ? null : sent.comment());
            answers.add(answer);
        }
        preview.setAnswers(answers);
        preview.setStatus(status);
        if (v2 && request.extraParts() != null && !request.extraParts().isEmpty())
        {
            try {
                preview.setExtraParts(structuredAnswers.normalizeExtraParts(request.extraParts()));
            } catch (RuntimeException refused) {
                // a part without a name yet: the preview goes without the added parts
            }
        }
        return toReport(preview, "APERCU-NON-ENVOYE");
    }

    // The values already written in some fields of the reports (« Informations générales : Client »…), the most
    // recently used first, for the form's searchable lists: label → up to 40 values
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Map<String, List<String>> knownValues(List<String> labels)
    {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String label : labels == null ? List.<String>of() : labels.stream().limit(20).toList())
            out.put(label, submissionRepository.knownValues(label, org.springframework.data.domain.PageRequest.of(0, 40)));
        return out;
    }

    // an uploaded photo used by this report: it exists, the caller uploaded it, and no report (nor
    // another answer of this one) uses it yet. where: for the error message
    private ImageEntity ownImage(String imageId, String where, String userId, Set<String> usedImageIds)
    {
        // a wrong id is a bad request body, not a missing resource
        ImageEntity imageEntity;
        try {
            imageEntity = imageService.getImageMetaData(imageId);
        } catch (ImageNotFoundException e) {
            throw new InvalidResponseException("invalid answer for " + where + ": no image with id " + imageId);
        }
        // only the technician who uploaded the photo can use it
        if (!imageEntity.getUploadedBy().equals(userId))
            throw new AccessDeniedException("image " + imageId + " does not belong to you");
        if (imageEntity.getReportId() != null || !usedImageIds.add(imageId))
            throw new ImageAlreadyAttachedException("image " + imageId + " is already attached to a report");
        return imageEntity;
    }
}
