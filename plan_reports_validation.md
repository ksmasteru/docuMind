# Plan: reports filling and validation, made functional

Built 2026-11-15 (deadline: Friday 20 November). Every box below is ticked; nothing is committed.

Two requests:
1. **The manager creates the technician accounts** (first name, last name, site, e-mail, password),
   so the name signed on a report is the right one.
2. **The eight gaps** found in the audit of the report flow (fill → send → validate).

## Rules, so the rest of GreenSense is not disturbed

- **No endpoint is removed or changes shape.** Responses only gain fields.
- **Two deliberate exceptions**, both about who can create or change an account:
  - Self-registration (`POST /api/auth/register`) is closed by default. `ALLOW_SELF_REGISTRATION=true`
    in `.env` reopens it.
  - `POST /api/v1/users` and `PUT /api/v1/users/{id}` become admin-only. The web app never calls them.
- **Database:** new columns only, all nullable, added by Hibernate. No new enum value, so no
  constraint to drop and nothing to add to the database check.
- **`name` stays the display name** everywhere (lists, PDFs, signatures). It becomes
  "Prénom Nom" for the accounts that have both.

## 1. Technician accounts

**Found in the code** (why this part matters for signatures):
- Anyone could create a technician account from the public sign-up page, under any name.
- Any logged-in user could change another user's e-mail (`PUT /api/v1/users/{id}`), and the e-mail
  is the identity a report is signed with.
- Nobody could change a password: the role accounts share the one given at setup.

**The manager, Techniciens page:**
- **Create:** first name, last name, site (required: Jorf or Safi), e-mail, password (8 characters
  at least). The account joins his team.
- **Correct** a technician of his team: first name, last name, site.
- **Reset his password.**

**Everyone, "Mon compte"** (from the header): name, e-mail, role, site, and "Changer mon mot de
passe" (the current one is asked). The page says whether the password was set by a manager or
chosen by its owner, and since when. It is not forced: the manager sets the first one, as asked.

**API**

| Call | Who | What |
|---|---|---|
| `POST /api/v1/team/technicians` | manager | `{firstName, lastName, worksite, email, password}` |
| `PUT /api/v1/team/technicians/{id}/account` | his manager | `{firstName, lastName, worksite}` |
| `POST /api/v1/team/technicians/{id}/password` | his manager | `{password}` |
| `GET /api/v1/users/me` | anyone logged in | his account |
| `POST /api/v1/users/me/password` | anyone logged in | `{currentPassword, newPassword}` |

**Not done:** renaming someone changes the name printed on his earlier reports too (PDFs are rebuilt
from the saved data). The e-mail, which the fingerprint covers, does not change.

## 2. The eight gaps

**1. A returned report reopens as it was sent.**
- The form's state goes with the report when it is sent, and is kept as the task's draft. When the
  report comes back, the form opens on it: answers, photos, comments.
- The photos of an earlier round of the same task can be sent again.
- The manager's comment stays above the form while the technician corrects (`returnComment` on the
  task, until it is approved).
- The draft is deleted when the task is approved or canceled.
- Limit: a report sent before this update and returned after it still opens empty.

**2. Simple checklists are saved while filling** (`InspectionForm.jsx`): on the server, a moment
after each change, and resumed when the form opens again. Same drafts API as the expertise reports.

**3. No more dead ends.**
- **Cancel** (`POST /api/v1/task/{id}/cancel`, comment required): a task not sent yet, or declined.
- **Reassign** (`POST /api/v1/task/{id}/reassign`): a task assigned or declined goes to another
  technician. The alert it came from follows.
- **Declined tasks wait in "Ordres"**, under "À réaffecter", until reassigned or canceled. They
  are kept apart from the active orders, so the pages that count work in progress don't change.
- **Any manager can validate or send back** a report, under his own name. "Revue" gets
  "Tous les rapports", for when the sender is away.
- **Workshop:** a declined task sends the intervention back to the Workshop Lead (step 7 or 15,
  "À corriger"), who assigns someone else.
- Check tasks (levée de doute) and workshop tasks keep their own paths: cancel and reassign refuse
  them.

**4. The technician sees what became of his reports.** "Tâches" gets "Envoyés": waiting, validated
(by whom, when) or sent back, each opening read-only. Counts on the tabs: tasks to do for the
technician, reports to review for the manager.

**5. The validation is on the record.**
- The report page and every report PDF say "Validé par … le …" (the Visa box), or that it waits, or
  that it was sent back.
- The report page shows the task's history: sent, sent back (with the comment), sent again, validated.
- The public verify page names who validated and when.

**6. A "Non conforme" report can't be validated in silence.** The manager writes what is done about
it ("Suite donnée"), which is kept with the validation and printed. The workshop's own review step
is not changed.

**7. Backup.** `scripts/backup-db.sh`: a dump of the database every night (photos and documents are
in it), 14 days kept, each dump checked. `scripts/restore-check.sh` restores the latest into a
scratch database and compares the counts. `init-server.sh` installs the nightly job;
`SERVER_SETUP.md` explains both and says to copy the dumps off the server.

