package com.docuMind.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.Intervention;
import com.docuMind.backend.model.enums.InterventionStatus;
import com.docuMind.backend.model.enums.WorkshopStep;

// interventions are never deleted : a final no sets them to ANNULEE.
@Repository
public interface InterventionRepository extends JpaRepository<Intervention, String>
{
    // a role's queue: the open interventions at one of its steps, the oldest first
    // uses idx_intervention_status_step
    List<Intervention> findByStatusAndCurrentStepInOrderByCreatedAtAsc(InterventionStatus status, Collection<WorkshopStep> steps);

    // the Suivi tab: the ones a user worked on, the last moved first
    List<Intervention> findByIdInOrderByUpdatedAtDesc(Collection<String> ids);

    // the intervention a technician's task belongs to (its step 8 / 16), if any
    Optional<Intervention> findByTaskId(String taskId);
    boolean existsByTaskId(String taskId);
}
