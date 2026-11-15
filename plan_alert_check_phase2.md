# Plan: levée de doute, phase 2

Built 2026-11-12, after Phase 1 ([plan_alert_check_flow.md](plan_alert_check_flow.md)). The boxes
are ticked as it goes.

The three items:
1. The check report in the repair task, and as a PDF with a QR code
2. The pump history: the check reports, the false-alarm rate, the closures and their reasons
3. The twin raising again an alert just found false

## 1. The check report in the repair task, and as a PDF

**Why:** the technician sent to repair is often not the one who checked. Today he gets a title and
instructions; what the check found (readings, anomalies, photos, parts) stays on the alert page,
which he can't open.

**Which alert a task comes from.** A work order made from an alert now records its alert
(`task.alertNumber`), as check tasks already do. It is set when the order is linked to the alert
(`AlertService.addOrder`: AssignTask's link and an accepted request). Older orders get it at
startup, from the alerts' order lists.

**The check behind a task:** `GET /api/v1/checks/for/{taskId}` returns the check that confirmed the
task's alert, in the same shape as `GET /checks/{id}`.
- Who: the task's technician, or a manager.
- 204 when the task doesn't come from an alert, or its alert has no check report (alerts confirmed
  before the check report existed).

**Technician, repair task, Détails tab:** a card "Constaté lors de la levée de doute":
- the verdict, who, when, and his comment
- what to look at first: the points in anomaly, and the readings above their limits
- his estimate and the parts he listed
- "Voir tout le rapport" opens the full report (the same view as the manager's)
- "PDF"

**The PDF:** `GET /api/v1/checks/{taskId}/pdf?round=n` (the latest round by default).
- Who: the check's technician, the technician of a task from the same alert, or a manager.
- Template `check-report.html` (A4), in the style of the other reports:
  - the header: PHOVA logo, "Rapport de levée de doute", the alert's number, the pump, the site
  - the conclusion, then the facts: technician, sent, state on arrival, time on site, round
  - the system's readings against the site's, with the limits
  - each point: result, reading, comment, photos
  - the free sections with their photos
  - what comes next: he can handle it (estimate, parts) or why not
  - the verification block: QR code and code
- **Where the PDF button is:**
  - the manager's report card on the alert page
  - the technician's own report, on his alert and in his check task once it's sent
  - the repair task's card
  - the pump history's list of checks

**Verification:** each check report gets a code and a fingerprint when it is sent. The ones already
sent get theirs at startup, like the checklists did.
- The public page `/verify/{code}` recognises them, with the same rules:
  - authentic or altered
  - a newer round exists
  - the check was canceled
- "Résultat" shows the verdict. `/verify/{code}/pdf` and `/preview` serve the check's PDF.

## 2. The pump history

**Server:** the history gets `checks`, every check task on the pump with its latest round. For each:
- the verdict, with its cause or reason
- the number of rounds, and whether an immediate stop was asked
- what comes next
- the number of points in anomaly, and of photos
- the task's status
- whether he started it himself, or it was a fault report

**The summary tiles:**

| Tile | Value | Hint |
|---|---|---|
| Alertes | how many | critical · reported on site |
| Levées de doute | how many checks | confirmed · false · not conclusive |
| Fausses alertes | the rate: false ÷ (confirmed + false), per alert, by its last verdict | "n sur m", and the causes |
| Interventions | as today | |
| Temps passé | as today | |
| Dernière maintenance | as today | |

"Signalées sur place" moves into the Alertes hint, so there are still six tiles. A not-conclusive
check isn't a finding, so it stays out of the rate.

**Two new panels**, side by side on a wide screen:
- **Levées de doute:** one line per check, with the date, the alert, the technician, the verdict
  and its cause, what came next and the status, plus "Rapport" and "PDF".
- **Clôtures:** how the pump's alerts were closed, by reason, with a count and a bar.

**When the sensor keeps failing:** two or more false alarms blamed on the sensor in 90 days show
"Le capteur a causé n fausses alertes : faites-le contrôler", with a button that opens a work order
for the pump.

**The timeline:**
- **The bug:** a check task's "Rapport" link opens `/review/<id of the check report>`, which can't
  open it. That page only reads checklists. It now opens the report on its alert, and the line
  shows the verdict.
- The same fix goes into the pump page's Historique panel (`PumpHistory.jsx`).

## 3. The twin raising again an alert just found false

It can happen at three moments.

**a) Before the manager confirms the false alarm.** The same case still follows the alert.
- **The warning:** if the alert got worse or came back since the report, the panel says so above
  "Confirmer la fausse alerte", for example "Depuis le rapport de X, l'alerte est passée en
  critique".
