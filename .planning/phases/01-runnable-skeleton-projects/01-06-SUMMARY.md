---
phase: 01-runnable-skeleton-projects
plan: 06
subsystem: infra
tags: [docker, docker-compose, worker, heartbeat, torch, ultralytics, pydantic-settings, pytest, tdd]

# Dependency graph
requires:
  - phase: 01-01
    provides: "docker-compose.yml (api/web services), docker/Dockerfile.backend (base/api stages), scripts/compose_smoke_test.sh skeleton"
  - phase: 01-02
    provides: "compose smoke-test burst-write/rebuild/integrity_check stage pattern; stop_grace_period convention"
  - phase: 01-04
    provides: "yolo_trainer_common.device.detect_compute_device()/ComputeDevice (lazy torch import); backend pyproject.toml worker extra (torch==2.14.0, torchvision==0.29.0, ultralytics==8.4.159) resolved from the pytorch-cpu index"
provides:
  - "yolo_trainer_worker package: WorkerSettings, build_heartbeat, write_heartbeat (atomic os.replace), is_heartbeat_fresh, run, main (--healthcheck)"
  - "Heartbeat file DATA_DIR/worker/heartbeat.json (pid, started_at, last_heartbeat, torch_version, ultralytics_version, cuda_available, device, device_name)"
  - "docker/Dockerfile.backend worker stage (torch CPU + ultralytics, libgl1/libglib2.0-0 for opencv-python), image yolo-trainer-worker:cpu"
  - "docker-compose.yml worker service (no ports, healthcheck via --healthcheck, start_period 90s, stop_grace_period 20s)"
  - "compose smoke-test stages proving worker ML imports, torch-free api image, and api < worker image size"
affects: [04-training-jobs, 12-gpu-image-diagnostics]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 4626
  tasks: 2
  commits: 3
plan_head_before: 8f25c5fcb3848e436b315d97d72db55646ced2d9

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worker-specific pydantic-settings class (WorkerSettings) kept separate from the api's Settings, so the worker has zero dependency on api configuration ahead of the Phase 4 job-handoff decision"
    - "Atomic file write via sibling temp file + os.replace for a heartbeat/status file read concurrently by a healthcheck process"
    - "--healthcheck CLI flag that returns before importing the heavy ML stack, so the compose healthcheck itself stays cheap even though the main process eagerly imports torch/ultralytics at start (fail loudly, D-17)"
    - "Multi-stage Dockerfile build target (worker) sharing the base layer with api, differentiated only by --extra worker on the uv sync line"

key-files:
  created:
    - backend/src/yolo_trainer_worker/__init__.py
    - backend/src/yolo_trainer_worker/main.py
    - backend/tests/test_worker.py
  modified:
    - backend/pyproject.toml
    - docker/Dockerfile.backend
    - docker-compose.yml
    - scripts/compose_smoke_test.sh

key-decisions:
  - "WorkerSettings.heartbeat_interval_seconds uses a pydantic validation_alias (WORKER_HEARTBEAT_INTERVAL_SECONDS) with populate_by_name=True, so both the env var and direct keyword construction (used by tests) work without duplicating the field under two names."
  - "The two `docker compose exec .../app/.venv/bin/python` calls in compose_smoke_test.sh need MSYS_NO_PATHCONV=1 on Git Bash/Windows, but that variable must be scoped to those two commands only (not exported for the whole script) - exporting it globally broke the pre-existing `curl -o /dev/null` burst-write stage, which relies on MSYS's normal path translation to reach Windows curl.exe correctly. Found and fixed by re-running the full smoke test after the first failure (curl exit 23) reproduced twice and a bisection isolated it to the global export."
  - "libgl1 and libglib2.0-0 were the only additional apt packages needed on python:3.12-slim for Ultralytics' opencv-python import to succeed in the worker image; no other libs were required (RESEARCH Pitfall 4 note was scoped correctly)."

requirements-completed: []  # DEPL-01 is shared with sibling plan 01-10 (not yet executed) - shared-ID gate (#2388) correctly reports 0/1 ready via `requirements.ready-ids`. It will flip to Complete once 01-10 finishes.

