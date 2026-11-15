package com.docuMind.backend.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.AlertCase;
import com.docuMind.backend.model.enums.AlertCloseReason;
import com.docuMind.backend.model.enums.AlertSource;
import com.docuMind.backend.model.enums.AlertStatus;

@Repository
public interface AlertCaseRepository extends JpaRepository<AlertCase, Long>
{
    // the open case following an alert (open_key is unique)
    Optional<AlertCase> findByOpenKey(String openKey);

    // the cases resolved while their alert was still on: they cover it until it clears (AlertService.sync)
    List<AlertCase> findByAlertKeyAndResolvedAtGreaterThanEqual(String alertKey, Instant since);

    // the false alarms closed on an alert since a moment: the latest, and how many
    Optional<AlertCase> findFirstByAlertKeyAndCloseReasonAndResolvedAtGreaterThanEqualOrderByResolvedAtDesc(
        String alertKey, AlertCloseReason closeReason, Instant since);

    long countByAlertKeyAndCloseReasonAndResolvedAtGreaterThanEqual(String alertKey, AlertCloseReason closeReason, Instant since);

    // the twin's open cases: the ones a sync may clear
    List<AlertCase> findBySourceAndStatusNot(AlertSource source, AlertStatus status);

    // the manager's list, newest first
    List<AlertCase> findAllByOrderByRaisedAtDesc(Pageable page);

    // a technician's list: the open cases of his site, and the ones he reported.
    // Two queries rather than ":site IS NULL OR ...": Hibernate binds a null parameter with no type,
    // Postgres then takes it for bytea and LOWER(bytea) fails.
    @Query("""
        SELECT c FROM AlertCase c
        WHERE (c.status <> com.docuMind.backend.model.enums.AlertStatus.RESOLVED
               AND LOWER(c.site) = LOWER(:site))
           OR c.reportedBy = :email
        ORDER BY c.raisedAt DESC
        """)
    List<AlertCase> findForTechnicianAtSite(@Param("site") String site, @Param("email") String email);

    // a technician with no site on his account: the open cases of every site, and the ones he reported
    @Query("""
        SELECT c FROM AlertCase c
        WHERE c.status <> com.docuMind.backend.model.enums.AlertStatus.RESOLVED
           OR c.reportedBy = :email
        ORDER BY c.raisedAt DESC
        """)
    List<AlertCase> findForTechnicianAnySite(@Param("email") String email);

    // a pump's history, newest first
    List<AlertCase> findByPumpIdIgnoreCaseOrderByRaisedAtDesc(String pumpId);

    // every work order made from a case: rows [taskId (String), case number (Long)]
    @Query("SELECT o.taskId, c.number FROM AlertCase c JOIN c.orders o")
    List<Object[]> findOrderLinks();
}
