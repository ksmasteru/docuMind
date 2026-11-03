package com.docuMind.backend.services;

import org.springframework.stereotype.Service;

import com.docuMind.backend.repository.FormDraftRepository;

import com.docuMind.backend.model.FormDraft;
import com.docuMind.backend.model.FormDraftDto;

import java.util.Optional;

import jakarta.transaction.Transactional;

// saves and loads the forms technicians haven't sent yet (see FormDraft)
@Service
@Transactional
public class FormDraftService {
    private final FormDraftRepository formDraftRepository;

    public FormDraftService(FormDraftRepository formDraftRepository)
    {
        this.formDraftRepository = formDraftRepository;
    }

    // when should a formdaraft be created ?
    // when the technician first opens a form :he should look in the db if draft exist ; because we delete it
    // after the sumbission

    
    public FormDraftDto findActiveFormDraft(String technicianId, String taskId, String TemplateId)
    {
        /*  if yes return
            {
               the formdatadto
            }
            else null .

        */
        // if it doesnt exist we create a new formdraft aftert the first suivant with
        // the checked data.
        Optional<FormDraft> form = formDraftRepository.findByUserIdAndTemplateIdAndTaskId(technicianId, TemplateId, taskId);
        if (form.isPresent())
            return FormDraftDto.from(form.get());
        else
            return null;
    }
}
