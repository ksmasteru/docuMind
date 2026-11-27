package com.docuMind.backend.controller;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docuMind.backend.model.Notification;
import com.docuMind.backend.model.enums.NotificationKind;
import com.docuMind.backend.services.NotificationService;

// the bell of the web pages (NotificationBell.jsx): the caller's own notifications, every role
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService)
    {
        this.notificationService = notificationService;
    }

    // what the bell shows; read: false until he opened it or marked all read
    public record NotificationView(String id, NotificationKind kind, String title, String body, String link,
                                   Instant createdAt, boolean read)
    {
        static NotificationView of(Notification n)
        {
            return new NotificationView(n.getId(), n.getKind(), n.getTitle(), n.getBody(), n.getLink(),
                    n.getCreatedAt(), n.getReadAt() != null);
        }
    }

    // GET /api/v1/notifications: his 50 newest, and how many are unread
    @GetMapping
    public ResponseEntity<Map<String, Object>> list(Authentication caller)
    {
        List<NotificationView> notifications = notificationService.latest(caller.getName()).stream()
            .map(NotificationView::of).toList();
        return ResponseEntity.ok(Map.of("notifications", notifications,
                "unread", notificationService.unreadCount(caller.getName())));
    }

    // GET /api/v1/notifications/unread-count: the number on the bell, read every 30 s
    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Long>> unreadCount(Authentication caller)
    {
        return ResponseEntity.ok(Map.of("unread", notificationService.unreadCount(caller.getName())));
    }

    // POST /api/v1/notifications/{id}/read: 204, or 404 when it isn't one of his
    @PostMapping("/{id}/read")
    public ResponseEntity<Void> markRead(@PathVariable String id, Authentication caller)
    {
        return notificationService.markRead(id, caller.getName())
            ? ResponseEntity.noContent().build()
            : ResponseEntity.notFound().build();
    }

    // POST /api/v1/notifications/read-all: « Tout marquer comme lu »
    @PostMapping("/read-all")
    public ResponseEntity<Map<String, Integer>> markAllRead(Authentication caller)
    {
        return ResponseEntity.ok(Map.of("marked", notificationService.markAllRead(caller.getName())));
    }
}
