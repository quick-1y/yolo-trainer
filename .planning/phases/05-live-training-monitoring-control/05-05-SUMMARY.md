---
phase: 05-live-training-monitoring-control
plan: 05
subsystem: training
tags: [fastapi, sqlalchemy, alembic, sqlite, react, mantine, vitest, subprocess, cancel]

requires:
  - phase: 05-live-training-monitoring-control
    provides: "failure categories and migration 0006 (05-04), progress stream and status frames (05-01), Supervisor tick loop"
provides:
  - "migration 0007 training_runs.cancel_requested_at"
  - "POST /api/projects/{project_id}/runs/{run_id}/cancel (service.cancel_run, RUN_NOT_CANCELLABLE_DETAIL)"
  - "queue.run_control / queue.mark_cancelled; supervisor CANCELLED outcome and Supervisor._control"
  - "reconcile_on_start and reconcile_runs_on_startup cancel split (cancelled, not interrupted)"
  - "RunSummary.cancelling in the read model, the list and the stream status frame"
  - "CancelRunModal, useCancelRun, Cancelling... badge/header/body, Run cancelled announcement"
affects: [05-06-resume, 05-07-cancel-no-checkpoint-variant, 05-10-readme-and-container-smoke]

actuals:
  tokens: 14000
  tasks: 2
  commits: 3

plan_head_before: f8262d6d3420d78af5eaf15ed7e82d94fae11d63
plan_head_after: eefd62ae4bc76b7df15d8d3b9e01182da59481b1
commits: 3

tech-stack:
  added: []
  patterns:
    - "Control through the database only: the api sets a flag, the worker supervisor (single writer of run state) reads it each tick and stops its own child"
    - "Guarded UPDATE ... WHERE status = 'running' for every state transition, with a disambiguating re-select for 404/409"
    - "Cancel branch runs only while the child is alive; a child that exited on its own is finished normally"

key-files:
  created:
    - backend/src/yolo_trainer_api/migrations/versions/0007_cancel_request.py
    - backend/tests/test_runs_cancel.py
    - frontend/src/features/training/CancelRunModal.tsx
  modified:
    - backend/src/yolo_trainer_api/models.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/training/service.py
    - backend/src/yolo_trainer_api/training/stream.py
    - backend/src/yolo_trainer_api/training/reconcile.py
    - backend/src/yolo_trainer_api/routers/runs.py
    - backend/src/yolo_trainer_worker/supervisor.py
    - backend/src/yolo_trainer_worker/queue.py
    - backend/tests/fake_train_job.py
    - backend/tests/test_worker_supervisor.py
    - backend/tests/test_worker_queue.py
    - backend/tests/test_training_reconcile.py
    - backend/tests/test_run_stream.py
    - backend/tests/test_migrations.py
    - frontend/src/api/training.ts
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/features/training/RunStatusBadge.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "The api never signals a process: POST cancel only sets cancel_requested_at with one UPDATE guarded by status = 'running'; the supervisor stops its own Popen child group (SIGTERM, 10 s, SIGKILL; terminate/kill on Windows)"
  - "The cancel branch runs before the stop_event branch and only while the child is alive, re-checking process.poll() right before terminating, so a child that finished on its own stays completed"
  - "A cancelled run goes through queue.mark_cancelled, never _finish: no exit-code classification, no error message, no category, no model registered even with an interim best.pt"
  - "A running row with a pending cancel is swept to cancelled (not interrupted) by both restart sweeps; the PID is still never signalled"
  - "The stream status frame carries the boolean cancelling and withholds the timestamp"

patterns-established:
  - "Supervisor._control(run_id) -> (status, cancel_requested_at) replaces _still_running; OperationalError counts as still running"
  - "Fake trainer writes weights/last.pt + best.pt and a model_save event before every fit_epoch_end, like Ultralytics"

requirements-completed: [TRAN-06]

