package com.docuMind.backend.services;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docuMind.backend.exception.TaskNotFoundException;
import com.docuMind.backend.model.AlertCase;
import com.docuMind.backend.model.CheckPoint;
import com.docuMind.backend.model.CheckReport;
import com.docuMind.backend.model.CheckReportDocument;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.VerificationResponse;
import com.docuMind.backend.model.enums.AlertSource;
import com.docuMind.backend.model.enums.CannotHandleReason;
import com.docuMind.backend.model.enums.CheckPointKind;
import com.docuMind.backend.model.enums.CheckResult;
import com.docuMind.backend.model.enums.CheckVerdict;
import com.docuMind.backend.model.enums.FalseAlarmCause;
import com.docuMind.backend.model.enums.InconclusiveReason;
import com.docuMind.backend.model.enums.PumpArrivalState;
import com.docuMind.backend.repository.AlertCaseRepository;
import com.docuMind.backend.repository.CheckPointRepository;
import com.docuMind.backend.repository.CheckReportRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.UserRepository;

// A check report (levée de doute) as a PDF, and what makes it checkable:
//   GET /api/v1/checks/{taskId}/pdf     one round → CheckReportDocument → templates/check-report.html
//   /verify/{code}                      the public page reads a printed check like a printed checklist
//                                       (VerificationService, VerificationController)
// Nothing is stored: the PDF is rebuilt from the saved report each time, like the checklists'.
// The labels are the app's (alertContent.js), so the paper reads like the screen.
@Service
public class CheckPdfService {

    private static final ZoneId SITE_ZONE = ZoneId.of("Africa/Casablanca");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final CheckService checkService;
    private final CheckReportRepository reportRepository;
    private final CheckPointRepository pointRepository;
    private final TaskRepository taskRepository;
    private final AlertCaseRepository caseRepository;
    private final UserRepository userRepository;
    private final ImageService imageService;
    private final ReportVerification reportVerification;
    private final SubmissionPdfService pdfService;

    public CheckPdfService(CheckService checkService, CheckReportRepository reportRepository,
                           CheckPointRepository pointRepository, TaskRepository taskRepository,
                           AlertCaseRepository caseRepository, UserRepository userRepository, ImageService imageService,
                           ReportVerification reportVerification, SubmissionPdfService pdfService)
    {
        this.checkService = checkService;
        this.reportRepository = reportRepository;
        this.pointRepository = pointRepository;
        this.taskRepository = taskRepository;
        this.caseRepository = caseRepository;
        this.userRepository = userRepository;
        this.imageService = imageService;
        this.reportVerification = reportVerification;
        this.pdfService = pdfService;
    }

    // the PDF and the name it downloads under ("levee-de-doute-HDX-S-08-12-11-2026.pdf")
    public record PdfFile(String name, byte[] bytes) {}

    // one round of a check the caller may read (CheckService.readable); the latest without a round.
    // 404 when the check has no report yet, or not that round
    @Transactional(readOnly = true)
    public PdfFile pdf(String taskId, Integer round, Authentication auth)
    {
        TaskModel task = checkService.readable(taskId, auth);
        List<CheckReport> reports = reportRepository.findByTaskIdOrderByRoundDesc(taskId);
        CheckReport report = reports.stream()
            .filter(r -> round == null || r.getRound() == round)
            .findFirst()
            .orElseThrow(() -> new TaskNotFoundException(round == null
                ? "check " + taskId + " has no report yet" : "check " + taskId + " has no round " + round));
        return render(task, report);
    }

    // ---------- the public verification page ----------

    // what /verify/{code} shows for a printed check report; empty when no check has that code
    @Transactional(readOnly = true)
    public Optional<VerificationResponse> verify(String code)
    {
        return reportRepository.findByVerificationCode(code).map(report -> {
            TaskModel task = taskRepository.findById(report.getTaskId()).orElse(null);
            boolean unchanged = Objects.equals(report.getContentHash(), fingerprint(report));
            // a round sent back and sent again replaces this one
            Optional<CheckReport> newer = reportRepository.findByTaskIdOrderByRoundDesc(report.getTaskId()).stream()
                .filter(r -> r.getRound() > report.getRound()).findFirst();
            AlertCase alertCase = caseRepository.findById(report.getAlertNumber()).orElse(null);
            return new VerificationResponse(
                unchanged ? VerificationResponse.Result.AUTHENTIC : VerificationResponse.Result.ALTERED,
                newer.isEmpty(),
                task == null ? null : task.getStatus().name(),
                ReportVerification.format(report.getVerificationCode()),
                heading(alertCase) + " · alerte #" + report.getAlertNumber(),
                report.getRound(),
                alertCase == null ? "—" : alertCase.getPumpId(),
                day(report.getSubmittedAt()),
                nameOf(report.getTechnicianEmail()).orElse("—"),
                dayTime(report.getSubmittedAt()),
                report.getVerdict().name(),
                newer.map(r -> dayTime(r.getSubmittedAt())).orElse(null),
                VerificationResponse.Kind.CHECK);
        });
    }

