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

# The first training run downloads its official weights unless they are already
# cached under DATA_DIR/weights; reuse the git-ignored copy in the repo root so the
# smoke test does not depend on the internet (Phase 4).
if [ -f yolo26n.pt ]; then
  mkdir -p "$DATA_DIR/weights"
  cp yolo26n.pt "$DATA_DIR/weights/yolo26n.pt"
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

echo "==> Drawing a box through the annotations API (Phase 3 tracer, ANNO-07)..."
CLASS_ID=$(printf '%s' "$CLASS_BODY" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$CLASS_ID" ]; then
  echo "FAIL: could not parse the class id from: $CLASS_BODY" >&2
  exit 1
fi
ANNOTATIONS_URL="${IMAGES_URL}/${IMAGE_ID}/annotations"
BOX_ID=3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f
BOX_PAYLOAD="{\"base_version\":0,\"is_background\":false,\"is_reviewed\":false,\"boxes\":[{\"id\":\"${BOX_ID}\",\"class_id\":${CLASS_ID},\"x\":0.1,\"y\":0.1,\"w\":0.5,\"h\":0.5}]}"

NOXHR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$ANNOTATIONS_URL" \
  -H "Content-Type: application/json" -d "$BOX_PAYLOAD")
if [ "$NOXHR_STATUS" != "403" ]; then
  echo "FAIL: PUT annotations without X-Requested-With returned HTTP ${NOXHR_STATUS} (expected 403)" >&2
  exit 1
fi

SAVE_BODY=$(curl -sS -X PUT "$ANNOTATIONS_URL" \
  -H "Content-Type: application/json" -H "X-Requested-With: yolo-trainer" -d "$BOX_PAYLOAD")
case "$SAVE_BODY" in
  *'"version":1'*'"box_count":1'*'"status":"annotated"'*) ;;
  *)
    echo "FAIL: saving a box did not return version 1 / box_count 1 / annotated (got: $SAVE_BODY)" >&2
    exit 1
    ;;
esac

ANNOTATIONS_BODY=$(curl -fsS "$ANNOTATIONS_URL")
case "$ANNOTATIONS_BODY" in
  *"\"id\":\"${BOX_ID}\""*) ;;
  *)
    echo "FAIL: GET annotations does not list the saved box (got: $ANNOTATIONS_BODY)" >&2
    exit 1
    ;;
esac

IMAGES_WITH_BOX=$(curl -fsS "$IMAGES_URL")
case "$IMAGES_WITH_BOX" in
  *'"box_count":1'*) ;;
  *)
    echo "FAIL: image list does not report box_count 1 (got: $IMAGES_WITH_BOX)" >&2
    exit 1
    ;;
esac

EDITOR_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/projects/${PROJECT_ID}/annotate/${IMAGE_ID}")
if [ "$EDITOR_STATUS" != "200" ]; then
  echo "FAIL: the editor deep link returned HTTP ${EDITOR_STATUS} through nginx (expected 200)" >&2
  exit 1
fi

STALE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$ANNOTATIONS_URL" \
  -H "Content-Type: application/json" -H "X-Requested-With: yolo-trainer" \
  -d '{"base_version":0,"is_background":false,"is_reviewed":false,"boxes":[]}')
if [ "$STALE_STATUS" != "409" ]; then
  echo "FAIL: a stale base_version returned HTTP ${STALE_STATUS} (expected 409)" >&2
  exit 1
fi

echo "==> Checking image files exist on the host at the id-keyed paths (D-18)..."
for IMAGE_FILE in \
  "${DATA_DIR}/projects/${PROJECT_ID}/images/${IMAGE_ID}.png" \
  "${DATA_DIR}/projects/${PROJECT_ID}/thumbs/${IMAGE_ID}.webp"; do
  if [ ! -f "$IMAGE_FILE" ]; then
    echo "FAIL: ${IMAGE_FILE} does not exist on the host" >&2
    exit 1
  fi
done