- The decision stays his.

**b) After the false alarm is closed, while the alert is still on.**
- **Today:** a closed case covers its alert until it clears, whatever the readings do.
- **New:** after a false alarm, if the twin's severity rises above the one the check was made at, a
  new case opens, because a worse reading deserves a new look. At the same severity, the false alarm
  still covers the alert.

**c) The alert clears, then comes back.** A new case opens, as today. Now it remembers the false
alarm: within 30 days of a false alarm closed on the same alert (same pump, same kind), the new case
is marked as a repeat.
- **Where the manager and technicians see it:**
  - an event "recurred" in its activity
  - a banner on the manager's alert page
  - a tag in the dashboard list and in the technician's Alertes tab
  - the wording, for example "Déjà classée fausse alerte le 10/11 (#12, capteur défectueux) ·
    2ᵉ fois en 30 jours"
- **It is still "À vérifier":** decision 4 says every alert is checked.
- **The suggested points add one about the earlier cause:**
  - sensor: "Capteur : état, fixation, câblage", with a photo required
  - pump OK: "Comparer avec le relevé du 10/11"
  - operating conditions: "Conditions de marche par rapport au 10/11"
- **The send-check page** marks the technician who made the earlier check.
- **When the earlier cause was the sensor:** "Faire contrôler le capteur" opens a work order for the
  pump. It isn't linked to the alert, so the confirmed-check rule isn't touched.

**Not done, on purpose:**
- **Muting an alert until its sensor is repaired:** it would skip the check (decision 4).

## Data model

| What | Change |
|---|---|
| `TaskModel.alertNumber` | also set on the work orders made from an alert (backfilled at startup) |
| `CheckReport` | + `verificationCode` (unique), + `contentHash` |
| `AlertCase` | + `followsFalseAlarm` (the number of the earlier case), + `falseAlarmsBefore` (how many in the 30 days before) |
| `AlertCaseView` | + `recurrence` { number, closedAt, cause, technicianName, count, worse } |
| `PumpHistoryView` | + `checks` |
| `VerificationResponse` | + `kind` ("CHECKLIST" or "CHECK") |

**On the server:** only new columns, which Hibernate adds, plus backfills that run at startup. No
new enum value, so no constraint to drop. Nothing to add to `scripts/init-server.sh`, and
`SERVER_SETUP.md` gets a line saying so.

## Steps

- [x] Plan (this file)
- [x] Backend: the alert number on work orders and its backfill; `GET /checks/for/{taskId}`
- [x] Backend: the check PDF (template, service, endpoint), its code and fingerprint, the backfill,
  the verification page and its PDF and preview
- [x] Backend: `checks` in the pump history
- [x] Backend: the twin's sync: a repeat after a false alarm, and a new case when it gets worse
  while covered; `recurrence` in the view
- [x] Frontend: the repair task's card, and the PDF buttons
- [x] Frontend: the pump history (tiles, the two panels, the sensor callout, the timeline fix) and
  `PumpHistory.jsx`
- [x] Frontend: the repeat banner, tags and suggested point; the warning before confirming a false
  alarm; the earlier technician on the send-check page; "Faire contrôler le capteur"
- [x] Frontend: the verify page for a check
- [x] Checks:
  - lint, build, backend tests
  - an API script on a copy of the database: the access rules of `for` and `pdf`, the
    verification, the twin's repeats and worsening, the history's `checks`
  - in the browser: the repair task on a phone, the pump history, the alert page's repeat
    banner, the verify page; both themes

