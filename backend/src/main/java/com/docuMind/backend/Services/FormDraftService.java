package com.docuMind.backend.services;

import java.util.Optional;

import org.springframework.stereotype.Service;

import com.docuMind.backend.exception.InvalidResponseException;
import com.docuMind.backend.model.FormDraft;
import com.docuMind.backend.model.FormDraftDto;
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

    private final FormDraftRepository formDraftRepository;

    public FormDraftService(FormDraftRepository formDraftRepository)
    {
        this.formDraftRepository = formDraftRepository;
    }

    // the technician's draft of this form (and task), null when there's none
    public FormDraftDto findActiveFormDraft(String technicianId, String taskId, String templateId)
    {
        Optional<FormDraft> form = formDraftRepository.findByUserIdAndTemplateIdAndTaskId(technicianId, templateId, blankToNull(taskId));
        return form.map(FormDraftDto::from).orElse(null);
    }

    // creates the draft the first time, updates it after (looked up first: the unique constraint
    // can't catch a second standalone draft, its taskId being null)
    public FormDraftDto save(String technicianId, String templateId, String taskId, String payload)
    {
        if (templateId == null || templateId.isBlank())
            throw new InvalidResponseException("templateId is required");
        if (payload == null || payload.isBlank())
            throw new InvalidResponseException("payload is required");
        if (payload.length() > MAX_PAYLOAD)
            throw new InvalidResponseException("the draft is too large (at most " + MAX_PAYLOAD / 1024 + " KB)");
        String task = blankToNull(taskId);
        FormDraft draft = formDraftRepository.findByUserIdAndTemplateIdAndTaskId(technicianId, templateId, task)
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
        formDraftRepository.findByUserIdAndTemplateIdAndTaskId(technicianId, templateId, blankToNull(taskId))
                .ifPresent(formDraftRepository::delete);
    }

    private static String blankToNull(String text)
    {
        return text == null || text.isBlank() ? null : text.trim();
    }
}
