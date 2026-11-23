# Plan: the report platform (« rapports » setting)

Asked on 2026-11-23: PHOVA's staff fill their reports on the platform from this week, before the rest of
documind is finished. Built on the branch `rapports`, made from `main` (folder `~/Desktop/documind-rapports`):
the `test` branch and its unfinished features are not touched.

**Decisions (user, 2026-11-23):**
- The same code as documind, deployed with a setting, `APP_EDITION=rapports`. Without it, the full platform,
  unchanged.
- No second server: the existing server runs only the report platform; the full documind is tested on the
  Mac with Docker.
- Three roles: the super admin (ADMIN), the manager, the technician.
- **The tasks stay:** the manager sends a report to fill as a task. **New:** a technician can also start a
  report himself and send it; it goes to his manager's « Revue », like a task's report.
- A report isn't necessarily about a pump: the equipment is optional.
- The Assistant and the Documents stay.
- Forms at launch: the 3 v2 expertise reports, the assembly report RASSN-02, the quality forms.

## What each role sees

| Role | Pages | Home |
|---|---|---|
| Super admin | Comptes (new: managers), Revue (every report), Documents, Importer, Assistant | Comptes |
| Manager | Revue, Ordres, Techniciens (his team, « Assigner une tâche »), Documents, Assistant | Revue |
| Technician | Formulaires, Tâches, Documents, Assistant | Formulaires |

Hidden: the dashboard, pumps, alerts, the workshop loop, « Fiches qualité » (every report now reaches the
manager through « Revue »). The other roles (Sales, Quality…) aren't used on this platform.

## How

### The setting
- Backend: `app.edition=${APP_EDITION:full}`, read through `Edition`.
- Web app: `VITE_EDITION=rapports` in `my-react-app/.env`, read through `edition.js`. `init-server.sh` writes
  it from `.env`'s `APP_EDITION`, so there is one setting to change.

### The server refuses what is hidden
- With `rapports`, a filter answers 404 to `/api/v1/alerts`, `/checks`, `/interventions`, `/quotes`, `/pumps`.
  A typed URL can't reach them.
- Everything else stays: login, forms, reports and PDFs, tasks, team, photos, drafts, documents, assistant,
  login links, the QR codes' public check.

### No simulated twin
- Today every manager page runs the simulated pump twin and sends its fake alerts to `/api/v1/alerts/sync`
  every 5 s. With `rapports`, the manager's frame runs none of it: no alerts bell, no « Digital twin » panel.

### A technician's own report goes to his manager
- With `rapports`, a report a technician sends without a task first opens a task he started himself
  (`selfAssigned`), for his team's manager. The normal send then makes it « Rapport envoyé ».
- From there it is a task like the others: in the manager's « Revue » (validate / send back), in the
  technician's « Tâches », on his profile.
- New class `OwnReportService`, so `TaskService` doesn't change.
- A technician in no team is refused with a clear message; his draft stays.

### Equipment optional
- The server accepts a report and a task without equipment, stored blank. The columns stay NOT NULL, so
  existing databases need no change. The PDFs print « — », like the preview already does.
- With `rapports`, the forms and « Assigner une tâche » don't require it. The full platform still does
  (pump history).
- The pages show « Équipement : … » only when there is one.

### Accounts
- New page « Comptes » for the super admin: the accounts, « Nouveau manager » (`/api/auth/register_manager`,
  already there), delete. Each manager creates his technicians on « Techniciens », as today.
- `init-server.sh` with `rapports`: creates the admin; skips the shared role accounts of `roles_accounts.txt`
  and the demo team.

### Forms on the server
- The 3 v2 reports move from the repo root into `forms/workshop/`, with `fillRoles: ["USER"]`, so a new
  database gets them (today they were posted by hand).
- The assembly report and the quality forms are already there. The v1 forms aren't created on a new database.

### Turning the server into the report platform (SERVER_SETUP.md)
- Back up the current database, start from an empty one (the demo data stays out), set `APP_EDITION=rapports`,
  run `./scripts/init-server.sh`, create the managers on « Comptes ».

## Steps
- [x] backend: `Edition`, the filter, `app.edition`
- [x] backend: equipment optional (requests, task creation, PDF « — »)
- [x] backend: `OwnReportService` + its call in `SubmissionService`
- [x] web: `edition.js`, `roleTabs.js`, `AppShell.jsx` without the twin, home pages
- [x] web: equipment optional (wizard, « Assigner une tâche »), « Équipement » only when set
- [x] web: « Comptes » page
- [x] forms: the v2 reports into `forms/workshop/`
- [x] server: `init-server.sh`, `.env.server.example`, `SERVER_SETUP.md`
- [x] tests: unit tests (filter, own report, equipment), `./mvnw test`, web build and lint. 41 tests pass
      (10 new); both web builds (full, rapports) pass; the app context builds with `APP_EDITION=rapports`
      up to Redis, which needs the stack
- [x] run on Docker (2026-11-23, throwaway database, `APP_EDITION=rapports`): 42 checks pass through the API.
      Admin and the 12 forms; the hidden parts answer 404; admin → manager → technician; his own v2 report
      with no equipment reaches the manager's « Revue », renders (« Équipement — »), is validated, its QR
      code is authentic; a technician in no team is refused and nothing is saved; an assigned report with no
      equipment is sent back, corrected and validated; the draft without a task goes once sent, its state
      stays with the new task

## Notes after building (2026-11-23)
- `FormFilesTest` (from `main`) now expects 12 form files: the 3 v2 reports joined `forms/workshop/`.
- Merging later: `rapports` and the uncommitted work on `test` both change `roleTabs.js`, `AppShell.jsx`,
  `Layout.jsx`, `App.jsx`, `SubmissionService.java`, `TaskService.java`, `SERVER_SETUP.md`,
  `init-server.sh`. When `main` is merged into `test`, those files need their two sets of changes joined.
- The super admin's « Revue » always shows every manager's reports (he has none of his own).
