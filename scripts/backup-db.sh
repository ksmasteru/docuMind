#!/usr/bin/env bash
# Backs up the GreenSense database: one dump per run, the old ones removed.
#
#   ./scripts/backup-db.sh
#
# Everything the app keeps is in the database: the reports, their photos, the uploaded documents, the
# accounts, the alerts. So one dump is a full backup. Each dump is checked (it must list its content)
# before it replaces nothing: a failed run leaves the earlier dumps untouched.
#
# scripts/init-server.sh installs it as a nightly job (02:30). The dumps stay on this server: copy
# them elsewhere too (SERVER_SETUP.md, "Backups"), or a lost disk loses both.
#
# Settings (environment):
#   BACKUP_DIR        where the dumps go            (default ./backups)
#   BACKUP_KEEP_DAYS  how long a dump is kept       (default 14)
#   COMPOSE_FILE_ARG  the compose file              (default docker-compose.server.yml)
set -euo pipefail
umask 077   # the dumps hold everything: only this user reads them
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f ${COMPOSE_FILE_ARG:-docker-compose.server.yml}"
DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$DIR"
stamp=$(date +%Y%m%d-%H%M%S)
file="$DIR/documind-$stamp.dump"
trap 'rm -f "$file.part"' EXIT

# custom format: compressed, and restorable whole or table by table with pg_restore
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.part"

# a dump that can't list its content is not a backup
tables=$($COMPOSE exec -T postgres pg_restore --list < "$file.part" | grep -c ' TABLE DATA ' || true)
[ "$tables" -gt 0 ] || { echo "backup FAILED: the dump lists no table ($file.part removed)" >&2; exit 1; }

mv "$file.part" "$file"
find "$DIR" -name 'documind-*.dump' -mtime +"$KEEP_DAYS" -delete
kept=$(find "$DIR" -name 'documind-*.dump' | wc -l | tr -d ' ')
echo "$(date '+%Y-%m-%d %H:%M:%S') backup ok: $file ($(du -h "$file" | cut -f1), $tables tables), $kept kept, older than $KEEP_DAYS days removed"
