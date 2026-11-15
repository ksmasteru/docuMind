package com.docuMind.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.CheckReport;

@Repository
public interface CheckReportRepository extends JpaRepository<CheckReport, String>
{
    // a check task's reports, the latest round first
    List<CheckReport> findByTaskIdOrderByRoundDesc(String taskId);

    // the reports of several check tasks at once (the alert list), every round
    List<CheckReport> findByTaskIdIn(Collection<String> taskIds);

    // the public verification page: the report a printed code belongs to
    Optional<CheckReport> findByVerificationCode(String verificationCode);

    // reports sent before their PDF had a QR code (VerificationBackfill)
    List<CheckReport> findByVerificationCodeIsNull();
}
