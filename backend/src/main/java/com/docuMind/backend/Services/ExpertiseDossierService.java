package com.docuMind.backend.services;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.ExpertiseDossier;
import com.docuMind.backend.model.ExpertiseDossier.ComparisonGroup;
import com.docuMind.backend.model.ExpertiseDossier.ComparisonRow;
import com.docuMind.backend.model.ExpertiseDossier.Milestone;
import com.docuMind.backend.model.ExpertiseDossier.PartWork;
import com.docuMind.backend.model.ExpertiseDossier.PhotoPair;
import com.docuMind.backend.model.ExpertiseDossier.QuoteLineView;
import com.docuMind.backend.model.ExpertiseDossier.QuoteView;
import com.docuMind.backend.model.ExpertiseDossier.Signature;
import com.docuMind.backend.model.ExpertiseDossier.TimelineRow;
import com.docuMind.backend.model.ExpertiseReportV2;
import com.docuMind.backend.model.ExpertiseReportV2.Field;
import com.docuMind.backend.model.ExpertiseReportV2.Photo;
import com.docuMind.backend.model.ExpertiseReportV2.Tile;
import com.docuMind.backend.model.ExpertiseReportV2.Trace;
import com.docuMind.backend.model.Intervention;
import com.docuMind.backend.model.InterventionDetails;
import com.docuMind.backend.model.InterventionEvent;
import com.docuMind.backend.model.QuoteDetails;
import com.docuMind.backend.model.SubmissionReport;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.InterventionAction;
import com.docuMind.backend.model.enums.WorkshopStep;
import com.docuMind.backend.repository.InterventionEventRepository;
import com.docuMind.backend.repository.InterventionRepository;
import com.docuMind.backend.repository.QuoteRepository;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.UserRepository;

/*
What the expertise PDFs know beyond the report itself (report_pdf.md):

  traceOf(submissionId)        where a report sits in the workshop loop: the intervention, its version
                               (a returned report sent again is version 2), who checked it and when
                               (step 9 for the démontage, step 17 for the montage), the devis
  dossier(interventionId, …)   the intervention's final file: its two reports, its devis, its history

Read only. Access is the intervention's (InterventionService.getIntervention) and the reports' and the
devis' own (SubmissionService.getReport, QuoteService.getQuote): every workshop role, and admins.
*/
@Service
public class ExpertiseDossierService {

    private static final ZoneId SITE_ZONE = ZoneId.of("Africa/Casablanca");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final InterventionService interventionService;
    private final SubmissionService submissionService;
    private final QuoteService quoteService;
    private final SubmissionPdfService pdfService;
    private final SubmissionRepository submissionRepository;
    private final TaskRepository taskRepository;
    private final InterventionRepository interventionRepository;
    private final InterventionEventRepository eventRepository;
    private final QuoteRepository quoteRepository;
    private final UserRepository userRepository;

    public ExpertiseDossierService(InterventionService interventionService, SubmissionService submissionService,
                                   QuoteService quoteService, SubmissionPdfService pdfService,
                                   SubmissionRepository submissionRepository, TaskRepository taskRepository,
                                   InterventionRepository interventionRepository, InterventionEventRepository eventRepository,
                                   QuoteRepository quoteRepository, UserRepository userRepository)
    {
        this.interventionService = interventionService;
        this.submissionService = submissionService;
        this.quoteService = quoteService;
        this.pdfService = pdfService;
        this.submissionRepository = submissionRepository;
        this.taskRepository = taskRepository;
        this.interventionRepository = interventionRepository;
        this.eventRepository = eventRepository;
        this.quoteRepository = quoteRepository;
        this.userRepository = userRepository;
    }

    // ================================================================== one report's traceability

