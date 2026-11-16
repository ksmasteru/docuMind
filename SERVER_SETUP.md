# Setting up a new server

Everything after step 3 is done by [scripts/init-server.sh](scripts/init-server.sh). It can be
run again at any time: what already exists (accounts, forms) is skipped, never changed.

## 1. The server

- Docker with the compose plugin (`docker compose version`), git and curl.
- Open ports 80 and 443 for the HTTPS proxy (step 3). Docker also publishes 8080 (backend),
  5173 (frontend) and 3001 (Grafana) on every interface.

## 2. Code and `.env`

```sh
sudo git clone git@github.com:ksmasteru/docuMind.git /opt/documind
cd /opt/documind
cp .env.server.example .env      # then fill it in: each line says what goes there
```

Keep the folder at `/opt/documind`: the compose project name comes from it, and so do the
volume names (`documind_postgres_data`, ...).

`FRONT_END_URL` is the new address. With sslip.io the address is the server's IP with dashes:
`https://2-31-83-75.sslip.io` for 2.31.83.75, so **changing the server changes the address**.

## 3. HTTPS proxy (not in this repo)

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
7. creates the 8 quality forms in [forms/quality/](forms/quality/)
8. gives `manager@phova.com` his team: every technician in no team joins it
   ([scripts/team_seed.sql](scripts/team_seed.sql)). Only the first time he gets a team, so
   someone he removed later is not put back. `TEAM_MANAGER=<email>` picks another manager.

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
newly listed in `roles_accounts.txt` and any new form in `forms/quality/`.

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
