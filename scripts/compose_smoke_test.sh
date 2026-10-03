#!/usr/bin/env bash
# End-to-end acceptance check for the Phase 1 walking skeleton (D-27).
# Brings the full compose stack up, exercises create/list through the real
# HTTP path, restarts the stack, and asserts the data survived.
set -euo pipefail

export COMPOSE_PROJECT_NAME=yolo-trainer-smoke
export DATA_DIR=./.smoke-data
export PORT=18080
export BIND_ADDR=127.0.0.1
# Small upload limit so the limit checks below need only a few MB of test data.
export MAX_UPLOAD_MB=2

cleanup() {
  if [ -n "${SMOKE_TMP:-}" ]; then
    rm -rf "$SMOKE_TMP"
  fi
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

echo "==> Uploading images through the API (Phase 2 tracer, DATA-01)..."
PROJECT_ID=$(printf '%s' "$CREATE_BODY" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$PROJECT_ID" ]; then
  echo "FAIL: could not parse the project id from: $CREATE_BODY" >&2
  exit 1
fi

# 16x16 PNG (83 bytes). Relative paths + a subshell cd keep Git Bash/MSYS from
# rewriting the curl -F "files=@..." argument into a host path.
SMOKE_TMP=$(mktemp -d)
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGklEQVR42mM8oaHBQApgYiARjGoY1TB0NAAAjC0BOJDndDkAAAAASUVORK5CYII=' | base64 -d > "${SMOKE_TMP}/tiny.png"
printf 'this is not an image' > "${SMOKE_TMP}/x.jpg"
IMAGES_URL="${BASE_URL}/api/projects/${PROJECT_ID}/images"

NOHEADER_STATUS=$(cd "$SMOKE_TMP" && curl -s -o /dev/null -w "%{http_code}" -F "files=@tiny.png;type=image/png" "$IMAGES_URL")
if [ "$NOHEADER_STATUS" != "403" ]; then
  echo "FAIL: upload without X-Requested-With returned HTTP ${NOHEADER_STATUS} (expected 403)" >&2
  exit 1
fi

ADDED_BODY=$(cd "$SMOKE_TMP" && curl -fsS -H "X-Requested-With: yolo-trainer" -F "files=@tiny.png;type=image/png" "$IMAGES_URL")
case "$ADDED_BODY" in
  *'"status":"added"'*) ;;
  *)
    echo "FAIL: PNG upload was not reported as added (got: $ADDED_BODY)" >&2
    exit 1
    ;;
esac
IMAGE_ID=$(printf '%s' "$ADDED_BODY" | sed -n 's/.*"image":{"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$IMAGE_ID" ]; then
  echo "FAIL: could not parse the image id from: $ADDED_BODY" >&2
  exit 1
fi

REJECTED_BODY=$(cd "$SMOKE_TMP" && curl -fsS -H "X-Requested-With: yolo-trainer" -F "files=@x.jpg;type=image/jpeg" "$IMAGES_URL")
case "$REJECTED_BODY" in
  *'"status":"rejected"'*) ;;
  *)
    echo "FAIL: a text file named x.jpg was not rejected (got: $REJECTED_BODY)" >&2
    exit 1
    ;;
esac

DUPLICATE_BODY=$(cd "$SMOKE_TMP" && curl -fsS -H "X-Requested-With: yolo-trainer" -F "files=@tiny.png;type=image/png" "$IMAGES_URL")
case "$DUPLICATE_BODY" in
  *'"status":"duplicate"'*) ;;
  *)
    echo "FAIL: re-uploading the same PNG was not reported as duplicate (got: $DUPLICATE_BODY)" >&2
    exit 1
    ;;
esac

IMAGES_LIST=$(curl -fsS "$IMAGES_URL")
case "$IMAGES_LIST" in
  *'"total":1'*) ;;
  *)
    echo "FAIL: image list total is not 1 (got: $IMAGES_LIST)" >&2
    exit 1
    ;;
esac

