# Plan: field alerts, fault reports, and pump history

Status: done, tested, not committed · 2026-11-12

## What changes for whom

**Technician** (new **Alertes** tab):
1. Sees the open alerts on pumps at **his site** (Jorf or Safi; all sites if his account has none).
2. Opens one, goes to check the pump, and answers **Je confirme** or **Fausse alerte**. A false alarm needs a comment. He can change his answer later. He **cannot** close the alert or change its status or priority.
3. Can press **Demander à intervenir** (optional message). His manager then accepts or refuses.
4. Can **report a fault** the twin did not see (**Signaler une panne**):
   - pump, model, what he sees, details, severity, photos
   - optionally, ask to fix it himself straight away
   The report becomes an alert for the manager.
5. Once a request is accepted, the task appears in his **Tâches** and follows the normal task flow (start, report, review). A refused request shows the manager's comment.

**Manager** (alert page):
1. Each alert shows a **Terrain** section: which technicians confirmed it or called it a false alarm, with their comments, and the requests to intervene.
2. **Accepter**: opens the usual assign form, pre-filled (pump, title, priority, message). Sending it creates the task, links it to the alert and marks the request accepted, all at once. **Refuser** takes a comment.
3. Fault reports arrive as alerts marked **Signalée par …**, with the description and photos. They work like any other alert: status, priority, orders, workshop.
4. The **Alertes** count in the sidebar also counts the open fault reports and the requests waiting for him.

**Pump history** (manager, `/pumps/:pumpId/historique`, linked from the pump page):
- One timeline of **everything the pump went through**:
  - every alert, twin-detected or reported: severity, when it was raised and cleared, field verdicts
  - every maintenance task: status, technician, report link
- Filters: all, alerts, maintenance.
- Summary at the top: alerts, critical alerts, false alarms, tasks done, last maintenance.

## The key decision: alerts move to the server

Today the alert cases (`#12 · PHB3-J-07 · Vibrations élevées`) live in **the manager's browser** (`alertStore.js`, localStorage). A technician cannot see them, and the manager cannot see what a technician answered. The file itself says it waits for "the backend's Alert / AlertEvent tables". This plan creates them.

- **The twin stays simulated in the browser.** Its alerts have stable ids (`PHB3-J-07:vibration`), so every browser raises the same ones.
  - The browsers running it send them to the server (`POST /api/v1/alerts/sync`), which opens and follows the cases.
  - That is the same logic as `syncAlerts` today, moved to Java. Severity only ever goes up there, so a browser that started later can't lower it.
  - When the real twin is connected, it calls the same service.
- **`alertStore.js` keeps its API** (`useAlertIssues`, `syncAlerts`, `setStatus`, `linkOrder`…). Only its storage changes: the server, with a refresh every 15 s. The 8 files that use it keep working.
- **The old browser-only cases are not carried over.** The live alerts reopen as new cases on the first sync. Their past comments and status changes, which only existed in one browser, are dropped.

## Data model (new tables; Hibernate creates them)

| Table | What | Main columns |
|---|---|---|
| `alert_case` | one alert, twin or field | `number` (the #12), `alert_key`, `open_key` (unique while open: one open case per alert), `pump_id`, `site`, `kind`, `source` (TWIN/FIELD), `severity`, `message`, `status`, `priority`, `raised_at`, `cleared_at`, `resolved_at`, `reported_by`, report fields (`equipment_model`, `title`, `description`) |
| `alert_case_image` | the photos of a fault report | case, image id |
| `alert_event` | the case's activity, append-only | case, `type` (raised, escalated, cleared, status, comment, order, workshop, **verified**, **request**, **request-accepted**, **request-refused**, **reported**), `at`, `by_email`, `from_value`, `to_value`, `text`, `severity`, `message` |
| `alert_order` / `alert_intervention` | the work orders and workshop interventions created from it | case, task id or intervention id, title, technician, at |
| `alert_request` | a technician asks to intervene | case, `technician_email`, `message`, `status` (PENDING/ACCEPTED/REFUSED), `decided_by`, `decided_at`, `decision_comment`, `task_id` |

The new enums go into `forms/server_db_check.sql` (the rule for new enum values).

## API (`/api/v1/alerts`)

| Who | Method | Path | Does |
|---|---|---|---|
| all signed in | GET | `/api/v1/alerts` | manager: every case; technician: open cases at his site, plus the ones he reported |
| all signed in | GET | `/api/v1/alerts/{number}` | one case (a technician: only within his scope) |
| manager, technician | POST | `/api/v1/alerts/sync` | the twin's live alerts → cases opened, escalated, cleared |
| manager | POST | `/{number}/status`, `/{number}/priority`, `/{number}/comments` | what the manager decides (same as today) |
| manager | POST | `/{number}/orders`, `/{number}/interventions` | links a work order / workshop intervention (same as today) |
| technician | POST | `/{number}/verifications` | `{verdict: CONFIRMED or FALSE_ALARM, comment}` |
| technician | POST | `/{number}/requests` | `{message}`: ask to intervene (one waiting request per technician and case) |
| technician | POST | `/api/v1/alerts/reports` | a fault report: `{pumpId, equipmentModel, site, title, description, severity, imageIds, askToHandle, message}` |
| manager | POST | `/api/v1/alerts/requests/{id}/accept` | the task (same body as `/task/new`): creates it for the technician, links it, request ACCEPTED |
| manager | POST | `/api/v1/alerts/requests/{id}/refuse` | `{comment}` |
| manager | GET | `/api/v1/pumps/{pumpId}/history` | the pump's alert cases and tasks (with their reports), newest first |

## Road

### Backend
- [x] Enums `AlertSource`, `AlertSeverity`, `AlertStatus`, `AlertVerdict`, `AlertRequestStatus`
- [x] Entities `AlertCase` (plus images, orders, interventions), `AlertEvent`, `AlertRequest`, and their repositories
- [x] `AlertCaseView`: the JSON the web app reads, the same shape as today's localStorage case (times in ms, lowercase severity), plus `source`, `report`, `verifications` (each technician's latest), `requests`
- [x] `AlertService`:
  - sync (ported from `alertStore.syncAlerts`)
  - the manager's actions
  - verifications, requests, fault reports
  - accept (through `TaskService.createNewTask`, so the task follows the usual flow) and refuse
  - the technician's scope by site