    // the printed check's PDF, for the verification page (no login: the code is the access)
    @Transactional(readOnly = true)
    public Optional<PdfFile> pdfByCode(String code)
    {
        return reportRepository.findByVerificationCode(code).flatMap(report ->
            taskRepository.findById(report.getTaskId()).map(task -> render(task, report)));
    }

    // Reports sent before their PDF had a QR code get their code and fingerprint at startup. Their
    // fingerprint vouches for the rows as they are today, not as they were when sent.
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfill()
    {
        List<CheckReport> missing = reportRepository.findByVerificationCodeIsNull();
        for (CheckReport report : missing)
            report.setVerification(reportVerification.newCode(), fingerprint(report));
        if (!missing.isEmpty())
            System.out.println("verification codes given to " + missing.size() + " older check reports");
    }

    // ---------- building the document ----------

    private String fingerprint(CheckReport report)
    {
        return reportVerification.fingerprint(report, pointsOf(report.getTaskId()));
    }

    private Map<String, CheckPoint> pointsOf(String taskId)
    {
        return pointRepository.findByTaskIdOrderByPositionAsc(taskId).stream()
            .collect(Collectors.toMap(CheckPoint::getId, p -> p));
    }

    private PdfFile render(TaskModel task, CheckReport report)
    {
        AlertCase alertCase = caseRepository.findById(report.getAlertNumber()).orElse(null);
        Map<String, CheckPoint> points = pointsOf(task.getId());
        int[] missing = { 0 };

        List<CheckReportDocument.Measure> measures = new ArrayList<>();
        List<CheckReportDocument.Point> lines = new ArrayList<>();
        int number = 1;
        for (CheckReport.Result r : report.getResults()) {
            CheckPoint point = points.get(r.getPointId());
            String unit = r.getUnit() == null ? "" : " " + r.getUnit();
            if (r.getKind() == CheckPointKind.MEASURE && point != null) {
                Double warn = point.getWarnLimit(), crit = point.getCritLimit();
                String limits = warn == null && crit == null ? null
                    : (warn == null ? "" : "alerte " + number(warn)) + (warn != null && crit != null ? " · " : "")
                        + (crit == null ? "" : "critique " + number(crit));
                measures.add(new CheckReportDocument.Measure(r.getLabel(), r.getUnit(),
                    point.getTwinValue() == null ? "—" : number(point.getTwinValue()) + unit,
                    r.getReading() == null ? "non relevée" : number(r.getReading()) + unit,
                    limits, readingTone(r.getReading(), warn, crit)));
            }
            lines.add(new CheckReportDocument.Point(number++, r.getLabel(), result(r.getResult()), resultTone(r.getResult()),
                r.getReading() == null ? null : number(r.getReading()) + unit, r.getComment(), photos(r.getPhotos(), missing)));
        }
        List<CheckReportDocument.Section> sections = report.getSections().stream()
            .map(s -> new CheckReportDocument.Section(s.getTitle(), s.getComment(), photos(s.getPhotos(), missing)))
            .toList();

        String why = report.getFalseAlarmCause() != null ? cause(report.getFalseAlarmCause())
            : report.getInconclusiveReason() != null ? reason(report.getInconclusiveReason()) : null;
        CheckReportDocument.Verdict verdict = new CheckReportDocument.Verdict(verdict(report.getVerdict()),
            verdictTone(report.getVerdict()), why, report.isUrgentStop(), report.getComment());

        CheckReportDocument.NextStep next = report.getCanHandle() == null ? null
            : new CheckReportDocument.NextStep(report.getCanHandle(), report.getHandleMessage(),
                report.getEstimatedHours() == null ? null : number(report.getEstimatedHours()) + " h",
                report.getPartsNeeded(),
                report.getCannotHandleReason() == null ? null : cannot(report.getCannotHandleReason()),
                report.getCannotHandleComment());

        String alert = alertWording(task, alertCase);
        CheckReportDocument document = new CheckReportDocument(heading(alertCase), report.getAlertNumber(), alert,
            task.getEquipmentId(), alertCase == null ? null : alertCase.getSite(),
            nameOf(report.getTechnicianEmail()).orElse(report.getTechnicianEmail()), task.isSelfAssigned(),
            dayTime(report.getSubmittedAt()), report.getRound(), arrival(report.getArrivalState()),
            task.getWorkedSeconds() > 0 ? hours(task.getWorkedSeconds()) : null,
            verdict, measures, lines, sections, next, missing[0], report.getId());

        String code = report.getVerificationCode();
        byte[] bytes = pdfService.renderCheck(document, code == null ? null : ReportVerification.format(code),
            code == null ? null : reportVerification.urlFor(code));
        String pump = task.getEquipmentId() == null ? "pompe" : task.getEquipmentId().replaceAll("[^A-Za-z0-9_-]+", "-");
        return new PdfFile("levee-de-doute-" + pump + "-" + day(report.getSubmittedAt()).replace('/', '-') + ".pdf", bytes);
    }

