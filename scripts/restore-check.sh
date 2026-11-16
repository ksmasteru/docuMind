#!/usr/bin/env bash
# Proves a backup can be restored: the latest dump (or the one given) goes into a scratch database,
# its row counts are compared with the live database's, and the scratch database is dropped.
# The live database is only read.
#
#   ./scripts/restore-check.sh                 the latest dump of ./backups
#   ./scripts/restore-check.sh path/to.dump    that one
#
# To restore for real (replacing the live data), see SERVER_SETUP.md, "Backups".
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f ${COMPOSE_FILE_ARG:-docker-compose.server.yml}"
DIR="${BACKUP_DIR:-./backups}"
SCRATCH=documind_restore_check
TABLES="users task task_event check_list_submission check_list_answer images_metadata images_data files alert_case check_report"

dump="${1:-$(ls -t "$DIR"/documind-*.dump 2>/dev/null | head -1 || true)}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "no dump found in $DIR: run ./scripts/backup-db.sh first" >&2; exit 1; }
echo "restoring $dump into the scratch database $SCRATCH…"

pg() { $COMPOSE exec -T postgres sh -c "$1"; }
cleanup() { pg 'dropdb -U "$POSTGRES_USER" --if-exists '"$SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
pg 'createdb -U "$POSTGRES_USER" -T template0 '"$SCRATCH"
# --no-owner: the scratch copy belongs to whoever restores it
pg 'pg_restore -U "$POSTGRES_USER" -d '"$SCRATCH"' --no-owner --exit-on-error' < "$dump"

count() { pg 'psql -U "$POSTGRES_USER" -d '"$1"' -tAc "select count(*) from '"$2"'" 2>/dev/null' | tr -d '[:space:]'; }
failed=0
printf '%-26s %10s %10s\n' "table" "restored" "live now"
for table in $TABLES; do
  restored=$(count "$SCRATCH" "$table" || true)
  live=$(count '"$POSTGRES_DB"' "$table" || true)
  printf '%-26s %10s %10s\n' "$table" "${restored:--}" "${live:--}"
  # a table the live database has rows in must not come back empty or missing
  if [ -n "$live" ] && [ "$live" != 0 ] && { [ -z "$restored" ] || [ "$restored" = 0 ]; }; then failed=1; fi
done

if [ "$failed" = 1 ]; then
  echo "restore check FAILED: a table that has rows came back empty" >&2
  exit 1
fi
echo "restore check ok: the dump restores. (Rows added since the dump explain a higher \"live now\".)"