- [x] `AlertController`, plus `PumpHistoryController` (`GET /api/v1/pumps/{id}/history`)
- [x] Compile; start against the local database; check the tables and constraints
- [x] API tests with real accounts (manager and technician): sync, scope by site, verify, request, accept → task in the technician's list, refuse, fault report with photo, the role refusals. **30 of 30 pass.** The Safi test technician is `technicien.safi@phova.com` / `technicien`.

### Frontend
- [x] `alertStore.js`: same API, backed by the server (load, 15 s refresh, actions call the API, sync sent only when the live alerts change)
- [x] `AssignTask.jsx`: `?demande=<id>` → it accepts the request instead of a plain `/task/new`
- [x] Manager `AlertDetail.jsx`:
  - **Terrain** panel: verdicts, requests with Accepter / Refuser
  - the fault report's details and photos
  - "Signalée par" badge
- [x] `AlertFeed.jsx`: the new event types in the activity feed
- [x] `AppShell.jsx`: the Alertes count includes open fault reports and waiting requests
- [x] Technician pages (`FieldAlerts.jsx`):
  - `/terrain`: alerts at his site, his answer and request on each, Signaler une panne
  - `/terrain/:number`: the alert, the pump's live readings, Je confirme / Fausse alerte, Demander à intervenir, request status
  - `/terrain/signaler`: the fault report form, with photos
- [x] `roleTabs.js` (Alertes tab for USER) and `App.jsx` routes
- [x] Pump history:
  - `PumpHistoryPage.jsx` at `/pumps/:pumpId/historique` (summary, filters, timeline)
  - the pump page's Historique panel reads the new endpoint and links to the full page

### Server and data
- [x] `forms/server_db_check.sql`: the new enum columns
- [x] `SERVER_SETUP.md`: alerts now live on the server, and no step is needed by hand (the tables are created at start)

### Checks
- [x] Browser: manager and technician side by side; the technician confirms, asks, reports with a photo; the manager sees it, accepts, and the task appears in the technician's Tâches
- [x] Pump history in both themes and at phone width
- [x] Lint, build, backend tests

## What was checked
- **API, 30 of 30 checks**, with a real manager and the Safi technician (`technicien.safi@phova.com` / `technicien`):
  - the twin sync: severity only goes up, alerts clear
  - the scope by site, and the 404 outside it
  - confirm / false alarm (a comment required), and the 403 on status
  - request → accept → the task in his Tâches
  - asking twice (409), and refusing without a comment (400)
  - a fault report with a photo, and someone else's photo refused
  - the pump history, and the 403 for a technician
- **Browser, end to end:** the technician on a phone and the manager on desktop, dark and light.
  - The technician asks to intervene, then reports a fault with a photo and asks to fix it.
  - The manager sees the report on the dashboard and its alert, accepts through the pre-filled assign form, and refuses the other request with a comment.
  - The technician finds the task in his Tâches and sees the refusal.
  - No page errors and no failed API call.
- **Lint and build:** both clean. The backend tests pass.

## Found along the way
- The assign form requires a checklist ("Rapport à remplir"), so accepting a request asks for one too. That is the existing rule for every task.
- In the local database I kept the demo data the test produced (twin cases #1–#4, fault reports #6 and #9, the two tasks of Technicien Safi). I deleted the made-up `TEST-S-99` case.
- [x] **Fixed 2026-11-12:** a technician with no Site got a 500 on his Alertes tab (`function lower(bytea) does not exist`). The query used `:site IS NULL OR LOWER(site) = LOWER(:site)`, and Postgres can't type a null parameter there. It is now two queries (`findForTechnicianAtSite`, `findForTechnicianAnySite`); checked with no site, Safi and Jorf. The first tests only used a technician with a site.

## Choices made without asking (tell me to change any)
- **A technician with no site sees every site.** Today none of the local technicians has a site set, so the feature would otherwise show them nothing.
- **Changing his answer.** A technician can change his verdict; the manager sees each technician's latest one, and the feed keeps the history.
- **Several requests on one alert.** Two technicians can both ask to intervene on the same alert. The manager accepts one, both, or neither.
- **Who can see pump history.** It's manager-only for now. A technician's alert page could link to it later.
