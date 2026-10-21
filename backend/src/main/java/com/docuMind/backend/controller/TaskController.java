package com.docuMind.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.ActiveTasks;
import com.docuMind.backend.model.TaskCreationDto;
import com.docuMind.backend.model.TaskDeclineDto;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.services.TaskService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/task")
public class TaskController {
    private final TaskService taskService;
    
    public TaskController(TaskService taskService)
    {
        this.taskService = taskService;
    }


    // my tasks tab opens tasks that are assigned / started.
    // how should the data be sent back to front end .
    // {"location", "title", "issueDate", "due Date", "equipements id", "info"}
    @GetMapping("/mine")
    public ResponseEntity<ActiveTasks> getTechnicianActiveTasks(Authentication technician)
    {
        List<TaskModel> tasks = taskService.getTechnicianActiveTasks(technician);
        
        ActiveTasks response = ActiveTasks.from(tasks);
        
        return ResponseEntity.status(HttpStatus.OK).body(
            response
        );
    }

    @PostMapping("/new")
    // preauthorize hasrole admin, manager.
    public ResponseEntity<?> createNewTask(@Valid @RequestBody TaskCreationDto task, Authentication manager)
    {
        String taskId = taskService.createNewTask(task, manager);
        return ResponseEntity.status(HttpStatus.CREATED).body(
            (Map.of("id", taskId)));
    }
    
    @PostMapping("/{id}/decline")
    public ResponseEntity<?> declineTask(@PathVariable String id, Authentication authentication, @Valid @RequestBody TaskDeclineDto declineDto)
    {
        String taskEventId = taskService.declineTask(id, authentication, declineDto.reason(), declineDto.comment());

        return ResponseEntity.status(HttpStatus.OK).body(
            (Map.of("deleted", taskEventId)));
    }
    
    @PostMapping("/{id}/start")
    public ResponseEntity<?> startTask(@PathVariable String id, Authentication authentication)
    {
        String taskEventId = taskService.startTask(id, authentication);
        return ResponseEntity.status(HttpStatus.OK).body(
            (Map.of("id", taskEventId))
        );
    }

    
    @PostMapping("/{id}/block")
    public ResponseEntity<?> blockTask(@PathVariable String id, Authentication authentication, @Valid @RequestBody TaskDeclineDto blockDto)
    {
        String taskEventId = taskService.blockTask(id, authentication, blockDto.reason(), blockDto.comment());
        return ResponseEntity.status(HttpStatus.OK).body(
            (Map.of("id", taskEventId))
        );
    }
    /*
    @PostMapping("/{id}/submit")
    public ResponseEntity<?> submitTask(@PathVariable String id, Authentication authentication)
    {
        String taskEventId = taskService.submitTask(id, authentication);
        return ResponseEntity.status(HttpStatus.OK).body(
            (Map.of("id", taskEventId))
        );
    }
    @PostMapping("/{id}/decline")
    public ResponseEntity<?> declineTask(@PathVariable String id, Authentication authentication)
    {
        String taskEventId = taskService.declineTask(id, authentication);
        return ResponseEntity.status(HttpStatus.OK).body(
            (Map.of("id", taskEventId))
        );
    }
    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancelTask(@PathVariable String id, Authentication authentication)
    {
    String taskEventId = taskService.cancelTask(id, authentication);
        return ResponseEntity.status(HttpStatus.OK).body(
            (Map.of("id", taskEventId))
        );
    }
    // --------- manager / admin ----------
    @PostMapping("/{id}/reject")
    
    @PostMapping("/{id/return")

    @PostMapping ("/{id}/approve")
    */
}
