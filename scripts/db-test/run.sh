#!/usr/bin/env bash
# Builds a throwaway database from supabase/migrations (plus Supabase stubs) and runs assertions.
# Needs a Postgres 15+ server with PostGIS and pg_cron (shared_preload_libraries=pg_cron,
# cron.database_name=<db>). Connection comes from the usual PG* env vars.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${DB_TEST_NAME:-staysdirect_test}"
export PGUSER="${PGUSER:-postgres}"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists ${DB} with (force)" -c "create database ${DB}"
psql -v ON_ERROR_STOP=1 -q -d "${DB}" -c "alter database ${DB} set search_path = public, extensions"
psql -v ON_ERROR_STOP=1 -q -d "${DB}" -f scripts/db-test/supabase-stubs.sql

HAS_PG_NET=$(psql -tAq -d "${DB}" -c "select count(*) from pg_available_extensions where name = 'pg_net'")
for f in supabase/migrations/*.sql; do
  echo "applying ${f}"
  if [ "${HAS_PG_NET}" = "0" ]; then
    # pg_net is Supabase-specific; supabase-stubs.sql provides net.http_post instead.
    sed 's/^create extension if not exists pg_net;$/-- pg_net stubbed/' "${f}" | psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "${DB}"
  else
    psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "${DB}" -f "${f}"
  fi
done

psql -v ON_ERROR_STOP=1 -q -d "${DB}" -f scripts/db-test/assertions.sql
