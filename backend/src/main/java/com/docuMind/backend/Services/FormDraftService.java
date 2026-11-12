package com.docuMind.backend.services;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.docuMind.backend.exception.InvalidResponseException;
import com.docuMind.backend.model.FormDraft;
import com.docuMind.backend.exception.FormNotFoundException;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.FormDraftDto;
import com.docuMind.backend.model.TicketSummary;
import com.docuMind.backend.model.enums.FormLayout;
import com.docuMind.backend.repository.CheckListTemplateRepository;
import com.docuMind.backend.repository.FormDraftRepository;

import jakarta.transaction.Transactional;

// saves and loads the forms technicians haven't sent yet (see FormDraft, form-draft-persistence.md)
//
//   open a form   → find():   the draft of this technician for this form (and task), or none
//   « Suivant », « Enregistrer », the app going to the background → save(): one draft, updated in place
//   report sent   → delete(): SubmissionService.validateSubmission, in the same transaction
//
// The payload is the form's state as the app keeps it (answers, added parts, remarks, page), with the photos'
// ids only, never the photos. It isn't checked here: a draft may be half filled; the checks run when it's sent.
@Service
@Transactional
public class FormDraftService {
    // a draft holds text and ids: 512 KB is far more than a full report needs
    static final int MAX_PAYLOAD = 512 * 1024;

    // a ticket's label: "PHB2-0412 · 06/10/2026", cut to its column
    static final int MAX_LABEL = 255;

    private final FormDraftRepository formDraftRepository;
    // which forms are tickets (the control sheets), and their titles for the list
    private final CheckListTemplateRepository checkListTemplateRepository;

    public FormDraftService(FormDraftRepository formDraftRepository, CheckListTemplateRepository checkListTemplateRepository)
    {
        this.formDraftRepository = formDraftRepository;
        this.checkListTemplateRepository = checkListTemplateRepository;
    }

    // A control sheet (or quality form) opened outside a task is a ticket: it's saved to finish later when
    // more is known, and one person may have several of the same form open (two complaints at once).
    // Tickets are found by their id; the other drafts by form and task, one each.
    public static boolean isTicket(CheckListTemplate template, String taskId)
    {
        return template.getLayout() == FormLayout.CONTROL_SHEET && (taskId == null || taskId.isBlank());
    }

    // ------------------------------------------------------------------ tickets

    // « Fiches en cours »: the caller's tickets, last edited first
    public List<TicketSummary> tickets(String userId)
    {
        Map<String, CheckListTemplate> forms = checkListTemplateRepository.findAll().stream()
                .filter(t -> t.getLayout() == FormLayout.CONTROL_SHEET)
                .collect(Collectors.toMap(CheckListTemplate::getId, Function.identity()));
        if (forms.isEmpty())
            return List.of();
        return formDraftRepository.findByUserIdAndTaskIdIsNullAndTemplateIdInOrderByUpdatedAtDesc(userId, forms.keySet())
                .stream()
                .map(d -> new TicketSummary(d.getId(), d.getTemplateId(), forms.get(d.getTemplateId()).getTitle(),
                        forms.get(d.getTemplateId()).getPaperReference(), d.getLabel(), d.getUpdatedAt()))
                .toList();
    }

    // one of the caller's tickets; anyone else's is "not found", like an unknown id
    public FormDraftDto ticket(String userId, String id)
    {
        return FormDraftDto.from(own(userId, id));
    }

    // a new ticket on this form: the first save of a control sheet opened outside a task
    public FormDraftDto createTicket(String userId, String templateId, String payload, String label)
    {
        checkPayload(templateId, payload);
        CheckListTemplate template = checkListTemplateRepository.findById(templateId)
                .orElseThrow(() -> new FormNotFoundException("no form with id " + templateId));
        if (!isTicket(template, null))
            throw new InvalidResponseException("form " + template.getTitle() + " isn't saved as tickets");
        FormDraft draft = new FormDraft();
        draft.setUserId(userId);
        draft.setTemplateId(templateId);
        draft.setPayload(payload);
        draft.setLabel(label(label));
        return FormDraftDto.from(formDraftRepository.saveAndFlush(draft));
    }

    // the next saves of a ticket
    public FormDraftDto updateTicket(String userId, String id, String payload, String label)
    {
        FormDraft draft = own(userId, id);
        checkPayload(draft.getTemplateId(), payload);
        draft.setPayload(payload);
        draft.setLabel(label(label));
        return FormDraftDto.from(formDraftRepository.saveAndFlush(draft));
    }

    // « Recommencer » or « Supprimer » on a ticket
    public void deleteTicket(String userId, String id)
    {
        formDraftRepository.findById(id).filter(d -> d.getUserId().equals(userId)).ifPresent(formDraftRepository::delete);
    }

    private FormDraft own(String userId, String id)
    {
        return formDraftRepository.findById(id)
                .filter(d -> d.getUserId().equals(userId))
                .orElseThrow(() -> new FormNotFoundException("no draft with id " + id));
    }

    private static String label(String label)
    {
        if (label == null || label.isBlank())
            return null;
        String clean = label.strip();
        return clean.length() > MAX_LABEL ? clean.substring(0, MAX_LABEL) : clean;
    }

    private static void checkPayload(String templateId, String payload)
    {
        if (templateId == null || templateId.isBlank())
            throw new InvalidResponseException("templateId is required");
        if (payload == null || payload.isBlank())
            throw new InvalidResponseException("payload is required");
        if (payload.length() > MAX_PAYLOAD)
            throw new InvalidResponseException("the draft is too large (at most " + MAX_PAYLOAD / 1024 + " KB)");
    }

    // ------------------------------------------------------------------ one draft per form and task

    // the technician's draft of this form (and task), null when there's none
    public FormDraftDto findActiveFormDraft(String technicianId, String taskId, String templateId)
    {
        Optional<FormDraft> form = formDraftRepository.findFirstByUserIdAndTemplateIdAndTaskIdOrderByUpdatedAtDesc(technicianId, templateId, blankToNull(taskId));
        return form.map(FormDraftDto::from).orElse(null);
    }

    // creates the draft the first time, updates it after (looked up first: the unique constraint
    // can't catch a second standalone draft, its taskId being null)
    public FormDraftDto save(String technicianId, String templateId, String taskId, String payload)
    {
        checkPayload(templateId, payload);
        String task = blankToNull(taskId);
        FormDraft draft = formDraftRepository.findFirstByUserIdAndTemplateIdAndTaskIdOrderByUpdatedAtDesc(technicianId, templateId, task)
                .orElseGet(() -> {
                    FormDraft fresh = new FormDraft();
                    fresh.setUserId(technicianId);
                    fresh.setTemplateId(templateId);
                    fresh.setTaskId(task);
                    return fresh;
                });
        draft.setPayload(payload);
        return FormDraftDto.from(formDraftRepository.saveAndFlush(draft));
    }

    // « Recommencer » on the form, and once the report is sent
    public void delete(String technicianId, String templateId, String taskId)
    {
        formDraftRepository.findFirstByUserIdAndTemplateIdAndTaskIdOrderByUpdatedAtDesc(technicianId, templateId, blankToNull(taskId))
                .ifPresent(formDraftRepository::delete);
    }

    private static String blankToNull(String text)
    {
        return text == null || text.isBlank() ? null : text.trim();
    }
}
