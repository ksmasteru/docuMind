package com.docuMind.backend.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

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

    // pump history, newest first, one page at a time
    // uses idx_task_equipment_created
    Page<TaskModel> findByEquipmentIdOrderByCreatedAtDesc(String equipmentId, Pageable pageable);
}