coverage:
  - id: D1
    description: "A user cancels a running run from its page; the run becomes cancelled within seconds, no training process is left, no model is registered and the next queued run is claimable at once (real subprocesses, CPU path)"
    requirement: TRAN-06
    verification:
      - kind: integration
        ref: "backend/tests/test_runs_cancel.py#test_cancelling_a_running_run_ends_it_without_a_model_and_the_queue_moves_on"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cancel route guards: XHR header required (403), only running runs (409 with the modal message), other project or unknown run (404), idempotent repeat (200, flag unchanged)"
    requirement: TRAN-06
    verification:
      - kind: integration
        ref: "backend/tests/test_runs_cancel.py (test_cancelling_needs_the_xhr_header, test_only_a_running_run_can_be_cancelled..., test_a_run_of_another_project..., test_a_second_cancel_while_still_running...)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Races and restarts: a child that exited first finishes normally; cancel beats a simultaneous worker stop; a pending cancel survives a worker or api restart as cancelled"
    requirement: TRAN-06
    verification:
      - kind: integration
        ref: "backend/tests/test_worker_supervisor.py (test_a_child_that_already_exited..., test_a_cancel_and_a_worker_stop_in_the_same_tick...); backend/tests/test_worker_queue.py#test_reconcile_on_start_cancels_a_running_run_with_a_pending_cancel_and_interrupts_the_rest; backend/tests/test_training_reconcile.py (pending cancel tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration 0007 upgrades a populated 0006 database with no pending cancel and downgrades/upgrades again without losing rows or AUTOINCREMENT"
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_a_populated_0006_database_upgrades_with_no_pending_cancel_and_round_trips"
        status: pass
    human_judgment: false
  - id: D5
    description: "Run page: Cancel training opener (running only, not in the list), confirm modal with Keep training focused and loading/disabled/409 states, transient Cancelling... state, Cancelling... badge in header and list, Run cancelled live-region announcement, en and ru strings"
    requirement: TRAN-06
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/training/RunPage.test.tsx (describe 'RunPage cancel training' and 'RunPage cancelling and cancelled states')"
        status: pass
    human_judgment: true
    rationale: "Visual fidelity of the light-red opener, the no-layout-shift swap to the disabled Cancelling... button and the gray badge Loader are not asserted by tests; the verifier should look at the run page once"

duration: 55min
completed: 2026-10-11
status: complete
---

# Phase 5 Plan 05: Cancel a running run Summary

**Cancel from the run page through a database flag: the api sets `cancel_requested_at`, the worker supervisor stops its own process group and writes `cancelled` (no model, no error), restart sweeps honor the flag, and the UI shows Cancelling... until the run is cancelled.**

## Performance

- **Duration:** about 55 min
- **Started:** 2026-10-11 (UTC, not captured by timestamp)
- **Completed:** 2026-10-11
- **Tasks:** 2 (1 tracer, 1 TDD)
- **Files modified:** 24 (3 created, 21 modified)

## Accomplishments

- Migration 0007 adds `training_runs.cancel_requested_at`; `POST /api/projects/{project_id}/runs/{run_id}/cancel` (XHR header required) sets it with one UPDATE guarded by `status = 'running'` and answers the run with `cancelling: true`; repeat is 200 unchanged, other states 409, foreign or unknown run 404.
- The supervisor reads `(status, cancel_requested_at)` in its existing tick, terminates its own child group and writes `cancelled` via `queue.mark_cancelled`; the next queued run is claimable immediately and no child remains (validated with real subprocesses).
- A cancelled run never registers a model even though an interim `best.pt` stays on disk, and its exit code is never classified.
- Races covered: a child that exited on its own stays `completed`; cancel plus worker stop in one tick ends `cancelled`; stop first then cancel answers 409; `reconcile_on_start` and the api startup sweep turn a running row with a pending cancel into `cancelled`, while a live worker is left to stop its own child.
- UI: `CancelRunModal` (440px, Keep training focused, loading/disabled/Esc-lock, red Alert on 409, re-fetch on close), header opener and disabled "Cancelling..." button, "Cancelling..." body without bars or ETA, gray "Cancelling..." badge in header and list, "Run cancelled" live-region announcement, en and ru strings.

## Task Commits

1. **Task 1: End-to-end cancel, one path only (tracer)** - `523f296` (feat)
2. **Task 2 RED: failing tests for races, restart sweeps, stream flag, badge** - `a8f2e9a` (test)
3. **Task 2 GREEN: restart sweeps, stream flag, badge, announcer** - `eefd62a` (feat)

**Plan metadata:** committed separately after this file (docs: complete plan)

## TDD Gate Compliance (Task 2)

- **RED (`a8f2e9a`):** 5 backend tests failed on the planned assertions (`'interrupted' == 'cancelled'` x3 for the two sweeps and `KeyError: 'cancelling'` x2 for the status frame) and 2 frontend tests failed (`Unable to find an element with the text: Cancelling…` in the badge; the live region never reads "Run cancelled"). Semantic assessment: each target test executed and failed on the intended behavior, not on import, fixture or syntax errors. The formal `gsd_run check tdd-red-evidence` classifier was not run (pytest and Vitest output was inspected by hand). The guard, race and 409-modal regression tests added in the same commit already passed, because the tracer slice (Task 1) implemented those behaviors; they are kept as regression coverage, not as RED evidence.
- **GREEN (`eefd62a`):** all 7 pass; full suites green (backend 776 passed, 3 deselected; frontend 833 passed; ruff check and format clean; `tsc` + `vite build` clean).
- **REFACTOR:** none needed.