coverage:
  - id: D1
    description: "yolo_trainer_worker.main provides a heartbeat loop (build_heartbeat/write_heartbeat/is_heartbeat_fresh/run/WorkerSettings) that writes DATA_DIR/worker/heartbeat.json atomically with device+version info, stops cleanly on SIGTERM, and reports its own health via --healthcheck without importing torch"
    requirement: "DEPL-01"
    verification:
      - kind: unit
        ref: "backend/tests/test_worker.py (15 tests: build_heartbeat key-set/ISO-Z timestamps, write_heartbeat atomicity/no-temp-file, is_heartbeat_fresh freshness boundary incl. missing/invalid-JSON, run() single-beat-then-stop, WorkerSettings env override + validation, main([\"--healthcheck\"]) exit codes)"
        status: pass
      - kind: other
        ref: "uv run pytest backend/tests -x -q -> 63 passed (full backend suite, no regressions)"
        status: pass
    human_judgment: false
  - id: D2
    description: "docker compose up also starts a worker service built from the worker target of docker/Dockerfile.backend; torch 2.14.0 (CPU) and ultralytics 8.4.159 import successfully inside it; the api image stays torch-free; the worker publishes no port and stays healthy via its heartbeat; api image is smaller than worker image"
    requirement: "DEPL-01"
    verification:
      - kind: other
        ref: "bash scripts/compose_smoke_test.sh -> SMOKE OK (new stages: worker heartbeat has cuda_available, worker torch/ultralytics versions == 2.14.0/8.4.159, api image torch-free via importlib.util.find_spec, api image 88793819 bytes < worker image 970045042 bytes)"
        status: pass
      - kind: other
        ref: "docker compose config --services -> api, web, worker; docker compose config shows a ports: section only under web"
        status: pass
    human_judgment: false
  - id: D3
    description: "The worker exits promptly on SIGTERM (well inside the 20s stop_grace_period), and its build/service structure (named target worker, image yolo-trainer-worker:cpu, no ports) is ready for the Phase 12 docker-compose.gpu.yml override"
    human_judgment: true
    rationale: "SIGTERM handling is unit-tested indirectly (the run() loop returns once stop_event is set, and signal handlers set that same event), but a real SIGTERM-to-container-exit timing measurement against the live compose stack was not separately timed in this plan's automated verification - the compose smoke test's stop_grace_period: 20s never triggered a SIGKILL during down/up cycles, which is consistent with prompt shutdown but not a precise timing proof."

# Metrics
duration: ~26min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 6: Worker Heartbeat Loop + CPU Worker Image Summary