echo "==> Training a detect project through the worker (Phase 4 tracer)..."
TRAIN_CREATE=$(curl -fsS -X POST "${BASE_URL}/api/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "smoke-train", "task_type": "detect"}')
TRAIN_PROJECT_ID=$(printf '%s' "$TRAIN_CREATE" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$TRAIN_PROJECT_ID" ]; then
  echo "FAIL: could not parse the training project id from: $TRAIN_CREATE" >&2
  exit 1
fi
TRAIN_URL="${BASE_URL}/api/projects/${TRAIN_PROJECT_ID}"
TRAIN_CLASS=$(curl -fsS -X POST "${TRAIN_URL}/classes" -H "Content-Type: application/json" -d '{"name": "box"}')
TRAIN_CLASS_ID=$(printf '%s' "$TRAIN_CLASS" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$TRAIN_CLASS_ID" ]; then
  echo "FAIL: could not parse the training class id from: $TRAIN_CLASS" >&2
  exit 1
fi

# Four distinct 96x96 PNGs (a solid background with a filled rectangle each),
# generated inside the api container (Pillow is in that image) and read back
# from stdout. Scoped MSYS_NO_PATHCONV, see the version check further down.
TRAIN_BOXES=(
  '"x":0.104167,"y":0.104167,"w":0.416667,"h":0.416667'
  '"x":0.416667,"y":0.125,"w":0.479167,"h":0.458333'
  '"x":0.145833,"y":0.458333,"w":0.479167,"h":0.458333'
  '"x":0.520833,"y":0.520833,"w":0.416667,"h":0.416667'
)
TRAIN_IDS=()
for N in 0 1 2 3; do
  MSYS_NO_PATHCONV=1 docker compose exec -T api /app/.venv/bin/python -c "
import sys
from PIL import Image, ImageDraw
n = int(sys.argv[1])
rects = [(10, 10, 50, 50), (40, 12, 86, 56), (14, 44, 60, 88), (50, 50, 90, 90)]
colors = [(220, 40, 40), (40, 200, 60), (40, 80, 220), (230, 200, 30)]
backgrounds = [(20, 20, 40), (40, 30, 20), (25, 45, 30), (45, 25, 45)]
image = Image.new('RGB', (96, 96), backgrounds[n])
ImageDraw.Draw(image).rectangle(rects[n], fill=colors[n])
image.save(sys.stdout.buffer, 'PNG')
" "$N" > "${SMOKE_TMP}/train-${N}.png"
  UPLOADED=$(cd "$SMOKE_TMP" && curl -fsS -H "X-Requested-With: yolo-trainer" -F "files=@train-${N}.png;type=image/png" "${TRAIN_URL}/images")
  case "$UPLOADED" in
    *'"status":"added"'*) ;;
    *)
      echo "FAIL: training image ${N} was not added (got: $UPLOADED)" >&2
      exit 1
      ;;
  esac
  IMAGE_N_ID=$(printf '%s' "$UPLOADED" | sed -n 's/.*"image":{"id":\([0-9][0-9]*\).*/\1/p')
  if [ -z "$IMAGE_N_ID" ]; then
    echo "FAIL: could not parse the id of training image ${N} from: $UPLOADED" >&2
    exit 1
  fi
  TRAIN_IDS+=("$IMAGE_N_ID")
  BOX_N_PAYLOAD="{\"base_version\":0,\"is_background\":false,\"is_reviewed\":false,\"boxes\":[{\"id\":\"3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6${N}\",\"class_id\":${TRAIN_CLASS_ID},${TRAIN_BOXES[$N]}}]}"
  BOX_N_BODY=$(curl -sS -X PUT "${TRAIN_URL}/images/${IMAGE_N_ID}/annotations" \
    -H "Content-Type: application/json" -H "X-Requested-With: yolo-trainer" -d "$BOX_N_PAYLOAD")
  case "$BOX_N_BODY" in
    *'"box_count":1'*) ;;
    *)
      echo "FAIL: saving the box of training image ${N} failed (got: $BOX_N_BODY)" >&2
      exit 1
      ;;
  esac
done

SPLIT_URL="${TRAIN_URL}/images/split"
SPLIT_NOXHR=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SPLIT_URL" \
  -H "Content-Type: application/json" -d "{\"ids\":[${TRAIN_IDS[0]}],\"split\":\"train\"}")
if [ "$SPLIT_NOXHR" != "403" ]; then
  echo "FAIL: POST /images/split without X-Requested-With returned HTTP ${SPLIT_NOXHR} (expected 403)" >&2
  exit 1
fi
SPLIT_TRAIN=$(curl -fsS -X POST "$SPLIT_URL" -H "Content-Type: application/json" \
  -H "X-Requested-With: yolo-trainer" \
  -d "{\"ids\":[${TRAIN_IDS[0]},${TRAIN_IDS[1]},${TRAIN_IDS[2]}],\"split\":\"train\"}")
