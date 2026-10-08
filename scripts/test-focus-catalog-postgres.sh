#!/usr/bin/env bash
set -euo pipefail
# Creates a separate, disposable CI database; never accepts a live database URL.
if [[ "${LIFERPG_DISPOSABLE_SQL:-}" != "YES" || ! "${LIFERPG_TEST_DATABASE_URL:-}" =~ @localhost:[0-9]+/liferpg_test$ ]]; then
  echo 'Use the isolated localhost LifeRPG test database.' >&2
  exit 1
fi
task_root="$(cd "$(dirname "$0")/.." && pwd)"
task_url="${LIFERPG_TEST_DATABASE_URL%/*}/liferpg_focus_catalog_test"
psql "$LIFERPG_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'create database liferpg_focus_catalog_test'
psql "$task_url" -X -v ON_ERROR_STOP=1 \
  -f "$task_root/tests/sql/focus-catalog-bootstrap.sql" \
  -f "$task_root/tests/sql/focus-catalog-fixtures.sql" \
  -f "$task_root/supabase/migrations/20261008103802_focus_area_catalog.sql" \
  -f "$task_root/supabase/migrations/20261008103802_focus_area_catalog.sql" \
  -f "$task_root/tests/sql/focus-catalog-assertions.sql"