THUMB_RESULT=$(curl -sS -o /dev/null -w "%{http_code} %{content_type}" "${IMAGES_URL}/${IMAGE_ID}/thumbnail")
if [ "$THUMB_RESULT" != "200 image/webp" ]; then
  echo "FAIL: thumbnail returned '${THUMB_RESULT}' (expected '200 image/webp')" >&2
  exit 1
fi

echo "==> Creating a class and checking project counts (CLS-01, SC4 setup)..."
CLASSES_URL="${BASE_URL}/api/projects/${PROJECT_ID}/classes"
CLASS_RESPONSE=$(curl -sS -w '\n%{http_code}' -X POST "$CLASSES_URL" \
  -H "Content-Type: application/json" \
  -d '{"name": "car"}')
CLASS_STATUS=$(printf '%s' "$CLASS_RESPONSE" | tail -n 1)
CLASS_BODY=$(printf '%s' "$CLASS_RESPONSE" | sed '$d')
if [ "$CLASS_STATUS" != "201" ]; then
  echo "FAIL: creating class 'car' returned HTTP ${CLASS_STATUS} (expected 201; body: $CLASS_BODY)" >&2
  exit 1
fi
case "$CLASS_BODY" in
  *'"index":0'*'"color":"#E6194B"'* | *'"color":"#E6194B"'*'"index":0'*) ;;
  *)
    echo "FAIL: class 'car' lacks index 0 / color #E6194B (got: $CLASS_BODY)" >&2
    exit 1
    ;;
esac

PROJECT_DETAIL=$(curl -fsS "${BASE_URL}/api/projects/${PROJECT_ID}")
case "$PROJECT_DETAIL" in
  *'"image_count":1'*'"class_count":1'* | *'"class_count":1'*'"image_count":1'*) ;;
  *)
    echo "FAIL: project response lacks image_count 1 / class_count 1 (got: $PROJECT_DETAIL)" >&2
    exit 1
    ;;
esac

echo "==> Checking image files exist on the host at the id-keyed paths (D-18)..."
for IMAGE_FILE in \
  "${DATA_DIR}/projects/${PROJECT_ID}/images/${IMAGE_ID}.png" \
  "${DATA_DIR}/projects/${PROJECT_ID}/thumbs/${IMAGE_ID}.webp"; do
  if [ ! -f "$IMAGE_FILE" ]; then
    echo "FAIL: ${IMAGE_FILE} does not exist on the host" >&2
    exit 1
  fi
done

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

echo "==> Checking uploaded images survived down/up (SC4)..."
IMAGES_AFTER_RESTART=$(curl -fsS "$IMAGES_URL")
case "$IMAGES_AFTER_RESTART" in
  *'"total":1'*) ;;
  *)
    echo "FAIL: image list did not survive down/up (got: $IMAGES_AFTER_RESTART)" >&2
    exit 1
    ;;
esac
THUMB_AFTER_RESTART=$(curl -sS -o /dev/null -w "%{http_code}" "${IMAGES_URL}/${IMAGE_ID}/thumbnail")
if [ "$THUMB_AFTER_RESTART" != "200" ]; then
  echo "FAIL: thumbnail returned HTTP ${THUMB_AFTER_RESTART} after down/up (expected 200)" >&2
  exit 1
fi

echo "==> Checking GET /classes survived down/up (SC4)..."
CLASSES_AFTER_RESTART=$(curl -fsS "$CLASSES_URL")
case "$CLASSES_AFTER_RESTART" in
  *'"name":"car"'*) ;;
  *)
    echo "FAIL: class 'car' did not survive down/up (got: $CLASSES_AFTER_RESTART)" >&2
    exit 1
    ;;
esac
case "$CLASSES_AFTER_RESTART" in
  *'"index":0'*) ;;
  *)
    echo "FAIL: class 'car' lost index 0 after down/up (got: $CLASSES_AFTER_RESTART)" >&2
    exit 1
    ;;
esac

