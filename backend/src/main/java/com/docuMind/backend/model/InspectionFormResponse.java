package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.enums.AnswerType;
import com.docuMind.backend.model.enums.ChecklistType;

public record InspectionFormResponse(
    String id,
    String title,
    ChecklistType type,
    int version,
    String instructions,
    List<QuestionItem> questions)
{
    public record QuestionItem(
        String id,
        int position,
        String labelAr,
        String labelFr,
        boolean critical,
        AnswerType answerType
    )
    {}
}