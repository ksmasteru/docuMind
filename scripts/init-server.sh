#!/usr/bin/env bash
# Sets up a DocuMind server: the steps SERVER_SETUP.md used to list by hand.
# Safe to run again on a server that is already set up: what exists is left as it is.
#
# Run it on the server, from the repo folder (/opt/documind), once .env is filled in:
#   ./scripts/init-server.sh
#
# What it does:
#   1. checks .env, and creates my-react-app/.env when it is missing
#   2. builds and starts docker-compose.server.yml                (skip: --no-start)
#   3. waits for the backend to answer
#   4. runs forms/server_db_check.sql, and offers to apply the fixes it prints
#   5. creates the admin account
#   6. creates one account per line of roles_accounts.txt; the role is the part before the @
#   7. creates the quality forms in forms/quality/*.json
#   8. gives the manager his team: the technicians in no team join it (scripts/team_seed.sql),
#      only the first time, so a technician he removed later is not put back
#   9. schedules the nightly backup (scripts/backup-db.sh, 02:30, 14 days kept) and takes one now
#
# It asks for the passwords. To run it without questions, set ADMIN_EMAIL, ADMIN_PASSWORD
# and ACCOUNTS_PASSWORD (the one password all the role accounts get).
# TEAM_MANAGER: whose team step 8 fills (default manager@phova.com, from roles_accounts.txt).
#
# Options:
#   --no-start        the stack is already running: don't build and start it
#   --base-url URL    where the backend answers (default http://localhost:8080)

set -euo pipefail
umask 077   # the temp files hold the passwords and the token

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.server.yml"
BASE_URL="http://localhost:8080"
START=1
FAILED=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-start) START=0 ;;
    --base-url) BASE_URL="${2:?--base-url needs a value}"; shift ;;
    -h|--help)  sed -n '2,22p' "$0"; exit 0 ;;
    *)          echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done
BASE_URL="${BASE_URL%/}"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

step() { printf '\n== %s\n' "$*"; }
ok()   { printf '   ok    %s\n' "$*"; }
skip() { printf '   skip  %s\n' "$*"; }
fail() { printf '   FAIL  %s\n' "$*"; FAILED=$((FAILED + 1)); }
die()  { printf '\nerror: %s\n' "$*" >&2; exit 1; }

# the value of KEY in .env, without surrounding quotes
env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# $1 as a JSON string, quotes included
json_str() {
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
}

ask() {        # ask "question" default  -> the answer
  local answer
  read -r -p "   $1 [$2]: " answer </dev/tty
  printf '%s' "${answer:-$2}"
}

ask_secret() { # ask_secret "question" -> the answer, typed twice
  local a b
  while :; do
    read -r -s -p "   $1: " a </dev/tty; echo >&2
    [ -n "$a" ] || { echo "   (empty, again)" >&2; continue; }
    read -r -s -p "   $1 again: " b </dev/tty; echo >&2
    [ "$a" = "$b" ] && break
    echo "   (they differ, again)" >&2
  done
  printf '%s' "$a"
}

confirm() {    # confirm "question" -> true on y; false without a terminal
  local answer
  [ -t 0 ] || return 1
  read -r -p "   $1 [y/N] " answer </dev/tty
  [ "$answer" = y ] || [ "$answer" = Y ]
}