    // The caller has already been allowed to read the report (SubmissionService.getReport).
    @Transactional(readOnly = true)
    public Trace traceOf(String submissionId)
    {
        String now = Instant.now().atZone(SITE_ZONE).format(DAY_TIME);
        CheckListSubmission submission = submissionRepository.findById(submissionId).orElse(null);
        if (submission == null || submission.getTaskId() == null)
            return Trace.none(now);
        TaskModel task = taskRepository.findById(submission.getTaskId()).orElse(null);
        if (task == null)
            return Trace.none(now);

        List<CheckListSubmission> versions = submissionRepository.findByTaskIdInOrderBySubmittedAtAsc(List.of(task.getId()));
        int version = 1;
        for (int i = 0; i < versions.size(); i++)
            if (versions.get(i).getId().equals(submissionId)) version = i + 1;

        if (task.getInterventionId() == null)
            return new Trace(null, task.getTitle(), version, versions.size(), null, null, null, null, now, false);
        Intervention intervention = interventionRepository.findById(task.getInterventionId()).orElse(null);
        if (intervention == null)
            return new Trace(null, task.getTitle(), version, versions.size(), null, null, null, null, now, false);

        WorkshopStep review = task.getInterventionStep() == WorkshopStep.MONTAGE_ESSAIS ? WorkshopStep.CONTROLE_FINAL
                : WorkshopStep.VALIDER_RAPPORT;
        List<InterventionEvent> events = eventRepository.findByInterventionIdOrderByOccurredAtAsc(intervention.getId());
        InterventionEvent checked = lastValidation(events, review, submission.getSubmittedAt());
        Map<String, String> names = new HashMap<>();
        return new Trace(InterventionDetails.number(intervention), task.getTitle(), version, versions.size(),
                checked == null ? null : nameOf(checked.getActorEmail(), names),
                checked == null ? null : dayTime(checked.getOccurredAt()),
                review.number() + " · " + review.getLabel(),
                quoteNumber(intervention), now, false);
    }

    // a report not sent yet, for the task it will answer: the version it will become, nobody has checked it
    @Transactional(readOnly = true)
    public Trace traceOfPreview(String taskId)
    {
        String now = Instant.now().atZone(SITE_ZONE).format(DAY_TIME);
        TaskModel task = taskId == null || taskId.isBlank() ? null : taskRepository.findById(taskId.trim()).orElse(null);
        if (task == null)
            return Trace.none(now).asPreview();
        int version = submissionRepository.findByTaskIdInOrderBySubmittedAtAsc(List.of(task.getId())).size() + 1;
        Intervention intervention = task.getInterventionId() == null ? null : interventionRepository.findById(task.getInterventionId()).orElse(null);
        return new Trace(intervention == null ? null : InterventionDetails.number(intervention), task.getTitle(), version, version,
                null, null, null, intervention == null ? null : quoteNumber(intervention), now, true);
    }

    // the last "Valider" of a step after the report was sent: the review that accepted it
    private static InterventionEvent lastValidation(List<InterventionEvent> events, WorkshopStep step, Instant after)
    {
        InterventionEvent found = null;
        for (InterventionEvent e : events)
            if (e.getStep() == step && e.getAction() == InterventionAction.VALIDATE
                    && (after == null || !e.getOccurredAt().isBefore(after)))
                found = e;
        return found;
    }

    private String quoteNumber(Intervention intervention)
    {
        if (intervention.getQuoteId() == null || intervention.getOperationNumber() == null)
            return null;
        return quoteRepository.findById(intervention.getQuoteId())
                .map(q -> String.format("DV-%05d-%d", intervention.getOperationNumber(), q.getVersion()))
                .orElse(null);
    }

    // ================================================================== the final file

