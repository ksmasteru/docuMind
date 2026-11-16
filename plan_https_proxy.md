# Plan: init-server.sh sets up the HTTPS proxy and firewall

Goal: on a fresh server, `./scripts/init-server.sh` does SERVER_SETUP.md step 3 (Caddy) too, so
nothing is left to do by hand except filling `.env`.

## Flow

- [x] Step 1: if `FRONT_END_URL` is blank, find the public IP, propose `https://<ip-with-dashes>.sslip.io`,
      write it into `.env`
- [x] New step 10 "HTTPS proxy (Caddy)", after the stack is up (`--no-proxy` skips it)
  - [x] skip when `FRONT_END_URL` is not `https://<name>`, or there is no systemd
  - [x] stop (FAIL) when something other than Caddy holds port 80/443 (nginx...): never touch it
  - [x] install Caddy from its official apt repo when missing (Debian/Ubuntu only)
  - [x] write `/etc/caddy/Caddyfile` (`/api/*` -> :8080, the rest -> :5173, 25 MB uploads),
        marked "Managed by init-server.sh"; a Caddyfile with a config of its own is only replaced
        after a y/N, and a copy is kept
  - [x] `caddy validate`, enable + reload, then wait for `https://<host>/` to answer (certificate)
- [x] New step 11 "Firewall (ufw)": ufw already on -> open 80/443; off -> asks, then opens SSH
      (its real port) + 80 + 443 and turns it on. Warns that Docker's ports bypass ufw.
- [x] Root or sudo: commands that need it go through `sudo` when not root
- [x] SERVER_SETUP.md: step 3 now says the script does it; list steps 10 and 11

## Fresh server: nothing by hand but `git clone` + the script (2026-11-16)

- [x] Not root: the script re-runs itself with sudo (Docker, Caddy, ufw, cron all need root)
- [x] Step 0 "Server packages": curl via apt when missing; Docker + compose plugin via the official
      get.docker.com script when missing; makes sure the docker service runs
- [x] `.env` missing: made from .env.server.example. Blank secrets are generated (JWT_SECRET,
      ADMIN_KEY, POSTGRES_PASSWORD = DB_PASSWORD, GRAFANA_ADMIN_PASSWORD); OPENAI_API_KEY is asked.
      POSTGRES_PASSWORD is not generated when a database volume already exists (it would not match).
- [x] `COMPOSE_PROJECT_NAME=documind` written into `.env`: the folder no longer has to be /opt/documind
      (backup-db.sh / restore-check.sh read the same .env through compose)
- [x] The end prints the address, the admin email and the Grafana password
- [x] SERVER_SETUP.md: the fresh-server path is "clone, run the script"

## Not done (needs a decision)

- Binding Docker's 8080/5173/3001 to 127.0.0.1 in docker-compose.server.yml: it would close them
  for real, but Grafana (3001) would then only be reachable through an SSH tunnel or a new proxy route.
