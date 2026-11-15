package com.docuMind.backend.model;

import java.time.LocalDate;
import java.util.List;

import com.docuMind.backend.model.enums.AlertCloseReason;
import com.docuMind.backend.model.enums.CannotHandleReason;
import com.docuMind.backend.model.enums.CheckPointKind;
import com.docuMind.backend.model.enums.CheckResult;
import com.docuMind.backend.model.enums.CheckVerdict;
import com.docuMind.backend.model.enums.FalseAlarmCause;
import com.docuMind.backend.model.enums.InconclusiveReason;
import com.docuMind.backend.model.enums.PumpArrivalState;
import com.docuMind.backend.model.enums.TaskPriority;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

// The bodies the alert endpoints receive (AlertController)
public final class AlertForms {

    private AlertForms() {}

    // POST /api/v1/alerts/sync: the twin's alerts on now, as the browser's simulation sees them
    public record Sync(@NotNull List<@Valid LiveAlert> alerts, Long at) {}

    // id: "PHB3-J-07:vibration"; since: when it started (ms); severity: warning or critical
    public record LiveAlert(@NotBlank String id, @NotBlank String pumpId, String site,
                            @NotBlank String severity, String message, Long since) {}

    public record Status(@NotBlank String status) {}

    public record Priority(@NotBlank String priority) {}

    public record Comment(@NotBlank(message = "Le commentaire est vide.") @Size(max = 4000) String text) {}

    // a work order created from the case (AssignTask.jsx)
    public record Order(@NotBlank String taskId, String title, String technicianEmail) {}

    // the pump sent to the workshop from the case (WorkshopRequest.jsx)
    public record Intervention(@NotBlank String id, String number) {}

    // the manager refuses a request: why
    public record Refusal(@NotBlank(message = "Dites au technicien pourquoi.") @Size(max = 4000) String comment) {}

    // POST /api/v1/alerts/reports: a technician reports a fault the twin did not see. What he found is a
    // check report (its sections and what comes next), confirmed from the start
    public record FieldReport(
        @NotBlank(message = "Choisissez la pompe.") @Size(max = 64) String pumpId,
        @Size(max = 64) String equipmentModel,
        @Size(max = 32) String site,
        @NotBlank(message = "Dites ce que vous constatez.") @Size(max = 255) String title,
        @Size(max = 4000) String description,
        @NotBlank(message = "Choisissez la gravité.") String severity,
        @NotNull(message = "Le rapport manque.") @Valid CheckReportForm report) {}

    // ---------- the check before acting (levée de doute) ----------

    // one point to check, as the web app suggests it and the sender edits it
    public record CheckPointForm(
        @NotBlank(message = "Un point à vérifier n'a pas de libellé.") @Size(max = 255) String label,
        CheckPointKind kind,            // STATE when missing
        @Size(max = 16) String unit,
        Double twinValue, Double warnLimit, Double critLimit,
        boolean photoRequired,
        boolean custom) {}

    // POST /api/v1/alerts/{n}/checks: the manager sends the check to a technician
    public record CheckOrder(
        @NotBlank(message = "Choisissez le technicien.") @Email String technicianEmail,
        @NotNull @Size(min = 1, max = 30, message = "Entre 1 et 30 points à vérifier.") List<@Valid CheckPointForm> points,
        TaskPriority priority,
        LocalDate dueDate,
        @Size(max = 4000) String instructions) {}

    // POST /api/v1/alerts/{n}/checks/self: a technician on site starts the check himself
    public record SelfCheck(
        @NotNull @Size(min = 1, max = 30, message = "Entre 1 et 30 points à vérifier.") List<@Valid CheckPointForm> points) {}

    // POST /api/v1/checks/{taskId}/report: what he found
    public record CheckResultForm(
        @NotBlank String pointId,
        @NotNull(message = "Chaque point a besoin d'un résultat.") CheckResult result,
        Double reading,
        @Size(max = 4000) String comment,
        @Size(max = 12, message = "12 photos au plus par point.") List<String> photos) {}

    public record CheckSectionForm(
        @Size(max = 255) String title,
        @Size(max = 4000) String comment,
        @Size(max = 12, message = "12 photos au plus par section.") List<String> photos) {}

    public record CheckReportForm(
        PumpArrivalState arrivalState,
        List<@Valid CheckResultForm> results,
        @Size(max = 20, message = "20 sections au plus.") List<@Valid CheckSectionForm> sections,
        CheckVerdict verdict,           // ignored for a fault report: CONFIRMED
        FalseAlarmCause falseAlarmCause,
        InconclusiveReason inconclusiveReason,
        boolean urgentStop,
        @Size(max = 4000) String comment,
        Boolean canHandle,
        @Size(max = 4000) String handleMessage,
        Double estimatedHours,
        @Size(max = 2000) String partsNeeded,
        CannotHandleReason cannotHandleReason,
        @Size(max = 4000) String cannotHandleComment) {}

    // the manager sends the report back to the technician: what to add
    public record CheckReturn(
        @NotBlank(message = "Dites au technicien ce qu'il faut compléter.") @Size(max = 4000) String comment) {}

    // the manager closes the alert, with its reason
    public record Close(
        @NotNull(message = "Choisissez la raison.") AlertCloseReason reason,
        @Size(max = 4000) String comment) {}
}