    // What the alert said, as printed. Not the case's message: the twin rewrites it on every sync, and
    // a reprint must read like the first print. The check task's title froze it when the check was made
    // ("Levée de doute · Palier chaud, 82 °C · OTW-S-07"); a fault report's title never changes
    private static String alertWording(TaskModel task, AlertCase alertCase)
    {
        if (alertCase != null && alertCase.getTitle() != null)
            return alertCase.getTitle();
        String title = task.getTitle();
        if (title == null)
            return null;
        String prefix = "Levée de doute · ";
        String suffix = " · " + task.getEquipmentId();
        if (title.startsWith(prefix))
            title = title.substring(prefix.length());
        if (title.endsWith(suffix))
            title = title.substring(0, title.length() - suffix.length());
        return title.isBlank() ? null : title;
    }

    // a fault report ("Signaler une panne") has no check points: it is the technician's own finding
    private static String heading(AlertCase alertCase)
    {
        return alertCase != null && alertCase.getSource() == AlertSource.FIELD ? "Signalement de panne" : "Rapport de levée de doute";
    }

    private List<String> photos(List<String> ids, int[] missing)
    {
        List<String> uris = new ArrayList<>();
        for (String id : ids) {
            String uri = imageService.getPhotoDataUri(id);
            if (uri == null) missing[0]++;
            else uris.add(uri);
        }
        return uris;
    }

    private Optional<String> nameOf(String email)
    {
        return userRepository.findByEmail(email).map(User::getName).filter(n -> n != null && !n.isBlank());
    }

    private static String day(Instant at)      { return at.atZone(SITE_ZONE).format(DAY); }
    private static String dayTime(Instant at)  { return at.atZone(SITE_ZONE).format(DAY_TIME); }

    // 1 h 05, 12 min
    private static String hours(long seconds)
    {
        return seconds >= 3600 ? (seconds / 3600) + " h " + String.format("%02d", Math.round((seconds % 3600) / 60.0) % 60)
            : Math.max(1, Math.round(seconds / 60.0)) + " min";
    }

    // 78.40 → "78,4": up to two decimals, a French comma
    private static String number(double value)
    {
        return new DecimalFormat("0.##", DecimalFormatSymbols.getInstance(Locale.FRENCH)).format(value);
    }

    // like alertContent.js readingTone: "crit" past the critical limit, "warn" past the warning one
    private static String readingTone(Double value, Double warn, Double crit)
    {
        if (value == null) return "off";
        if (crit != null && value >= crit) return "crit";
        if (warn != null && value >= warn) return "warn";
        return "ok";
    }

    // ---------- the labels (alertContent.js) ----------

    private static String verdict(CheckVerdict v)
    {
        return switch (v) {
            case CONFIRMED -> "Alerte confirmée";
            case FALSE_ALARM -> "Fausse alerte";
            case INCONCLUSIVE -> "Non concluant";
        };
    }

    private static String verdictTone(CheckVerdict v)
    {
        return switch (v) {
            case CONFIRMED -> "crit";
            case FALSE_ALARM -> "ok";
            case INCONCLUSIVE -> "warn";
        };
    }

    private static String cause(FalseAlarmCause c)
    {
        return switch (c) {
            case PUMP_OK -> "Pompe en bon état, mesure normale sur place";
            case SENSOR_FAULT -> "Capteur ou transmission défaillant";
            case OPERATING_CONDITIONS -> "Conditions d'exploitation normales (démarrage, essai…)";
        };
    }

    private static String reason(InconclusiveReason r)
    {
        return switch (r) {
            case NO_ACCESS -> "Pas d'accès à la pompe";
            case MISSING_TOOL -> "Il manque un outil ou un appareil de mesure";
            case PUMP_STOPPED -> "Pompe à l'arrêt pour une autre raison";
            case OTHER -> "Autre";
        };
    }

    private static String cannot(CannotHandleReason r)
    {
        return switch (r) {
            case SKILLS -> "Compétence (électricien, spécialiste…)";
            case TOOLS_LIFTING -> "Outillage ou levage";
            case PARTS -> "Pièces à commander d'abord";
            case WORKSHOP -> "La pompe doit partir en atelier";
            case OTHER -> "Autre";
        };
    }

    private static String arrival(PumpArrivalState s)
    {
        if (s == null) return null;
        return switch (s) {
            case RUNNING -> "En marche";
            case STOPPED -> "À l'arrêt";
            case LOCKED_OUT -> "Consignée";
        };
    }

    private static String result(CheckResult r)
    {
        return switch (r) {
            case OK -> "Conforme";
            case ANOMALY -> "Anomalie";
            case NOT_CHECKABLE -> "Non vérifiable";
        };
    }

    private static String resultTone(CheckResult r)
    {
        return switch (r) {
            case OK -> "ok";
            case ANOMALY -> "crit";
            case NOT_CHECKABLE -> "off";
        };
    }
}
