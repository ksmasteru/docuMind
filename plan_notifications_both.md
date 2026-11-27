# Plan: notifications on documind and on the report platform

Asked on 2026-11-25: « apply notifications for both documind and this report platform ».

- **documind** (`~/Desktop/documind`, branch `test`) has them since 2026-11-21
  (`plan_notifications_registry_stock_signatures.md` §1): the bell in both headers, e-mail when an SMTP account
  is set. Never tried on a running stack.
- **The report platform** (`~/Desktop/documind-rapports`, branch `rapports`) has none: a technician doesn't
  know a task arrived, a manager doesn't know a report waits for him, unless they open the app.

## What it does (same rules on both)

| Event | Who is told | Opens |
|---|---|---|
| a manager sends a task (a report to fill) | the technician | the task |
| a task given to another technician | the new one (and the one it was taken from) | the task |
| task declined / put on hold | the manager | « Ordres » |
| report sent (a task's, or one a technician filled on his own) | the manager | « Revue » |
| report validated / rejected | the technician | his sent report |
| report sent back to correct | the technician | the task |
| task cancelled | the technician | — |
| documind only: a workshop step waiting for a role, an intervention finished, stock low | that role / who launched it / storekeepers | the intervention |

Never to the person who did the action. A notification that fails is only logged: it never undoes the action.
E-mail: each one is also sent by e-mail once `SPRING_MAIL_*` is set in `.env`; off until then. The bell works
either way (read every 30 s and when the tab comes back).

## Fixes found while porting (both branches)

1. **A report a technician files on his own** (report platform: `OwnReportService` opens a task he started
   himself) told his manager « X a démarré une vérification », then « Rapport à valider ». Only a check (levée de
   doute) a technician starts himself is news; for his own report the manager gets « Rapport à valider »,
   « rempli à son initiative ».
2. **No equipment** (optional on the report platform): the text began with « · ». The pump is only named when
   there is one.
3. **« Rapport validé » / « Rapport rejeté »** opened the task page, which then says « Cette tâche n'est plus dans
   vos tâches actives ». They open the technician's sent report (`/tasks/rapport/:submissionId`) instead.

## Steps

### Report platform (port from `test`)
- [x] backend: `spring-boot-starter-mail` (`pom.xml`); mail settings in `application.properties`;
      `mailExecutor` in `AsyncConfig`
- [x] backend: `Notification`, `NotificationRequest`, `NotificationKind`, `NotificationRepository`,
      `NotificationService`, `NotificationMailer`, `NotificationController`; `@DomainEvents` on `TaskEvent` and
      `InterventionEvent` (only that: their signature columns stay on `test`)
- [x] web: `notifications.js`, `NotificationBell.jsx`; the bell in `Layout.jsx` (technician, admin) and
      `AppShell.jsx` (manager), in both editions
- [x] server: `.env.server.example` (the `SPRING_MAIL_*` keys, commented out), `forms/server_db_check.sql`
      (`notification.kind`), `SERVER_SETUP.md`, `init-server.sh`'s header (no step: e-mail is optional)

### Both branches
- [x] `NotificationService`: fixes 1–3
- [x] `NotificationRulesTest`: copied to rapports; new cases for fixes 1–3 on both

### Checks
- [x] `./mvnw test` and `vite build` (rapports also with `VITE_EDITION=rapports`) in both folders; eslint on the
      changed web files. 2026-11-25: documind 115 run, rapports 110 run, all pass but `BackendApplicationTests`
      (no database outside Docker); `NotificationRulesTest` 10 (3 new); the three builds pass; eslint clean on the
      bell's 4 files
- [x] Live, on throwaway containers (pgvector database, Redis, Mailpit as the SMTP server; never the local
      documind database), 2026-11-25, with a script in the session's scratchpad (`notif-check.mjs`): admin → manager →
      two technicians; task sent, report sent, sent back, corrected, validated; reassigned, declined, cancelled;
      a report with no task; read one, another's refused (404), read all; every notice's title, text and link; one
      e-mail per notice, its subject and link.
      - **report platform** (`APP_EDITION=rapports`): **44 / 44**, including fixes 1–3 seen live (a task with no
        equipment, « rempli à son initiative », « Rapport validé » opening the sent report);
      - **documind**: **42 / 42** (a report with no task reaches nobody there, as before).
      - Seen on the way: the e-mails leave a few seconds after the action (the first SMTP connection on the Mac is
        slow); the bell has them at once.
- [ ] Not checked live: the workshop and stock notices (documind only; `NotificationRulesTest` covers them), and
      the bell clicked in a browser (only the API was driven)

## Merging later
`NotificationService.java`, `NotificationRulesTest.java`, the bell's files and the `Notification*` classes are the
same on both branches. `TaskEvent.java` and `InterventionEvent.java` differ: `test` also has the signature
columns. `Layout.jsx`, `AppShell.jsx`, `AsyncConfig.java`, `application.properties`, `SERVER_SETUP.md`,
`.env.server.example` and `forms/server_db_check.sql` already needed joining by hand.

## Not in this plan
- Push notifications on the phone: the mobile app isn't in this repo; it can call the same API later.
- PHOVA's SMTP account: needed to switch e-mail on in production (`SERVER_SETUP.md` says where).
