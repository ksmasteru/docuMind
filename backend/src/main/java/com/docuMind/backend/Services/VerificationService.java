package com.docuMind.backend.services;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.VerificationResponse;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.UserRepository;

import jakarta.transaction.Transactional;

// Answers "is this printed report real, unchanged, and still the current one?" for whoever
// scanned its QR code (VerificationController, no login).
@Service
@Transactional
public class VerificationService {
    private final SubmissionRepository submissionRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final ReportVerification reportVerification;
    private final CheckPdfService checkPdfService;
    private final TaskService taskService;

    // the same formats as the PDF (SubmissionService), so the page reads like the paper
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final ZoneId SITE_ZONE = ZoneId.of("Africa/Casablanca");

    public VerificationService(SubmissionRepository submissionRepository,
                               TaskRepository taskRepository,
                               UserRepository userRepository,
                               ReportVerification reportVerification,
                               CheckPdfService checkPdfService,
                               TaskService taskService)
    {
        this.taskService = taskService;
        this.submissionRepository = submissionRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.reportVerification = reportVerification;
        this.checkPdfService = checkPdfService;
    }

    // empty for a code that isn't one, or that no report has: the page says "unknown document".
    // A checklist's code, else a check report's (CheckPdfService)
    public Optional<VerificationResponse> verify(String input)
    {
        String code = ReportVerification.normalize(input);
        if (code == null)
            return Optional.empty();
        return submissionRepository.findByVerificationCode(code).map(this::toResponse)
                .or(() -> checkPdfService.verify(code));
    }

    private VerificationResponse toResponse(CheckListSubmission submission)
    {
        // a missing hash counts as altered too: every report gets one when it's sent or backfilled
        boolean unchanged = Objects.equals(submission.getContentHash(), reportVerification.fingerprint(submission));

        // a report answering a task is out of date once a newer round replaced it (task returned, sent again)
        TaskModel task = submission.getTaskId() == null ? null
                : taskRepository.findById(submission.getTaskId()).orElse(null);
        String latestId = task == null ? null : task.getLatestSubmissionId();
        boolean current = latestId == null || latestId.equals(submission.getId());
        String replacedAt = current ? null : submissionRepository.findById(latestId)
                .map(CheckListSubmission::getSubmittedAt)
                .map(at -> at.atZone(SITE_ZONE).format(DAY_TIME))
                .orElse(null);

        String inspector = userRepository.findByEmail(submission.getUserId())
                .map(User::getName)
                .filter(name -> name != null && !name.isBlank())
                .orElse("—");

        // who validated this very report (not an earlier or a later version of it)
        TaskEvent approval = task == null || submission.getSubmittedAt() == null ? null
                : TaskService.decisionOn(taskService.historyOf(task.getId()), submission.getSubmittedAt())
                    .filter(d -> d.getToStatus() == TaskStatus.APPROVED).orElse(null);

        return new VerificationResponse(
                unchanged ? VerificationResponse.Result.AUTHENTIC : VerificationResponse.Result.ALTERED,
                current,
                task == null ? null : task.getStatus().name(),
                ReportVerification.format(submission.getVerificationCode()),
                submission.getTemplate().getTitle(),
                submission.getTemplate().getVersion(),
                submission.getEquipment(),
                submission.getInspectionDate() == null ? "" : submission.getInspectionDate().format(DAY),
                inspector,
                submission.getSubmittedAt() == null ? "" : submission.getSubmittedAt().atZone(SITE_ZONE).format(DAY_TIME),
                submission.getStatus().name(),
                replacedAt,
                VerificationResponse.Kind.CHECKLIST,
                approval == null ? null : nameOf(approval.getActorEmail()),
                approval == null ? null : approval.getOccurredAt().atZone(SITE_ZONE).format(DAY_TIME));
    }

    // a person's name for the public page: never the e-mail
    private String nameOf(String email)
    {
        return userRepository.findByEmail(email).map(User::getName)
                .filter(name -> name != null && !name.isBlank()).orElse("—");
    }

    // Reports sent before verification existed get their code and fingerprint at startup, so
    // their PDFs carry a QR code too. Their fingerprint vouches for the rows as they are today,
    // not as they were when sent. Runs once per report: afterwards none is left without a code.
    @EventListener(ApplicationReadyEvent.class)
    public void backfill()
    {
        List<CheckListSubmission> missing = submissionRepository.findByVerificationCodeIsNull();
        for (CheckListSubmission submission : missing)
        {
            submission.setVerificationCode(reportVerification.newCode());
            submission.setContentHash(reportVerification.fingerprint(submission));
        }
        if (!missing.isEmpty())
            System.out.println("verification codes given to " + missing.size() + " older reports");
    }
}
