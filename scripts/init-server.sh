#!/usr/bin/env bash
# Sets up a DocuMind server: the steps SERVER_SETUP.md used to list by hand.
# Safe to run again on a server that is already set up: what exists is left as it is.
#
# On a fresh server, right after cloning the repo (anywhere), this is the only command:
#   ./scripts/init-server.sh
#
# What it does:
#   0. installs curl and Docker when missing (Docker's official get.docker.com script)
#   1. creates .env when missing: generates the secrets, asks for the OpenAI key, proposes
#      FRONT_END_URL; creates my-react-app/.env when it is missing
#   2. builds and starts docker-compose.server.yml                (skip: --no-start)
#   3. waits for the backend to answer
#   4. runs forms/server_db_check.sql, and offers to apply the fixes it prints
#   5. creates the admin account
#   6. creates one account per line of roles_accounts.txt; the role is the part before the @
#   7. creates the forms in forms/quality/*.json and forms/workshop/*.json
#  7b. makes the quality control sheets fillable by technicians on a server whose forms predate it
#      (scripts/control_sheets_technicians.sql: adds USER, never removes a role)
#   8. gives the manager his team: the technicians in no team join it (scripts/team_seed.sql),
#      only the first time, so a technician he removed later is not put back
#   9. schedules the nightly backup (scripts/backup-db.sh, 02:30, 14 days kept) and takes one now
#  10. HTTPS proxy: installs Caddy, writes /etc/caddy/Caddyfile for FRONT_END_URL  (skip: --no-proxy)
#  11. firewall: opens SSH, 80 and 443 in ufw (asks before turning ufw on)
#
# The report platform (plan_rapports_platform.md): APP_EDITION=rapports in .env. Step 1 builds the web app
# for it too (VITE_EDITION in my-react-app/.env); steps 6 and 8 are skipped: no shared role accounts, no
# demo team. The admin creates the managers on « Comptes », each manager his technicians.
#
# E-mail notifications stay off until the SPRING_MAIL_* keys are filled in .env (SERVER_SETUP.md):
# optional, so nothing here asks for them.
#
# It asks for the passwords. To run it without questions, set ADMIN_EMAIL, ADMIN_PASSWORD
# and ACCOUNTS_PASSWORD (the one password all the role accounts get).
# TEAM_MANAGER: whose team step 8 fills (default manager@phova.com, from roles_accounts.txt).
# It needs root: not run as root, it runs itself again with sudo.
#
# Options:
#   --no-start        the stack is already running: don't build and start it
#   --no-proxy        don't touch Caddy or the firewall (steps 10 and 11)
#   --base-url URL    where the backend answers (default http://localhost:8080)

set -euo pipefail
umask 077   # the temp files hold the passwords and the token

cd "$(dirname "$0")/.."

# installing Docker and Caddy, the firewall and the backup job all need root
if [ "$(id -u)" != 0 ]; then
  case " $* " in *" -h "*|*" --help "*) ;; *)
    command -v sudo >/dev/null 2>&1 || { echo "error: run this as root (no sudo here)" >&2; exit 1; }
    echo "Not root: running again with sudo."
    exec sudo --preserve-env=ADMIN_EMAIL,ADMIN_PASSWORD,ACCOUNTS_PASSWORD,TEAM_MANAGER,OPENAI_API_KEY \
      bash "$(pwd)/scripts/init-server.sh" "$@"
  esac
fi

COMPOSE="docker compose -f docker-compose.server.yml"
BASE_URL="http://localhost:8080"
START=1
PROXY=1
FAILED=0
SUDO=""
[ "$(id -u)" = 0 ] || SUDO="sudo"

while [ $# -gt 0 ]; do
  case "$1" in
    --no-start) START=0 ;;
    --no-proxy) PROXY=0 ;;
    --base-url) BASE_URL="${2:?--base-url needs a value}"; shift ;;
    -h|--help)  sed -n '2,32p' "$0"; exit 0 ;;
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

