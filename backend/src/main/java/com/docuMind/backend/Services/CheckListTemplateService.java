package com.docuMind.backend.services;

import java.util.ArrayList;
import java.util.List;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.docuMind.backend.exception.FormAlreadyExistException;
import com.docuMind.backend.exception.FormNotFoundException;
import com.docuMind.backend.model.CheckListItem;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.FormCreationDto;
import com.docuMind.backend.model.FormCreationDto.FormItem;
import com.docuMind.backend.repository.CheckListTemplateRepository;
import com.docuMind.backend.model.FormOptionsResponse;
import com.docuMind.backend.model.InspectionFormResponse;

@Service
public class CheckListTemplateService{

    private final CheckListTemplateRepository checkListTemplateRepository;
    
    public CheckListTemplateService(CheckListTemplateRepository checkListTemplateRepository)
    {
        this.checkListTemplateRepository = checkListTemplateRepository;
    }

    // gets the an active form with the path variable label.
    // !!!TO IMPLEMENT : The page first shows the list of active forms, and the user picks one, which gives you its id. 
    public InspectionFormResponse getInspectionForm(String id)
    {
        // if no form has this id, FormNotFoundException → 404 (see GlobalExceptionHandler)
        CheckListTemplate fetchedTemplate = checkListTemplateRepository.findById(id)
                .orElseThrow(() -> new FormNotFoundException("no form with id " + id));

        // a record is built once, with all its values: build the question list first
        List<InspectionFormResponse.QuestionItem> items = new ArrayList<>();
        for (CheckListItem question : fetchedTemplate.getQuestions())
        {
            items.add(new InspectionFormResponse.QuestionItem(question.getId(), question.getPosition(),
                        question.getLabelAr(), question.getLabelFr(), question.isCritical(),
                        question.getAnswerType()));
        }
        return new InspectionFormResponse(fetchedTemplate.getId(), fetchedTemplate.getTitle(),
                    fetchedTemplate.getCheckListType(), fetchedTemplate.getVersion(),
                    fetchedTemplate.getInstructions(), items);
    }

    // input -- > output
    // take some kind of data dto --> save it to database as a template -- return a response.
    // repsonse should be like created, rejected : lets start with boolean.
    // create a new form
    // lets' do an initla check outside this function that checks the data intergrity
    // here only valid forms enter
    public String createNewForm(FormCreationDto newForm)
    {
        // new kind of form(checkList)
        // first check if a form with same name and version exist
        // how do we fix this issue ?
        // only one form with the same name should be live
        // we simply check if a form  with the same name exist and active.
        boolean templateExist = checkListTemplateRepository.existsByTitleAndActiveTrue(newForm.title());
        if (templateExist)
            throw (new FormAlreadyExistException());
        
        CheckListTemplate template = new CheckListTemplate();
        
        // what should check data integrity ?
        
        template.setTitle(newForm.title());
        template.setCheckListType(newForm.type());
        template.setInstructions(newForm.instructions());

        // getting the items out of newForm
        List <FormItem> formItems = newForm.items();
        
        // transform them into CheckListItem
        List <CheckListItem> checkListItems = new ArrayList<>();
        for (FormItem item : formItems)
        {
            CheckListItem newItem = new CheckListItem();
            newItem.setLabelAr(item.labelAr());
            newItem.setLabelFr(item.labelFr());
            newItem.setCritical(item.critical());
            newItem.setAnswerType(item.answerType());
            newItem.setTemplate(template);
            checkListItems.add(newItem);
        }

        //brit n add questrion fl l forms , 5assni nsawb CheckListItem
        template.setQuestions(checkListItems);
        int nextVersion = checkListTemplateRepository
                            .findTopByTitleOrderByVersionDesc(newForm.title())
                            .map(t -> t.getVersion() + 1)
                            .orElse(1);
        template.setVersion(nextVersion);

        try {
            return checkListTemplateRepository.saveAndFlush(template).getId();
        }       
        catch (DataIntegrityViolationException e) {
            throw new FormAlreadyExistException("form already exists: " + template.getTitle()
                + " v" + template.getVersion());
        }

    }

    public FormOptionsResponse getFormOptions()
    {
        // db query : get all actif. ?
        List<CheckListTemplate> forms = checkListTemplateRepository.findByActiveTrue();
        List<FormOptionsResponse.FormOptionItem> items = new ArrayList<>();
        for (CheckListTemplate form : forms)
        {
            items.add(new FormOptionsResponse.FormOptionItem(form.getCheckListType(), 
                    form.getTitle(), form.getId()));
        }
        FormOptionsResponse response = new FormOptionsResponse(items, items.size());
        return response;
    }
}