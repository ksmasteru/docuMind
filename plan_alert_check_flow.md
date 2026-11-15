# Plan: check every twin alert before acting on it (levée de doute)

Agreed 2026-11-12. Phase 1 is being built; the boxes below are ticked as it goes.

## The flow

```
Twin alert ─────────────────────────────────────────────── verification: À vérifier
 ├─ the manager sends a CHECK task to a technician ┐
 └─ a technician on site starts the check himself  ┴─────── Vérification en cours
     the check report: state on arrival, check points (results, readings, photos, comments),
     free photo sections, conclusion
     ├─ FAUSSE ALERTE (+ cause) ─► the manager reads the report, confirms ─► alert closed
     ├─ NON CONCLUANT (+ reason) ─► the manager sends a new check
     └─ CONFIRMÉE ──────────────────────────────────────── a MISSION for the manager
         ├─ "Je peux m'en charger" → his request (message, estimate, parts)
         └─ "Je ne peux pas" → his reason (compétence, outillage/levage, pièces, atelier, autre)
             the manager:
             ├─ accept → pre-filled task (this technician, pump, reason) → the usual task flow
             ├─ refuse + choose another technician / Envoyer en atelier
             └─ close the mission, with a reason

A fault reported by a technician ("Signaler une panne") is a check report already CONFIRMÉE.
At any step the manager can send the report back to the technician for more details.
```

## Decisions (2026-11-12)

1. **False alert:** the manager closes it, after reading the technician's report.
2. **"Can't handle":** it is still a true alert, so it becomes a mission like the others.
3. **"Non concluant":** added as a third verdict.
4. **No skipping:** every alert is checked, even one that looks obvious, because the sensor itself
   may be faulty. A work order or a workshop request from an alert needs a confirmed check, and
   closing an alert needs a check report.
5. **A technician can check without being sent** (design below).
6. **"Signaler une panne"** uses the check report's layout.

## Decision 5: a check the technician starts himself, inside the task flow

When a technician presses "Faire la levée de doute" on an alert of his site, the server creates a
real check task for him. It goes through `TaskService` like any other task:
- **Same flow:** the same table, statuses and history. The creation step is logged under the
  technician's name, then the task is started through the usual `start` path, so the time on site is
  counted the usual way. He fills the report from his Tâches, and it can be sent back to him like any
  report.
- **Who reviews it:** `managerEmail` is his team's manager. A technician in no team can't start one;
  the message tells him to ask his manager.
- **Marked as his own initiative:** a `selfAssigned` flag shows it as "à son initiative" in the lists.

Guards, so nothing else is affected:
- **Check tasks only:** a technician can't create any other kind of task for himself.
- **One check at a time per alert,** whoever started it. Others see "Levée de doute en cours par X".
  An alert that is confirmed or closed can't get a new check.
- **Settled from the alert:** a check task is approved or returned from its alert, never through the
  generic `/approve` and `/return`, which refuse it the way they refuse workshop tasks. The Revue
  queue doesn't list check tasks, since their decisions are on the alert page.
- **The manager can cancel it** (`CANCELED`) if he would rather send someone else.

## Data model

| What | Change |
|---|---|
| `TaskType` | + `VERIFICATION` ("Levée de doute") |
| `TaskModel` | + `alertNumber`, + `selfAssigned` |
| `check_point` (new) | the points of one check task: position, label, kind (state / measure), unit, twin value, warning and critical limits, photo required, added by the manager |
| `check_report` (new) | one per check task and round: state on arrival, verdict, false-alarm cause, inconclusive reason, urgent stop, comment, can handle (+ message, estimate in hours, parts) or can't (+ reason, comment) |
| `check_report_result` (new, collection) | per point: result OK / Anomalie / Non vérifiable, reading, comment, photo ids |
| `check_report_section` (new, collection) | free sections: title, comment, photo ids |
| `AlertCase` | + `verification`, + the current check task, + verified by / at, + `closeReason`, `closeComment` |

**Alert verification states.** Existing cases without one are read as: a fault report → CONFIRMED;
a twin alert that already has an order or an intervention → CONFIRMED; any other → TO_CHECK.

