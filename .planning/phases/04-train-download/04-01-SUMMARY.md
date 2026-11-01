---
phase: 04-train-download
plan: 01
subsystem: training
tags: [ultralytics, sqlite, sqlalchemy, alembic, fastapi, docker-compose, subprocess, hard-links]

requires:
  - phase: 03-annotate
    provides: images, classes and annotations (boxes) that become a run's dataset; require_xhr, status-counts
  - phase: 01-foundation
    provides: worker container with torch/ultralytics, heartbeat, compose stack and smoke-test harness
provides:
  - images.split (train/valid/test/unassigned) with POST /api/projects/{id}/images/split and status-counts splits
  - training_runs and models tables (migration 0005) with the seven-value run status contract
  - POST/GET /api/projects/{id}/runs and GET /api/models/{id}/download
  - run snapshot taken inside the run INSERT transaction, hard-linked YOLO dataset folder, manifest.json, job.json
  - DB-polled worker (claim_next, Supervisor, train_job subprocess) that registers best.pt as a model
  - yolo_trainer_common layout/progress/heartbeat modules shared by api and worker
  - in-process pipeline tests with a fake trainer (training_helpers.py, fake_train_job.py)
affects: [04-02, 04-03, 04-04, 04-05, 04-06, 04-07, 04-08, 04-09, 04-10, phase-05, phase-07, phase-08, phase-09, phase-11]

actuals:
  tokens: 41700
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Database is the job queue: worker claims the oldest queued run with one UPDATE ... RETURNING guarded by NOT EXISTS(running), both subqueries on aliased tables"
    - "Single writer of run state: the supervisor tails progress.jsonl and writes the DB; the train_job subprocess never opens the database"
    - "Run INSERT is the first statement of the snapshot transaction (SQLite write lock held while reading)"
    - "Shared on-disk contract (yolo_trainer_common.layout): every path from integers and allow-listed names, atomic JSON/text writes"
    - "Materialization after the response via BackgroundTasks; run stays preparing until files exist"
    - "Model file hard-linked inside the registration transaction; rollback removes it"

key-files:
  created:
    - backend/src/yolo_trainer_api/migrations/versions/0005_training.py
    - backend/src/yolo_trainer_api/training/__init__.py
    - backend/src/yolo_trainer_api/training/catalog.py
    - backend/src/yolo_trainer_api/training/labels.py
    - backend/src/yolo_trainer_api/training/snapshot.py
    - backend/src/yolo_trainer_api/training/service.py
    - backend/src/yolo_trainer_api/routers/splits.py
    - backend/src/yolo_trainer_api/routers/runs.py
    - backend/src/yolo_trainer_api/routers/models.py
    - backend/src/yolo_trainer_common/layout.py
    - backend/src/yolo_trainer_common/progress.py
    - backend/src/yolo_trainer_common/heartbeat.py
    - backend/src/yolo_trainer_worker/queue.py
    - backend/src/yolo_trainer_worker/supervisor.py
    - backend/src/yolo_trainer_worker/train_job.py
    - backend/tests/training_helpers.py
    - backend/tests/fake_train_job.py
    - backend/tests/test_training_pipeline.py
  modified:
    - backend/src/yolo_trainer_api/models.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/settings.py
    - backend/src/yolo_trainer_api/storage.py
    - backend/src/yolo_trainer_api/main.py
    - backend/src/yolo_trainer_api/routers/annotations.py
    - backend/src/yolo_trainer_worker/main.py
    - docker-compose.yml
    - scripts/compose_smoke_test.sh
    - backend/tests/test_migrations.py
    - backend/tests/test_annotations_status.py
    - backend/tests/test_images_api.py

key-decisions:
  - "images.split is added with one portable ALTER TABLE ... ADD COLUMN ... CONSTRAINT ck_images_split statement instead of a batch rebuild, so the images table keeps AUTOINCREMENT and its indexes (D-01)"
  - "All seven run statuses (incl. cancelled) are in the CHECK from the first migration, because a CHECK cannot be altered in place later"
  - "The worker polls SQLite (no Redis/Celery); claim is one atomic UPDATE ... RETURNING that succeeds only while no run is running (D-11)"
  - "train_job patches ultralytics.data.utils.check_font to a no-op so the dataset check never downloads Arial.ttf: a run's only outbound access is the official weights download"
  - "The extra post-training on_fit_epoch_end is tagged final_validation=true and never written to the epoch column (D-12)"

