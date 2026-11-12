package com.docuMind.backend.model.enums;

// what a question expects. The first three are the original checklists'; the others are the v2
// expertise reports' (report_ui.md), whose answers are JSON (StructuredAnswers). The column's check
// constraint was written with the first three: drop it once before saving a form with the others
// (ALTER TABLE check_list_item DROP CONSTRAINT IF EXISTS check_list_item_answer_type_check).
public enum AnswerType{
    BON_MAUVAIS,
    TEXT,
    IMAGE,          // photos: "id1,id2" (old forms) or [{ imageId, title, comment }] (v2)
    DATE,           // "2026-11-08"
    SINGLE_CHOICE,  // { selected, other }: one of options.choices, or a free "Autre"
    MULTI_CHOICE,   // { selected: [...], other }: findings; options.exclusive ("Bon état") excludes the rest
    MEASURE,        // { readings: [..] }: several readings, the average computed; options.unit
    PARTS_SUMMARY,  // { rows: [{ quantity, description, code, recommendation, decision, remark }] }
    TABLE           // { rows: [{ <column key>: value, … }] }: columns from options.columns (control sheets)
}
