package com.docuMind.backend.services;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.security.access.AccessDeniedException;
import com.docuMind.backend.exception.InvalidRoleException;
import com.docuMind.backend.exception.InvalidTaskException;
import com.docuMind.backend.exception.TaskNotFoundException;
import com.docuMind.backend.model.TaskCreationDto;
import com.docuMind.backend.model.TaskEvent;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.User;
import java.util.List;
import com.docuMind.backend.model.enums.StatusReason;
import com.docuMind.backend.model.enums.TaskStatus;
import com.docuMind.backend.model.enums.UserRole;
import com.docuMind.backend.repository.TaskEventRepository;
import com.docuMind.backend.repository.TaskRepository;

import jakarta.transaction.Transactional;

@Service
public class TaskService {
    private final TaskRepository taskRepository;
    private final TaskEventRepository taskEventRepository;
    private final UserService userService;

    // statuses a task may be started from (see maintenace_loop_servicetohandle.md)
    private static final Set<TaskStatus> CAN_START_FROM =
            EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.BLOCKED, TaskStatus.RETURNED);

    private static final Set<TaskStatus> ACTIVE_STATUSES =
        EnumSet.of(TaskStatus.ASSIGNED, TaskStatus.STARTED, TaskStatus.BLOCKED, TaskStatus.RETURNED);

    public TaskService(TaskRepository taskRepository, TaskEventRepository taskEventRepository,
        UserService userService
    )
    {
        this.taskRepository = taskRepository;
        this.taskEventRepository = taskEventRepository;
        this.userService = userService;
    }

    //One method changes the status. It checks who is acting 
    // and whether the transition is allowed, updates the times 
    // (fixing points 3 and 4), saves the task 
    // and writes the event in the same transaction.
    //  Fix point 2 here by having all code go through it.
    
    // creating an order by a manager should preauthorize
     // task 
    @PreAuthorize("hasRole('USER')")
    public List<TaskModel> getTechnicianActiveTasks(Authentication technician)
    {
        return taskRepository.findByTechnicianEmailAndStatusInOrderByCreatedAtDesc(technician.getName(), ACTIVE_STATUSES);
    }

    @Transactional
    //@PreAuthorize('hasRole')
    // managerEmail and technicianEmail store the users' emails (what the JWT holds)
    public String createNewTask(TaskCreationDto task, Authentication manager)
    {
        // test if the user actualy exist and is a technician.
        // users are identified by their email (unique, and it's what the JWT holds)
        // getUserByEmail throws UserNotFoundException (404) if the email doesn't exist
        User technician = userService.getUserByEmail(task.technicianEmail());
        if (technician.getRole() != UserRole.USER)
            throw new InvalidRoleException("user " + task.technicianEmail() + " is not a technician");

        TaskModel taskOrder = new TaskModel(task.title(), task.taskType(), technician.getEmail(),
                manager.getName(), task.equipmentId(), task.instructions(), task.dueDate()
        );
        
        taskOrder.setStatus(TaskStatus.ASSIGNED);

        TaskModel order = taskRepository.save(taskOrder);

        // creating an event of task creation : nothing -> ASSIGNED
        TaskEvent taskEvent = TaskEvent.statusChanged(order.getId(), order.getEquipmentId(),
                manager.getName(), null, TaskStatus.ASSIGNED, null, null, Instant.now());

        taskEventRepository.save(taskEvent);
        
        return order.getId();
    }

    // techincian declining a task
    @Transactional
    public String declineTask(String taskId, Authentication technician, StatusReason reason, String comment)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
    
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
            throw new AccessDeniedException("task not assigned to this technician");   
        if (!task.getStatus().equals(TaskStatus.ASSIGNED))
            throw new InvalidTaskException("a task in status " + task.getStatus() + " can't be declined");

        Instant now = Instant.now();
        
        TaskEvent taskEvent = TaskEvent.statusChanged(taskId, task.getEquipmentId(), technicianEmail,
                TaskStatus.ASSIGNED, TaskStatus.DECLINED, reason, comment, now);

        task.setStatus(TaskStatus.DECLINED);

        task.setStatusReason(reason);
        task.setStatusComment(comment);

        taskRepository.save(task);
        TaskEvent saved = taskEventRepository.save(taskEvent);
        return saved.getId();
    }
    // techncian Starting a task
    // techincian gets shown a task : bottom of it start, decline.
    // the task gets shown from the backend so its field should be valid.
    @Transactional
    public String startTask(String taskId, Authentication technician)
    {
        // check for task validity. 
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");
        // only these statuses can move to STARTED : first start, resume after a block,
        // or rework after the manager returned the report. Anything else is refused.
        if (!CAN_START_FROM.contains(task.getStatus()))
            throw new InvalidTaskException("a task in status " + task.getStatus() + " can't be started");

        Instant now = Instant.now();
        
        TaskEvent taskEvent = TaskEvent.statusChanged(taskId,task.getEquipmentId() , technicianEmail, task.getStatus(), TaskStatus.STARTED, null, null, now);

        task.setStatus(TaskStatus.STARTED);

        // only the very first start : a resume after BLOCKED / RETURNED keeps the original time
        if (task.getFirstStartedAt() == null)
            task.setFirstStartedAt(now);

        task.setActiveSince(now);

        // the reason of the previous status (BLOCKED, RETURNED) no longer applies
        task.setStatusReason(null);
        task.setStatusComment(null);

        taskRepository.save(task);
        
        TaskEvent saved = taskEventRepository.save(taskEvent);
        
        return saved.getId();
    }

    @Transactional
    // TASK BLOCKED THE MANAGER SHOULD GET NOTIFIED.
    public String blockTask(String taskId, Authentication technician, StatusReason reason, String comment)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

        if (!task.getStatus().equals(TaskStatus.STARTED))
            throw new InvalidTaskException("a task in status " + task.getStatus() + " can't be blocked");

        
        Instant now = Instant.now();
        
        if (task.getActiveSince() != null)
        {
            long periodSeconds = Duration.between(task.getActiveSince(), now).getSeconds();
            task.setWorkedSeconds(task.getWorkedSeconds() + periodSeconds);
            task.setActiveSince(null);
        }

        TaskEvent taskEvent = TaskEvent.statusChanged(taskId,task.getEquipmentId() , technicianEmail, task.getStatus(), TaskStatus.BLOCKED, reason, comment, now);
    
        task.setStatus(TaskStatus.BLOCKED);

        task.setStatusReason(reason);
        
        task.setStatusComment(comment);

        taskRepository.save(task);
        
        TaskEvent saved = taskEventRepository.save(taskEvent);
        
        return saved.getId();
    }

    /*
    @Transactional
    // TODO THIS requires a lot of work.
    
    public String submitTask(String taskId, Authentication technician)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

    }
    
    @Transactional
    public String declineTask(String taskId, Authentication technician)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

    }

    @Transactional
    public String cancelTask(String taskId, Authentication technician)
    {
        TaskModel task = taskRepository.findById(taskId).
            orElseThrow( () -> new TaskNotFoundException("no task found with id :" + taskId));
        
        // check if this task is assigned to this user.
        // the token holds the email, and tasks store the technician's email
        String technicianEmail = technician.getName();
        if (!task.getTechnicianEmail().equals(technicianEmail))
              throw new AccessDeniedException("task not assigned to this technician");

    }
    */
}