| From | Event | To |
|---|---|---|
| TO_CHECK | the manager sends a check, or a technician starts one | CHECK_ORDERED |
| CHECK_ORDERED | the report is sent | the verdict: CONFIRMED / FALSE_ALARM / INCONCLUSIVE |
| CHECK_ORDERED | the technician declines (`TaskDeclinedEvent`) | TO_CHECK |
| CHECK_ORDERED | the manager cancels | TO_CHECK |
| any verdict | the manager returns the report | CHECK_ORDERED |
| FALSE_ALARM or INCONCLUSIVE | the manager sends a new check | CHECK_ORDERED |

**Close reasons:**
- FALSE_ALARM, only after a false-alarm verdict
- FIXED, the default once a work order or intervention exists
- REPAIRED_BY_THIRD_PARTY
- PLANNED_SHUTDOWN
- RISK_ACCEPTED
- OTHER, which needs a comment

The status menu no longer offers "Résolue": closing goes through "Clore", with its reason.

**When the check task is approved.** It becomes APPROVED when the manager acts on its report:
- accepts or refuses a request
- links a work order or a workshop intervention
- closes the alert
- sends a new check

**The verdict applies when the report is sent:**
- **The mission or the false alert appears at once.** The manager's next action is the validation.
- **"Je peux m'en charger"** creates the request (`alert_request`, as today).
- **"Arrêt immédiat recommandé"** raises the alert's priority to URGENT.

**Suggested check points:** built in the browser (`alertContent.js`), because the twin's readings and
limits only exist there:
- every check: "Photo d'ensemble de la pompe" (photo required)
- the alert's metric, as a measure with the twin's value and limits
- the alert kind's check-only points

The server validates what it receives (1 to 30 points, labels not blank).

## API

**Alert endpoints** (`/api/v1/alerts`):

| Call | Who | What |
|---|---|---|
| `POST /{n}/checks` | manager | technician, points, priority, due date, instructions → check task |
| `POST /{n}/checks/self` | technician | points → his own check task, started; returns its id |
| `POST /{n}/check/cancel` | manager | |
| `POST /{n}/check/return` | manager | comment → RETURNED |
| `POST /{n}/close` | manager | reason, comment |
| `POST /reports` | technician | the fault report, now with the check report's sections and what comes next |

**Check endpoints** (`/api/v1/checks`):

| Call | Who | What |
|---|---|---|
| `GET /{taskId}` | its technician, or a manager | points, reports (latest first), task status |
| `POST /{taskId}/report` | its technician | the report; sends the task and applies the verdict |

**Removed:** `POST /{n}/verifications` and `POST /{n}/requests`, replaced by the check report.
Verdicts already given stay readable.

## Screens

**Manager, alert page (`AlertDetail.jsx`)**
- **Side panel, by state:**
  - À vérifier: "Demander une levée de doute".
  - Vérification en cours: who, the task's status, "à son initiative", Annuler.
  - Mission: the verdict, then his request (accept / refuse and choose another technician) or his
    reason, then Assigner / Un autre technicien / Envoyer en atelier / Clore la mission / Renvoyer le
    rapport.
  - Fausse alerte: Confirmer et clore / Nouvelle vérification / Renvoyer le rapport.
  - Non concluant: Nouvelle vérification / Renvoyer le rapport.
- **Main column:** the check report card, with the verdict, twin against site, the points with their
  photos and the sections.
- **New page `/alerts/:n/verification`:** the technician (his team, his site first), the points
  (tick, add, require a photo, reorder), priority, due date and instructions.
- **Dashboard and side menu:** the alert list shows each alert's verification state, and the count
  covers what waits for the manager.

**Technician**
- **Tâches:** a "Levée de doute" task opens the check report instead of a checklist.
- **The check report (`CheckReportForm.jsx`), on the phone:**
  - one section after another: arrival, points, photos, conclusion, what comes next
  - saved on the device as he goes
  - pre-filled from his last round when a report comes back
- **Alertes tab:**
  - each alert shows its state
  - "Faire la levée de doute", or "En cours par X", or "Ouvrir ma levée de doute"
  - the old confirm and deny buttons and "Demander à intervenir" are gone
- **"Signaler une panne":** the pump, what he sees and the severity, then the same sections and what
  comes next.

## Steps

**Phase 1**
- [x] Plan (this file)
- [x] Backend: enums, `TaskModel` fields, check point / report entities and repositories
- [x] Backend: `TaskService`, covering the check task creation, the settle, return and cancel paths,
  the generic approve/return refusing check tasks, the Revue queue without them, and the decline event
