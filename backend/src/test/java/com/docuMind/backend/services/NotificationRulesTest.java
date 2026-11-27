package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.docuMind.backend.model.Intervention;
import com.docuMind.backend.model.InterventionEvent;
import com.docuMind.backend.model.Notification;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.InterventionAction;
import com.docuMind.backend.model.enums.InterventionOrigin;
import com.docuMind.backend.model.enums.InterventionStatus;
import com.docuMind.backend.model.enums.StepStatus;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.model.enums.WorkshopStep;
import com.docuMind.backend.repository.InterventionRepository;
import com.docuMind.backend.repository.NotificationRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.UserRepository;

// Who is told what (NotificationService.forTask / forIntervention), without Spring or a database
class NotificationRulesTest {

    private static final String MANAGER = "manager@phova.com";
    private static final String TECH = "tech@phova.com";
    private static final Instant NOW = Instant.parse("2026-11-21T10:00:00Z");

    private UserRepository users;
    private NotificationService service;

    @BeforeEach
    void setUp()
    {
        users = mock(UserRepository.class);
        when(users.findByEmail(anyString())).thenReturn(Optional.empty());
        service = new NotificationService(mock(NotificationRepository.class), users, mock(TaskRepository.class),
                mock(InterventionRepository.class), mock(NotificationMailer.class));
    }

    // ------------------------------------------------------------------ tasks

    @Test
    void aTaskSentByTheManagerGoesToItsTechnician()
    {
        TaskModel task = task(TaskType.CORRECTIVE);
        List<Notification> out = service.forTask(task, TaskEvent.statusChanged("t1", "PHB3-J-07", MANAGER, null, TaskStatus.ASSIGNED, null, null, NOW));
        assertEquals(1, out.size());
        assertEquals(TECH, out.get(0).getRecipientEmail());
        assertEquals("/tasks/t1", out.get(0).getLink());
        assertTrue(out.get(0).getTitle().startsWith("Nouvelle tâche"));
    }

    @Test
    void aCheckTheTechnicianStartedHimselfIsHisManagersNews()
    {
        TaskModel task = task(TaskType.VERIFICATION);
        task.setAlertNumber(12L);
        List<Notification> out = service.forTask(task, TaskEvent.statusChanged("t1", "PHB3-J-07", TECH, null, TaskStatus.STARTED, null, null, NOW));
        assertEquals(1, out.size());
        assertEquals(MANAGER, out.get(0).getRecipientEmail());
        assertEquals("/alerts/12", out.get(0).getLink());
    }

    @Test
    void aReportSentGoesToTheManagerUnlessTheWorkshopTellsIt()
    {
        TaskModel field = task(TaskType.CORRECTIVE);
        TaskEvent sent = TaskEvent.statusChanged("t1", "PHB3-J-07", TECH, TaskStatus.STARTED, TaskStatus.SUBMITTED, null, null, NOW);
        List<Notification> out = service.forTask(field, sent);
        assertEquals(List.of(MANAGER), out.stream().map(Notification::getRecipientEmail).toList());
        assertEquals("/review", out.get(0).getLink());

        TaskModel workshop = task(TaskType.CORRECTIVE);
        workshop.linkToIntervention("i1", WorkshopStep.DEMONTAGE_EXPERTISE);
        assertTrue(service.forTask(workshop, sent).isEmpty(), "its intervention's row reaches the Workshop Lead's queue");
    }

    @Test
    void theReviewsAnswerGoesBackToTheTechnicianWithTheComment()
    {
        TaskModel task = task(TaskType.CORRECTIVE);
        List<Notification> out = service.forTask(task, TaskEvent.statusChanged("t1", "PHB3-J-07", MANAGER,
                TaskStatus.SUBMITTED, TaskStatus.RETURNED, null, "Photo du palier floue", NOW));
        assertEquals(TECH, out.get(0).getRecipientEmail());
        assertTrue(out.get(0).getBody().contains("Photo du palier floue"));
    }

    @Test
    void nobodyIsToldOfHisOwnAction()
    {
        TaskModel task = task(TaskType.CORRECTIVE);
        // the technician approving his own report can't happen, but if the manager is also the technician…
        task.setTechnicianEmail(MANAGER);
        assertTrue(service.forTask(task, TaskEvent.statusChanged("t1", "X", MANAGER, TaskStatus.SUBMITTED, TaskStatus.APPROVED, null, null, NOW)).isEmpty());
    }

    // the report platform: a report a technician files on his own opens a task he started himself
    // (OwnReportService). Its creation tells nobody; its sending tells the manager, with no pump named
    @Test
    void aReportTheTechnicianFiledOnHisOwnReachesTheManagerOnce()
    {
        TaskModel own = new TaskModel("Rapport d'expertise", TaskType.MAINTENANCE, TECH, MANAGER, "", "Rapport rempli à son initiative, sans tâche.", null);
        own.setId("t2");
        own.setSelfAssigned(true);
        assertTrue(service.forTask(own, TaskEvent.statusChanged("t2", "", TECH, null, TaskStatus.STARTED, null, null, NOW)).isEmpty(),
                "not « a démarré une vérification »: it isn't a check");

        List<Notification> out = service.forTask(own, TaskEvent.statusChanged("t2", "", TECH, TaskStatus.STARTED, TaskStatus.SUBMITTED, null, null, NOW));
        assertEquals(List.of(MANAGER), out.stream().map(Notification::getRecipientEmail).toList());
        assertEquals("/review", out.get(0).getLink());
        assertEquals("tech@phova.com · rempli à son initiative", out.get(0).getBody());
    }