**8. A test of the whole flow, in the repo.** `scripts/e2e-reports.mjs` (Node, no dependency): it
creates a technician, sends a task, fills, saves, sends, returns, corrects with the same photos,
validates, cancels, reassigns, changes a password, and checks every refusal. It writes test data,
so it is for a test database.

**Not this week:** filling offline, e-mail or push notifications, drawn signatures, a form builder,
"reject" as a separate decision (send back or cancel cover it), CI.

## Steps

- [x] Plan (this file)
- [x] Backend, accounts: user fields, the manager's create / correct / reset, "me" and its password,
  sign-up closed, the user endpoints admin-only
- [x] Backend, tasks: cancel, reassign (and the alert follows), declined in "Ordres", any manager
  reviews, "Tous les rapports", the return comment kept, "Suite donnée", the sent list, the counts
- [x] Backend, reports: the state kept with the report, photos of earlier rounds, the validation and
  history on the report, the PDFs and the verify page; the workshop's declined task
- [x] Frontend, accounts: the create form, correct and reset, Mon compte, the sign-up page
- [x] Frontend, technician: the return comment, the expertise report's state sent with it, drafts
  for the simple checklists, "Envoyés", the count
- [x] Frontend, manager: Ordres (declined, cancel, reassign), Revue (all reports, count), the report
  page (validation, history, "Suite donnée"), the verify page
- [x] Server: backup and restore check, `init-server.sh`, `SERVER_SETUP.md`, `.env.server.example`
- [x] The flow test in the repo
- [x] Checks: lint, build, backend tests, the flow test and the earlier API tests on a copy of the
  database, the browser on a phone and a desktop

## What was checked (2026-11-15)

Everything ran on a copy of the local database (`documind_checktest`), deleted afterwards.

- **The flow test in the repo (`scripts/e2e-reports.mjs`), 68 of 68:**
  - accounts: sign-up refused; a technician refused without last name, site or an 8-character
    password; created by the manager; his own password change (wrong current one and a short one
    refused); the manager's correction and reset; a technician refused on the account endpoints
  - a checklist: draft saved and read back; sent non-conforming, its state kept; in Revue with names
    and counts; read refused to another technician; validation in silence refused; sent back; the
    request kept while correcting; the form's state back; corrected and sent; found and validated by
    a second manager from "Tous les rapports"; validated twice refused; the report and "Envoyés" say
    who validated; the first version says it was sent back; the kept state gone once closed
  - "Suite donnée" kept on the validation and shown to the technician
  - cancel (no reason, by a technician, twice, after sending: refused) and reassign (a declined task
    in "À réaffecter" and not among the active orders; to a non-technician, by a technician, once
    started: refused)
  - an expertise report sent back and sent again with the same photo; a photo of another task's
    report still refused
- **18 more checks through the API:**
  - the workshop: a declined task sends the intervention back to "Affecter équipe", à corriger, with
    who declined and why; the Workshop Lead takes it and assigns someone else
  - an alert follows its work order when it is reassigned or canceled
  - a levée de doute and a workshop task refused by cancel
  - the verify page names who validated; the PDFs print "Validé par … le …" and "Suite donnée"
- **The earlier alert tests still pass:** 63 of 63 (phase 1) and 61 of 61 (phase 2).
- **Browser, 34 checks, no page error, no failed API call.** Manager on a desktop, technician on a
  390 px phone, a second manager in the light theme, the public pages:
  - the login and sign-up pages; the create form's messages; the correction and the reset
  - Mon compte and the password change on the phone
  - the checklist: "Brouillon enregistré", the answers back after a reload, sent
  - sent back; the request above the form and all 16 answers back; sent again
  - validated by the second manager; "Envoyés" and the report's history on the phone
  - "Suite donnée" required before validating a non-conforming report
  - Ordres: the declined task, reassigned; another canceled; the counts on the tabs
  - no sideways scroll on the phone
- **Backup:** a dump of the local database (161 MB, 37 tables), restored into a scratch database with
  the same counts (244 photos, 53 documents), scratch database dropped.
- **Lint, build, backend tests:** no file touched fails lint (15 older files still do); the build
  passes; the backend tests run 25 with 0 failures and 1 skipped.

Fixed along the way, found by the tests:
- **Correcting a technician's name failed in the browser.** The server's CORS rules refuse `PATCH`,
  which the API test could not see. The call is now a `PUT`.
- **The Visa box printed the variable names** instead of the reviewer's name and date.
- **A technician who declined a check kept access to that alert's report.** A declined or canceled
  task no longer counts.
- **The restore check listed two tables under the wrong names.**
- **The verification block's right border** was cut on every report PDF (the one-line fix noted in
  phase 2).

Found, not changed (for a decision):
- **Deleting a form is open to every logged-in user** (`DELETE /api/v1/forms/{id}`), a technician
  included, as long as no report uses it.
- **One session per account.** Signing in a second time (another device, another browser) ended the
  first session at its next page load.
- **Any logged-in user can open any photo** if he has its id. Reports themselves are restricted.
- **`/actuator/**` is public.** The code's own comment says it should be admin-only.
- **The role accounts still share the setup password** until each person changes theirs from
  "Mon compte". A validation is only as personal as the password behind it.
- **A mobile app's sign-up screen**, if one is in use, is refused like the web one.
