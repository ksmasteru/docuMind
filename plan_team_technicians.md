# Plan: manager team, technician profile and task history

Status: done, not committed · 2026-11-12

## What the manager gets

1. **Techniciens** (existing tab, `/technicians`) now lists **his team**: one card per technician with site, open tasks, reports to review, approved tasks and last activity.
   - From the list he can **add** a technician who is in no team yet, or **create a new technician account**, which joins his team straight away.
   - Each card has a quick **Assigner** button, so the pump/alert → "assign an order" flow stays one click.
2. Clicking a card opens **the technician's page** (`/technicians/:id`):
   - **Profile:** name, e-mail, site, whose team he is in, and an **Assigner une tâche** button in the header.
   - **Performance:**
     - tasks, open, to review, approved
     - right first time (approved without being sent back)
     - on time (report sent by the due date)
     - returns, and average time per approved task
     - non-conforming reports
   - **History:** every task he was given, newest first, filterable: all, open, to review, approved, sent back, declined or canceled. Each task opens to show:
     - its details and the manager's instructions
     - **its reports** (every round when it was sent back, each one opens read-only)
     - **its remarks**: the timeline of who moved it, when, with the reason and comment
   - **Retirer de l'équipe**, at the bottom of the page, away from accidental clicks.
3. Opening a report from the history uses the existing read-only report view (`ReportView`) at `/technicians/:id/rapport/:submissionId`.

## Decisions (tell me if one is wrong)

| Decision | Why |
|---|---|
| Reuse the Techniciens tab, no new tab | One place for "my technicians"; a second tab would show almost the same list. |
| One team per manager, a technician in **one team at most** | "His technicians" stays unambiguous. Adding someone from another team is refused with that manager's name (409). |
| The team is created the first time he adds someone | Opening the page never writes to the database. |
| The manager of a technician's team can read **all** that technician's reports | Today only the manager who assigned the task can. Without this, history reports from other managers or workshop tasks would be refused. |
| Removing a technician keeps his account and tasks | It only changes the team. |
| Seed account is `manager@phova.com` / `manager` | You wrote `maanger@phova.com`. No such account exists; `manager@phova.com` exists with password `manager`, so I took it as a typo. |
| Assigning a task is **not** limited to the team | You didn't ask for it. Easy to add later. |

## API (all MANAGER only)

| Method | Path | Does |
|---|---|---|
| GET | `/api/v1/team` | his technicians with counts, plus `available` (in no team) |
| POST | `/api/v1/team/technicians` | `{name, email, password, worksite?}`: new account in his team (409 if the e-mail exists) |
| PUT | `/api/v1/team/technicians/{id}` | add an existing technician (409 if in another team) |
| DELETE | `/api/v1/team/technicians/{id}` | remove him from the team |
| GET | `/api/v1/team/technicians/{id}` | profile, performance, task history with reports and remarks (403 if not in his team) |

Each change answers with the whole team, so the page just redraws.

## Steps

### Backend
- [x] `Team` entity: `team` table (`manager_id` unique) and `team_member` join table (`technician_id` unique)
- [x] `TeamRepository`: his team, a technician's team, everyone in a team, "is he in my team"
- [x] Queries added: a technician's tasks, task counts per technician and status, several tasks' timelines, users by e-mail
- [x] DTOs: `TeamResponse`, `TeamTechnicianForm` (validated, password hidden in logs), `TechnicianProfile`
- [x] `TeamService`: team, add, create account, remove, profile and performance
- [x] `TeamController` and `TeamException` (409)
- [x] Report access: `SubmissionService.canRead` also lets the technician's team manager read
- [x] Compile; start against the local database and check the two new tables and their unique constraints

### Frontend
- [x] `Technicians.jsx`: the team list (cards → profile, quick Assigner, add and create panels, empty and error states)
- [x] `TechnicianProfile.jsx`: profile header with Assigner, performance readouts, filterable history, task details with reports and remarks timeline, remove from team
- [x] Report page for the history (`ReportView`, back link to the profile)
- [x] Routes in `App.jsx`
- [x] `AssignTask.jsx`: opened from a technician's page (`?retour=/technicians/<id>`), it goes back there after sending the task

### Data
- [x] `scripts/team_seed.sql`: `manager@phova.com`'s team, with every technician in no team. It only fills a team it creates, so a re-run never undoes a removal. On a new server, the account itself comes from `roles_accounts.txt` (added there).
- [x] Run it on the local database: 7 technicians joined; a second run changed nothing
- [x] Add the seed to `scripts/init-server.sh` and `SERVER_SETUP.md` (it must run after the new backend has started once, which creates the tables)

### Checks
- [x] API against the real backend with the manager's token: list, add, create, 409 cases, remove, profile, a report from the history
- [x] Browser: list and profile in dark and light, phone width, empty and error states
- [x] Lint and build

## Changes made along the way
- **No status bar on the profile.** The performance view is stat tiles only. A status split bar was tried, but the theme's status colors fail the color-blindness check side by side (green next to amber), and the tiles already give the same counts.
- **Wider pages.** The list and the profile use the wide layout (`<Layout wide>`). At the default width the cards' counts overflowed.

## Known limits (reported, not fixed)
- **Deleting a user fails** (admin `DELETE /api/v1/users/{id}`) for anyone who has signed in, because refresh tokens point at the user. This was already the case. Team members and managers now add the same kind of link.

## Open questions
- Should a manager only be able to assign tasks to his own team?
- Should the admin see and edit every team?
