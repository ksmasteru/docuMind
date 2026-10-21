# Maintenance loop: what the service must handle

Logic issues left in `TaskModel` and `TaskEvent` after the entities were written (17 October 2026). The entities compile; these points must be handled in `TaskService` or in the next entities.

## TaskModel

1. **`equipmentId` points to nothing yet.** There's no `Equipment` entity, so a task can name a pump that doesn't exist, and there's no route from a task to its pump model and manuals.
   → Create `Equipment` (matricule, location, site, link to `PumpModel`), and check the id exists when a task is created.

2. **Anyone can change the status with a setter.** `setStatus()`, `setWorkedSeconds()`, `setActiveSince()` and the others let any code jump straight from `ASSIGNED` to `APPROVED`, skip writing an event, or forget the time calculation.
   → Status changes go through **one service method** that checks the transition is allowed, updates the time fields and writes the event, all in the same transaction.

3. **The reason stays after the problem is gone.** After `BLOCKED` (`MISSING_PART`) → `STARTED`, `statusReason` still says `MISSING_PART`, and the app would show it.
   → The service clears `statusReason` and `statusComment` when the status changes.

4. **Phone time and server time must not be mixed.** If `activeSince` comes from the phone and the next calculation uses the server time (or the other way round), a phone clock that's off by a few minutes gives wrong or even negative durations.
   → Use the event's `occurredAt` for both ends of every work period.

5. **No report is linked to a task yet.** `CheckListSubmission` has no `taskId`, so "submit the report → `SUBMITTED`" can't be connected.
   → Add `taskId` to the report, and move the task to `SUBMITTED` when the report is saved.

## TaskEvent

6. **`occurredAt` comes from the phone, so the server should check it.** It shouldn't be in the future or earlier than the task's previous event. Otherwise a wrong phone clock, or a technician changing it, distorts the time per task, and that number ends up in the technician profile, which is a sensitive measure.
   → Reject or correct an `occurredAt` that is in the future or before the previous event of the same task.

## Allowed transitions (reference for the service)

| From | To | Who | Reason required |
|---|---|---|---|
| — | `ASSIGNED` | Manager (creates the task) | No |
| `ASSIGNED` | `STARTED` | Technician | No |
| `ASSIGNED` | `DECLINED` | Technician | Yes (`ON_LEAVE`, `WRONG_TASK`, `NO_ISSUE_FOUND`, `OTHER`) |
| `DECLINED` | `ASSIGNED` (new technician, `REASSIGNED` event) | Manager | No |
| `STARTED` | `BLOCKED` | Technician | Yes (`MISSING_PART`, `NO_ACCESS`, `SAFETY_ISSUE`, `OTHER`) |
| `BLOCKED` | `STARTED` | Technician | No |
| `STARTED` | `SUBMITTED` | Technician (report sent) | No |
| `SUBMITTED` | `APPROVED` | Manager | No |
| `SUBMITTED` | `RETURNED` | Manager | Yes (`MISSING_INFO`, `WRONG_MEASUREMENT`, `OTHER`) |
| `RETURNED` | `STARTED` | Technician | No |
| `SUBMITTED` | `REJECTED` | Manager | Yes (`INCOMPLETE_WORK`, `OTHER`) |
| `ASSIGNED`, `STARTED`, `BLOCKED`, `DECLINED` | `CANCELED` | Manager | Yes (`WRONG_ASSIGNMENT`, `DUPLICATE`, `OTHER`) |

`OTHER` always requires a comment. `APPROVED`, `REJECTED` and `CANCELED` are final.

**Time rules:**
- Entering `STARTED`: `activeSince = occurredAt`, and `firstStartedAt` is set the first time only.
- Leaving `STARTED`: `workedSeconds += occurredAt - activeSince`, then `activeSince = null`.
- Entering `SUBMITTED`: `submittedAt = occurredAt`.
- Entering a final state: `closedAt = occurredAt`.

## Next steps

1. `TaskRepository` and `TaskEventRepository`.
2. `TaskService`: the state machine above (handles points 2, 3, 4 and 6).
3. Endpoints for the manager (create, assign, approve, return, reject, cancel) and the technician (list my tasks, start, block, decline, submit).
4. `Equipment` entity (point 1), then the report link (point 5).
