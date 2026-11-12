package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.enums.AnswerType;
import com.fasterxml.jackson.databind.JsonNode;
import com.docuMind.backend.model.enums.ChecklistType;
import com.docuMind.backend.model.enums.FormLayout;

public record InspectionFormResponse(
    String id,
    String title,
    ChecklistType type,
    int version,
    String instructions,
    List<QuestionItem> questions,
    FormLayout layout,          // null for the original forms; CONTROL_SHEET opens the section wizard
    String paperReference)      // "EN-PFD-MIC-01", shown under the title; null if none
{
    public record QuestionItem(
        String id,
        int position,
        String labelAr,
        String labelFr,
        boolean critical,
        AnswerType answerType,
        JsonNode options            // null for the original checklists (CheckListItem.options)
    )
    {}
}