    @Test
    void withoutEquipmentTheTextDoesNotStartWithASeparator()
    {
        TaskModel task = task(TaskType.CORRECTIVE);
        task.setEquipmentId("");
        List<Notification> sent = service.forTask(task, TaskEvent.statusChanged("t1", "", MANAGER, null, TaskStatus.ASSIGNED, null, null, NOW));
        assertEquals("envoyée par manager@phova.com · pour le 2026-11-25", sent.get(0).getBody());
        List<Notification> returned = service.forTask(task, TaskEvent.statusChanged("t1", "", MANAGER,
                TaskStatus.SUBMITTED, TaskStatus.RETURNED, null, "Photo floue", NOW));
        assertEquals("« Photo floue »", returned.get(0).getBody());
        List<Notification> cancelled = service.forTask(task, TaskEvent.statusChanged("t1", "", MANAGER,
                TaskStatus.ASSIGNED, TaskStatus.CANCELED, null, null, NOW));
        assertNull(cancelled.get(0).getBody());
        assertEquals("PHB3-J-07 · « RAS »", NotificationService.about("PHB3-J-07", null, "« RAS »"));
    }

    // a validated or rejected report has left the technician's active tasks: the notice opens his sent report
    @Test
    void aValidatedReportOpensTheSentReport()
    {
        TaskModel task = task(TaskType.CORRECTIVE);
        task.setLatestSubmissionId("s9");
        List<Notification> approved = service.forTask(task, TaskEvent.statusChanged("t1", "PHB3-J-07", MANAGER,
                TaskStatus.SUBMITTED, TaskStatus.APPROVED, null, null, NOW));
        assertEquals("/tasks/rapport/s9", approved.get(0).getLink());
        List<Notification> rejected = service.forTask(task, TaskEvent.statusChanged("t1", "PHB3-J-07", MANAGER,
                TaskStatus.SUBMITTED, TaskStatus.REJECTED, null, "Hors périmètre", NOW));
        assertEquals("/tasks/rapport/s9", rejected.get(0).getLink());
        // sent back: still his task to correct
        List<Notification> returned = service.forTask(task, TaskEvent.statusChanged("t1", "PHB3-J-07", MANAGER,
                TaskStatus.SUBMITTED, TaskStatus.RETURNED, null, "Photo floue", NOW));
        assertEquals("/tasks/t1", returned.get(0).getLink());
    }

    // ------------------------------------------------------------------ interventions

    @Test
    void aStepWaitingInItsQueueGoesToEveryUserOfItsRole()
    {
        when(users.findByRole(UserRole.SALES)).thenReturn(List.of(user("sales1@phova.com"), user("sales2@phova.com"), user("pl@phova.com")));
        Intervention i = intervention(WorkshopStep.ACCORD_DEVIS, StepStatus.A_TRAITER);
        // the Chef de projet validated step 10: step 11 waits for Sales; the one of them who did it isn't told
        List<Notification> out = service.forIntervention(i, event(WorkshopStep.VALIDER_BESOINS_DEVIS, InterventionAction.VALIDATE, "pl@phova.com"));
        assertEquals(List.of("sales1@phova.com", "sales2@phova.com"), out.stream().map(Notification::getRecipientEmail).toList());
        assertEquals("/atelier/i1", out.get(0).getLink());
        assertTrue(out.get(0).getTitle().contains("11. Accord client sur devis"));
    }

    @Test
    void takingAStepOrATechniciansStepTellsNobody()
    {
        assertTrue(service.forIntervention(intervention(WorkshopStep.ACCORD_DEVIS, StepStatus.EN_COURS),
                event(WorkshopStep.ACCORD_DEVIS, InterventionAction.TAKE, "sales1@phova.com")).isEmpty());
        // step 8 waits for the technician: his task tells him
        assertTrue(service.forIntervention(intervention(WorkshopStep.DEMONTAGE_EXPERTISE, StepStatus.A_TRAITER),
                event(WorkshopStep.AFFECTER_EQUIPE, InterventionAction.VALIDATE, "lead@phova.com")).isEmpty());
    }

    @Test
    void aCancelledInterventionIsToldToWhoLaunchedIt()
    {
        Intervention i = intervention(WorkshopStep.ACCORD_DEVIS, StepStatus.EN_COURS);
        i.setStatus(InterventionStatus.ANNULEE);
        i.setStatusComment("Devis refusé");
        List<Notification> out = service.forIntervention(i, event(WorkshopStep.ACCORD_DEVIS, InterventionAction.CANCEL, "sales1@phova.com"));
        assertEquals(List.of(MANAGER), out.stream().map(Notification::getRecipientEmail).toList());
        assertTrue(out.get(0).getTitle().endsWith("annulée"));
        assertTrue(out.get(0).getBody().contains("Devis refusé"));
    }

    // ------------------------------------------------------------------ helpers

    private static TaskModel task(TaskType type)
    {
        TaskModel task = new TaskModel("Vérifier le palier", type, TECH, MANAGER, "PHB3-J-07", null, LocalDate.of(2026, 11, 25));
        task.setId("t1");
        return task;
    }

    private static Intervention intervention(WorkshopStep step, StepStatus status)
    {
        Intervention i = new Intervention(InterventionOrigin.ALERT, 12, MANAGER, "PHB3-J-07", "Vibrations", false);
        ReflectionTestUtils.setField(i, "id", "i1");
        i.setCurrentStep(step);
        i.setStepStatus(status);
        return i;
    }

    private static InterventionEvent event(WorkshopStep step, InterventionAction action, String actor)
    {
        return new InterventionEvent("i1", step, action, actor, StepStatus.EN_COURS, StepStatus.VALIDE, null, NOW);
    }

    private static User user(String email)
    {
        User user = new User(email, email, "x", UserRole.SALES);
        return user;
    }
}