patterns-established:
  - "Fake-trainer testing: Supervisor takes a CommandBuilder, tests run a pure-Python fake_train_job.py (modes success/fail/crash/sleep) instead of Ultralytics"
  - "Compose smoke section trains a 4-image project for one CPU epoch through nginx and loads the downloaded .pt with plain YOLO(path) in the worker container"

requirements-completed: [TRAN-01, TRAN-03, TRAN-04, MODL-01, MODL-03, MODL-04, DATA-05]

coverage:
  - id: D1
    description: "Image split assignment (train/valid/test/unassigned) via POST /images/split, CSRF-guarded, never touching annotation state; status-counts report splits"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "backend/tests/test_training_pipeline.py#test_split_sets_only_the_listed_images_and_leaves_annotation_state_alone"
        status: pass
      - kind: integration
        ref: "bash scripts/compose_smoke_test.sh (403 without X-Requested-With, 3+1 images assigned)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Starting a run snapshots only annotated images, refuses empty class/Train/Valid sets, names runs run-<n>, and materializes a hard-linked YOLO dataset after the 201 response"
    requirement: TRAN-03
    verification:
      - kind: unit
        ref: "backend/tests/test_training_pipeline.py#test_start_snapshots_annotated_images_only_and_materializes_the_dataset"
        status: pass
      - kind: integration
        ref: "bash scripts/compose_smoke_test.sh (201 preparing run-1, dataset/train/images holds 3 files on the host)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The worker container claims the queued run, trains in a subprocess and registers best.pt as a model; failure and crash paths keep a plain message and cleaned log tail"
    requirement: TRAN-04
    verification:
      - kind: unit
        ref: "backend/tests/test_training_pipeline.py#test_a_clean_run_registers_best_pt_as_a_model_and_it_downloads"
        status: pass
      - kind: integration
        ref: "bash scripts/compose_smoke_test.sh (run reaches completed with a real one-epoch CPU YOLO26n training)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/models/{id}/download streams the registered .pt as smoke-train_run-1_best.pt and the file loads and predicts with plain YOLO(path); run and download survive down/up"
    requirement: MODL-04
    verification:
      - kind: integration
        ref: "bash scripts/compose_smoke_test.sh (200, Content-Disposition, >1 MB body, detect/box/PREDICT_OK in worker, persistence after down/up)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Telemetry stays off during training: Ultralytics sync disabled before any model exists, isolated YOLO_CONFIG_DIR"
    requirement: TRAN-04
    verification:
      - kind: unit
        ref: "backend/tests/test_training_pipeline.py#test_train_job_disables_sync_first_and_tags_the_final_validation"
        status: pass
      - kind: integration
        ref: "bash scripts/compose_smoke_test.sh (grep sync false under data/worker/ultralytics)"
        status: pass
    human_judgment: false

duration: 13min (resumed run; the interrupted first run is not counted)
completed: 2026-10-06
status: complete
commits: 2
plan_head_before: b3f8c6284de0dabdacdc6d85fb12feb0c0cbe524
plan_head_after: 77e0a4b9befb7c6387d32d05a00f393de8fe4cf9
---

# Phase 4 Plan 01: Train and Download Tracer Summary

**Image splits, a snapshotted and hard-linked YOLO dataset, a SQLite-polled worker running Ultralytics in a subprocess, automatic model registration and a `.pt` download that loads with plain `YOLO(path)`, proven end to end through nginx by the compose smoke test.**

## Performance

- **Duration:** 13 min for the resumed run (audit, verification, commits); the interrupted first run (about 33 min of implementation on 2026-10-05) is not included
- **Started (resumed run):** 2026-10-06T05:58Z
- **Completed:** 2026-10-06T06:12Z
- **Tasks:** 2
- **Files modified:** 30 (18 created, 12 modified)

## Resume Note