echo "==> Checking upload limits through nginx (D-03, MAX_UPLOAD_MB=2)..."
NGINX_CONF=$(docker compose exec -T web nginx -T 2>/dev/null)
case "$NGINX_CONF" in
  *'client_max_body_size 2m;'*) ;;
  *)
    echo "FAIL: rendered nginx config lacks 'client_max_body_size 2m;' for the upload route" >&2
    exit 1
    ;;
esac
case "$NGINX_CONF" in
  *'client_max_body_size 1m;'*) ;;
  *)
    echo "FAIL: rendered nginx config lacks the server-level 'client_max_body_size 1m;'" >&2
    exit 1
    ;;
esac

# A separate project keeps the tracer assertions above (total 1 before/after
# restart) untouched.
LIMITS_NAME="smoke-limits-$(date +%s)"
LIMITS_CREATE=$(curl -fsS -X POST "${BASE_URL}/api/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"${LIMITS_NAME}\", \"task_type\": \"detect\"}")
LIMITS_ID=$(printf '%s' "$LIMITS_CREATE" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$LIMITS_ID" ]; then
  echo "FAIL: could not parse the limits project id from: $LIMITS_CREATE" >&2
  exit 1
fi
LIMITS_URL="${BASE_URL}/api/projects/${LIMITS_ID}/images"

# Solid-color BMPs (uncompressed, so size is exact) generated inside the api
# container into the bind-mounted data root. Scoped MSYS_NO_PATHCONV so the
# absolute interpreter path is not rewritten by Git Bash.
MSYS_NO_PATHCONV=1 docker compose exec -T api /app/.venv/bin/python -c "
from PIL import Image
for name, size, color in (
    ('smoke-medium.bmp', (800, 600), (200, 30, 30)),
    ('smoke-edge.bmp', (830, 823), (30, 200, 30)),
    ('smoke-large.bmp', (1100, 1000), (30, 30, 200)),
):
    Image.new('RGB', size, color).save('/data/' + name)
"
for BMP in smoke-medium.bmp smoke-edge.bmp smoke-large.bmp; do
  if [ ! -f "${DATA_DIR}/${BMP}" ]; then
    echo "FAIL: ${DATA_DIR}/${BMP} was not generated" >&2
    exit 1
  fi
done

MEDIUM_BODY=$(cd "$DATA_DIR" && curl -sS -H "X-Requested-With: yolo-trainer" -F "files=@smoke-medium.bmp;type=image/bmp" "$LIMITS_URL")
case "$MEDIUM_BODY" in
  *'"status":"added"'*) ;;
  *)
    echo "FAIL: 1.44 MB BMP was not added through nginx (got: $MEDIUM_BODY)" >&2
    exit 1
    ;;
esac

EDGE_BODY=$(cd "$DATA_DIR" && curl -sS -H "X-Requested-With: yolo-trainer" -F "files=@smoke-edge.bmp;type=image/bmp" "$LIMITS_URL")
case "$EDGE_BODY" in
  *'"status":"rejected"'*'larger than 2 MB'*) ;;
  *)
    echo "FAIL: 2.05 MB BMP was not rejected by the api as 'larger than 2 MB' (got: $EDGE_BODY)" >&2
    exit 1
    ;;
esac

LARGE_STATUS=$(cd "$DATA_DIR" && curl -s -o /dev/null -w "%{http_code}" -H "X-Requested-With: yolo-trainer" -F "files=@smoke-large.bmp;type=image/bmp" "$LIMITS_URL" || true)
if [ "$LARGE_STATUS" != "413" ]; then
  echo "FAIL: 3.3 MB BMP returned HTTP ${LARGE_STATUS} (expected 413 from nginx)" >&2
  exit 1
fi

