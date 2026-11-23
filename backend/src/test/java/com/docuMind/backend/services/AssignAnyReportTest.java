package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.CheckListTemplateRepository;
import com.docuMind.backend.repository.SubmissionRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.UserRepository;

import com.fasterxml.jackson.databind.ObjectMapper;

// A manager assigns any report to a technician (plan_rapports_platform.md): the list to assign from, and the
// task letting its technician fill a form his role doesn't fill on its own. Without Spring or a database.
class AssignAnyReportTest {

    private static final String TECH = "tech@phova.com";
    private static final String OTHER = "other@phova.com";

    private CheckListTemplateRepository templates;
    private TaskRepository tasks;
    private CheckListTemplateService service;
    private CheckListTemplate qualityOnly;   // a form only Quality fills on its own
    private CheckListTemplate technicians;   // a form for technicians

    @BeforeEach
    void setUp()
    {
        templates = mock(CheckListTemplateRepository.class);
        tasks = mock(TaskRepository.class);
        UserRepository users = mock(UserRepository.class);
        for (var account : List.of(new User("Karim", "manager@phova.com", "x", UserRole.MANAGER),
                new User("Hicham", TECH, "x", UserRole.USER), new User("Sara", OTHER, "x", UserRole.USER),
                new User("Lead", "lead@phova.com", "x", UserRole.WORKSHOP_LEAD), new User("Sales", "sales@phova.com", "x", UserRole.SALES)))
            when(users.findByEmail(account.getEmail())).thenReturn(Optional.of(account));
        service = new CheckListTemplateService(templates, mock(SubmissionRepository.class), new StructuredAnswers(new ObjectMapper()), users, tasks);

        qualityOnly = template("form-quality", "Fiche qualité interne", List.of(UserRole.QUALITY));
        technicians = template("form-v2", "Rapport d'expertise V2 (démontage)", List.of(UserRole.USER));
        CheckListTemplate managers = template("form-nc", "Fiche de non-conformité produit", List.of(UserRole.MANAGER, UserRole.USER));
        when(templates.findByActiveTrue()).thenReturn(List.of(qualityOnly, technicians, managers));

        // the manager assigned the Quality-only form to Hicham
        TaskModel task = new TaskModel("Contrôle", TaskType.CORRECTIVE, TECH, "manager@phova.com", "", null, null);
        task.setId("t1");
        task.setTemplateId("form-quality");
        when(tasks.findById("t1")).thenReturn(Optional.of(task));
        when(tasks.existsByTechnicianEmailAndTemplateId(TECH, "form-quality")).thenReturn(true);
    }

    @Test
    void whoeverSendsTasksListsEveryForm()
    {
        assertEquals(3, service.getTaskFormOptions("manager@phova.com").formsCount(), "the manager: every report");
        assertEquals(3, service.getTaskFormOptions("lead@phova.com").formsCount(), "the Pumps Maintenance Lead too");
        assertThrows(AccessDeniedException.class, () -> service.getTaskFormOptions(TECH), "a technician sends no task");
        assertThrows(AccessDeniedException.class, () -> service.getTaskFormOptions("sales@phova.com"));
        // his own Formulaires page still lists what his role fills
        assertEquals(1, service.getFormOptions("manager@phova.com").formsCount(), "the manager fills the NC only");
    }

    @Test
    void theTaskLetsItsTechnicianOpenAndSendTheForm()
    {
        assertTrue(service.mayOpen(qualityOnly, TECH), "his task names it");
        assertTrue(service.mayFill(qualityOnly, TECH, "t1"), "the report for that task");
        assertTrue(service.mayFill(technicians, TECH, null), "his role fills this one anyway");
    }

    @Test
    void withoutTheTaskHisRoleDecides()
    {
        assertFalse(service.mayFill(qualityOnly, TECH, null), "his own report, without the task: his role only");
        assertFalse(service.mayOpen(qualityOnly, OTHER), "another technician has no task with it");
        assertFalse(service.mayFill(qualityOnly, OTHER, "t1"), "nor may he send for Hicham's task");
        when(tasks.findById("t2")).thenReturn(Optional.empty());
        assertFalse(service.mayFill(qualityOnly, TECH, "t2"), "an unknown task");
    }

    private static CheckListTemplate template(String id, String title, List<UserRole> fill)
    {
        CheckListTemplate t = new CheckListTemplate();
        t.setId(id);
        t.setTitle(title);
        t.setActive(true);
        t.setFillRoles(fill);
        return t;
    }
}
