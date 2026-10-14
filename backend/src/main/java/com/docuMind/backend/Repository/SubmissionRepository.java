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

    // what one technician submitted, newest first
    List<CheckListSubmission> findByUserIdOrderBySubmittedAtDesc(String userId);

    // e.g. every NON_CONFORME submission, for the supervisor's list
    List<CheckListSubmission> findByStatusOrderBySubmittedAtDesc(SubmissionStatus status);
}