SPLIT_VALID=$(curl -fsS -X POST "$SPLIT_URL" -H "Content-Type: application/json" \
  -H "X-Requested-With: yolo-trainer" -d "{\"ids\":[${TRAIN_IDS[3]}],\"split\":\"valid\"}")
case "${SPLIT_TRAIN}${SPLIT_VALID}" in
  *'"updated":3'*'"updated":1'*) ;;
  *)
    echo "FAIL: assigning splits did not update 3 + 1 images (got: ${SPLIT_TRAIN} ${SPLIT_VALID})" >&2
    exit 1
    ;;
esac

RUN_RESPONSE=$(curl -sS -w '\n%{http_code}' -X POST "${TRAIN_URL}/runs" \
  -H "Content-Type: application/json" -H "X-Requested-With: yolo-trainer" \
  -d '{"name":null,"base":{"kind":"official","name":"yolo26n"},"epochs":1,"imgsz":64,"batch":2,"device":"cpu"}')
RUN_STATUS=$(printf '%s' "$RUN_RESPONSE" | tail -n 1)
RUN_BODY=$(printf '%s' "$RUN_RESPONSE" | sed '$d')
if [ "$RUN_STATUS" != "201" ]; then
  echo "FAIL: starting a run returned HTTP ${RUN_STATUS} (expected 201; body: $RUN_BODY)" >&2
  exit 1
fi
case "$RUN_BODY" in
  *'"status":"preparing"'*'"name":"run-1"'* | *'"name":"run-1"'*'"status":"preparing"'*) ;;
  *)
    echo "FAIL: the new run is not preparing / run-1 (got: $RUN_BODY)" >&2
    exit 1
    ;;
esac
TRAIN_RUN_ID=$(printf '%s' "$RUN_BODY" | sed -n 's/^{"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$TRAIN_RUN_ID" ]; then
  echo "FAIL: could not parse the run id from: $RUN_BODY" >&2
  exit 1
fi
TRAIN_RUN_URL="${TRAIN_URL}/runs/${TRAIN_RUN_ID}"

echo "    waiting for run ${TRAIN_RUN_ID} to finish (up to ${SMOKE_TRAIN_TIMEOUT:-600}s)..."
TRAIN_DEADLINE=$(( $(date +%s) + ${SMOKE_TRAIN_TIMEOUT:-600} ))
RUN_NOW=""
RUN_STATE=""
while :; do
  RUN_NOW=$(curl -fsS "$TRAIN_RUN_URL")
  RUN_STATE=$(printf '%s' "$RUN_NOW" | sed -n 's/^{"id":[0-9]*,"project_id":[0-9]*,"name":"[^"]*","status":"\([a-z]*\)".*/\1/p')
  case "$RUN_STATE" in
    completed) break ;;
    failed | interrupted | cancelled)
      echo "FAIL: the run ended as ${RUN_STATE}: ${RUN_NOW}" >&2
      exit 1
      ;;
  esac
  if [ "$(date +%s)" -ge "$TRAIN_DEADLINE" ]; then
    echo "FAIL: the run is still ${RUN_STATE} after ${SMOKE_TRAIN_TIMEOUT:-600}s: ${RUN_NOW}" >&2
    exit 1
  fi
  sleep 3
done

echo "    reading the progress stream of the finished run through nginx..."
if ! curl -sS -N --max-time 30 -D "${SMOKE_TMP}/stream.headers" -o "${SMOKE_TMP}/stream.body" "${TRAIN_RUN_URL}/stream"; then
  echo "FAIL: the progress stream did not finish within 30s (a terminal run must end its stream): $(cat "${SMOKE_TMP}/stream.headers" 2>/dev/null)" >&2
  exit 1
fi
if ! grep -qi '^content-type:.*text/event-stream' "${SMOKE_TMP}/stream.headers"; then
  echo "FAIL: the progress stream is not text/event-stream: $(cat "${SMOKE_TMP}/stream.headers")" >&2
  exit 1
fi
if ! grep -q 'event: progress' "${SMOKE_TMP}/stream.body"; then
  echo "FAIL: the progress stream carries no 'event: progress' frame: $(head -c 400 "${SMOKE_TMP}/stream.body")" >&2
  exit 1