This plan was resumed from an interrupted execute-phase run on the same working tree. The first run wrote all the code and tests of both tasks (430 tests and ruff were green) but made no commit and wrote no SUMMARY. The resumed run did not redo that work: it audited every file against both tasks (actions, must_haves, acceptance criteria, threat-model mitigations), ran the verification that the first run could not (the compose smoke test, with Docker Desktop now running, and every grep acceptance criterion), fixed one acceptance-criterion violation, and committed per task.

## Accomplishments

- Migration 0005 and models: `images.split` with `ck_images_split`, `training_runs` (seven-value status CHECK, unique name per project), `models`; existing images stay unassigned.
- Split, run and download API: `POST /images/split`, `POST|GET /runs`, `GET /runs/{id}`, `GET /api/models/{id}/download`; all state-changing requests require `X-Requested-With`.
- Run creation takes the dataset snapshot in the same transaction as the run INSERT, refuses empty class/Train/Valid sets, and builds a hard-linked dataset (copy fallback) in a background task.
- Worker: `claim_next` atomic claim, `Supervisor` tailing `progress.jsonl`, `train_job` subprocess with analytics off, official-weights cache under `data/weights`, `final_validation` tagging, registration of `best.pt` as a model in one transaction.
- Compose: worker waits for a healthy api, `shm_size: 2gb`, `YOLO_AUTOINSTALL=false`; smoke test trains a 4-image detect project for one CPU epoch and loads the download with plain `YOLO(path)`.
- 30 new in-process tests (fake trainer) pin the whole chain; full suite is 430 tests, ruff clean.

## Task Commits

1. **Task 1: End-to-end train from the API and download a working .pt (tracer)** - `34cd0db` (feat)
2. **Task 2: Pin the pipeline in-process** - `77e0a4b` (test)

**Plan metadata:** docs commit follows this SUMMARY (`docs(04-01): complete train-download tracer plan`).

## TDD Gate Compliance

Task 2 is `tdd="true"`, but its implementation (Task 1) already existed in the working tree when the plan was resumed, so a genuine RED -> GREEN sequence could not be reproduced and no failing commit was faked. The tests are committed as `test(04-01)` characterization tests of the already-correct tracer, following the Phase 01 precedent in STATE.md ("Task 2 tests were written against Task 1's already-correct tracer implementation"). There is no RED commit and no separate GREEN commit for Task 2; the `feat(04-01)` commit (Task 1) precedes the `test(04-01)` commit.

## Files Created/Modified

See the frontmatter `key-files` lists. Highlights:

- `backend/src/yolo_trainer_api/training/service.py` - run creation, snapshot-in-transaction, preparation, read models, download name
- `backend/src/yolo_trainer_api/training/snapshot.py` - `capture_snapshot` and `materialize` (hard link + copy fallback)
- `backend/src/yolo_trainer_worker/queue.py` - claim, reconcile, progress/finish writes, `register_model`
- `backend/src/yolo_trainer_worker/supervisor.py` - Popen supervision, progress tail, finish handling
- `backend/src/yolo_trainer_worker/train_job.py` - Ultralytics entry with JSONL callbacks
- `backend/tests/test_training_pipeline.py` - 30 tests of the pipeline with the fake trainer

## Decisions Made