# api METHOD PATH [BODY_FILE]: sets HTTP to the status, the body is in $TMP/out
api() {
  local args=(-sS -o "$TMP/out" -w '%{http_code}' -X "$1" -H 'Content-Type: application/json')
  if [ -s "$TMP/auth" ]; then args+=(-H "@$TMP/auth"); fi
  if [ $# -ge 3 ]; then args+=(--data-binary "@$3"); fi
  HTTP=$(curl "${args[@]}" "$BASE_URL$2" 2>/dev/null) || HTTP=000
}

psql_exec() {
  $COMPOSE exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}


step "1. Config files"
command -v curl >/dev/null || die "curl is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose is not installed"
[ -f .env ] || die ".env is missing: copy .env.server.example to .env and fill it in"
missing=""
for key in JWT_SECRET ADMIN_KEY OPENAI_API_KEY POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DB_PASSWORD FRONT_END_URL; do
  [ -n "$(env_value "$key")" ] || missing="$missing $key"
done
[ -z "$missing" ] || die ".env has no value for:$missing (see .env.server.example)"
# application.properties connects to database documind as user documind, whatever .env says
[ "$(env_value POSTGRES_DB)" = documind ] && [ "$(env_value POSTGRES_USER)" = documind ] \
  || die "POSTGRES_DB and POSTGRES_USER must both be documind in .env"
[ "$(env_value DB_PASSWORD)" = "$(env_value POSTGRES_PASSWORD)" ] \
  || die "DB_PASSWORD must be the same as POSTGRES_PASSWORD in .env"
ok ".env"
[ -n "$(env_value GRAFANA_ADMIN_PASSWORD)" ] \
  || echo "   warn  GRAFANA_ADMIN_PASSWORD is blank: Grafana (port 3001, public) signs in with admin/admin"
if [ -f my-react-app/.env ]; then
  ok "my-react-app/.env"
else
  # git ignores this file, so a fresh clone has none; blank = the app calls /api on its own address
  echo 'VITE_API_URL=' > my-react-app/.env
  chmod 644 my-react-app/.env
  ok "my-react-app/.env created (VITE_API_URL blank)"
fi


if [ "$START" = 1 ]; then
  step "2. Build and start the stack (a few minutes the first time)"
  $COMPOSE up -d --build
else
  step "2. Build and start: skipped (--no-start)"
fi


step "3. Wait for the backend at $BASE_URL"
for _ in $(seq 1 60); do
  api GET /actuator/health
  [ "$HTTP" = 200 ] && break
  sleep 5
done
[ "$HTTP" = 200 ] || die "no answer after 5 minutes (last status $HTTP). Look at: $COMPOSE logs backend"
ok "backend is up"


step "4. Database check (forms/server_db_check.sql): both results should be (0 rows)"
if $COMPOSE exec -T postgres true >/dev/null 2>&1; then
  if ! psql_exec < forms/server_db_check.sql | tee "$TMP/dbcheck"; then
    fail "the check itself failed (see the psql error above)"
  fi
  fixes=$(grep -oE 'alter table [^;]+;' "$TMP/dbcheck" || true)
  if [ -z "$fixes" ]; then
    ok "no constraint to fix"
  else
    echo "   These constraints refuse values the code now uses (saving them fails until they are dropped):"
    printf '%s\n' "$fixes" | sed 's/^/     /'
    if confirm "Apply them now?"; then
      printf '%s\n' "$fixes" | psql_exec
      ok "fixes applied"
    else
      fail "fixes not applied: run the lines above, then this script again"
    fi
  fi
else
  skip "the postgres container is not reachable from here"
fi


step "5. Admin account"
ADMIN_EMAIL=${ADMIN_EMAIL:-$(ask "admin email" admin@phova.com)}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-$(ask_secret "admin password")}
printf '{"admin_key":%s,"name":"Admin","email":%s,"password":%s}' \
  "$(json_str "$(env_value ADMIN_KEY)")" "$(json_str "$ADMIN_EMAIL")" "$(json_str "$ADMIN_PASSWORD")" > "$TMP/body"
api POST /api/auth/register-admin "$TMP/body"
if [ "$HTTP" = 200 ]; then
  ok "created $ADMIN_EMAIL"
elif grep -q "already registered" "$TMP/out"; then
  skip "$ADMIN_EMAIL already exists"
else
  die "creating the admin: HTTP $HTTP $(cat "$TMP/out")"
fi

