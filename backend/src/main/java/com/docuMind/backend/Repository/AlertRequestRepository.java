package com.docuMind.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.AlertCase;
import com.docuMind.backend.model.AlertRequest;
import com.docuMind.backend.model.enums.AlertRequestStatus;

@Repository
public interface AlertRequestRepository extends JpaRepository<AlertRequest, String>
{
    // one waiting request per technician and case
    boolean existsByAlertCaseAndTechnicianEmailAndStatus(AlertCase alertCase, String technicianEmail, AlertRequestStatus status);
}
