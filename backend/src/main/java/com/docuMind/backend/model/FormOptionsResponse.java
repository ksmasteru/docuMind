package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.enums.ChecklistType;
import com.docuMind.backend.model.enums.FormLayout;

public record FormOptionsResponse(
    List<FormOptionItem> FormItem,
    int formsCount
)
{
    public record FormOptionItem(
        ChecklistType type,
        String title,
        String id,
        FormLayout layout   // CONTROL_SHEET: saved as tickets to finish later (FormDraftService.isTicket); null otherwise
    ){}
}
