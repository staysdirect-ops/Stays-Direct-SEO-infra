#!/usr/bin/env bash
# Starts a throwaway Postgres 16 with PostGIS and pg_cron for scripts/db-test/run.sh.
# Ubuntu/Debian only (used by CI). Prints the env vars to export.
set -euo pipefail
PGVER="${PGVER:-16}"
DATA="${PGDATA_DIR:-/tmp/sd-pg}"
PORT="${PGPORT:-54329}"
BIN="/usr/lib/postgresql/${PGVER}/bin"

if ! ls /usr/share/postgresql/${PGVER}/extension/postgis.control >/dev/null 2>&1 || ! ls /usr/share/postgresql/${PGVER}/extension/pg_cron.control >/dev/null 2>&1; then
  sudo apt-get update -q
  sudo apt-get install -y -q "postgresql-${PGVER}" "postgresql-${PGVER}-postgis-3" "postgresql-${PGVER}-cron"
fi

rm -rf "$DATA"
mkdir -p "$DATA"
"$BIN/initdb" -D "$DATA/data" -A trust -U postgres >/dev/null
cat >> "$DATA/data/postgresql.conf" <<CONF
shared_preload_libraries = 'pg_cron'
cron.database_name = 'staysdirect_test'
listen_addresses = ''
unix_socket_directories = '$DATA'
port = $PORT
CONF
"$BIN/pg_ctl" -D "$DATA/data" -l "$DATA/log" -w start >/dev/null
echo "PGHOST=$DATA"
echo "PGPORT=$PORT"