fi
if ! grep -q 'event: end' "${SMOKE_TMP}/stream.body"; then
  echo "FAIL: the progress stream of a completed run did not end with 'event: end': $(tail -c 400 "${SMOKE_TMP}/stream.body")" >&2
  exit 1
fi

for DATASET_FILE in data.yaml manifest.json; do
  if [ ! -f "${DATA_DIR}/runs/${TRAIN_RUN_ID}/dataset/${DATASET_FILE}" ]; then
    echo "FAIL: ${DATA_DIR}/runs/${TRAIN_RUN_ID}/dataset/${DATASET_FILE} does not exist on the host" >&2
    exit 1
  fi
done
TRAIN_IMAGE_COUNT=$(find "${DATA_DIR}/runs/${TRAIN_RUN_ID}/dataset/train/images" -type f | wc -l | tr -d ' ')
if [ "$TRAIN_IMAGE_COUNT" != "3" ]; then
  echo "FAIL: the run dataset holds ${TRAIN_IMAGE_COUNT} train images (expected 3)" >&2
  exit 1
fi

TRAIN_MODEL_ID=$(printf '%s' "$RUN_NOW" | sed -n 's/.*"model":{"id":\([0-9][0-9]*\).*/\1/p')
if [ -z "$TRAIN_MODEL_ID" ]; then
  echo "FAIL: the completed run has no registered model: ${RUN_NOW}" >&2
  exit 1
fi
MODEL_URL="${BASE_URL}/api/models/${TRAIN_MODEL_ID}/download"
DOWNLOAD_STATUS=$(curl -sS -D "${SMOKE_TMP}/download.headers" -o "${SMOKE_TMP}/download.pt" -w "%{http_code}" "$MODEL_URL")
if [ "$DOWNLOAD_STATUS" != "200" ]; then
  echo "FAIL: downloading the model returned HTTP ${DOWNLOAD_STATUS} (expected 200)" >&2
  exit 1
fi
if ! grep -qi 'content-disposition:.*smoke-train_run-1_best\.pt' "${SMOKE_TMP}/download.headers"; then
  echo "FAIL: the download lacks a Content-Disposition naming smoke-train_run-1_best.pt: $(cat "${SMOKE_TMP}/download.headers")" >&2
  exit 1
fi
DOWNLOAD_BYTES=$(wc -c < "${SMOKE_TMP}/download.pt" | tr -d ' ')
if [ "$DOWNLOAD_BYTES" -le 1000000 ]; then
  echo "FAIL: the downloaded model is only ${DOWNLOAD_BYTES} bytes" >&2
  exit 1
fi

echo "==> Loading the trained model with plain YOLO(path) in the worker container..."
PREDICT_OUTPUT=$(MSYS_NO_PATHCONV=1 docker compose exec -T worker /app/.venv/bin/python -c "
import glob
from ultralytics import settings
settings.update({'sync': False})
from ultralytics import YOLO
model = YOLO('/data/models/${TRAIN_MODEL_ID}.pt')
print(model.task)
print(list(model.names.values()))
image = sorted(glob.glob('/data/runs/${TRAIN_RUN_ID}/dataset/train/images/*'))[0]
model.predict(image, imgsz=64, device='cpu', verbose=False)
print('PREDICT_OK')
" 2>&1)
for EXPECTED in detect box PREDICT_OK; do
  case "$PREDICT_OUTPUT" in
    *"$EXPECTED"*) ;;
    *)
      echo "FAIL: loading the model in the worker did not print '${EXPECTED}' (got: $PREDICT_OUTPUT)" >&2
      exit 1
      ;;
  esac
done

if ! grep -rEq '"sync": *false' "${DATA_DIR}/worker/ultralytics"; then
  echo "FAIL: Ultralytics sync (analytics) is not disabled under ${DATA_DIR}/worker/ultralytics" >&2
  exit 1
fi

