#!/usr/bin/env bash
# End-to-end acceptance check for the Phase 1 walking skeleton (D-27).
# Brings the full compose stack up, exercises create/list through the real
# HTTP path, restarts the stack, and asserts the data survived.
set -euo pipefail

export COMPOSE_PROJECT_NAME=yolo-trainer-smoke
export DATA_DIR=./.smoke-data
export PORT=18080
export BIND_ADDR=127.0.0.1

cleanup() {
  if [ "${KEEP_SMOKE_DATA:-}" = "1" ]; then
    return
  fi
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  # Empty the bind-mounted data dir via a throwaway container so root-owned
  # files created inside the container can still be removed from the host.
  if [ -d "$DATA_DIR" ]; then
    docker compose run --rm --no-deps --entrypoint sh api -c "rm -rf /data/* /data/.[!.]* 2>/dev/null || true" >/dev/null 2>&1 || true
    rm -rf "$DATA_DIR"
  fi
}
trap cleanup EXIT

# Start from a clean slate: remove any leftovers from a previous run.
if [ -d "$DATA_DIR" ]; then
  docker compose run --rm --no-deps --entrypoint sh api -c "rm -rf /data/* /data/.[!.]* 2>/dev/null || true" >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
fi

echo "==> Building and starting the stack..."
docker compose up -d --build --wait --wait-timeout 600

echo "==> Checking web port binds to 127.0.0.1..."
PORT_MAPPING=$(docker compose port web 80)
case "$PORT_MAPPING" in
  127.0.0.1:*) ;;
  *)
    echo "FAIL: web port is not bound to 127.0.0.1 (got: $PORT_MAPPING)" >&2
    exit 1
    ;;
esac

BASE_URL="http://127.0.0.1:${PORT}"

echo "==> Checking SPA is served..."
INDEX_BODY=$(curl -fsS "${BASE_URL}/")
case "$INDEX_BODY" in
  *'id="root"'*) ;;
  *)
    echo "FAIL: SPA index.html does not contain id=\"root\"" >&2
    exit 1
    ;;
esac

echo "==> Checking /api/health is proxied..."
HEALTH_BODY=$(curl -fsS "${BASE_URL}/api/health")
case "$HEALTH_BODY" in
  *'"status":"ok"'*) ;;
  *)
    echo "FAIL: /api/health did not return status ok (got: $HEALTH_BODY)" >&2
    exit 1
    ;;
esac

echo "==> Creating a project through the API..."
PROJECT_NAME="smoke-test-$(date +%s)"
CREATE_BODY=$(curl -fsS -X POST "${BASE_URL}/api/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"${PROJECT_NAME}\", \"task_type\": \"detect\"}")
case "$CREATE_BODY" in
  *"\"name\":\"${PROJECT_NAME}\""*) ;;
  *)
    echo "FAIL: project creation response did not echo the name (got: $CREATE_BODY)" >&2
    exit 1
    ;;
esac

echo "==> Checking the project is listed..."
LIST_BODY=$(curl -fsS "${BASE_URL}/api/projects")
case "$LIST_BODY" in
  *"\"name\":\"${PROJECT_NAME}\""*) ;;
  *)
    echo "FAIL: project list did not contain the created project" >&2
    exit 1
    ;;
esac

echo "==> Checking app.db exists on the host bind mount..."
if [ ! -f "${DATA_DIR}/app.db" ]; then
  echo "FAIL: ${DATA_DIR}/app.db does not exist on the host" >&2
  exit 1
fi

echo "==> Restarting the stack (down/up) to check persistence..."
docker compose down
docker compose up -d --wait --wait-timeout 600

LIST_AFTER_RESTART=$(curl -fsS "${BASE_URL}/api/projects")
case "$LIST_AFTER_RESTART" in
  *"\"name\":\"${PROJECT_NAME}\""*) ;;
  *)
    echo "FAIL: project did not survive down/up" >&2
    exit 1
    ;;
esac

echo "==> Creating 10 projects in quick succession (burst-write check, RESEARCH Pitfall 1)..."
BURST_NAMES=()
for i in $(seq 1 10); do
  NAME="burst-${i}-$(date +%s%N)"
  BURST_NAMES+=("$NAME")
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/projects" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${NAME}\", \"task_type\": \"detect\"}")
  if [ "$STATUS" != "201" ]; then
    echo "FAIL: burst project ${NAME} creation returned HTTP ${STATUS} (expected 201)" >&2
    exit 1
  fi
done

echo "==> Rebuilding and recreating containers (docker compose up -d --build --force-recreate)..."
docker compose up -d --build --force-recreate --wait --wait-timeout 600

echo "==> Checking all projects survived the image rebuild..."
LIST_AFTER_REBUILD=$(curl -fsS "${BASE_URL}/api/projects")
for NAME in "${BURST_NAMES[@]}" "$PROJECT_NAME"; do
  case "$LIST_AFTER_REBUILD" in
    *"\"name\":\"${NAME}\""*) ;;
    *)
      echo "FAIL: project ${NAME} missing after image rebuild" >&2
      exit 1
      ;;
  esac
done

echo "==> Checking database integrity after burst writes and rebuild..."
INTEGRITY_OUTPUT=$(docker compose exec -T api python -c \
  "import sqlite3; conn = sqlite3.connect('/data/app.db'); print(conn.execute('PRAGMA integrity_check').fetchone()[0])" \
  | tr -d '\r\n')
if [ "$INTEGRITY_OUTPUT" != "ok" ]; then
  echo "FAIL: PRAGMA integrity_check returned '${INTEGRITY_OUTPUT}' (expected 'ok')" >&2
  exit 1
fi

echo "==> Checking alembic_version has exactly one row..."
ALEMBIC_ROWS=$(docker compose exec -T api python -c \
  "import sqlite3; conn = sqlite3.connect('/data/app.db'); print(conn.execute('SELECT count(*) FROM alembic_version').fetchone()[0])" \
  | tr -d '\r\n')
if [ "$ALEMBIC_ROWS" != "1" ]; then
  echo "FAIL: alembic_version has ${ALEMBIC_ROWS} row(s) (expected 1)" >&2
  exit 1
fi

echo "SMOKE OK"
