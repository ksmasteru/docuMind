package com.docuMind.backend.services;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Comparator;
import java.util.HexFormat;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.docuMind.backend.model.CheckListAnswer;
import com.docuMind.backend.model.CheckListSubmission;

// What makes a printed report checkable:
//   - a random code per report, printed with a QR code of its verification URL
//   - a fingerprint of the report's content, taken when it's sent and recomputed on each check
// A QR code can't stop anyone editing a PDF: it sends whoever holds the paper to the server's
// copy, which they can't edit, to compare with what they read.
@Component
public class ReportVerification {

    // Crockford's base32: no I, L, O or U, so a code read off paper can't be mistyped between
    // look-alikes (normalize maps them back)
    private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    // 16 characters × 5 bits = 80 random bits: not guessable, even without the rate limit
    public static final int CODE_LENGTH = 16;

    private final SecureRandom random = new SecureRandom();

    // where the QR codes point: the frontend's /verify/{code} page
    private final String baseUrl;

    // VERIFY_BASE_URL first, then the frontend's own URL (FRONT_END_URL), else local Vite.
    // A printed QR code keeps this URL forever: it must be an address that lasts.
    public ReportVerification(@Value("${app.verify.base-url:}") String baseUrl,
                              @Value("${app.cors.frontend-url:}") String frontendUrl)
    {
        String url = !baseUrl.isBlank() ? baseUrl : !frontendUrl.isBlank() ? frontendUrl : "http://localhost:5173";
        this.baseUrl = url.replaceAll("/+$", "");
    }

    public String newCode()
    {
        char[] code = new char[CODE_LENGTH];
        for (int i = 0; i < CODE_LENGTH; i++)
            code[i] = ALPHABET[random.nextInt(ALPHABET.length)];
        return new String(code);
    }

    // "7K3F9QXM2B4C8DHN" → "7K3F-9QXM-2B4C-8DHN", as printed and shown
    public static String format(String code)
    {
        return String.join("-", code.split("(?<=\\G.{4})"));
    }

    // what someone typed or scanned → the stored code, or null if it can't be one.
    // Dashes, spaces and case don't matter; O → 0 and I / L → 1 like Crockford's base32.
    public static String normalize(String input)
    {
        if (input == null)
            return null;
        String code = input.toUpperCase().replaceAll("[\\s-]", "")
                .replace('O', '0').replace('I', '1').replace('L', '1');
        return code.matches("[0-9A-HJKMNP-TV-Z]{" + CODE_LENGTH + "}") ? code : null;
    }

    public String urlFor(String code)
    {
        return baseUrl + "/verify/" + format(code);
    }

    // SHA-256 over the report's content, in a fixed order. Each value is written with its length
    // ("5:hello", "-" for null) so no two different reports can produce the same text.
    // submittedAt counts to the second: the database keeps microseconds, the JVM may have more.
    public String fingerprint(CheckListSubmission submission)
    {
        StringBuilder text = new StringBuilder("v1|");
        field(text, submission.getTemplate().getId());
        field(text, submission.getEquipment());
        field(text, submission.getInspectionDate() == null ? null : submission.getInspectionDate().toString());
        field(text, submission.getUserId());
        field(text, submission.getStatus().name());
        field(text, submission.getRemarks());
        field(text, submission.getTaskId());
        field(text, submission.getExtraParts());
        field(text, submission.getSubmittedAt() == null ? null : String.valueOf(submission.getSubmittedAt().getEpochSecond()));
        submission.getAnswers().stream()
                .sorted(Comparator.comparingInt((CheckListAnswer a) -> a.getItem().getPosition())
                        .thenComparing(a -> a.getItem().getId()))
                .forEach(a -> {
                    field(text, a.getItem().getId());
                    field(text, a.getValue());
                    field(text, a.getComment());
                });
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is missing from this JVM", e);
        }
    }

    private static void field(StringBuilder text, String value)
    {
        if (value == null)
            text.append("-|");
        else
            text.append(value.length()).append(':').append(value).append('|');
    }
}
