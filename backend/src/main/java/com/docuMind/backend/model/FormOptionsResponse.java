package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.enums.ChecklistType;

public record FormOptionsResponse(
    List<FormOptionItem> FormItem,
    int formsCount
)
{
    public record FormOptionItem(
        ChecklistType type,
        String title,
        String id
    ){}
}