    @Transactional(readOnly = true)
    public ExpertiseDossier dossier(String interventionId, Authentication caller)
    {
        InterventionDetails details = interventionService.getIntervention(interventionId, caller);
        Map<String, String> names = new HashMap<>();

        InterventionDetails.WorkshopTask.Report dismantlingRef = latestReport(details, WorkshopStep.DEMONTAGE_EXPERTISE);
        InterventionDetails.WorkshopTask.Report mountingRef = latestReport(details, WorkshopStep.MONTAGE_ESSAIS);
        ExpertiseReportV2 dismantling = dismantlingRef == null ? null : report(dismantlingRef.submissionId(), caller);
        ExpertiseReportV2 mounting = mountingRef == null ? null : report(mountingRef.submissionId(), caller);
        QuoteDetails quote = details.quoteId() == null ? null : quoteService.getQuote(details.quoteId(), caller);

        // the identification as last written: the montage report's, else the démontage's
        ExpertiseReportV2 first = mounting != null ? mounting : dismantling;
        String pumpType = first == null ? null : first.identityValue("Type");

        // ---- cover
        Photo before = firstPhoto(dismantling, ExpertiseReportV2.RECEPTION);
        Photo after = firstPhoto(mounting, ExpertiseReportV2.ASSEMBLED);
        List<Field> facts = new ArrayList<>();
        addFact(facts, "Client", details.client() != null ? details.client() : first == null ? null : first.identityValue("Client"));
        addFact(facts, "Site / entité", first == null ? null : first.identityValue("Entité"));
        addFact(facts, "Équipement", details.equipmentId());
        addFact(facts, "Type de pompe", pumpType);
        addFact(facts, "Fabricant", first == null ? null : first.identityValue("Fabricant"));
        addFact(facts, "Fluide pompé", first == null ? null : first.identityValue("Fluide pompé"));
        addFact(facts, "N° de commande", details.customerOrderNumber() != null ? details.customerOrderNumber()
                : first == null ? null : first.identityValue("N° de commande"));
        addFact(facts, "N° d'opération", first == null ? null : first.identityValue("N° d'opération"));
        addFact(facts, "Motif", details.fault());

        // ---- verdict and figures
        long replace = countTone(dismantling, "replace"), repair = countTone(dismantling, "repair");
        String verdict, detail, tone;
        if (mounting != null)
        {
            boolean conform = "CONFORME".equals(mounting.status());
            verdict = conform ? "Pompe remise en état — montage conforme" : "Montage non conforme";
            tone = conform ? "reuse" : "replace";
            detail = mounting.summary().verdictDetail();
        }
        else if (dismantling != null)
        {
            verdict = "Remise en état en cours";
            tone = "info";
            detail = "Expertise au démontage : " + dismantling.summary().verdictDetail();
        }
        else
        {
            verdict = "Aucun rapport d'expertise";
            tone = "none";
            detail = "Le démontage n'a pas encore été rapporté.";
        }
        List<Tile> tiles = new ArrayList<>();
        tiles.add(new Tile(String.valueOf(replace), replace > 1 ? "pièces remplacées" : "pièce remplacée", replace > 0 ? "replace" : "none"));
        tiles.add(new Tile(String.valueOf(repair), repair > 1 ? "pièces réparées" : "pièce réparée", repair > 0 ? "repair" : "none"));
        tiles.add(mounting == null || mounting.summary().checks() == 0
                ? new Tile("—", "contrôles de montage", "none")
                : new Tile(mounting.summary().checksOk() + "/" + mounting.summary().checks(), "contrôles de montage conformes",
                        mounting.summary().openChecks().isEmpty() ? "reuse" : "replace"));
        tiles.add(quote == null || quote.totalAmount() == null ? new Tile("—", "devis", "none")
                : new Tile(money(quote.totalAmount()), quote.currency() + " TTC · devis", "info"));

        // ---- before / after
        List<PhotoPair> pairs = new ArrayList<>();
        List<Photo> befores = photos(dismantling, ExpertiseReportV2.RECEPTION);
        List<Photo> afters = photos(mounting, ExpertiseReportV2.ASSEMBLED);
        for (int i = 0; i < Math.max(befores.size(), afters.size()); i++)
            pairs.add(new PhotoPair(i < befores.size() ? befores.get(i) : null, i < afters.size() ? afters.get(i) : null));
        List<Photo> changed = new ArrayList<>();
        String changedComment = null;
        if (mounting != null)
            for (ExpertiseReportV2.Section s : mounting.sections())
                if (s.name().toLowerCase(Locale.ROOT).startsWith("pièces changées"))
                    for (ExpertiseReportV2.Card c : s.cards())
                    {
                        changed.addAll(c.photos());
                        changedComment = c.blocks().stream().filter(b -> b.kind().equals("text")).map(ExpertiseReportV2.Block::text)
                                .findFirst().orElse(changedComment);
                    }

        return new ExpertiseDossier(details.number(), details.equipmentId(), pumpType, details.client(),
                Instant.now().atZone(SITE_ZONE).format(DAY_TIME),
                details.currentStep().number() + " · " + details.currentStep().label(),
                verdict, detail, tone, facts, tiles, before, after, pairs, changed, changedComment,
                work(dismantling), comparisons(dismantling, mounting), quoteView(quote), dismantling, mounting,
                milestones(details, dismantlingRef, mountingRef, quote, names), timeline(details, names),
                signatures(details, dismantling, mounting, names));
    }

    private ExpertiseReportV2 report(String submissionId, Authentication caller)
    {
        SubmissionReport report = submissionService.getReport(submissionId, caller.getName());
        return ExpertiseReportV2.of(report, pdfService.drawings(), traceOf(submissionId));
    }

    // the step's latest task that has a report, and its latest version
    private static InterventionDetails.WorkshopTask.Report latestReport(InterventionDetails details, WorkshopStep step)
    {
        InterventionDetails.WorkshopTask.Report found = null;
        for (InterventionDetails.WorkshopTask task : details.tasks())
            if (task.step() != null && step.name().equals(task.step().code()) && !task.reports().isEmpty())
                found = task.reports().get(task.reports().size() - 1);
        return found;
    }

