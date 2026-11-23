package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.docuMind.backend.config.Edition;
import com.docuMind.backend.exception.InvalidTaskException;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.Team;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.TaskEventRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.TeamRepository;
import com.docuMind.backend.repository.UserRepository;

// A technician's own report on the report platform (OwnReportService): the task it opens for his manager.
// Without Spring or a database: the repositories are mocks.
class OwnReportServiceTest {

    private static final String TECH = "tech@phova.com";
    private static final String MANAGER = "manager@phova.com";

    private UserRepository users;
    private TeamRepository teams;
    private TaskRepository tasks;
    private TaskEventRepository events;
    private User technician;

    @BeforeEach
    void setUp()
    {
        users = mock(UserRepository.class);
        teams = mock(TeamRepository.class);
        tasks = mock(TaskRepository.class);
        events = mock(TaskEventRepository.class);
        technician = new User("Hicham", TECH, "x", UserRole.USER);
        technician.setId("u-tech");
        User manager = new User("Karim", MANAGER, "x", UserRole.MANAGER);
        when(users.findByEmail(TECH)).thenReturn(Optional.of(technician));
        when(users.findByEmail(MANAGER)).thenReturn(Optional.of(manager));
        when(teams.findByTechnicianId("u-tech")).thenReturn(Optional.of(new Team(manager)));
        when(tasks.save(any(TaskModel.class))).thenAnswer(call -> {
            TaskModel task = call.getArgument(0);
            task.setId("t-new");
            return task;
        });
    }

    private OwnReportService service(String edition)
    {
        return new OwnReportService(new Edition(edition), users, teams, tasks, events);
    }

    @Test
    void onlyATechniciansReportOnTheReportPlatform()
    {
        assertTrue(service("rapports").applies(TECH));
        assertFalse(service("rapports").applies(MANAGER), "a manager's report stays without a task");
        assertFalse(service("full").applies(TECH), "the full platform doesn't change");
        assertFalse(service("rapports").applies("nobody@phova.com"));
    }

    @Test
    void itOpensAStartedTaskOfHisOwnForHisManager()
    {
        String id = service("rapports").open(TECH, template(), "");

        assertEquals("t-new", id);
        ArgumentCaptor<TaskModel> saved = ArgumentCaptor.forClass(TaskModel.class);
        verify(tasks).save(saved.capture());
        TaskModel task = saved.getValue();
        assertEquals(TECH, task.getTechnicianEmail());
        assertEquals(MANAGER, task.getManagerEmail(), "his team's manager reviews it");
        assertEquals("form-v2", task.getTemplateId(), "the report's form: submitTask checks it");
        assertEquals("Rapport d'expertise V2 (démontage)", task.getTitle());
        assertEquals(TaskStatus.STARTED, task.getStatus(), "what submitTask expects");
        assertTrue(task.isSelfAssigned());
        assertEquals("", task.getEquipmentId(), "no equipment: blank, the column stays NOT NULL");
        assertNull(task.getDueDate());

        ArgumentCaptor<TaskEvent> event = ArgumentCaptor.forClass(TaskEvent.class);
        verify(events).save(event.capture());
        assertEquals(TECH, event.getValue().getActorEmail());
        assertNull(event.getValue().getFromStatus(), "its creation");
        assertEquals(TaskStatus.STARTED, event.getValue().getToStatus());
    }

    @Test
    void aTechnicianInNoTeamIsRefused()
    {
        when(teams.findByTechnicianId("u-tech")).thenReturn(Optional.empty());
        InvalidTaskException refused = assertThrows(InvalidTaskException.class, () -> service("rapports").open(TECH, template(), "MP1"));
        assertTrue(refused.getMessage().contains("brouillon est gardé"));
        verify(tasks, never()).save(any());
    }

    private static CheckListTemplate template()
    {
        CheckListTemplate template = new CheckListTemplate();
        template.setId("form-v2");
        template.setTitle("Rapport d'expertise V2 (démontage)");
        return template;
    }
}
