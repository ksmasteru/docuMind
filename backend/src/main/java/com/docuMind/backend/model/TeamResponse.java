package com.docuMind.backend.model;

import java.time.Instant;
import java.util.List;

// GET /api/v1/team, and the answer to every change of the team: the Techniciens page.
// members: the manager's technicians, by name, with their task counts.
// available: the technicians in no team yet, the ones he can add.
public record TeamResponse(
    List<Member> members,
    List<Technician> available)
{
    public record Member(
        String id,
        String name,
        String email,
        String worksite,
        int activeTasks,         // ASSIGNED, STARTED, BLOCKED, RETURNED
        int toReview,            // SUBMITTED: a report waits for its review
        int approved,
        int totalTasks,
        Instant lastActivityAt   // the last change on one of his tasks, null if he has none
    ) {}

    // firstName / lastName: null for an account made before names were asked in two parts.
    // passwordSetBySelf: he chose his password himself (false: a manager set it; null: not known)
    public record Technician(String id, String name, String email, String worksite,
                             String firstName, String lastName, Boolean passwordSetBySelf, Instant passwordSetAt)
    {
        public static Technician from(User user) {
            return new Technician(user.getId(), user.getName(), user.getEmail(), user.getWorksite(),
                user.getFirstName(), user.getLastName(),
                user.getPasswordSetBy() == null ? null : user.getPasswordSetBy().equals(user.getEmail()),
                user.getPasswordSetAt());
        }
    }
}