echo "==> Cancel, no orphan, next run, resume (Phase 5 tracer, TRAN-05..TRAN-08)..."
# Helpers for this stage. The run JSON starts with id, project_id, name, status (the
# RunSummary field order), so the same sed extraction as the training stage works.
smoke_run_status() {
  printf '%s' "$1" | sed -n 's/^{"id":[0-9]*,"project_id":[0-9]*,"name":"[^"]*","status":"\([a-z]*\)".*/\1/p'
}
# An integer field of a run JSON; the leading quote keeps "epoch" apart from "resume_epoch"
# and "epochs". Prints nothing when the field is null or absent.
smoke_run_int() {
  printf '%s' "$1" | sed -n "s/.*\"$2\":\([0-9][0-9]*\).*/\1/p"
}
# Starts a tiny CPU run on the smoke-train project and sets SMOKE_RUN_ID.
start_smoke_run() {
  local response status body
  response=$(curl -sS -w '\n%{http_code}' -X POST "${TRAIN_URL}/runs" \
    -H "Content-Type: application/json" -H "X-Requested-With: yolo-trainer" \
    -d "{\"name\":\"$1\",\"base\":{\"kind\":\"official\",\"name\":\"yolo26n\"},\"epochs\":$2,\"imgsz\":64,\"batch\":2,\"device\":\"cpu\"}")
  status=$(printf '%s' "$response" | tail -n 1)
  body=$(printf '%s' "$response" | sed '$d')
  if [ "$status" != "201" ]; then
    echo "FAIL: starting run $1 returned HTTP ${status} (expected 201; body: $body)" >&2
    exit 1
  fi
  SMOKE_RUN_ID=$(printf '%s' "$body" | sed -n 's/^{"id":\([0-9][0-9]*\).*/\1/p')
  if [ -z "$SMOKE_RUN_ID" ]; then
    echo "FAIL: could not parse the id of run $1 from: $body" >&2
    exit 1
  fi
}
# Waits until the run JSON at $1 reports status $2 within $3 seconds; any other terminal
# status is a failure. The last answer stays in SMOKE_RUN_NOW.
wait_for_run_status() {
  local deadline state
  deadline=$(( $(date +%s) + $3 ))
  while :; do
    SMOKE_RUN_NOW=$(curl -fsS "$1")
    state=$(smoke_run_status "$SMOKE_RUN_NOW")
    if [ "$state" = "$2" ]; then
      return 0
    fi
    case "$state" in
      completed | failed | interrupted | cancelled)
        echo "FAIL: waiting for ${2}, the run ended as ${state}: ${SMOKE_RUN_NOW}" >&2
        exit 1
        ;;
    esac
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "FAIL: the run is still ${state} (not ${2}) after ${3}s: ${SMOKE_RUN_NOW}" >&2
      exit 1
    fi
    sleep 1
  done
}

start_smoke_run "smoke-cancel" 50
CANCEL_RUN_ID=$SMOKE_RUN_ID
CANCEL_RUN_URL="${TRAIN_URL}/runs/${CANCEL_RUN_ID}"

echo "    waiting for run ${CANCEL_RUN_ID} to save a checkpoint while running (up to ${SMOKE_TRAIN_TIMEOUT:-600}s)..."
CANCEL_DEADLINE=$(( $(date +%s) + ${SMOKE_TRAIN_TIMEOUT:-600} ))
while :; do
  SMOKE_RUN_NOW=$(curl -fsS "$CANCEL_RUN_URL")
  CANCEL_STATE=$(smoke_run_status "$SMOKE_RUN_NOW")
  case "$CANCEL_STATE" in
    completed | failed | interrupted | cancelled)
      echo "FAIL: the run to cancel ended as ${CANCEL_STATE} before it could be cancelled: ${SMOKE_RUN_NOW}" >&2
      exit 1
      ;;
  esac
  if [ "$CANCEL_STATE" = "running" ] && [ -n "$(smoke_run_int "$SMOKE_RUN_NOW" resume_epoch)" ]; then
    break
  fi
  if [ "$(date +%s)" -ge "$CANCEL_DEADLINE" ]; then
    echo "FAIL: the run is ${CANCEL_STATE} without a checkpoint after ${SMOKE_TRAIN_TIMEOUT:-600}s: ${SMOKE_RUN_NOW}" >&2
    exit 1
  fi
  sleep 1
done

CANCEL_NOXHR=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${CANCEL_RUN_URL}/cancel")
if [ "$CANCEL_NOXHR" != "403" ]; then
  echo "FAIL: POST /cancel without X-Requested-With returned HTTP ${CANCEL_NOXHR} (expected 403)" >&2
  exit 1
fi
CANCEL_STATUS=$(curl -sS -o "${SMOKE_TMP}/cancel.body" -w "%{http_code}" -X POST "${CANCEL_RUN_URL}/cancel" \
  -H "X-Requested-With: yolo-trainer")
