package com.docuMind.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.InterventionEvent;

// events are only ever added (InterventionEvent is @Immutable) : use save(), never delete.
@Repository
public interface InterventionEventRepository extends JpaRepository<InterventionEvent, String>
{
    // one intervention's timeline, oldest first
    // uses idx_intervention_event_occurred
    List<InterventionEvent> findByInterventionIdOrderByOccurredAtAsc(String interventionId);

    // the interventions one user acted on (the Suivi tab)
    @Query("select distinct e.interventionId from InterventionEvent e where e.actorEmail = :email")
    List<String> findInterventionIdsByActor(@Param("email") String email);
}