## What was checked (2026-11-12)

Everything ran on a copy of the local database (`documind_checktest`), deleted afterwards.

- **API, 61 of 61 checks:**
  - `GET /checks/for/{task}`: the work order's technician and the manager can read it; another
    technician can't; 204 for a task not made from an alert, and for an older work order whose alert
    has no check report
  - who may read a check and its PDF: a technician with no task on the alert is refused (403), until
    a work order on that alert is his
  - the PDF: its name, round 2 not there yet (404), a work order isn't a check (404)
  - a code and a fingerprint on every report sent, and on the one already in the database (backfill)
  - the verify page: a check's code (CHECK, authentic, verdict, pump, round, task status, his name and
    not his email), typed with dashes in lower case, its PDF and preview, a checklist's code still
    answered as CHECKLIST, an unknown code (404), the report altered in the database (ALTERED) and put
    back (AUTHENTIC), round 1 replaced by round 2
  - the pump history: each check with its verdict, rounds, stop, next step, counts and status; a check
    task's line no longer points to a checklist
  - the twin:
    - worse before the manager decides: logged on the same case
    - still on at the same severity after the false alarm: no new case
    - back after clearing: a repeat, with the earlier case, its cause, who checked it and how many
    - worse than the false alarm covering it: a new case, opened now, marked worse
    - the next sync follows that case
    - another alert on the same pump isn't a repeat
    - technicians see the repeat
- **Browser, 31 checks, no page error, no failed API call:**
  - **Ali on a phone, both themes:**
    - his work order shows what the check found: the reading past its limit against the system's, the
      anomaly, the photos, the estimate and parts
    - the full report opens in place
    - the PDF downloads
    - no sideways scroll
  - **The manager on a desktop:**
    - the repeat banner (when, by whom, why, how many, worse) and its line in the activity
    - "Faire contrôler le capteur" opens a work order on the pump, not linked to the alert
    - the send-check page marks Ali and adds the sensor point
    - the warning before confirming a false alarm that got worse
    - the PDF on the report card
    - the pump history in both themes: the rate, the sensor callout, the checks, the closures, the
      repeats in the timeline, a check linked to its report on the alert
    - the pump page's Historique tab
  - **Technicien Safi on a phone:**
    - the "Déjà fausse alerte" tag
    - the repeat on the alert's page, and the sensor point in "Ce que la levée de doute fait vérifier"
  - **The public verify page on a phone:** a check reads with its own words (pump, technician,
    conclusion)
- **The PDF itself, rendered and looked at:**
  - photos printed
  - a WebP or unreadable photo is counted in a note, not dropped silently
  - two pages when the photos need it
- **Lint, build and backend tests:**
  - lint: none of the files touched fails. 17 older files still do, `VerifyReport.jsx` among them,
    for a line that was already there.
  - the build passes
  - the backend tests run 25 with 0 failures and 1 skipped

Fixed along the way, found by the tests:
- **The PDF printed the alert's current message,** which the twin rewrites on every sync, so a reprint
  could differ from the first print. It now prints the wording frozen when the check was made.
- **The tables' right border was cut** in the PDF. The tables are now a hair under full width.
- **An estimate read "3,00 h"** in the repair card and the full report. It now reads "3 h".
- **"par Ali" came after "2 fausses alertes en 30 jours"** in the repeat line. It now comes after the
  date.
- **The technician's "Ce que la levée de doute fait vérifier"** listed the kind's checks only. It now
  lists the points his check will have, the repeat's point included.

Found, not changed (for a decision):
- **A case closed for another reason still covers its alert, however much worse it gets.** This holds
  for risk accepted, planned shutdown, repaired by a third party and the others, as before Phase 2.
  Only a false alarm now lets a worse reading through. Proposal: the same rule for every closure
  except "Réparée".
- **The verification block at the bottom of every report PDF loses its right border.** This includes
  the checklists, and comes from the shared `verification.html`. It's cosmetic, and the same
  one-line fix would do.
- **The workshop:** a pump sent to the workshop from an alert doesn't show the check report on its
  intervention page. The same card could go there.