if [ "$CANCEL_STATUS" != "200" ]; then
  echo "FAIL: POST /cancel returned HTTP ${CANCEL_STATUS} (expected 200; body: $(cat "${SMOKE_TMP}/cancel.body"))" >&2
  exit 1
fi
wait_for_run_status "$CANCEL_RUN_URL" cancelled 30
# The checkpoint epoch and the last finished epoch at the moment of the cancel: the resumed
# run must get past both.
CANCEL_RESUME_EPOCH=$(smoke_run_int "$SMOKE_RUN_NOW" resume_epoch)
CANCEL_EPOCH=$(smoke_run_int "$SMOKE_RUN_NOW" epoch)
if [ -z "$CANCEL_RESUME_EPOCH" ]; then
  echo "FAIL: the cancelled run lost its resume_epoch: ${SMOKE_RUN_NOW}" >&2
  exit 1
fi
CANCEL_BASELINE=$CANCEL_RESUME_EPOCH
if [ -n "$CANCEL_EPOCH" ] && [ "$CANCEL_EPOCH" -gt "$CANCEL_BASELINE" ]; then
  CANCEL_BASELINE=$CANCEL_EPOCH
fi

echo "    checking that no training process is left in the worker container..."
# No process-listing tool is in the slim worker image: scan /proc with the venv Python. The needle is built
# from two parts so this scanner's own command line (which holds the source text) never matches.
ORPHAN_COUNT=$(MSYS_NO_PATHCONV=1 docker compose exec -T worker /app/.venv/bin/python -c "
import glob
needle = b'yolo_trainer_worker.' + b'train_job'
count = 0
for path in glob.glob('/proc/[0-9]*/cmdline'):
    try:
        with open(path, 'rb') as handle:
            if needle in handle.read():
                count += 1
    except OSError:
        pass
print(count)
" | tr -d '\r\n')
if [ "$ORPHAN_COUNT" != "0" ]; then
  echo "FAIL: ${ORPHAN_COUNT} yolo_trainer_worker.train_job process(es) left in the worker after the cancel" >&2
  exit 1
fi

echo "    starting the next run to prove the queue moved on..."
start_smoke_run "smoke-next" 1
NEXT_RUN_URL="${TRAIN_URL}/runs/${SMOKE_RUN_ID}"
wait_for_run_status "$NEXT_RUN_URL" completed "${SMOKE_TRAIN_TIMEOUT:-600}"

echo "    resuming the cancelled run..."
RESUME_NOXHR=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${CANCEL_RUN_URL}/resume")
if [ "$RESUME_NOXHR" != "403" ]; then
  echo "FAIL: POST /resume without X-Requested-With returned HTTP ${RESUME_NOXHR} (expected 403)" >&2
  exit 1
fi
RESUME_STATUS=$(curl -sS -o "${SMOKE_TMP}/resume.body" -w "%{http_code}" -X POST "${CANCEL_RUN_URL}/resume" \
  -H "X-Requested-With: yolo-trainer")
RESUME_BODY=$(cat "${SMOKE_TMP}/resume.body")
if [ "$RESUME_STATUS" != "200" ]; then
  echo "FAIL: POST /resume returned HTTP ${RESUME_STATUS} (expected 200; body: ${RESUME_BODY})" >&2
  exit 1
fi
case "$RESUME_BODY" in
  *'"status":"queued"'*) ;;
  *)
    echo "FAIL: the resumed run is not queued (got: ${RESUME_BODY})" >&2
    exit 1
    ;;
esac

echo "    waiting for the resumed run to get past epoch ${CANCEL_BASELINE} (up to ${SMOKE_TRAIN_TIMEOUT:-600}s)..."
RESUME_DEADLINE=$(( $(date +%s) + ${SMOKE_TRAIN_TIMEOUT:-600} ))
while :; do
  SMOKE_RUN_NOW=$(curl -fsS "$CANCEL_RUN_URL")
  RESUME_STATE=$(smoke_run_status "$SMOKE_RUN_NOW")
  case "$RESUME_STATE" in
    completed | failed | interrupted | cancelled)
      echo "FAIL: the resumed run ended as ${RESUME_STATE} before passing epoch ${CANCEL_BASELINE}: ${SMOKE_RUN_NOW}" >&2
      exit 1
      ;;
  esac
  RESUME_EPOCH_NOW=$(smoke_run_int "$SMOKE_RUN_NOW" epoch)
  if [ "$RESUME_STATE" = "running" ] && [ -n "$RESUME_EPOCH_NOW" ] && [ "$RESUME_EPOCH_NOW" -gt "$CANCEL_BASELINE" ]; then
    break
  fi
  if [ "$(date +%s)" -ge "$RESUME_DEADLINE" ]; then
    echo "FAIL: the resumed run is ${RESUME_STATE} at epoch ${RESUME_EPOCH_NOW:-none} after ${SMOKE_TRAIN_TIMEOUT:-600}s: ${SMOKE_RUN_NOW}" >&2
    exit 1
  fi
  sleep 1