    private static List<Photo> photos(ExpertiseReportV2 report, String section)
    {
        if (report == null) return List.of();
        return report.sections().stream().filter(s -> s.name().equals(section))
                .flatMap(s -> s.cards().stream()).flatMap(c -> c.photos().stream()).toList();
    }

    private static Photo firstPhoto(ExpertiseReportV2 report, String section)
    {
        List<Photo> photos = photos(report, section);
        if (!photos.isEmpty()) return photos.get(0);
        return report == null ? null : report.summary().hero();
    }

    private static void addFact(List<Field> facts, String label, String value)
    {
        if (value != null && !value.isBlank()) facts.add(new Field(label, value));
    }

    private static long countTone(ExpertiseReportV2 report, String tone)
    {
        return report == null ? 0 : report.summary().parts().stream().filter(p -> tone.equals(p.tone())).count();
    }

    // every part of the démontage with its state, and the client's decision from the synthèse when it lists it
    private static List<PartWork> work(ExpertiseReportV2 dismantling)
    {
        if (dismantling == null) return List.of();
        Map<String, String> decisions = new HashMap<>();
        for (ExpertiseReportV2.Section s : dismantling.sections())
            for (ExpertiseReportV2.Card c : s.cards())
                for (ExpertiseReportV2.Block b : c.blocks())
                    if (b.kind().equals("summary"))
                        for (ExpertiseReportV2.SummaryLine line : b.rows())
                            if (line.description() != null && line.decision() != null)
                                decisions.put(line.description().toLowerCase(Locale.ROOT).strip(), line.decision());
        return dismantling.summary().parts().stream()
                .map(p -> new PartWork(p.name(), p.state(), p.tone(), p.findings(), p.recommendation(),
                        decisions.get(p.name().toLowerCase(Locale.ROOT).strip())))
                .toList();
    }

    // ------------------------------------------------------------------ measures: démontage against remontage

    private static List<ComparisonGroup> comparisons(ExpertiseReportV2 dismantling, ExpertiseReportV2 mounting)
    {
        Map<String, Map<String, String[]>> before = averages(dismantling), after = averages(mounting);
        Map<String, String> units = new HashMap<>();
        units.putAll(unitsOf(dismantling));
        units.putAll(unitsOf(mounting));
        // group → mark → { before, after, before out, after out }
        LinkedHashMap<String, LinkedHashMap<String, String[]>> groups = new LinkedHashMap<>();
        for (var g : before.entrySet())
            for (var m : g.getValue().entrySet())
            {
                String[] cell = groups.computeIfAbsent(g.getKey(), k -> new LinkedHashMap<>()).computeIfAbsent(m.getKey(), k -> new String[4]);
                cell[0] = m.getValue()[0];
                cell[2] = m.getValue()[1];
            }
        for (var g : after.entrySet())
            for (var m : g.getValue().entrySet())
            {
                String[] cell = groups.computeIfAbsent(g.getKey(), k -> new LinkedHashMap<>()).computeIfAbsent(m.getKey(), k -> new String[4]);
                cell[1] = m.getValue()[0];
                cell[3] = m.getValue()[1];
            }

        List<ComparisonGroup> out = new ArrayList<>();
        for (var g : groups.entrySet())
        {
            List<ComparisonRow> rows = new ArrayList<>();
            for (var m : g.getValue().entrySet())
            {
                String b = m.getValue()[0], a = m.getValue()[1];
                if (b == null && a == null) continue;
                BigDecimal nb = ExpertiseReportV2.number(b), na = ExpertiseReportV2.number(a);
                String delta = null, trend = "none";
                if (nb != null && na != null)
                {
                    BigDecimal d = na.subtract(nb).stripTrailingZeros();
                    if (d.scale() < 0) d = d.setScale(0);
                    trend = d.signum() > 0 ? "up" : d.signum() < 0 ? "down" : "same";
                    delta = (d.signum() > 0 ? "+" : d.signum() < 0 ? "−" : "") + ExpertiseReportV2.french(d.abs().toPlainString());
                }
                rows.add(new ComparisonRow(m.getKey(), b, a, delta, trend, m.getValue()[2] != null, m.getValue()[3] != null));
            }
            if (!rows.isEmpty())
                out.add(new ComparisonGroup(g.getKey(), units.getOrDefault(g.getKey(), "mm"), rows));
        }
        return out;
    }

