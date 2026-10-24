#!/usr/bin/env bash
# Test de migrations op een tijdelijke database. Vereist een draaiende Postgres (PGHOST/PGPORT/PGUSER).
set -euo pipefail
cd "$(dirname "$0")/.."
db="huurradar_test_$$"
createdb "$db"
trap 'dropdb "$db"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f tests/supabase_stub.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$db" -f tests/migration_test.sql