# set_env KEY VALUE: writes KEY=VALUE into .env (replaces the line, or adds one)
set_env() {
  if grep -q "^$1=" .env; then
    sed "s|^$1=.*|$1=$2|" .env > "$TMP/env" && cat "$TMP/env" > .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

# setup_proxy HOST: Caddy on 80/443 for HOST, /api/* -> backend :8080, the rest -> frontend :5173
setup_proxy() {
  local host=$1 caddyfile=/etc/caddy/Caddyfile other code

  # another web server on 80/443 (nginx, apache...): leave it alone
  if command -v ss >/dev/null 2>&1; then
    other=$($SUDO ss -tlnp 2>/dev/null | awk '$4 ~ /:(80|443)$/' | grep -v '"caddy"' \
      | grep -oE 'users:\(\("[^"]+"' | sed 's/users:(("//; s/"$//' | sort -u | tr '\n' ' ' || true)
    if [ -n "$other" ]; then
      fail "ports 80/443 are taken by: $other. Stop it (sudo systemctl disable --now <name>) and run this again, or configure it by hand (SERVER_SETUP.md, step 3)"
      return
    fi
  fi

  if command -v caddy >/dev/null 2>&1; then
    ok "Caddy is installed ($(caddy version 2>/dev/null | cut -d' ' -f1))"
  else
    command -v apt-get >/dev/null 2>&1 \
      || { fail "Caddy is not installed, and this is not Debian/Ubuntu: install it (caddyserver.com/docs/install) and run this again"; return; }
    echo "   installing Caddy from its apt repository (a minute)"
    if $SUDO apt-get update -qq >"$TMP/apt" 2>&1 \
      && $SUDO apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >>"$TMP/apt" 2>&1 \
      && curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
           | $SUDO gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
      && curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
           | $SUDO tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null \
      && $SUDO chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list \
      && $SUDO apt-get update -qq >>"$TMP/apt" 2>&1 \
      && $SUDO apt-get install -y -qq caddy >>"$TMP/apt" 2>&1; then
      ok "Caddy installed"
    else
      fail "installing Caddy: $(tail -3 "$TMP/apt")"
      return
    fi
  fi

  cat > "$TMP/Caddyfile" <<EOF
# Managed by documind/scripts/init-server.sh, from FRONT_END_URL in .env.
# It rewrites this file on each run: change .env, not this file.
$host {
	request_body {
		max_size 25MB
	}
	handle /api/* {
		reverse_proxy localhost:8080
	}
	handle {
		reverse_proxy localhost:5173
	}
}
EOF
  if $SUDO cmp -s "$TMP/Caddyfile" "$caddyfile"; then
    skip "$caddyfile is already up to date"
  else
    # a Caddyfile that is neither ours nor the package's ":80" placeholder: ask first
    if $SUDO test -s "$caddyfile" \
      && ! $SUDO grep -q "Managed by documind" "$caddyfile" \
      && ! $SUDO grep -vE '^[[:space:]]*(#|$)' "$caddyfile" | head -1 | grep -qE '^:80[[:space:]]*\{'; then
      echo "   $caddyfile already has a config of its own:"
      $SUDO grep -vE '^[[:space:]]*(#|$)' "$caddyfile" | head -8 | sed 's/^/     /'
      if ! confirm "Replace it (a copy is kept next to it)?"; then
        fail "$caddyfile left as it is: add the routes of SERVER_SETUP.md step 3 to it yourself"
        return
      fi
    fi
    if $SUDO test -f "$caddyfile"; then
      $SUDO cp "$caddyfile" "$caddyfile.bak-$(date +%Y%m%d-%H%M%S)"
    fi
    $SUDO install -m 644 "$TMP/Caddyfile" "$caddyfile"   # caddy runs as its own user: must be readable
    ok "wrote $caddyfile for $host"
  fi

  if ! $SUDO caddy validate --config "$caddyfile" --adapter caddyfile >"$TMP/cv" 2>&1; then
    fail "the Caddyfile is refused: $(tail -2 "$TMP/cv")"
    return
  fi
  $SUDO systemctl enable caddy >/dev/null 2>&1 || true
  if ! $SUDO systemctl reload-or-restart caddy; then
    fail "Caddy did not start. Look at: sudo journalctl -u caddy -n 50"
    return
  fi
  ok "Caddy running"

  # the first time, Caddy needs a little while to get the certificate
  echo "   waiting for https://$host (the certificate, up to 2 minutes)"
  for _ in $(seq 1 24); do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "https://$host/" 2>/dev/null) || code=000
    [ "$code" = 200 ] && break
    sleep 5
  done
  if [ "$code" != 200 ]; then
    fail "https://$host does not answer (last status $code). Ports 80 and 443 must be open to the internet (the hosting provider's firewall too), and $host must point to this server. Look at: sudo journalctl -u caddy -n 50"
    return
  fi
  ok "https://$host answers"
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "https://$host/api/auth/login" 2>/dev/null) || code=000
  case "$code" in
    000|502|503|504) fail "https://$host/api does not reach the backend (status $code)" ;;
    *)               ok "https://$host/api reaches the backend" ;;
  esac
}


step "0. Server packages"
if command -v curl >/dev/null 2>&1; then
  ok "curl"
else
  command -v apt-get >/dev/null 2>&1 || die "curl is not installed: install it and run this again"
  apt-get update -qq >/dev/null && apt-get install -y -qq curl ca-certificates >/dev/null || die "installing curl failed"
  ok "curl installed"
fi
if docker compose version >/dev/null 2>&1; then
  ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || true), $(docker compose version --short 2>/dev/null)"
else
  echo "   installing Docker with its official script, get.docker.com (a few minutes)"
  curl -fsSL https://get.docker.com -o "$TMP/get-docker.sh" || die "cannot download get.docker.com"
  sh "$TMP/get-docker.sh" >"$TMP/docker-install" 2>&1 || die "installing Docker failed: $(tail -5 "$TMP/docker-install")"
  docker compose version >/dev/null 2>&1 || die "Docker is installed but 'docker compose' is not: see $TMP/docker-install"
  ok "Docker installed"
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
docker info >/dev/null 2>&1 || die "the docker service does not answer: systemctl status docker"


step "1. Config files"
if [ -f .env ]; then
  ok ".env exists: only its blank values are filled in"
else
  cp .env.server.example .env
  ok ".env created from .env.server.example"
fi
chmod 600 .env
# compose takes the project name from here, so the volumes are documind_* wherever the repo is
[ -n "$(env_value COMPOSE_PROJECT_NAME)" ] || set_env COMPOSE_PROJECT_NAME documind

# blank secrets: generated. They are only read by the containers, nobody types them.
random_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
if [ -z "$(env_value JWT_SECRET)" ]; then
  set_env JWT_SECRET "$(head -c 32 /dev/urandom | base64 | tr -d '\n')"; ok "JWT_SECRET generated"
fi
if [ -z "$(env_value ADMIN_KEY)" ]; then
  set_env ADMIN_KEY "$(random_hex 32)"; ok "ADMIN_KEY generated"
fi
if [ -z "$(env_value POSTGRES_PASSWORD)" ]; then
  # an existing database keeps the password it was created with: a new one would lock the backend out
  if docker volume ls -q | grep -qx "$(env_value COMPOSE_PROJECT_NAME)_postgres_data"; then
    die "POSTGRES_PASSWORD is blank but a database already exists: put its password in .env (POSTGRES_PASSWORD and DB_PASSWORD)"
  fi
  pg_pw=$(random_hex 24)
  set_env POSTGRES_PASSWORD "$pg_pw"
  set_env DB_PASSWORD "$pg_pw"
  ok "POSTGRES_PASSWORD and DB_PASSWORD generated"
elif [ -z "$(env_value DB_PASSWORD)" ]; then
  set_env DB_PASSWORD "$(env_value POSTGRES_PASSWORD)"
fi
GRAFANA_NEW=""
if [ -z "$(env_value GRAFANA_ADMIN_PASSWORD)" ]; then
  GRAFANA_NEW=$(random_hex 12)
  set_env GRAFANA_ADMIN_PASSWORD "$GRAFANA_NEW"; ok "GRAFANA_ADMIN_PASSWORD generated (shown at the end)"
fi
# the one secret that cannot be made up here
if [ -z "$(env_value OPENAI_API_KEY)" ]; then
  if [ -n "${OPENAI_API_KEY:-}" ]; then
    key=$OPENAI_API_KEY
  elif [ -t 0 ]; then
    read -r -s -p "   OpenAI API key (sk-...): " key </dev/tty; echo
  else
    key=""
  fi
  [ -n "$key" ] || die "OPENAI_API_KEY is blank: run this again in a terminal, or set OPENAI_API_KEY"
  set_env OPENAI_API_KEY "$key"
  ok "OPENAI_API_KEY written to .env"
fi
# FRONT_END_URL blank: propose the sslip.io address of this server's public IP (2.31.83.75 -> 2-31-83-75.sslip.io)
if [ -z "$(env_value FRONT_END_URL)" ] && [ -t 0 ]; then
  ip=$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)
  if printf '%s' "$ip" | grep -qE '^[0-9]+(\.[0-9]+){3}$'; then
    url=$(ask "FRONT_END_URL is blank. The address people will open" "https://$(printf '%s' "$ip" | tr . -).sslip.io")
    url=${url%/}
    set_env FRONT_END_URL "$url"
    ok "FRONT_END_URL=$url written to .env"
  fi
fi
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

# the report platform (APP_EDITION=rapports): the web app is built with the same choice, VITE_EDITION, read
# when its image is built at step 2. Any other value removes it: the full platform
EDITION=$(env_value APP_EDITION)
{ grep -v '^VITE_EDITION=' my-react-app/.env || true; } > "$TMP/webenv"
if [ "$EDITION" = rapports ]; then
  echo 'VITE_EDITION=rapports' >> "$TMP/webenv"
  ok "the report platform (APP_EDITION=rapports): the web app is built for it"
fi
cat "$TMP/webenv" > my-react-app/.env


if [ "$START" = 1 ]; then
  step "2. Build and start the stack (a few minutes the first time)"
  # --remove-orphans: a container whose service left docker-compose.server.yml is removed (analysis-service,
  # 2026-11-25, plan_remove_analysis_service.md). Volumes, and so the data, are not touched.
  $COMPOSE up -d --build --remove-orphans
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
if [ "$EDITION" = rapports ]; then
  skip "the report platform: no shared role accounts. The admin creates the managers on « Comptes »"
else
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
fi


step "7. Forms (forms/quality/*.json, forms/workshop/*.json)"
for form in forms/quality/*.json forms/workshop/*.json; do
  [ -e "$form" ] || continue
  api POST /api/v1/forms/ "$form"
  case "$HTTP" in
    201) ok "$(basename "$form")" ;;
    409) skip "$(basename "$form"): an active form already has this title" ;;
    *)   fail "$(basename "$form"): HTTP $HTTP $(cat "$TMP/out")" ;;
  esac
done


step "7b. Control sheets fillable by technicians (scripts/control_sheets_technicians.sql)"
# forms created before 2026-11-21 still say QUALITY only: add USER where it's missing (never removes a role)
if $COMPOSE exec -T postgres true >/dev/null 2>&1; then
  if psql_exec -At < scripts/control_sheets_technicians.sql > "$TMP/sheets" 2>&1; then
    added=$(sed -n 's/^UPDATE \([0-9]*\)$/\1/p' "$TMP/sheets")
    if [ "${added:-0}" -gt 0 ]; then
      ok "$added control sheet(s) now fillable by technicians"
    else
      skip "the control sheets already list USER"
    fi
  else
    fail "control sheets: $(cat "$TMP/sheets")"
  fi
else
  skip "the postgres container is not reachable from here"
fi


step "7c. HDX is no longer a pump model (scripts/hdx_removed.sql)"
# since 2026-11-24 (plan_pump_manuals.md): the simulated HDX pumps' alerts follow them to PHB2 (same number), the
# old model rows go (a registered pump's model too, on the full platform: no registry here). A second run changes nothing.
if $COMPOSE exec -T postgres true >/dev/null 2>&1; then
  if psql_exec -At < scripts/hdx_removed.sql > "$TMP/hdx" 2>&1; then
    if grep -qE '^(UPDATE|DELETE) [1-9]' "$TMP/hdx"; then
      ok "HDX moved: $(grep -E '^(UPDATE|DELETE) [1-9]' "$TMP/hdx" | tr '\n' ' ')"
    else
      skip "nothing says HDX any more"
    fi
  else
    fail "HDX: $(cat "$TMP/hdx")"
  fi
else
  skip "the postgres container is not reachable from here"
fi


step "8. The manager's team (scripts/team_seed.sql)"
TEAM_MANAGER=${TEAM_MANAGER:-manager@phova.com}
if [ "$EDITION" = rapports ]; then
  skip "the report platform: each manager creates his technicians, who join his team"
elif $COMPOSE exec -T postgres true >/dev/null 2>&1; then
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


step "10. HTTPS proxy (Caddy)"
front=$(env_value FRONT_END_URL)
front=${front%/}
host=$(printf '%s' "$front" | sed -E 's#^https://##; s#[/:].*$##')
if [ "$PROXY" = 0 ]; then
  skip "--no-proxy"
elif [ "${front#https://}" = "$front" ] || [ -z "$host" ] || [ "$host" = localhost ] \
  || printf '%s' "$host" | grep -qE '^[0-9.]+$'; then
  skip "FRONT_END_URL ($front) is not https://<a name>: no certificate possible, no proxy set up"
elif ! command -v systemctl >/dev/null 2>&1; then
  skip "no systemd on this machine: set up the proxy by hand (SERVER_SETUP.md, step 3)"
else
  setup_proxy "$host"
fi


step "11. Firewall (ufw): only SSH, 80 and 443 open"
if [ "$PROXY" = 0 ]; then
  skip "--no-proxy"
elif ! command -v ufw >/dev/null 2>&1; then
  skip "no ufw on this machine: open ports 80 and 443 in whatever firewall it has"
else
  # the SSH port to keep open: the one this session came in on, and the one sshd is set to
  ssh_ports=$( { [ -n "${SSH_CONNECTION:-}" ] && echo "${SSH_CONNECTION##* }"
                 $SUDO sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }'
                 echo 22; } | sort -un | tr '\n' ' ')
  if $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
    $SUDO ufw allow 80/tcp >/dev/null && $SUDO ufw allow 443/tcp >/dev/null
    ok "ufw is on: 80 and 443 allowed"
  elif confirm "ufw is off. Turn it on, with only ports ${ssh_ports}(SSH), 80 and 443 open?"; then
    for p in $ssh_ports; do $SUDO ufw allow "$p/tcp" >/dev/null; done
    $SUDO ufw allow 80/tcp >/dev/null && $SUDO ufw allow 443/tcp >/dev/null
    $SUDO ufw --force enable >/dev/null
    ok "ufw on: ${ssh_ports}80, 443 open"
  else
    skip "ufw left off"
  fi
  echo "   note  Docker publishes 8080, 5173 and 3001 itself, around ufw: they stay reachable on the server's IP"
fi

if [ "$FAILED" -gt 0 ]; then
  printf '\n%s step(s) failed, see FAIL above. Fix them and run the script again.\n' "$FAILED"
  exit 1
fi
printf '\nDone. Open %s and sign in as %s.\n' "$(env_value FRONT_END_URL)" "$ADMIN_EMAIL"
if [ -n "$GRAFANA_NEW" ]; then
  printf 'Grafana (port 3001): admin / %s  (kept in .env as GRAFANA_ADMIN_PASSWORD)\n' "$GRAFANA_NEW"
fi
