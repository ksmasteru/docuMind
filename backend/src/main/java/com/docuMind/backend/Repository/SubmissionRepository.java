package com.docuMind.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

import com.docuMind.backend.model.CheckListSubmission;
import com.docuMind.backend.model.enums.SubmissionStatus;

// save / findById / findAll / deleteById come from JpaRepository.
// No repository for answers: cascade on CheckListSubmission.answers saves them.
@Repository
public interface SubmissionRepository extends JpaRepository<CheckListSubmission,String>
{
    // every check of one piece of equipment, newest first  (e.g. "MP1")
    List<CheckListSubmission> findByEquipmentOrderBySubmittedAtDesc(String equipment);

    // every submission of one template, newest first.
    // Template_Id = the "id" field of the "template" relation
    List<CheckListSubmission> findByTemplate_IdOrderBySubmittedAtDesc(String templateId);

    // does any submission answer this template? (checked before deleting a form)
    boolean existsByTemplate_Id(String templateId);

    // what one technician submitted, newest first
    List<CheckListSubmission> findByUserIdOrderBySubmittedAtDesc(String userId);

    // the reports sent for these tasks (a task sent back has several), oldest first
    List<CheckListSubmission> findByTaskIdInOrderBySubmittedAtAsc(java.util.Collection<String> taskIds);

    // the values already answered to a question with this label, in any form, the most recently used first
    // (the report's searchable lists: clients, addresses, sites…)
    @org.springframework.data.jpa.repository.Query("""
        select a.value from CheckListAnswer a
        where a.item.labelFr = :label and a.value is not null and trim(a.value) <> ''
        group by a.value order by max(a.submission.submittedAt) desc""")
    List<String> knownValues(@org.springframework.data.repository.query.Param("label") String label,
                             org.springframework.data.domain.Pageable page);

    // e.g. every NON_CONFORME submission, for the supervisor's list
    List<CheckListSubmission> findByStatusOrderBySubmittedAtDesc(SubmissionStatus status);

    // the reports sent with these forms (every version), newest first: the shared list (SubmissionService.sharedReports)
    List<CheckListSubmission> findByTemplate_IdInOrderBySubmittedAtDesc(java.util.Collection<String> templateIds,
                                                                       org.springframework.data.domain.Pageable page);

    // one person's reports sent with these forms, newest first (their own quality forms in the shared list)
    List<CheckListSubmission> findByUserIdAndTemplate_IdInOrderBySubmittedAtDesc(String userId, java.util.Collection<String> templateIds,
                                                                                org.springframework.data.domain.Pageable page);

    // the report a scanned QR code points to (the public verification page)
    java.util.Optional<CheckListSubmission> findByVerificationCode(String verificationCode);

    // reports sent before verification codes existed (VerificationService.backfill)
    List<CheckListSubmission> findByVerificationCodeIsNull();
}
