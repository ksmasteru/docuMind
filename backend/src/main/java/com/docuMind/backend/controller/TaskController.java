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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.ActiveTasks;
import com.docuMind.backend.model.ReviewTask;
import com.docuMind.backend.model.ReviewTasks;
import com.docuMind.backend.model.SentTask;
import com.docuMind.backend.model.TaskCreationDto;
import com.docuMind.backend.model.TaskDeclineDto;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.TaskReturnDto;
import com.docuMind.backend.services.TaskService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

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

    // the active tasks the logged-in manager assigned (ASSIGNED / STARTED / BLOCKED / RETURNED)
    // 403 for a technician
    @GetMapping("/assigned")
    public ResponseEntity<ActiveTasks> getManagerActiveTasks(Authentication manager)
    {
        List<TaskModel> tasks = taskService.getManagerActiveTasks(manager);

        ActiveTasks response = ActiveTasks.from(tasks);

        return ResponseEntity.status(HttpStatus.OK).body(
            response
        );
    }

    // the logged-in manager's tasks whose report waits for his review (SUBMITTED),
    // oldest submission first. 403 for a technician
    // ?scope=all: every manager's waiting reports (the sender is away), each with whose task it is
    @GetMapping("/review")
    public ResponseEntity<ReviewTasks> getManagerTasksToReview(@RequestParam(required = false) String scope,
        Authentication manager)
    {
        List<ReviewTask> tasks = "all".equalsIgnoreCase(scope)
            ? taskService.getAllTasksToReview() : taskService.getManagerTasksToReview(manager);

        ReviewTasks response = ReviewTasks.from(tasks);

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
    // a manager (the sender, or another when he is away): the report is approved, the task closed
    // (SUBMITTED -> APPROVED). Body optional: { comment }, what is done about a non-conforming report
    // (« Suite donnée »), required for one (400 without it).
    // 409 for a workshop task: it is reviewed on its intervention's page
    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approveTask(@PathVariable String id, Authentication authentication,
        @RequestBody(required = false) Approval approval)
    {
        String taskEventId = taskService.approveTask(id, authentication, approval == null ? null : approval.comment());
        return ResponseEntity.status(HttpStatus.OK).body(Map.of("id", taskEventId));
    }

    public record Approval(String comment) {}

    // a manager cancels a task not sent yet, or declined: { reason?, comment } (comment required;
    // reason WRONG_ASSIGNMENT, DUPLICATE or OTHER). 409 for a sent report, a check or a workshop task
    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancelTask(@PathVariable String id, Authentication authentication,
        @Valid @RequestBody TaskReturnDto cancel)
    {
        String taskEventId = taskService.cancelTask(id, authentication, cancel.reason(), cancel.comment());
        return ResponseEntity.status(HttpStatus.OK).body(Map.of("id", taskEventId));
    }

    // a manager gives a task to another technician: { technicianEmail, comment? }. Only one nobody
    // worked on yet (ASSIGNED) or one declined; it is ASSIGNED again
    @PostMapping("/{id}/reassign")
    public ResponseEntity<?> reassignTask(@PathVariable String id, Authentication authentication,
        @Valid @RequestBody Reassignment to)
    {
        String taskEventId = taskService.reassignTask(id, authentication, to.technicianEmail(), to.comment());
        return ResponseEntity.status(HttpStatus.OK).body(Map.of("id", taskEventId));
    }

    public record Reassignment(
        @NotBlank(message = "technicianEmail must not be blank") String technicianEmail,
        String comment) {}

    // the manager's tasks their technician declined: to give to someone else, or cancel (« À réaffecter »)
    @GetMapping("/declined")
    public ResponseEntity<ActiveTasks> getManagerDeclinedTasks(Authentication manager)
    {
        return ResponseEntity.ok(ActiveTasks.from(taskService.getManagerDeclinedTasks(manager)));
    }

    // the technician's « Envoyés »: the reports he sent, waiting or validated (by whom, when)
    @GetMapping("/mine/sent")
    public ResponseEntity<List<SentTask>> getTechnicianSentTasks(Authentication technician)
    {
        return ResponseEntity.ok(taskService.getTechnicianSentTasks(technician));
    }

    // the numbers on the tabs: { toDo } for a technician, { toReview, toReviewAll, declined } for a manager
    @GetMapping("/counts")
    public ResponseEntity<Map<String, Integer>> counts(Authentication caller)
    {
        return ResponseEntity.ok(taskService.counts(caller));
    }

    // the report goes back to the technician with what to redo (SUBMITTED -> RETURNED)
    @PostMapping("/{id}/return")
    public ResponseEntity<?> returnTask(@PathVariable String id, Authentication authentication,
        @Valid @RequestBody TaskReturnDto returnDto)
    {
        String taskEventId = taskService.returnTask(id, authentication, returnDto.reason(), returnDto.comment());
        return ResponseEntity.status(HttpStatus.OK).body(Map.of("id", taskEventId));
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
    // later: @PostMapping("/{id}/reject")
    */
}
