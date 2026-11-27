# Setting up a new server

Everything after step 2 (filling `.env`) is done by [scripts/init-server.sh](scripts/init-server.sh). It can be
run again at any time: what already exists (accounts, forms) is skipped, never changed.

## Fresh server: the short version

1. At the hosting provider: open ports 80 and 443 (and keep SSH open).
2. On the server (Debian/Ubuntu, logged in as root or a sudo user):

```sh
git clone git@github.com:ksmasteru/docuMind.git /opt/documind
cd /opt/documind
./scripts/init-server.sh
```

That's all. The script installs Docker and Caddy, creates `.env` (it generates the secrets and
asks only for the OpenAI key, the admin's email and password, and the role accounts' password),
starts everything, gets the HTTPS certificate, and prints the address and the Grafana password.
The sections below say what it does, for when something goes wrong.

## 1. The server

- Debian/Ubuntu with systemd. The script installs Docker (with the compose plugin) and curl when
  they are missing; git is needed to clone.
- Open ports 80 and 443 for the HTTPS proxy (step 3). Docker also publishes 8080 (backend),
  5173 (frontend) and 3001 (Grafana) on every interface.

## 2. Code and `.env`

```sh
git clone git@github.com:ksmasteru/docuMind.git /opt/documind
cd /opt/documind
```

The script makes `.env` from `.env.server.example` when there is none. It generates `JWT_SECRET`,
`ADMIN_KEY`, `POSTGRES_PASSWORD` (= `DB_PASSWORD`) and `GRAFANA_ADMIN_PASSWORD`, asks for
`OPENAI_API_KEY`, and proposes `FRONT_END_URL`. A value already in `.env` is never changed, so
you can still fill it by hand first.

The folder can be anywhere: `.env` sets `COMPOSE_PROJECT_NAME=documind`, so the volume names stay
`documind_postgres_data`, ...

`FRONT_END_URL` is the new address. With sslip.io the address is the server's IP with dashes:
`https://2-31-83-75.sslip.io` for 2.31.83.75, so **changing the server changes the address**.

## 3. HTTPS proxy (done by the script)

**Nothing to do by hand on Debian/Ubuntu:** step 10 of the script installs Caddy, writes
`/etc/caddy/Caddyfile` for the host of `FRONT_END_URL`, starts it and waits for the certificate.
Step 11 opens SSH, 80 and 443 in ufw (it asks before turning ufw on). What you still need:

- ports 80 and 443 open at the hosting provider too (its own firewall / security group)
- `FRONT_END_URL` set to `https://<a name>`. Left blank, the script proposes the sslip.io address
  of the server's public IP and writes it into `.env`.
- if nginx or another web server already holds port 80/443, the script stops at step 10 without
  touching it: stop that server (`sudo systemctl disable --now nginx`) and run the script again.
- a Caddyfile with a config of its own is replaced only after you answer y (a `.bak-<date>` copy
  is kept). `--no-proxy` skips steps 10 and 11.

The rest of this section is what the script sets up, for doing it by hand on another system.

The frontend calls `/api/...` on its own address (`VITE_API_URL` is blank), so one proxy in front
of both containers has to:

- send `https://<address>/api/*` to `localhost:8080`
- send everything else to `localhost:5173`
- accept uploads of at least 20 MB (nginx's default is 1 MB: `client_max_body_size 25m;`)

Copy the old server's config if you can (`systemctl status caddy nginx` shows which one runs).
With Caddy, which gets the certificate by itself, `/etc/caddy/Caddyfile` would be:

```
2-31-83-75.sslip.io {
	handle /api/* {
		reverse_proxy localhost:8080
	}
	handle {
		reverse_proxy localhost:5173
	}
}
```

## 4. Run the script

```sh
cd /opt/documind
./scripts/init-server.sh
```

It asks for the admin's email and password, then for one password shared by all the role
accounts. Then it:

1. checks `.env`, and creates `my-react-app/.env` if it's missing (git ignores it, so a fresh
   clone has none)
2. builds and starts `docker-compose.server.yml`
3. waits for the backend
4. runs [forms/server_db_check.sql](forms/server_db_check.sql) and offers to apply the fixes it prints
5. creates the admin (with `ADMIN_KEY` from `.env`)
6. creates one account per line of [roles_accounts.txt](roles_accounts.txt)
7. creates the 8 quality forms in [forms/quality/](forms/quality/) and the workshop forms in
   [forms/workshop/](forms/workshop/) (the assembly report, RASSN-02); then (7b) makes the 4 control sheets
   fillable by technicians on a server whose forms were created before that
   ([scripts/control_sheets_technicians.sql](scripts/control_sheets_technicians.sql))