## Decisions Made

See `key-decisions` above. Additional detail: `Supervisor._control` replaces `_still_running` and is also used for the final "row vanished" check after the loop; a busy database counts as "still running, no cancel" so a locked SQLite never cancels or abandons a training.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/race] Re-check `process.poll()` immediately before terminating for a cancel**
- **Found during:** Task 1 (supervisor cancel branch)
- **Issue:** The plan's tick order polls the child at the top of the tick; a child could finish between that poll and the control read, and a cancel would then overwrite a successful run as `cancelled`.
- **Fix:** The cancel branch requires `process.poll() is None` at the moment the flag is seen; otherwise the normal finish decides (tested with a stub process `[None, 0]`).
- **Files modified:** `backend/src/yolo_trainer_worker/supervisor.py`
- **Committed in:** `523f296`

**2. [Rule 3 - Blocking/naming] `stubTrainingApi` records cancel calls in `cancels`, not `posts`**
- **Found during:** Task 1 (frontend test stub)
- **Issue:** The plan asks for "a `posts` record", but `posts` already holds the bodies of `POST /runs`; reusing it would break existing tests' meaning.
- **Fix:** Added `cancels: string[]` (paths of every cancel POST) plus `cancelStatus`, `cancelResult`, `cancelDetail`, `cancelGate` options.
- **Files modified:** `frontend/src/test/trainingApi.ts`
- **Committed in:** `523f296`

**3. [Rule 2 - Missing critical] `mark_cancelled` returning 0 ends the run as `vanished`, not `cancelled`**
- **Found during:** Task 1
- **Issue:** If the row disappeared or left `running` between the control read and the write, reporting `cancelled` would be false.
- **Fix:** `outcome = CANCELLED if changed else VANISHED`.
- **Files modified:** `backend/src/yolo_trainer_worker/supervisor.py`
- **Committed in:** `523f296`

---

**Total deviations:** 3 auto-fixed (1 race bug, 1 test-helper naming, 1 correctness guard)
**Impact on plan:** All necessary for correctness; no scope creep.

### Process notes

- The per-plan commit ledger file (`gsd-plan-head-before-05-05` in the git dir) was not written because the shell guard refused the compound command; the base `f8262d6d3420d78af5eaf15ed7e82d94fae11d63` was recorded from the worktree branch check and `commits: 3` is measured with `git rev-list --count f8262d6..HEAD`.
- The tracer feedback gate (re-run of `<verify>` before expansion) was satisfied by running the backend and frontend verify commands on the committed slice before Task 2 started; they passed.
- `uv run` was not used; tests ran with the main checkout interpreter and `PYTHONPATH` pointing at the worktree sources, as instructed.

## Issues Encountered

None blocking.

## Known Stubs

None.

## Threat Flags

None. The only new network surface is `POST .../cancel`, covered by the plan's threat model (T-05-13 XHR guard + 403 test, T-05-14 api never signals, grep gate 0, T-05-15 guarded UPDATEs and race tests, T-05-16 scoping by project id + 404 test).

## Not done here (by plan)

- README note on the native-Windows abrupt cancel (DataLoader grandchildren may survive with workers > 0): Plan 05-10.
- Real-container check (no `train_job` process left, next run starts): Plan 05-10 smoke stage.
- `CancelRunModal` no-checkpoint variant (`run.cancel.bodyNoCheckpoint`): Plan 05-07.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `cancelled` runs now exist with an interim `best.pt` and `last.pt` on disk, ready for the resume and interim-download plans.
- No blockers.

## Self-Check: PASSED

- Created files exist: `0007_cancel_request.py`, `test_runs_cancel.py`, `CancelRunModal.tsx`.
- Commits `523f296`, `a8f2e9a`, `eefd62a` are ancestors of HEAD.
- Plan acceptance greps: all pass (down_revision "0006" = 1, `mark_cancelled` = 1, `run_control` = 1, `/cancel` in router >= 1, `require_xhr` = 4, signalling words in service/router = 0, `useCancelRun` in modal = 2, `CancelRunModal` in TrainingPage = 0, `cancel_requested_at` in reconcile = 1 and queue = 4, `cancelling` in badge = 6).

---
*Phase: 05-live-training-monitoring-control*
*Completed: 2026-10-11*