- [x] Backend: `CheckService` (order, self-start, report and verdict, view, decline listener),
  `AlertService` (verification state, close with reason, the work-order and workshop gate, the
  settle, the new fault report, the old endpoints removed), controllers
- [x] Server: `task_type` gets VERIFICATION. Hibernate won't widen the existing check constraint, so
  the fix goes into `forms/server_db_check.sql` (which `scripts/init-server.sh` runs and offers to
  apply), plus a note in `SERVER_SETUP.md`. It is also applied to the local database.
- [x] Frontend: store actions, suggested points, labels (`TASK_TYPES`, verification states, reasons)
- [x] Frontend: `CheckReportForm` (in `TaskScreen`, and the field-report mode)
- [x] Frontend: the manager's page to send a check, the alert page panels and the report card, the
  close dialog, the status menu without "Résolue"
- [x] Frontend: the technician's Alertes tab and detail, "Signaler une panne"
- [x] Frontend: the dashboard list and the side-menu count
- [x] Checks:
  - lint, build, backend tests
  - an API script covering every transition and refusal
  - the browser end to end: a manager-sent check confirmed and assigned, a self-started false alarm
    confirmed by the manager, a non-conclusive one re-sent, a returned report, a fault report;
    manager on desktop, technician on a phone, both themes

Found while building:
- **A sent check counts as "à revoir"** on the Techniciens cards (they count reports waiting for the
  manager). That is true: it waits for him on its alert, not in Revue.
- **A technician in no team can't start a check or report a fault,** since nobody would review it.
  The message tells him to ask his manager, and the server setup's step 8 puts every technician who
  has no team into `manager@phova.com`'s team.

## What was checked (2026-11-12)

Everything ran on a copy of the local database (`documind_checktest`), deleted afterwards, so your
own data was not touched by the tests.

- **API, 63 of 63 checks:**
  - a work order, a closure or "Résolue" refused before the check
  - `/task/new` refusing a check task
  - a check sent, then refused a second time while one is open
  - the report refused before the task is started, or with a point, a comment, a reading, a
    required photo or "can handle" missing
  - confirmed, then a pending request; the generic approve refused
  - the report returned, the request refused meanwhile, round 2 with a photo of round 1, the
    request accepted: work order, check approved, closed "Réparée"
  - self-started: under his team's manager, a colleague refused, a technician in no team refused
  - false alarm without its cause refused; with it, only "fausse alerte" closes it
  - declined: back to "À vérifier"
  - not conclusive without a comment refused; self-start refused while it waits; a new check
    approves it; canceled
  - fault report: confirmed, urgent priority, workshop, check approved
- **Browser, manager on desktop and technician on a 390 px phone, both themes:**
  - **A sent check:** the manager sends it, choosing between the site's technicians, the least busy
    first, and adding a point. Technicien Safi fills it on his phone (photos, a reading above the
    limit, a section, "je peux m'en charger"). The manager reads the report and accepts the request
    through the pre-filled form, which carries the check's comment and his message.
  - **A self-started false alarm:** Technicien Safi starts a check himself and finds a false alarm
    (sensor). The manager confirms it and closes.
  - **A fault report:** urgent, "atelier nécessaire". The manager sees "Envoyer en atelier" first.
  - No page error, no failed API call, no sideways scrolling on the phone.
- **Lint, build and backend tests:** lint is clean on every file touched (the same 18 old files
  still have their own problems), the build passes, and the backend tests run 25 with 0 failures
  and 1 skipped.

Fixed along the way, found by the tests:
- **Reading one alert returned a 500** when no case in it had a check: the same `Map.of()` null-key
  trap as before.
- **The task lists didn't carry** the task type, the alert or who the task is under. They do now:
  added fields, nothing removed.
- **"Ajouter" on the send-check page reloaded the page,** because a form sat inside the page's form.
- **A photo added to a check point was dropped** when its upload finished, so a required photo
  could never be satisfied.
- **The readings table was cut off on a phone.** The limits now go under the label there.

**Phase 2** (built from [plan_alert_check_phase2.md](plan_alert_check_phase2.md))
- [x] The check report in the repair task, and as a PDF with QR code
- [x] Pump history: check reports, false-alarm rate, closures and their reasons
- [x] The twin raising again an alert just found false

**Phase 3**
- [ ] Default check-point lists editable per alert kind and pump model
- [ ] Better technician suggestion (skills, distance)