    // group → mark → { average, "out" when marked hors tolérance }: the geometric checks by name, the sheets'
    // marks by their group, whatever the phase
    private static Map<String, Map<String, String[]>> averages(ExpertiseReportV2 report)
    {
        Map<String, Map<String, String[]>> out = new LinkedHashMap<>();
        if (report == null) return out;
        for (ExpertiseReportV2.Section s : report.sections())
        {
            for (ExpertiseReportV2.GeometryRow g : s.geometry())
                if (g.average() != null)
                    out.computeIfAbsent(s.name(), k -> new LinkedHashMap<>())
                       .put(ExpertiseReportV2.anyPhaseRemoved(g.control()), new String[] { g.average(), g.out() ? "out" : null });
            for (ExpertiseReportV2.Card c : s.cards())
                for (ExpertiseReportV2.Block b : c.blocks())
                    if (b.kind().equals("measures"))
                    {
                        String group = b.label() != null ? b.label() : ExpertiseReportV2.anyPhaseRemoved(c.name());
                        for (ExpertiseReportV2.MeasureLine m : b.measures())
                            if (m.average() != null)
                                out.computeIfAbsent(group, k -> new LinkedHashMap<>()).put(m.mark(), new String[] { m.average(), m.out() ? "out" : null });
                    }
        }
        return out;
    }

    private static Map<String, String> unitsOf(ExpertiseReportV2 report)
    {
        Map<String, String> out = new HashMap<>();
        if (report == null) return out;
        for (ExpertiseReportV2.Section s : report.sections())
        {
            if (s.geometryUnit() != null) out.put(s.name(), s.geometryUnit());
            for (ExpertiseReportV2.Card c : s.cards())
                for (ExpertiseReportV2.Block b : c.blocks())
                    if (b.kind().equals("measures") && b.unit() != null)
                        out.put(b.label() != null ? b.label() : ExpertiseReportV2.anyPhaseRemoved(c.name()), b.unit());
        }
        return out;
    }

    // ------------------------------------------------------------------ the devis

    private static QuoteView quoteView(QuoteDetails quote)
    {
        if (quote == null) return null;
        List<QuoteLineView> lines = quote.lines().stream()
                .sorted(Comparator.comparingInt(QuoteDetails.Line::position))
                .map(l -> new QuoteLineView(l.position() + 1, l.designation(), l.quantity(),
                        l.unitPrice() == null ? "—" : money(l.unitPrice()), l.lineTotal() == null ? "—" : money(l.lineTotal())))
                .toList();
        String status = switch (quote.status()) {
            case DRAFT -> "Brouillon";
            case SENT -> "Transmis au client";
            case ACCEPTED -> "Accepté par le client";
            case REFUSED -> "Refusé par le client";
            case CANCELED -> "Annulé";
        };
        return new QuoteView(quote.number(), status, quote.validatedAt() == null ? null : day(quote.validatedAt()), lines,
                quote.subtotalAmount() == null ? "—" : money(quote.subtotalAmount()),
                quote.vatRate() == null ? null : quote.vatRate().stripTrailingZeros().toPlainString().replace('.', ','),
                quote.vatAmount() == null ? "—" : money(quote.vatAmount()),
                quote.totalAmount() == null ? "—" : money(quote.totalAmount()),
                quote.currency(), quote.vatApplicable(), quote.notes());
    }

    // 1575.5 → "1 575,50" (no-break spaces, so an amount never splits across lines)
    static String money(BigDecimal amount)
    {
        DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance(Locale.FRENCH);
        symbols.setGroupingSeparator(' ');
        symbols.setDecimalSeparator(',');
        DecimalFormat format = new DecimalFormat("#,##0.00", symbols);
        return format.format(amount.setScale(2, RoundingMode.HALF_UP));
    }

    // ------------------------------------------------------------------ history

