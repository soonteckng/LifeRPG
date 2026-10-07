#!/usr/bin/env bash
set -euo pipefail
# Existing disposable EMPTY database only. Never supply a live URL.
if [[ "${LIFERPG_DISPOSABLE_SQL:-}" != "YES" || -z "${LIFERPG_TEST_DATABASE_URL:-}" ]]; then
  echo 'Set LIFERPG_DISPOSABLE_SQL=YES and LIFERPG_TEST_DATABASE_URL to a disposable empty database.' >&2
  exit 1
fi
task_root="$(cd "$(dirname "$0")/.." && pwd)"
for task_file in tests/sql/progression-bootstrap.sql docs/progression-live-contract.sql tests/sql/progression-fixtures.sql docs/exact-seconds-credit.sql tests/exact-seconds-credit.sql docs/goal-completion-base.sql docs/daily-goal-exact-credit.sql tests/daily-goal-exact-credit.sql tests/exact-seconds-credit.sql; do
  psql "$LIFERPG_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$task_root/$task_file"
done