# Other routes keep the 1 MiB body limit.
head -c 1500000 /dev/zero | tr '\0' 'a' > "${SMOKE_TMP}/big.json"
BIGJSON_STATUS=$(cd "$SMOKE_TMP" && curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/projects" \
  -H "Content-Type: application/json" --data-binary @big.json || true)
if [ "$BIGJSON_STATUS" != "413" ]; then
  echo "FAIL: 1.5 MB JSON body to /api/projects returned HTTP ${BIGJSON_STATUS} (expected 413)" >&2
  exit 1
fi

# The upload location must still carry the server-level security headers.
LIMITS_HEADERS=$(curl -sS -D - -o /dev/null "$LIMITS_URL")
case "$LIMITS_HEADERS" in
  *[Xx]-[Cc]ontent-[Tt]ype-[Oo]ptions:*nosniff*) ;;
  *)
    echo "FAIL: upload route response lacks X-Content-Type-Options: nosniff" >&2
    exit 1
    ;;
esac
case "$LIMITS_HEADERS" in
  *[Cc]ontent-[Ss]ecurity-[Pp]olicy:*) ;;
  *)
    echo "FAIL: upload route response lacks Content-Security-Policy" >&2
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

echo "==> Checking GET /classes and the image list survived the image rebuild (SC4)..."
CLASSES_AFTER_REBUILD=$(curl -fsS "$CLASSES_URL")
case "$CLASSES_AFTER_REBUILD" in
  *'"name":"car"'*'"index":0'* | *'"index":0'*'"name":"car"'*) ;;
  *)
    echo "FAIL: class 'car' (index 0) missing after image rebuild (got: $CLASSES_AFTER_REBUILD)" >&2
    exit 1
    ;;
esac
IMAGES_AFTER_REBUILD=$(curl -fsS "$IMAGES_URL")
case "$IMAGES_AFTER_REBUILD" in
  *'"total":1'*) ;;
  *)
    echo "FAIL: image list did not survive the image rebuild (got: $IMAGES_AFTER_REBUILD)" >&2
    exit 1
    ;;
esac

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

echo "==> Checking worker heartbeat file exists with cuda_available..."
if ! grep -q '"cuda_available"' "${DATA_DIR}/worker/heartbeat.json" 2>/dev/null; then
  echo "FAIL: ${DATA_DIR}/worker/heartbeat.json missing or lacks cuda_available" >&2
  exit 1
fi

echo "==> Checking worker's real torch/ultralytics versions (D-17)..."
# Scoped (not exported globally): on Git Bash/MSYS, an absolute-looking arg
# like /app/.venv/bin/python gets silently rewritten to a host path (e.g.
# C:/Program Files/Git/app/...) before reaching `docker compose exec`.
# MSYS_NO_PATHCONV=1 disables that specifically for this command; it must
# NOT be exported for the whole script, since the same conversion is what
# lets the `-o /dev/null` curl calls above work at all on Windows.
WORKER_VERSIONS=$(MSYS_NO_PATHCONV=1 docker compose exec -T worker /app/.venv/bin/python -c \
  "import torch, ultralytics; print(torch.__version__); print(ultralytics.__version__)")
case "$WORKER_VERSIONS" in
  *"2.14.0"*"8.4.159"*) ;;
  *)
    echo "FAIL: worker torch/ultralytics versions unexpected (got: $WORKER_VERSIONS)" >&2
    exit 1
    ;;
esac

echo "==> Checking the api image stays torch-free (D-17, RESEARCH Pitfall 4)..."
if ! MSYS_NO_PATHCONV=1 docker compose exec -T api /app/.venv/bin/python -c \
  "import importlib.util, sys; sys.exit(1 if importlib.util.find_spec('torch') else 0)"; then
  echo "FAIL: torch is importable in the api image" >&2
  exit 1
fi

echo "==> Comparing api vs worker image sizes (api must stay smaller)..."
API_SIZE=$(docker image inspect --format '{{.Size}}' yolo-trainer-api:local)
WORKER_SIZE=$(docker image inspect --format '{{.Size}}' yolo-trainer-worker:cpu)
echo "    api image:    ${API_SIZE} bytes"
echo "    worker image: ${WORKER_SIZE} bytes"
if [ "$API_SIZE" -ge "$WORKER_SIZE" ]; then
  echo "FAIL: api image (${API_SIZE}) is not smaller than worker image (${WORKER_SIZE})" >&2
  exit 1
fi

echo "SMOKE OK"