    private List<Milestone> milestones(InterventionDetails details, InterventionDetails.WorkshopTask.Report dismantling,
                                       InterventionDetails.WorkshopTask.Report mounting, QuoteDetails quote, Map<String, String> names)
    {
        List<Milestone> out = new ArrayList<>();
        out.add(milestone("Demande", firstEvent(details, null, InterventionAction.CREATE), names));
        out.add(milestone("Réception", lastEvent(details, WorkshopStep.ENREGISTRER_RECEPTION), names));
        out.add(new Milestone("Démontage et expertise", dismantling == null ? null : day(dismantling.submittedAt()), null, dismantling != null));
        out.add(milestone("Rapport validé", lastEvent(details, WorkshopStep.VALIDER_RAPPORT), names));
        out.add(new Milestone("Devis", quote == null || quote.validatedAt() == null ? null : day(quote.validatedAt()), null, quote != null));
        out.add(milestone("Accord client", lastEvent(details, WorkshopStep.ACCORD_DEVIS), names));
        out.add(new Milestone("Montage et essais", mounting == null ? null : day(mounting.submittedAt()), null, mounting != null));
        out.add(milestone("Contrôle final", lastEvent(details, WorkshopStep.CONTROLE_FINAL), names));
        out.add(milestone("Attachement validé", lastEvent(details, WorkshopStep.VALIDER_ATTACHEMENT), names));
        return out;
    }

    private Milestone milestone(String label, InterventionDetails.Event event, Map<String, String> names)
    {
        return event == null ? new Milestone(label, null, null, false)
                : new Milestone(label, day(event.occurredAt()), nameOf(event.actorEmail(), names), true);
    }

    private static InterventionDetails.Event firstEvent(InterventionDetails details, WorkshopStep step, InterventionAction action)
    {
        return details.events().stream().filter(e -> e.action() == action && (step == null || step.name().equals(e.step().code())))
                .findFirst().orElse(null);
    }

    private static InterventionDetails.Event lastEvent(InterventionDetails details, WorkshopStep step)
    {
        InterventionDetails.Event found = null;
        for (InterventionDetails.Event e : details.events())
            if (e.action() == InterventionAction.VALIDATE && step.name().equals(e.step().code()))
                found = e;
        return found;
    }

    // every decision on the file: creation, validations, returns, cancellation ("Prendre en charge" left out)
    private List<TimelineRow> timeline(InterventionDetails details, Map<String, String> names)
    {
        List<TimelineRow> out = new ArrayList<>();
        for (InterventionDetails.Event e : details.events())
        {
            String action, tone;
            switch (e.action()) {
                case CREATE -> { action = "Demande créée"; tone = "info"; }
                case VALIDATE -> { action = "Validé"; tone = "reuse"; }
                case RETURN -> { action = "Renvoyé pour correction"; tone = "replace"; }
                case CANCEL -> { action = "Annulé"; tone = "replace"; }
                default -> { continue; }
            }
            out.add(new TimelineRow(dayTime(e.occurredAt()), e.step().number() + " · " + e.step().label(), action,
                    nameOf(e.actorEmail(), names), e.comment(), tone));
        }
        return out;
    }

    private List<Signature> signatures(InterventionDetails details, ExpertiseReportV2 dismantling, ExpertiseReportV2 mounting,
                                       Map<String, String> names)
    {
        List<Signature> out = new ArrayList<>();
        if (dismantling != null) out.add(new Signature("Technicien · démontage", dismantling.inspector(), dayOf(dismantling.submittedAt())));
        if (mounting != null) out.add(new Signature("Technicien · montage", mounting.inspector(), dayOf(mounting.submittedAt())));
        InterventionDetails.Event control = lastEvent(details, WorkshopStep.CONTROLE_FINAL);
        out.add(new Signature("Responsable atelier", control == null ? null : nameOf(control.actorEmail(), names),
                control == null ? null : day(control.occurredAt())));
        InterventionDetails.Event closing = lastEvent(details, WorkshopStep.DOSSIER_FINAL);
        out.add(new Signature("Chef de projet", closing == null ? null : nameOf(closing.actorEmail(), names),
                closing == null ? null : day(closing.occurredAt())));
        out.add(new Signature("Client · réception", null, null));
        return out;
    }

    // ------------------------------------------------------------------ small helpers

    private String nameOf(String email, Map<String, String> names)
    {
        if (email == null) return null;
        return names.computeIfAbsent(email, e -> userRepository.findByEmail(e).map(User::getName)
                .filter(n -> n != null && !n.isBlank()).orElse(e));
    }

    private static String day(Instant instant)
    {
        return instant == null ? null : instant.atZone(SITE_ZONE).format(DAY);
    }

    private static String dayTime(Instant instant)
    {
        return instant == null ? null : instant.atZone(SITE_ZONE).format(DAY_TIME);
    }

    // "08/11/2026 12:05" → "08/11/2026"
    private static String dayOf(String dayTime)
    {
        return dayTime == null || dayTime.length() < 10 ? dayTime : dayTime.substring(0, 10);
    }
}