**A `yolo_trainer_worker` package with an atomic-write heartbeat loop and `--healthcheck` CLI, plus a Docker `worker` stage (torch 2.14.0 CPU + ultralytics 8.4.159) and compose service proven healthy end-to-end while the `api` image stays torch-free.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-09-28T07:35:00Z (approx)
- **Completed:** 2026-09-28T08:01:00Z (approx)
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- `backend/src/yolo_trainer_worker/main.py`: `WorkerSettings` (`data_dir` via `DATA_DIR`, `heartbeat_interval_seconds` via `WORKER_HEARTBEAT_INTERVAL_SECONDS`, `heartbeat_path` property), `build_heartbeat` (exact 8-key payload with UTC ISO-8601 `Z`-suffixed timestamps), `write_heartbeat` (sibling-temp-file + `os.replace`, so readers never see a half-written file), `is_heartbeat_fresh` (missing file / invalid JSON / stale-by-age all return `False`), `run` (probes the device once, writes immediately, then on `stop_event.wait(interval)`), and `main` (`--healthcheck` returns 0/1 without importing torch; otherwise imports `torch`/`ultralytics` up front so a broken heavy image fails loudly at start, installs SIGTERM/SIGINT handlers)
- 15 new unit tests (`backend/tests/test_worker.py`) - no real torch, no real sleeping, fixed timestamps and a fake device probe; full backend suite went from 48 to 63 passed
- `docker/Dockerfile.backend`: new `worker` stage sharing the `base` layer with `api`, installing `libgl1`/`libglib2.0-0` (the only extra apt packages Ultralytics' `opencv-python` needed on `python:3.12-slim`), running `uv sync --frozen --no-dev --package yolo-trainer-backend --extra worker`, `STOPSIGNAL SIGTERM`, `CMD` runs `yolo_trainer_worker.main`
- `docker-compose.yml`: new `worker` service - `target: worker`, `image: yolo-trainer-worker:cpu`, bind-mounted `DATA_DIR`, healthcheck via `python -m yolo_trainer_worker.main --healthcheck` (`start_period: 90s` for the slow torch import), no `ports:`, `restart: unless-stopped`, `stop_grace_period: 20s`, plus a comment marking the Phase 12 `docker-compose.gpu.yml` override point (D-18)
- `scripts/compose_smoke_test.sh`: new stages proving the worker heartbeat file has `cuda_available`, the worker's real `torch`/`ultralytics` versions are `2.14.0`/`8.4.159`, the `api` image cannot `importlib.util.find_spec('torch')`, and the `api` image (88,793,819 bytes) is smaller than the `worker` image (970,045,042 bytes) - `SMOKE OK` end to end with the real Docker Desktop stack on this Windows dev machine

## Task Commits

Each task was committed atomically (TDD: RED then GREEN for Task 1):

1. **Task 1: yolo_trainer_worker heartbeat loop (RED)** - `2c8d703` (test)
2. **Task 1: yolo_trainer_worker heartbeat loop (GREEN)** - `6f0c43b` (feat)
3. **Task 2: Worker image stage, compose worker service, and smoke assertions** - `904b8d5` (feat)

**Plan metadata:** commit to follow this SUMMARY (docs(01-06): complete plan)

_Note: Task 1 was `tdd="true"`. RED was a genuine `ModuleNotFoundError: No module named 'yolo_trainer_worker'` collection error (the module didn't exist yet), matching this project's established non-strict `tdd="true"` convention (`workflow.tdd_mode` is not enabled in `.planning/config.json`) - same shape as Plan 01-04's Task 1. Task 2 was a plain `type="auto"` task with a `<precondition>` (Docker Desktop running), verified read-only via `docker info` before starting._

## Files Created/Modified

- `backend/src/yolo_trainer_worker/__init__.py` - re-exports `WorkerSettings`, `build_heartbeat`, `is_heartbeat_fresh`, `main`, `run`, `write_heartbeat`
- `backend/src/yolo_trainer_worker/main.py` - heartbeat loop, atomic writer, `--healthcheck` CLI, SIGTERM/SIGINT handling
- `backend/tests/test_worker.py` - 15 tests covering all of `<behavior>`
- `backend/pyproject.toml` - `src/yolo_trainer_worker` added to hatch wheel packages
- `docker/Dockerfile.backend` - new `worker` build stage
- `docker-compose.yml` - new `worker` service
- `scripts/compose_smoke_test.sh` - four new assertion stages (heartbeat, ML versions, torch-free api, image-size comparison)

## Decisions Made

See frontmatter `key-decisions`: `validation_alias` + `populate_by_name=True` for `WorkerSettings.heartbeat_interval_seconds`; `MSYS_NO_PATHCONV=1` scoped per-command (not exported globally) in the smoke test; `libgl1`/`libglib2.0-0` as the only apt packages needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Global `MSYS_NO_PATHCONV=1` broke the pre-existing burst-write curl stage**
- **Found during:** Task 2 (first two full `bash scripts/compose_smoke_test.sh` runs both failed with curl exit code 23 - "failed writing received data" - inside the pre-existing 10-project burst-write loop, which was unmodified by this plan)
- **Issue:** To make the new `docker compose exec ... /app/.venv/bin/python` calls work on Git Bash/Windows (MSYS was rewriting the absolute container path to a host path, e.g. `C:/Program Files/Git/app/.venv/bin/python`, causing "no such file or directory"), `MSYS_NO_PATHCONV=1` was first exported for the whole script. That same variable also disabled MSYS's path translation for the pre-existing `curl -s -o /dev/null ...` calls, which rely on that translation to hand Windows' native `curl.exe` a working null-output path - breaking the burst-write stage.
- **Fix:** Scoped `MSYS_NO_PATHCONV=1` as a command-local env-var prefix on only the two new `docker compose exec .../app/.venv/bin/python` invocations, leaving the rest of the script (including the pre-existing curl calls) unaffected.
- **Files modified:** `scripts/compose_smoke_test.sh`
- **Verification:** Re-ran `bash scripts/compose_smoke_test.sh` end-to-end against the real Docker Desktop stack - `SMOKE OK`, including the burst-write stage and all four new stages.
- **Committed in:** `904b8d5` (Task 2 commit; the broken global-export version was never committed)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary to make the plan's own `<verify>` (the smoke test) actually pass on this Windows/Git-Bash dev environment. No scope creep - the fix is confined to how one environment variable is scoped in the smoke-test script.

## Issues Encountered

- `docker compose exec -T <service> python -c ...` (bare `python`, no path) resolves to the base image's system Python, not `/app/.venv/bin/python` - confirmed by a quick manual check (`torch` was `ModuleNotFoundError` via bare `python` in the `worker` container, but importable via the absolute venv path). This is why the plan specifies the absolute `/app/.venv/bin/python` path for the new torch/ultralytics-version and torch-free assertions; the pre-existing `sqlite3`-based checks in the script still use bare `python` correctly since `sqlite3` is a stdlib module present in either interpreter.
- A stray long-running `docker compose` stack (project name `yolo-trainer`, not `yolo-trainer-smoke`) was found already running on this machine from an earlier manual session (`yolo-trainer-api-1`, `yolo-trainer-web-1`, up ~2h, no `worker` container - predates this plan). It uses a separate compose project namespace from the smoke test and did not interfere with any check in this plan; left untouched as out of scope.

## User Setup Required

None - no external service configuration required.

## Ultralytics Analytics Follow-up (Phase 4)

Per the plan's `<threat_model>` (T-06-04, disposition `accept` for this phase): Ultralytics usage analytics must be disabled in the worker **before it runs real training/inference jobs** (privacy of a self-hosted tool). No train/predict calls happen in Phase 1 - the worker only imports `torch`/`ultralytics` and writes a heartbeat - so this is not yet a live exposure, but Phase 4 (real job execution) must set `settings.update({"sync": False})` (or the equivalent Ultralytics settings-file override) as part of wiring up the first real job, before it ships.

## Next Phase Readiness

- `docker compose up` now starts all three Phase 1 services (`web`, `api`, `worker`) on this CPU-only Windows dev machine; the worker's heavy image builds and stays healthy end-to-end, and the api image is proven torch-free (88,793,819 vs 970,045,042 bytes) - DEPL-01's worker/api-split requirement (D-17) has real, running evidence now, alongside 01-02's DEPL-03 persistence evidence.
- `requirements-completed` is intentionally empty in this SUMMARY's frontmatter: DEPL-01 is also declared by sibling plan 01-10, which hasn't executed yet. The shared-ID gate (#2388) correctly reported `0/1 ready` via `requirements.ready-ids` - it will flip to `Complete` in REQUIREMENTS.md automatically once 01-10 (the last declaring plan) finishes.
- `yolo_trainer_worker.main`'s `run`/`WorkerSettings`/`detect_compute_device` integration is the concrete shape Phase 4's real job-execution design can build on, though how jobs actually cross from `api` to `worker` remains the open STATE.md blocker this plan explicitly did not attempt to resolve (the worker still runs no jobs).
- New STATE.md follow-up (not a blocker, tracked above): disable Ultralytics analytics in the worker before Phase 4 ships real jobs.
- No new blockers. Pre-existing STATE.md blockers (DEPL-01 on Linux/macOS, GPU-path acceptance, Phase 4 job hand-off design, Phase 6 click-to-segment research) remain open and are unaffected by this plan.

## Self-Check: PASSED

All key files confirmed present on disk (`backend/src/yolo_trainer_worker/{__init__,main}.py`, `backend/tests/test_worker.py`, `docker/Dockerfile.backend`, `docker-compose.yml`, `scripts/compose_smoke_test.sh`). All three task commits (`2c8d703`, `6f0c43b`, `904b8d5`) confirmed in `git log --oneline --all`. Re-ran the plan's full `<verification>` block clean: `uv run pytest backend/tests -x` -> 63 passed; `bash scripts/compose_smoke_test.sh` -> `SMOKE OK` with the worker heartbeat/ML-import/torch-free-api/image-size assertions all passing. `docker compose config --services` -> `api`, `web`, `worker`; `docker compose config` shows a `ports:` section only under `web`. All plan-level acceptance-criteria greps (`os.replace`, `SIGTERM`, `src/yolo_trainer_worker`, `AS worker`, `--extra worker`, `yolo-trainer-worker:cpu`, `docker-compose.gpu.yml` mention, absence of `docker-compose.gpu.yml` itself) verified passing.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
