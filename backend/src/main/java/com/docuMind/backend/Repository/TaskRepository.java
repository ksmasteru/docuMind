package com.docuMind.backend.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

import com.docuMind.backend.model.ReviewTask;
import com.docuMind.backend.model.TaskModel;
import com.docuMind.backend.model.enums.TaskStatus;

// save / findById / findAll come from JpaRepository.
// Tasks are never deleted : the manager sets them to CANCELED.
@Repository
public interface TaskRepository extends JpaRepository<TaskModel, String>
{
    // technician's tabs, e.g. "En cours" = [STARTED, BLOCKED, RETURNED]
    // uses idx_task_technician_status
    List<TaskModel> findByTechnicianEmailAndStatusInOrderByCreatedAtDesc(String technicianEmail, Collection<TaskStatus> statuses);

    // manager's view of the tasks he assigned, e.g. every SUBMITTED task waiting for review
    // uses idx_task_manager_status
    List<TaskModel> findByManagerEmailAndStatusInOrderByCreatedAtDesc(String managerEmail, Collection<TaskStatus> statuses);

    // manager's review queue : the report waiting longest comes first.
    // One query: each task joined to its latest submission and that submission's form.
    // LEFT JOINs so a task submitted before latestSubmissionId existed still shows up.
    // uses idx_task_manager_status
    @Query("""
        SELECT new com.docuMind.backend.model.ReviewTask(
            t.id, t.title, t.taskType, t.priority, t.equipmentId, t.technicianEmail,
            t.instructions, t.dueDate, t.createdAt, t.submittedAt, t.workedSeconds,
            s.id, s.status, s.inspectionDate,
            t.templateId, tpl.title, t.managerEmail, m.name, tech.name)
        FROM TaskModel t
        LEFT JOIN CheckListSubmission s ON s.id = t.latestSubmissionId
        LEFT JOIN s.template tpl
        LEFT JOIN User m ON m.email = t.managerEmail
        LEFT JOIN User tech ON tech.email = t.technicianEmail
        WHERE t.managerEmail = :managerEmail AND t.status = :status
          AND t.taskType <> com.docuMind.backend.model.enums.TaskType.VERIFICATION
        ORDER BY t.submittedAt ASC
        """)
    List<ReviewTask> findTasksToReview(@Param("managerEmail") String managerEmail,
                                       @Param("status") TaskStatus status);

    // every manager's reports waiting for a review (« Tous les rapports »: the sender is away).
    // Not the checks (settled from their alert) nor the workshop's tasks (reviewed from their intervention)
    @Query("""
        SELECT new com.docuMind.backend.model.ReviewTask(
            t.id, t.title, t.taskType, t.priority, t.equipmentId, t.technicianEmail,
            t.instructions, t.dueDate, t.createdAt, t.submittedAt, t.workedSeconds,
            s.id, s.status, s.inspectionDate,
            t.templateId, tpl.title, t.managerEmail, m.name, tech.name)
        FROM TaskModel t
        LEFT JOIN CheckListSubmission s ON s.id = t.latestSubmissionId
        LEFT JOIN s.template tpl
        LEFT JOIN User m ON m.email = t.managerEmail
        LEFT JOIN User tech ON tech.email = t.technicianEmail
        WHERE t.status = :status
          AND t.taskType <> com.docuMind.backend.model.enums.TaskType.VERIFICATION
          AND t.interventionId IS NULL
        ORDER BY t.submittedAt ASC
        """)
    List<ReviewTask> findAllTasksToReview(@Param("status") TaskStatus status);

    // a technician's reports sent or validated, the latest first (« Envoyés »)
    List<TaskModel> findTop60ByTechnicianEmailAndStatusInOrderBySubmittedAtDesc(String technicianEmail, Collection<TaskStatus> statuses);

    // pump history, newest first, one page at a time
    // uses idx_task_equipment_created
    Page<TaskModel> findByEquipmentIdOrderByCreatedAtDesc(String equipmentId, Pageable pageable);

    // a workshop intervention's tasks, oldest first. Uses idx_task_intervention
    List<TaskModel> findByInterventionIdOrderByCreatedAtAsc(String interventionId);

    // every task made on a pump, newest first: its history page (AlertService.pumpHistory).
    // Ignoring case: managers type the pump id by hand ("phb3-j-07")
    List<TaskModel> findByEquipmentIdIgnoreCaseOrderByCreatedAtDesc(String equipmentId);

    // every task a technician was given, newest first: his profile's history (TeamService)
    // uses idx_task_technician_status
    List<TaskModel> findByTechnicianEmailOrderByCreatedAtDesc(String technicianEmail);

    // a technician with a task on an alert (its check, or a work order made from it) may read its
    // check report (CheckService.readable): not one he declined or that was canceled
    boolean existsByTechnicianEmailAndAlertNumberAndStatusNotIn(String technicianEmail, Long alertNumber,
                                                                Collection<TaskStatus> statuses);

    // the work orders made before they recorded their alert (AlertService.backfillOrderAlerts)
    List<TaskModel> findByIdInAndAlertNumberIsNull(Collection<String> ids);

    // the team's cards: per technician and status, how many tasks and the last change among them
    // rows: [technicianEmail (String), status (TaskStatus), count (Long), last updatedAt (Instant)]
    @Query("""
        SELECT t.technicianEmail, t.status, COUNT(t), MAX(t.updatedAt)
        FROM TaskModel t
        WHERE t.technicianEmail IN :emails
        GROUP BY t.technicianEmail, t.status
        """)
    List<Object[]> countByTechnicianAndStatus(@Param("emails") Collection<String> emails);
}
