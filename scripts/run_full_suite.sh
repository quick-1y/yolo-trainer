#!/usr/bin/env bash
# Runs the full Phase 1 verification suite in one command: backend tests,
# lint/format, frontend tests, frontend build, the compose smoke test, and
# the legacy-CLI git-clean check.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)
cd "$REPO_ROOT"

echo "==> uv run pytest backend/tests..."
uv run pytest backend/tests

echo "==> uv run ruff check backend..."
uv run ruff check backend

echo "==> uv run ruff format --check backend..."
uv run ruff format --check backend

echo "==> npm --prefix frontend run test -- --run..."
npm --prefix frontend run test -- --run

echo "==> npm --prefix frontend run build..."
npm --prefix frontend run build

echo "==> bash scripts/compose_smoke_test.sh..."
bash scripts/compose_smoke_test.sh

echo "==> uv run python scripts/check_cli_run_git_clean.py..."
uv run python scripts/check_cli_run_git_clean.py

echo "ALL CHECKS OK"
