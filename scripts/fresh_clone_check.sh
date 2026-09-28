#!/usr/bin/env bash
# Rehearses README.md's developer setup steps against a fresh `git clone` of
# the committed HEAD, in a throwaway temp directory (FOUND-01). Never touches
# the working tree it is run from.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)

CLONE_DIR=$(mktemp -d)

cleanup() {
  rm -rf "$CLONE_DIR"
}
trap cleanup EXIT

echo "==> Cloning committed HEAD into a temporary directory..."
git clone --quiet "$REPO_ROOT" "$CLONE_DIR"

cd "$CLONE_DIR"

echo "==> uv sync --locked..."
uv sync --locked

echo "==> uv run pytest backend/tests -x -q..."
uv run pytest backend/tests -x -q

echo "==> npm --prefix frontend ci..."
npm --prefix frontend ci

echo "==> npm --prefix frontend run test -- --run..."
npm --prefix frontend run test -- --run

echo "FRESH CLONE OK"
