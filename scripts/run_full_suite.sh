#!/usr/bin/env bash
# Runs the full verification suite in one command: backend tests, the real CPU
# training tests (`training` marker), lint/format, frontend tests, frontend build,
# the compose smoke test, and the legacy-CLI git-clean check.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)
cd "$REPO_ROOT"

echo "==> uv run pytest backend/tests..."
uv run pytest backend/tests

echo "==> uv run pytest -m training backend/tests (real CPU training; needs yolo26n.pt or internet)..."
uv run pytest -m training backend/tests

echo "==> uv run ruff check backend..."
uv run ruff check backend

echo "==> uv run ruff format --check backend..."
uv run ruff format --check backend

echo "==> uv run ruff check scripts/seed_images.py..."
uv run ruff check scripts/seed_images.py

echo "==> uv run ruff format --check scripts/seed_images.py..."
uv run ruff format --check scripts/seed_images.py

echo "==> uv run ruff check scripts/verify_model_download.py..."
uv run ruff check scripts/verify_model_download.py

echo "==> uv run ruff format --check scripts/verify_model_download.py..."
uv run ruff format --check scripts/verify_model_download.py

echo "==> npm --prefix frontend run test -- --run..."
npm --prefix frontend run test -- --run

echo "==> npm --prefix frontend run build..."
npm --prefix frontend run build

echo "==> bash scripts/compose_smoke_test.sh..."
bash scripts/compose_smoke_test.sh

echo "==> uv run python scripts/check_cli_run_git_clean.py..."
uv run python scripts/check_cli_run_git_clean.py

echo "ALL CHECKS OK"
