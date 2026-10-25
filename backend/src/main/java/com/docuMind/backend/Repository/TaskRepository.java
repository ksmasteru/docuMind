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
            t.templateId, tpl.title)
        FROM TaskModel t
        LEFT JOIN CheckListSubmission s ON s.id = t.latestSubmissionId
        LEFT JOIN s.template tpl
        WHERE t.managerEmail = :managerEmail AND t.status = :status
        ORDER BY t.submittedAt ASC
        """)
    List<ReviewTask> findTasksToReview(@Param("managerEmail") String managerEmail,
                                       @Param("status") TaskStatus status);

    // pump history, newest first, one page at a time
    // uses idx_task_equipment_created
    Page<TaskModel> findByEquipmentIdOrderByCreatedAtDesc(String equipmentId, Pageable pageable);
}
