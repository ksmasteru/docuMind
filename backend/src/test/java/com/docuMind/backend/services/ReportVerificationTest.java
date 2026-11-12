package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.docuMind.backend.model.CheckListAnswer;
import com.docuMind.backend.model.CheckListItem;
import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.enums.SubmissionStatus;

// The codes printed on the reports and the fingerprint that tells a changed report apart,
// without Spring or a database.
class ReportVerificationTest {

    private final ReportVerification verification = new ReportVerification("", "");

    @Test
    void codesAreRandomAndReadable()
    {
        Set<String> codes = new HashSet<>();
        for (int i = 0; i < 1000; i++)
        {
            String code = verification.newCode();
            assertEquals(code, ReportVerification.normalize(code), "a new code is already normalized");
            codes.add(code);
        }
        assertEquals(1000, codes.size());
    }

    @Test
    void aCodeTypedByHandStillMatches()
    {
        assertEquals("7K3F-9QXM-2B4C-8DHN", ReportVerification.format("7K3F9QXM2B4C8DHN"));
        assertEquals("7K3F9QXM2B4C8DHN", ReportVerification.normalize("7k3f-9qxm 2b4c-8dhn"));
        // look-alikes read off paper: O is 0, I and L are 1
        assertEquals("0K3F9QXM2B4C81HN", ReportVerification.normalize("OK3F-9QXM-2B4C-8LHN"));
        assertNull(ReportVerification.normalize("7K3F-9QXM"));
        assertNull(ReportVerification.normalize("7K3F-9QXM-2B4C-8DH!"));
        assertNull(ReportVerification.normalize(null));
    }

    @Test
    void urlsPointToTheFrontendsVerifyPage()
    {
        assertEquals("http://localhost:5173/verify/7K3F-9QXM-2B4C-8DHN", verification.urlFor("7K3F9QXM2B4C8DHN"));
        assertEquals("https://app.example/verify/7K3F-9QXM-2B4C-8DHN",
                new ReportVerification("https://app.example/", "https://other.example").urlFor("7K3F9QXM2B4C8DHN"));
        assertEquals("https://front.example/verify/7K3F-9QXM-2B4C-8DHN",
                new ReportVerification("", "https://front.example").urlFor("7K3F9QXM2B4C8DHN"));
    }

    @Test
    void anyChangeToTheReportChangesItsFingerprint()
    {
        String original = verification.fingerprint(submission("bon", "RAS"));
        assertEquals(original, verification.fingerprint(submission("bon", "RAS")), "same content, same fingerprint");
        assertTrue(original.matches("[0-9a-f]{64}"));

        assertNotEquals(original, verification.fingerprint(submission("mauvais", "RAS")), "an answer");
        assertNotEquals(original, verification.fingerprint(submission("bon", "RAS ")), "a comment");

        CheckListSubmission otherEquipment = submission("bon", "RAS");
        otherEquipment.setEquipment("MP2");
        assertNotEquals(original, verification.fingerprint(otherEquipment), "the equipment");

        // the length prefix keeps values from sliding into each other: "ab" + "c" ≠ "a" + "bc"
        CheckListSubmission shifted = submission("bon", "RAS");
        shifted.setEquipment("MP1|");
        shifted.setRemarks("Pont");
        CheckListSubmission unshifted = submission("bon", "RAS");
        unshifted.setEquipment("MP1");
        unshifted.setRemarks("|Pont");
        assertNotEquals(verification.fingerprint(shifted), verification.fingerprint(unshifted));
    }

    private static CheckListSubmission submission(String value, String comment)
    {
        CheckListTemplate template = new CheckListTemplate();
        template.setId("template-1");
        CheckListSubmission submission = new CheckListSubmission();
        submission.setTemplate(template);
        submission.setEquipment("MP1");
        submission.setInspectionDate(LocalDate.of(2026, 10, 6));
        submission.setUserId("tech@phova.ma");
        submission.setStatus(SubmissionStatus.CONFORME);
        submission.setRemarks("Pont");
        submission.setAnswers(List.of(answer(1, "I1", value, comment), answer(2, "I2", "500", null)));
        return submission;
    }

    private static CheckListAnswer answer(int position, String itemId, String value, String comment)
    {
        CheckListItem item = new CheckListItem();
        item.setId(itemId);
        item.setPosition(position);
        CheckListAnswer answer = new CheckListAnswer();
        answer.setItem(item);
        answer.setValue(value);
        answer.setComment(comment);
        return answer;
    }
}