8. gives `manager@phova.com` his team: every technician in no team joins it
   ([scripts/team_seed.sql](scripts/team_seed.sql)). Only the first time he gets a team, so
   someone he removed later is not put back. `TEAM_MANAGER=<email>` picks another manager.
9. schedules the nightly backup and takes one now (see Backups)
10. sets up the HTTPS proxy (Caddy) for `FRONT_END_URL`, and checks that `https://<address>` answers
11. opens SSH, 80 and 443 in ufw. Docker's ports (8080, 5173, 3001) go around ufw and stay reachable.

The script needs root: run as another user, it runs itself again with sudo.

To run it without questions, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ACCOUNTS_PASSWORD`.
If the stack is already running, `--no-start` skips step 2.

### roles_accounts.txt

One account per line. The role is the part before the `@`, in capitals (`quality@phova.com` →
`QUALITY`), so it has to be one of the roles in
[UserRole.java](backend/src/main/java/com/docuMind/backend/model/enums/UserRole.java) other than
`ADMIN` and `USER`. The display name is made from the same part (`business_ops` → "Business Ops").
To give a name of your own, write it after a comma:

```
sales@phova.com
hse@phova.com, Hygiène Sécurité Environnement
```

## Keeping the old server's data

The script only creates the accounts and forms. Everything else (documents, pumps, interventions,
reports, uploaded files and images) lives in the old server's Postgres. To bring it along, restore
a dump **before the backend starts for the first time**. Otherwise the backend creates empty
tables and the restore runs into them.

On the old server:

```sh
cd /opt/documind
docker compose -f docker-compose.server.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > documind.dump
```

Copy `documind.dump` to `/opt/documind` on the new server, then:

```sh
docker compose -f docker-compose.server.yml up -d postgres
docker compose -f docker-compose.server.yml exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < documind.dump
./scripts/init-server.sh         # existing accounts and forms are skipped
```

Redis only holds a cache, and Grafana's dashboards come from the repo, so neither needs copying.

## After the move

- QR codes on PDFs printed before the move point to the old address. They stop working when the
  old server goes away, unless the old address keeps answering.
- Change `baseUrl` in the Postman collections
  ([roles_accounts](roles_accounts.postman_collection.json),
  [quality forms](forms/quality_forms.postman_collection.json)).

## Deploying an update on the same server

```sh
cd /opt/documind && git pull && ./scripts/init-server.sh
```

This rebuilds and restarts the stack and re-runs the database check. It also adds any account
newly listed in `roles_accounts.txt` and any new form in `forms/quality/` or `forms/workshop/`.

### No `analysis-service` on the report platform (since 2026-11-25)

Nothing to run by hand. The stack no longer has the Python `analysis-service`: it only read CSV/Excel uploads,
which the platform doesn't use, and its image failed to build when PyPI was slow. `init-server.sh` starts the stack
with `--remove-orphans`, so the old container is removed on the next update. Volumes are left alone. « Importer »
now takes PDF, TXT and MD only, and the backend refuses a spreadsheet. An `ANALYSIS_HOST` line left in `.env` is
harmless. ([plan_remove_analysis_service.md](plan_remove_analysis_service.md))

### Forms for technicians (since 2026-11-21)

Nothing to run by hand: `./scripts/init-server.sh` covers it ([plan_forms_technician_assembly.md](plan_forms_technician_assembly.md)).

- **The 4 control sheets** (EN-CPE-QU-01, EN-PFD-MIC-01/03/04) are fillable by technicians as well as by
  Quality. Step 7b adds `USER` to their roles on the server. It only adds: if someone removes `USER` from one
  of them by hand, the next run of the script puts it back.
- **« Rapport d'assemblage pompe »** (RASSN-02) is a new form for technicians, created by step 7 from
  `forms/workshop/`. The backend has to know it (its title is how the app opens it as a section-by-section
  report): step 2 rebuilds the stack first, so this holds unless the script is run with `--no-start` on an
  old stack.

### Reports and accounts (since 2026-11-15)

Nothing to run by hand: `./scripts/init-server.sh` covers it, and the backend adds the new columns.
What changes on the server ([plan_reports_validation.md](plan_reports_validation.md)):

- **Technician accounts are created by their manager** (Techniciens page: first name, last name,
  site, e-mail, password). The public sign-up page is closed. To reopen it (a demo), add
  `ALLOW_SELF_REGISTRATION=true` to `.env` and restart the backend.
- **Everyone can change their password** from "Mon compte" (the person icon in the header). The
  role accounts created by step 6 share one password: ask each person to change theirs, since a
  validation is recorded under the account that made it.
- **Step 9 schedules the nightly backup** (below).

## The report platform (since 2026-11-23)

PHOVA's staff fill their reports on the platform before the rest of documind is finished
([plan_rapports_platform.md](plan_rapports_platform.md)). Same code, one setting: `APP_EDITION=rapports` in
`.env`. The server then shows only the reports, the tasks, the team, the documents and the assistant, and
refuses the rest (alerts, pumps, workshop). Three roles: the admin, the managers, their technicians. A
technician's report sent without a task goes to his manager's « Revue ».

### Turning the current server into it

1. **Back up what is there**, and copy the dump off the server: `./scripts/backup-db.sh`, then
   `scp <server>:/opt/documind/backups/documind-<date>.dump .`
2. **Get the code:** `git pull` on `main`.
3. **Start from an empty database**, so the demo's reports, accounts and simulated alerts stay out. The dump
   from step 1 is then the only copy of the demo data:

   ```sh
   docker compose -f docker-compose.server.yml down
   docker volume rm documind_postgres_data
   ```

   The manuals uploaded for the assistant live in the database too: they are uploaded again in step 6.
4. **In `.env`:** `APP_EDITION=rapports`.
5. **Run `./scripts/init-server.sh`.** It asks for the admin's e-mail and password, and creates the forms (the
   v2 expertise reports, the assembly report, the quality forms). It skips the shared role accounts and the
   demo team.
6. **In the app, as the admin:** « Comptes » → « Nouveau manager » for each manager; « Importer » for the
   manuals, ticking the pump models each one serves (below).
7. **Each manager:** « Techniciens » → his technicians. Everyone chooses their own password in « Mon compte ».

### Pump documents, spec sheets, chat sources (since 2026-11-25)

Nothing to run by hand ([plan_pump_manuals.md](plan_pump_manuals.md), [plan_rapports_new_changes.md](plan_rapports_new_changes.md)):
the backend creates the table `pump_model_document`, step 4's database check knows its values, and step 7c
(`scripts/hdx_removed.sql`) clears what still says HDX. What changes on the server:

- **Spec sheets:** at its first start the backend installs one « Fiche technique » per model (OTW, OTC, OTS,
  PHB2, PHB3, PHH, from `backend/src/main/resources/specs/`) into the library: six embedding calls to OpenAI.
  `docker logs backend | grep "spec sheet"` shows « installed ». If OpenAI was unreachable, the next start tries
  again. The admin, the managers and the technicians read them on « Fiches techniques »; the admin edits or
  replaces them there, and a redeploy never overwrites the admin's version.
- **Ticking documents:** on « Importer », the admin ticks the pump models a document serves, and whether it is a
  PHOVA document or a comparable pump's manual. Documents imported before have no model: tick them on
  « Documents » (search, then « Modèles »), as done locally (`manuals_pump_choice.md` on `test`): AHLSTAR and
  AHLSTAR CC → OTW, MBN and MBN RO → PHB3, ZPP horizontal → PHB2, all « pompe comparable ». Then remove
  `rapport_pfa_phova.pdf` if it was imported: its figures are now in the spec sheets.
- **The chat knows the pump:** from a task, the model its equipment's code starts with (« OTW-JORF-01 » → OTW;
  the report platform has no pump registry, and a blank equipment gives « Pompe non précisée »); on « Assistant »,
  the model picked above the chat. It searches that model's documents and the general ones, always reads its spec
  sheet, and labels in amber any value taken from a comparable pump's manual, another model's documentation, or
  no document at all. The sources under an answer are the documents it cited; each chip opens it.
- **Only the admin writes to the library:** uploading, scanning a page in and deleting documents answer 403 to
  every other role, also through the API.

### Notifications (since 2026-11-25)

Nothing to run by hand ([plan_notifications_both.md](plan_notifications_both.md)): the backend creates the table
`notification`, and step 4's database check knows its values. What changes on the server:

- **A bell in every header** with the unread count: a technician is told of a task sent to him, a report
  validated, sent back or rejected, a task cancelled; a manager of a report waiting in « Revue » (a task's, or one
  a technician filed on his own) and of a task declined or put on hold. Clicking a line opens its page.
- **E-mail notifications are off** until an SMTP account is in `.env`. To switch them on, add these keys
  (they are commented out in `.env.server.example`), then restart the backend
  (`docker compose -f docker-compose.server.yml up -d backend`):

  ```sh
  SPRING_MAIL_HOST=smtp.example.com
  SPRING_MAIL_PORT=587
  SPRING_MAIL_USERNAME=rapports@phova.com
  SPRING_MAIL_PASSWORD=…
  MAIL_FROM=PHOVA Rapports <rapports@phova.com>
  ```

  STARTTLS and login are on by default. The links in the e-mails use `FRONT_END_URL`. A refused e-mail is
  only logged (`docker logs backend | grep "notification e-mail"`), and `/actuator/health` doesn't depend on
  the SMTP server. Each person's e-mail is their login, so the accounts need real addresses.

### Back to the full platform, later

Blank `APP_EDITION` and run `./scripts/init-server.sh` again: the same database, Hibernate adds the new
tables, and the reports filled meanwhile stay. Step 6 then creates the accounts of `roles_accounts.txt`:
empty it first if those shared accounts aren't wanted in production.

## Backups

Everything the app keeps is in the database: the reports, their photos, the uploaded documents, the
accounts, the alerts. One dump is a full backup.

- **Every night at 02:30**, `scripts/backup-db.sh` writes `backups/documind-<date>.dump` and removes
  the dumps older than 14 days. `init-server.sh` (step 9) installs the job and takes a first dump.
  `crontab -l` shows the job; `backups/backup.log` has one line per run.
- **Run one now:** `./scripts/backup-db.sh`
- **Check that the latest dump restores:** `./scripts/restore-check.sh`. It restores into a scratch
  database, compares the row counts with the live one, and drops the scratch database. Run it after
  the first backup, and once a month.
- **Copy the dumps off the server.** They sit on the same disk as the database: a lost disk loses
  both. From another machine, for example every night:

  ```sh
  rsync -a --delete root@SERVER_IP:/opt/documind/backups/ ~/documind-backups/
  ```

- **Restore for real** (this replaces the live data with the dump's):

  ```sh
  cd /opt/documind
  docker compose -f docker-compose.server.yml stop backend
  docker compose -f docker-compose.server.yml exec -T postgres sh -c \
    'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" -T template0 "$POSTGRES_DB"'
  docker compose -f docker-compose.server.yml exec -T postgres sh -c \
    'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < backups/documind-<date>.dump
  docker compose -f docker-compose.server.yml start backend
  ```

- Settings: `BACKUP_DIR` (default `./backups`) and `BACKUP_KEEP_DAYS` (default 14), as environment
  variables of the job.

## Testing the report flow

`scripts/e2e-reports.mjs` walks the whole flow through the API (accounts, fill, save, send, send
back, correct, validate, cancel, reassign) and checks every refusal. **It writes test data** (a
technician account, tasks, reports): run it against a test server or a copy of the database, not
the production one.

```sh
BASE_URL=http://localhost:8080 MANAGER_EMAIL=manager@phova.com MANAGER_PASSWORD=… node scripts/e2e-reports.mjs
```

### Alerts on the server (since 2026-11-12)

The alert cases now live in the database (`alert_case`, `alert_event`, `alert_request`…), so
technicians can see the alerts of their site, confirm them or call them false alarms, ask to
intervene and report faults. The backend creates the tables at its first start: there is
nothing to run by hand. A technician's site is the **Site** on his account (Jorf or Safi); with
none, he sees every site's alerts.

Cases the managers' browsers kept before this update (in localStorage) are not carried over: the
twin's live alerts open new cases on the server at the first sync.

### Checking alerts on site (since 2026-11-12)

Every alert is now checked on site before anyone acts on it (the "levée de doute",
[plan_alert_check_flow.md](plan_alert_check_flow.md)). The check is a new kind of task
(`VERIFICATION`), and the `task` table's old list of task types refuses it. The database check
(step 4) prints the fix, `alter table task drop constraint task_task_type_check;`: let the script
apply it. Without it, sending a check fails. The other new tables are created by the backend.

A technician can start a check himself, or report a fault, only if he belongs to a team: the check
goes to his team's manager. Step 8 puts every technician who has no team into
`manager@phova.com`'s team.

**Phase 2 (check report PDFs, repeats after a false alarm), nothing to do.** It only adds columns,
which the backend creates. At its first start it also fills in two things for older data, and logs
a line for each:
- the alert of each work order made from an alert ("alert numbers given to n older work orders")
- the verification code printed on each check report already sent ("verification codes given to n
  older check reports")

The check report PDFs' QR codes point to `VERIFY_BASE_URL`, like the checklists' PDFs.
