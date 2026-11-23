package com.docuMind.backend.services;

import java.time.Instant;

import org.springframework.stereotype.Service;

import com.docuMind.backend.config.Edition;
import com.docuMind.backend.exception.InvalidTaskException;
import com.docuMind.backend.exception.UserNotFoundException;
import com.docuMind.backend.model.CheckListTemplate;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.TaskType;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.TaskEventRepository;
import com.docuMind.backend.repository.TaskRepository;
import com.docuMind.backend.repository.TeamRepository;
import com.docuMind.backend.repository.UserRepository;

import jakarta.transaction.Transactional;

// A technician's own report, on the report platform (Edition.rapports, plan_rapports_platform.md): a report
// he sends from « Formulaires », with no task, goes to his manager for review. It opens a task he started
// himself (selfAssigned), STARTED, for his team's manager, with the report's form; SubmissionService then
// sends the report for it like any task's (TaskService.submitTask: SUBMITTED). From there it is a task like
// the others: in the manager's « Revue » (validate, send back), in the technician's « Tâches », on his profile.
// On the full platform nothing changes: a report sent without a task stays without one.
@Service
public class OwnReportService {
    // what the task says, for the manager reading it in « Revue » and the technician on his task's page
    static final String INSTRUCTIONS = "Rapport rempli à son initiative, sans tâche.";

    private final Edition edition;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;
    private final TaskRepository taskRepository;
    private final TaskEventRepository taskEventRepository;

    public OwnReportService(Edition edition, UserRepository userRepository, TeamRepository teamRepository,
                            TaskRepository taskRepository, TaskEventRepository taskEventRepository)
    {
        this.edition = edition;
        this.userRepository = userRepository;
        this.teamRepository = teamRepository;
        this.taskRepository = taskRepository;
        this.taskEventRepository = taskEventRepository;
    }

    // whether a report this user sends without a task goes to his manager: on the report platform, from a technician
    public boolean applies(String email)
    {
        return edition.rapports()
            && userRepository.findByEmail(email).map(user -> user.getRole() == UserRole.USER).orElse(false);
    }

    // the task the report goes with; its id. Refused (409) when he is in no team: nobody would review it.
    // In the transaction of the report's sending, so a refused report leaves nothing behind
    @Transactional
    public String open(String technicianEmail, CheckListTemplate template, String equipment)
    {
        User technician = userRepository.findByEmail(technicianEmail)
            .orElseThrow(() -> new UserNotFoundException("no user " + technicianEmail));
        String manager = teamRepository.findByTechnicianId(technician.getId())
            .map(team -> team.getManager().getEmail())
            .orElseThrow(() -> new InvalidTaskException("Vous n'êtes dans l'équipe d'aucun manager : votre rapport "
                    + "n'aurait personne pour le valider. Demandez à votre manager de vous ajouter à son équipe ; "
                    + "votre brouillon est gardé."));

        Instant now = Instant.now();
        TaskModel task = new TaskModel(template.getTitle(), TaskType.MAINTENANCE, technicianEmail, manager,
                equipment == null ? "" : equipment, INSTRUCTIONS, null);
        task.setTemplateId(template.getId());
        task.setSelfAssigned(true);
        task.setStatus(TaskStatus.STARTED);
        task.setFirstStartedAt(now);
        TaskModel saved = taskRepository.save(task);
        taskEventRepository.save(TaskEvent.statusChanged(saved.getId(), saved.getEquipmentId(), technicianEmail,
                null, TaskStatus.STARTED, null, INSTRUCTIONS, now));
        return saved.getId();
    }
}