See `key-decisions`. All follow the plan; the `check_font` no-op in `train_job` is the one addition (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing tests extended for the new fields (files outside `files_modified`)**
- **Found during:** Task 1 (audit of the interrupted run's working tree)
- **Issue:** `test_annotations_status.py` and `test_images_api.py` assert exact dicts/key sets that are now incomplete: status-counts gained `splits` and `ImageRead` gained `split`. `test_migrations.py` needed coverage for the new head revision 0005.
- **Fix:** Added `splits` (and `split: None`) to the expected values; added two migration tests (0004 -> head keeps images unassigned and enforces `ck_images_split`; 0005 downgrades to 0004 and upgrades again keeping images). Confirmed these are the only changes in those three files.
- **Files modified:** backend/tests/test_annotations_status.py, backend/tests/test_images_api.py, backend/tests/test_migrations.py
- **Verification:** `uv run pytest backend/tests -x -q` -> 430 passed
- **Committed in:** 34cd0db (Task 1 commit)

**2. [Rule 1 - Bug against the plan's acceptance criterion] `fake_train_job.py` mentioned "ultralytics"**
- **Found during:** Task 2 (acceptance-criteria audit)
- **Issue:** `grep -c "ultralytics" backend/tests/fake_train_job.py` returned 1 (a `"ultralytics_version": "0.0.0-fake"` key in the fake result.json); the criterion requires 0. The key is optional (`register_model` reads it with `.get`) and no test asserted on it.
- **Fix:** Removed the key from the fake result.
- **Files modified:** backend/tests/fake_train_job.py
- **Verification:** grep returns 0; 39 pipeline-related tests pass
- **Committed in:** 77e0a4b (Task 2 commit)

**3. [Rule 2 - Missing critical] `train_job` no-ops Ultralytics `check_font`**
- **Found during:** Task 1 audit (code written by the interrupted run, kept)
- **Issue:** `check_det_dataset` downloads `Arial.ttf` from the internet for plots; the plan's prohibition and T4-01-08 state that a run's only outbound access is the official weights download.
- **Fix:** `train_job` replaces `ultralytics.data.utils.check_font` with an identity lambda (plots are off). The module-level name exists in the pinned Ultralytics 8.4.159 and is the one `check_det_dataset` calls.
- **Files modified:** backend/src/yolo_trainer_worker/train_job.py
- **Verification:** smoke test trains a real epoch with the patch active; covered by the `test_train_job_*` tests
- **Committed in:** 34cd0db (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1/criterion, 1 Rule 2, 1 Rule 3)
**Impact on plan:** All necessary for correctness or to satisfy the plan's own criteria; no scope creep.

## Audit Result of the Interrupted Run's Code

Everything else matched the plan and was kept unchanged: migration shape and CHECK names, claim SQL with aliased subqueries and `RETURNING`, Popen with an argument list and `start_new_session`, `final_validation` handling in both `train_job` and the supervisor, `add_task` plus `require_xhr` in the runs router, `service_healthy` (2) and `shm_size` (1) in compose, no torch/ultralytics imports in the common modules or `snapshot.py`. No `shell=True`, no `text()` in application code.

## Issues Encountered

- Docker Desktop was not running during the first run, so the smoke test was unverified; it ran for the first time here and passed on the first attempt (about 12 minutes including the torch image build). Result: `SMOKE OK`.

## Verification Results

- `bash scripts/compose_smoke_test.sh` -> exit 0, last line `SMOKE OK`, no `FAIL:` lines
- `uv run pytest backend/tests -x -q` -> 430 passed
- `uv run pytest backend/tests/test_training_pipeline.py -x -q` -> 39 passed
- `uv run ruff check backend && uv run ruff format --check backend` -> clean
- All Task 1 and Task 2 grep acceptance criteria pass (0005 revision, cancelled, ck_images_split, aliased/returning, start_new_session / no shell=True, `"sync": False`, attempt_download_asset, final_validation, add_task/require_xhr, service_healthy x2, shm_size x1, torch-free modules, 30 tests, fake trainer free of "ultralytics")

## Known Stubs

None. Intentionally deferred to later plans (not stubs): official-base-only runs (trained-model bases in 04-08), no cancel/queue removal (04-05), no SIGTERM-time handling beyond the supervisor's stop path (04-05), no UI (04-02 onward).

## Threat Flags

None. All new surface (split/run/download endpoints, subprocess, weights download, pickle load) is covered by the plan's threat model T4-01-01 to T4-01-10.

## User Setup Required

None - no external service configuration required. First training run downloads the official weights unless `data/weights/<name>.pt` already exists.

## Next Phase Readiness

- Contracts for 04-02 to 04-10 (routes, schemas, layout, run statuses, test helpers) are in place and unchanged from the plan's interfaces block.
- Unclassified assumptions carried from the plan (DATA-05 no stratification, MODL-03 register-only-on-clean-exit, TRAN-01 server-side bounds, TRAN-04 background means worker container) are implemented as stated.
- GPU path remains untested on this hardware (no NVIDIA GPU on the dev machine).

---
*Phase: 04-train-download*
*Completed: 2026-10-06*

## Self-Check: PASSED

- Files exist: all 18 created files found on disk and tracked.
- Commits exist and are ancestors of HEAD: 34cd0db, 77e0a4b.
- Acceptance criteria of both tasks re-run after the last edit: all pass.
