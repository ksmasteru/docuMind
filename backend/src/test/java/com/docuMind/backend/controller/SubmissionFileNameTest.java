package com.docuMind.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.docuMind.backend.model.SubmissionReport;

// The PDF's file name, with an equipment and without one (« — », the report platform)
class SubmissionFileNameTest {

    @Test
    void theEquipmentIsInTheNameWhenThereIsOne()
    {
        assertEquals("checklist-MP1-12-10-2026.pdf", SubmissionController.fileName(report("MP1")));
        assertEquals("checklist-PHB3-J-07-12-10-2026.pdf", SubmissionController.fileName(report("PHB3 J/07")));
    }

    @Test
    void aReportAboutNoEquipmentLeavesItOut()
    {
        assertEquals("checklist-12-10-2026.pdf", SubmissionController.fileName(report("—")));
    }

    private static SubmissionReport report(String equipment)
    {
        return new SubmissionReport("Checklist", "Inspection", 1, null, "id", equipment, "12/10/2026", "Hicham",
                "12/10/2026 10:30", "CONFORME", null, List.of());
    }
}