done
case "$SMOKE_RUN_NOW" in
  *'"resume_count":1'*) ;;
  *)
    echo "FAIL: the resumed run does not report resume_count 1: ${SMOKE_RUN_NOW}" >&2
    exit 1
    ;;
esac

# Keep the smoke short: cancel the resumed run too, so no run is active afterwards.
curl -fsS -o /dev/null -X POST "${CANCEL_RUN_URL}/cancel" -H "X-Requested-With: yolo-trainer"
wait_for_run_status "$CANCEL_RUN_URL" cancelled 30

CANCEL_PROGRESS="${DATA_DIR}/runs/${CANCEL_RUN_ID}/progress.jsonl"
if [ ! -f "$CANCEL_PROGRESS" ]; then
  echo "FAIL: ${CANCEL_PROGRESS} does not exist on the host" >&2
  exit 1
fi
TRAIN_START_COUNT=$(grep -c '"event": "train_start"' "$CANCEL_PROGRESS" || true)
if [ "${TRAIN_START_COUNT:-0}" -lt 2 ]; then
  echo "FAIL: ${CANCEL_PROGRESS} has ${TRAIN_START_COUNT:-0} train_start line(s) (expected at least 2)" >&2
  exit 1
fi
if ! grep -q '"resumed": true' "$CANCEL_PROGRESS"; then
  echo "FAIL: ${CANCEL_PROGRESS} has no '\"resumed\": true' train_start" >&2
  exit 1
fi

echo "    reading the stream of the cancelled run through nginx..."
if ! curl -sS -N --max-time 30 -o "${SMOKE_TMP}/cancel-stream.body" "${CANCEL_RUN_URL}/stream"; then
  echo "FAIL: the stream of a cancelled run did not finish within 30s" >&2
  exit 1
fi
if ! grep -q 'event: end' "${SMOKE_TMP}/cancel-stream.body"; then
  echo "FAIL: the stream of a cancelled run did not end with 'event: end': $(tail -c 400 "${SMOKE_TMP}/cancel-stream.body")" >&2
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

echo "==> Checking the saved box survived down/up (ANNO-07, SC3)..."
ANNOTATIONS_AFTER_RESTART=$(curl -fsS "$ANNOTATIONS_URL")
case "$ANNOTATIONS_AFTER_RESTART" in
  *"\"id\":\"${BOX_ID}\""*) ;;
  *)
    echo "FAIL: the saved box did not survive down/up (got: $ANNOTATIONS_AFTER_RESTART)" >&2
    exit 1
    ;;
esac
case "$ANNOTATIONS_AFTER_RESTART" in
  *'"version":1'*) ;;
  *)
    echo "FAIL: the annotation version is not 1 after down/up (got: $ANNOTATIONS_AFTER_RESTART)" >&2
    exit 1
    ;;
esac

echo "==> Checking the trained run and its download survived down/up (TRAN-04)..."
RUN_AFTER_RESTART=$(curl -fsS "$TRAIN_RUN_URL")
case "$RUN_AFTER_RESTART" in
  *'"status":"completed"'*) ;;
  *)
    echo "FAIL: the run is not completed after down/up (got: $RUN_AFTER_RESTART)" >&2
    exit 1
    ;;
esac
DOWNLOAD_AFTER_RESTART=$(curl -sS -o /dev/null -w "%{http_code}" "$MODEL_URL")
if [ "$DOWNLOAD_AFTER_RESTART" != "200" ]; then
  echo "FAIL: the model download returned HTTP ${DOWNLOAD_AFTER_RESTART} after down/up (expected 200)" >&2
  exit 1
fi

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
