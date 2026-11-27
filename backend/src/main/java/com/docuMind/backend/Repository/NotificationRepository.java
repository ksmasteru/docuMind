package com.docuMind.backend.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.Notification;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, String>
{
    // the bell's list: one person's newest (idx_notification_recipient_created)
    List<Notification> findTop50ByRecipientEmailOrderByCreatedAtDesc(String recipientEmail);

    // the number on the bell (idx_notification_recipient_read)
    long countByRecipientEmailAndReadAtIsNull(String recipientEmail);

    // one of his own: someone else's id is "not found"
    Optional<Notification> findByIdAndRecipientEmail(String id, String recipientEmail);

    // "Tout marquer comme lu"; returns how many were unread
    @Modifying
    @Query("update Notification n set n.readAt = :at where n.recipientEmail = :email and n.readAt is null")
    int markAllRead(@Param("email") String email, @Param("at") Instant at);
}