printf '{"email":%s,"password":%s}' "$(json_str "$ADMIN_EMAIL")" "$(json_str "$ADMIN_PASSWORD")" > "$TMP/body"
api POST /api/auth/login "$TMP/body"
[ "$HTTP" = 200 ] || die "cannot sign in as $ADMIN_EMAIL (HTTP $HTTP): wrong password for an existing account?"
grep -q '"Role":"ADMIN"' "$TMP/out" || die "$ADMIN_EMAIL exists but is not an ADMIN"
token=$(sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p' "$TMP/out")
printf 'Authorization: Bearer %s\n' "$token" > "$TMP/auth"
ok "signed in"


step "6. Role accounts (roles_accounts.txt)"
ACCOUNTS_PASSWORD=${ACCOUNTS_PASSWORD:-$(ask_secret "password for all the role accounts")}
# one "email" or "email, Display name" per line; the role is the part before the @, in capitals
while IFS= read -r line || [ -n "$line" ]; do
  line=$(printf '%s' "$line" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  case "$line" in ''|'#'*) continue ;; esac
  email=$(printf '%s' "${line%%,*}" | sed 's/[[:space:]]*$//')
  local_part=${email%%@*}
  role=$(printf '%s' "$local_part" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
  if [ "$line" != "${line#*,}" ]; then
    name=$(printf '%s' "${line#*,}" | sed 's/^[[:space:]]*//')
  elif [ ${#local_part} -le 3 ]; then
    name=$role                                   # hse -> HSE
  else
    name=$(printf '%s' "$local_part" | tr '_-' '  ' \
      | awk '{ for (i = 1; i <= NF; i++) $i = toupper(substr($i, 1, 1)) substr($i, 2) } 1')
  fi
  printf '{"name":%s,"email":%s,"password":%s,"role":%s}' \
    "$(json_str "$name")" "$(json_str "$email")" "$(json_str "$ACCOUNTS_PASSWORD")" "$(json_str "$role")" > "$TMP/body"
  api POST /api/auth/register_manager "$TMP/body"
  if [ "$HTTP" = 200 ]; then
    ok "$email ($role)"
  elif grep -q "already registered" "$TMP/out"; then
    skip "$email already exists (its role and password are not changed)"
  else
    fail "$email ($role): HTTP $HTTP $(cat "$TMP/out")"
  fi
done < roles_accounts.txt


step "7. Quality forms (forms/quality/*.json)"
for form in forms/quality/*.json; do
  api POST /api/v1/forms/ "$form"
  case "$HTTP" in
    201) ok "$(basename "$form")" ;;
    409) skip "$(basename "$form"): an active form already has this title" ;;
    *)   fail "$(basename "$form"): HTTP $HTTP $(cat "$TMP/out")" ;;
  esac
done


step "8. The manager's team (scripts/team_seed.sql)"
TEAM_MANAGER=${TEAM_MANAGER:-manager@phova.com}
if $COMPOSE exec -T postgres true >/dev/null 2>&1; then
  # -At: "INSERT 0 <how many joined>", then "<manager>|<technicians in his team>" (no row: no such MANAGER)
  if psql_exec -At -v manager="$TEAM_MANAGER" < scripts/team_seed.sql > "$TMP/team" 2>&1; then
    joined=$(sed -n 's/^INSERT 0 \([0-9]*\)$/\1/p' "$TMP/team")
    members=$(grep '|' "$TMP/team" | tail -1 | cut -d'|' -f2)
    if [ -z "$members" ]; then
      skip "no MANAGER account $TEAM_MANAGER: add it to roles_accounts.txt"
    elif [ "${joined:-0}" -gt 0 ]; then
      ok "$joined technician(s) joined the team of $TEAM_MANAGER"
    else
      skip "$TEAM_MANAGER already has a team ($members technician(s)): it is left as it is"
    fi
  else
    fail "team seed: $(cat "$TMP/team")"
  fi
else
  skip "the postgres container is not reachable from here"
fi

step "9. Nightly backup (scripts/backup-db.sh)"
# everything the app keeps is in the database (reports, photos, documents): one dump a night, 14 days kept
BACKUP_JOB="30 2 * * * cd $(pwd) && ./scripts/backup-db.sh >> backups/backup.log 2>&1"
if ! command -v crontab >/dev/null 2>&1; then
  skip "no crontab on this machine: schedule ./scripts/backup-db.sh yourself (SERVER_SETUP.md, Backups)"
elif crontab -l 2>/dev/null | grep -qF "scripts/backup-db.sh"; then
  skip "the nightly backup is already scheduled"
else
  mkdir -p backups
  if { crontab -l 2>/dev/null; echo "$BACKUP_JOB"; } | crontab - 2>"$TMP/cron"; then
    ok "scheduled every night at 02:30 (crontab -l shows it); dumps go to ./backups"
  else
    fail "could not schedule the backup: $(cat "$TMP/cron")"
  fi
fi
if $COMPOSE exec -T postgres true >/dev/null 2>&1; then
  if ./scripts/backup-db.sh > "$TMP/backup" 2>&1; then
    ok "$(tail -1 "$TMP/backup")"
  else
    fail "the backup did not run: $(tail -2 "$TMP/backup")"
  fi
else
  skip "the postgres container is not reachable from here: no backup taken now"
fi

if [ "$FAILED" -gt 0 ]; then
  printf '\n%s step(s) failed, see FAIL above. Fix them and run the script again.\n' "$FAILED"
  exit 1
fi
printf '\nDone. Open %s and sign in.\n' "$(env_value FRONT_END_URL)"
