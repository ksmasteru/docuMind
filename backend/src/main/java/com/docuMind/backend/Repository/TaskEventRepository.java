package com.docuMind.backend.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

import com.docuMind.backend.model.TaskEvent;

// events are only ever added (TaskEvent is @Immutable) : use save(), never delete.
@Repository
public interface TaskEventRepository extends JpaRepository<TaskEvent, String>
{
    // one task's timeline, oldest first (also used to rebuild the time spent in STARTED)
    // uses idx_task_event_task_occurred
    List<TaskEvent> findByTaskIdOrderByOccurredAtAsc(String taskId);

    // the latest event of a task : a new event's occurredAt must not be before it
    Optional<TaskEvent> findFirstByTaskIdOrderByOccurredAtDesc(String taskId);

    // pump history, newest first, one page at a time
    // uses idx_task_event_equipment_occurred
    Page<TaskEvent> findByEquipmentIdOrderByOccurredAtDesc(String equipmentId, Pageable pageable);
}
