package com.docuMind.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.FormDraft;

// save / findById / deleteById come from JpaRepository.
@Repository
public interface FormDraftRepository extends JpaRepository<FormDraft, String>
{
    // the one draft of a technician for a form (and task). A null taskId becomes
    // "taskId IS NULL" in a derived query, so this also finds standalone drafts:
    // the lookup the service needs before saving, since the unique constraint can't catch those
    Optional<FormDraft> findByUserIdAndTemplateIdAndTaskId(String userId, String templateId, String taskId);

    // the newest when there may be several: a control sheet opened outside a task is a ticket, and one
    // person may have several of the same form open (FormDraftService.tickets)
    Optional<FormDraft> findFirstByUserIdAndTemplateIdAndTaskIdOrderByUpdatedAtDesc(String userId, String templateId, String taskId);

    // a person's drafts on these forms outside any task: their tickets, last edited first
    List<FormDraft> findByUserIdAndTaskIdIsNullAndTemplateIdInOrderByUpdatedAtDesc(String userId, java.util.Collection<String> templateIds);

    // a technician's unfinished forms, last edited first
    List<FormDraft> findByUserIdOrderByUpdatedAtDesc(String userId);

    // once the submission is sent, its draft goes. Must run inside a transaction
    // (SubmissionService is @Transactional)
    void deleteByUserIdAndTemplateIdAndTaskId(String userId, String templateId, String taskId);
}
