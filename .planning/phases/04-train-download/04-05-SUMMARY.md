---
phase: 04-train-download
plan: 05
subsystem: worker
tags: [fastapi, sqlalchemy, sqlite, ultralytics, pytest, subprocess, reconciliation]

requires:
  - phase: 04-train-download
    provides: "04-01 tracer: queue, supervisor, train_job, progress helpers, fake trainer"
provides:
  - "api startup sweep: preparing -> failed (folder removed), running -> interrupted only without a fresh worker heartbeat"
  - "worker heartbeat key active_run_id, read from the supervisor on every beat"
  - "supervisor: vanished-run detection every tick, child always terminated on any error, busy-database tolerance"
  - "register_model removes a partial model file when linking or copying fails"
  - "train_job.configure_ultralytics and the pytest marker `training` (deselected by default)"
  - "real 2-epoch CPU training test that registers best.pt and loads it in a fresh process"
affects: [04-06, 04-07, 04-08, docker, verify-work]

actuals:
  tokens: 12000
  tasks: 3
  commits: 5

plan_head_before: 7133fedfa83ea578cfd3085009a8c922b6719bac
plan_head_after: 4333b80081d1339a134fed83638aec1e1112d329

tech-stack:
  added: []
  patterns:
    - "Restart reconciliation split by owner: the api sweeps preparing/running, the worker sweeps running at its own start; neither ever signals a recorded PID"
    - "Supervisor never lets a child outlive its supervision: terminate in an except BaseException around the watch loop"
    - "Opt-in slow tests behind a pytest marker with addopts -m 'not training'"

key-files:
  created:
    - backend/src/yolo_trainer_api/training/reconcile.py
    - backend/tests/test_worker_queue.py
    - backend/tests/test_training_reconcile.py
    - backend/tests/test_worker_supervisor.py
    - backend/tests/test_progress.py
    - backend/tests/test_train_job.py
  modified:
    - backend/src/yolo_trainer_api/main.py
    - backend/src/yolo_trainer_worker/main.py
    - backend/src/yolo_trainer_worker/queue.py
    - backend/src/yolo_trainer_worker/supervisor.py
    - backend/src/yolo_trainer_worker/train_job.py
    - backend/pyproject.toml
    - backend/tests/test_worker.py
    - backend/tests/fake_train_job.py
    - backend/tests/training_helpers.py

key-decisions:
  - "The run-state check runs on every supervisor tick as one tiny SELECT; a row that is gone or not 'running' stops the child and returns 'vanished' (a deleted project cascades the run away between epochs, so no progress event would reveal it)"
  - "A transient OperationalError while recording an epoch or checking the row is logged and skipped instead of killing a long training"
  - "The interrupted message lives once in yolo_trainer_api.training.reconcile (RUNNING_INTERRUPTED_DETAIL); the worker queue re-exports it as INTERRUPTED_ON_RESTART_MESSAGE"
  - "Ultralytics keeps its settings file at YOLO_CONFIG_DIR/Ultralytics/settings.json and falls back to the current working directory when YOLO_CONFIG_DIR does not exist; the supervisor already creates the directory, and the test mirrors that"

patterns-established:
  - "Test the restart of the api by opening a second make_client on the same DATA_DIR after seeding through the first"
  - "Record every spawned child (subclassed Popen) in supervisor tests so 'the child has exited' is provable cross-platform"

requirements-completed: [TRAN-04, MODL-01, MODL-03]

coverage:
  - id: D1
    description: "FIFO queue across projects with one running run; concurrent claims yield exactly one id"
    requirement: TRAN-04
    verification:
      - kind: unit
        ref: "backend/tests/test_worker_queue.py#test_claim_next_is_fifo_across_projects_and_waits_while_a_run_is_running"
        status: pass
      - kind: unit
        ref: "backend/tests/test_worker_queue.py#test_two_workers_claiming_at_once_get_exactly_one_run"
        status: pass
    human_judgment: false
  - id: D2
    description: "Restarts of the api, the worker or both never leave a run stuck as preparing or running; an api-only restart keeps a live run"
    requirement: TRAN-04
    verification:
      - kind: integration
        ref: "backend/tests/test_training_reconcile.py (5 tests)"
        status: pass
      - kind: unit
        ref: "backend/tests/test_worker_queue.py#test_reconcile_on_start_interrupts_running_runs_without_signalling_any_pid"
        status: pass
    human_judgment: false
  - id: D3
    description: "A stop signal, a vanished row, a failure, a crash, a class mismatch and a registration failure each end with an honest status and no orphan child"
    requirement: TRAN-04
    verification:
      - kind: integration
        ref: "backend/tests/test_worker_supervisor.py (7 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Heartbeat reports active_run_id"
    requirement: TRAN-04
    verification:
      - kind: unit
        ref: "backend/tests/test_worker.py#TestBuildHeartbeat and TestRun"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real 2-epoch CPU training emits the callback stream, registers best.pt and the file loads and predicts in a fresh process; analytics are off in the isolated settings"
    requirement: MODL-03
    verification:
      - kind: e2e
        ref: "uv run pytest -m training backend/tests/test_train_job.py (1 passed, yolo26n.pt from the repo root)"
        status: pass
      - kind: unit
        ref: "backend/tests/test_train_job.py#test_the_isolated_ultralytics_settings_file_has_analytics_off"
        status: pass
    human_judgment: false
  - id: D6
    description: "A missing official weights file that cannot be downloaded fails the run in plain words"
    requirement: MODL-01
    verification:
      - kind: unit
        ref: "backend/tests/test_train_job.py#test_missing_official_weights_that_cannot_be_downloaded_fail_with_a_plain_message"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-10-10
status: complete
---

# Phase 4 Plan 05: Runs survive restarts, stops and failures Summary

**Restart reconciliation (api sweep plus worker heartbeat `active_run_id`), a supervisor that never orphans or mislabels a training child, and a real 2-epoch CPU yolo26n run proving the callback stream and a `YOLO(path)`-loadable registered model**

## Performance

- **Duration:** about 45 min
- **Started:** 2026-10-10T08:55:00Z (approximate; the start time was not captured by the run)
- **Completed:** 2026-10-10T09:40:00Z
- **Tasks:** 3
- **Files modified:** 15 (6 created, 9 modified)

## Accomplishments

- API startup now sweeps stale runs: `preparing` becomes `failed` with the "Dataset preparation was interrupted by a restart. Start the run again." message and loses its folder; `running` becomes `interrupted` only when the worker heartbeat is missing or older than 60 s, so an api-only restart never kills the status of a live run. Nothing ever signals a recorded PID.
- The worker heartbeat carries `active_run_id` (read from `supervisor.active_run_id` on every beat).
- The supervisor now checks the run row each tick: a deleted run stops the child and returns `"vanished"`; any exception in the watch loop terminates the child before propagating; a busy database no longer aborts a long training. `register_model` removes a partial model file when linking or copying fails, so a registered row always has its file.
- A real CPU run (`pytest -m training`) produces exactly two `fit_epoch_end` events with `final_validation` false and one with true, records epoch 2 of 2, registers only `best.pt`, and the registered file loads and predicts in a fresh process (`detect`, `['box']`, `PREDICT_OK`). It passed in about 25 s with `yolo26n.pt` from the repo root.

## Task Commits

1. **Task 1: queue order and restarts** - RED `04c8c6b` (test), GREEN `14c8f02` (feat)
2. **Task 2: stop, failure, vanish, registration failure** - RED `7128af3` (test), GREEN `63c3bf8` (feat)
3. **Task 3: real CPU training proof** - `4333b80` (feat; not a TDD task)

**Plan metadata:** committed separately after this file (docs: complete plan).

## TDD Gate Compliance

Plan type is `execute` with `tdd="true"` on Tasks 1 and 2, so the format-based `check tdd-red-evidence` classifier (type: tdd plans) was not applied; RED was assessed by hand from the pytest output.

- **Task 1 RED:** `test_worker.py` failed on the planned assertions (`active_run_id` missing from the exact key set; `build_heartbeat` and `run` rejecting the new keyword arguments) and `test_training_reconcile.py` failed to collect because `yolo_trainer_api.training.reconcile` did not exist. `test_worker_queue.py` passed on arrival: claim ordering, single running run and `reconcile_on_start` were already implemented by 04-01, so those tests are characterization tests that now pin the behavior.
- **Task 2 RED:** three tests failed for the intended reasons: the deleted-run test (supervisor kept supervising, no `"vanished"`), the watch-loop-error test (child left running after `RuntimeError`) and the registration-failure test (a partial `models/1.pt` left behind). The stop, failure, crash, mismatch and progress-helper tests passed on arrival (behavior from 04-01) and now pin it. One test of mine was wrong, not the code (`clean_log_tail` keeps leading spaces), and was fixed before the RED commit.
- GREEN commits exist for both tasks; no REFACTOR commit was needed.

## Files Created/Modified

- `backend/src/yolo_trainer_api/training/reconcile.py` - api startup sweep and the two interrupted/failed messages
- `backend/src/yolo_trainer_api/main.py` - lifespan awaits the sweep after the sessionmaker exists, before orphan cleanup
- `backend/src/yolo_trainer_worker/main.py` - `active_run_id` in the heartbeat; the supervisor is built before the heartbeat thread starts
- `backend/src/yolo_trainer_worker/queue.py` - shared interrupted message, `run_status`, partial-file cleanup in `register_model`
- `backend/src/yolo_trainer_worker/supervisor.py` - vanished detection, child termination on errors, `getpgid` process-group signalling
- `backend/src/yolo_trainer_worker/train_job.py` - `configure_ultralytics`
- `backend/pyproject.toml` - `training` marker and `-m 'not training'`
- Tests: `test_worker_queue.py`, `test_training_reconcile.py`, `test_worker_supervisor.py`, `test_progress.py`, `test_train_job.py` (new); `test_worker.py`, `fake_train_job.py` (noisy failure), `training_helpers.py` (`size` parameter) updated

## Decisions Made

See `key-decisions` above. The notable one: the existence check runs every tick rather than only on progress events, because deleting a project cascades its runs away while the child sleeps between epochs and no event would ever reveal it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Child could outlive its supervision**
- **Found during:** Task 2
- **Issue:** `Supervisor.serve` catches an exception from `run_claimed` and marks the run failed, but the training subprocess kept running unsupervised (and the next run could then start on top of it).
- **Fix:** `_run` terminates the child in an `except BaseException` around record_start and the watch loop before re-raising. Covered by `test_an_error_inside_the_watch_loop_never_leaves_the_child_training`.
- **Files modified:** `backend/src/yolo_trainer_worker/supervisor.py`
- **Committed in:** `63c3bf8`

**2. [Rule 2 - Missing Critical] Periodic row check, busy-database tolerance**
- **Found during:** Task 2
- **Issue:** The plan's vanished behavior was only detectable when a progress event arrived (`record_epoch` rowcount 0). A run deleted between epochs would train to the end; a transient `database is locked` on `record_epoch` would abort the supervision.
- **Fix:** `queue.run_status` plus `_still_running` each tick; an `OperationalError` there or in `record_epoch` is logged and skipped. The outcome string is now `"vanished"` (was `"gone"`).
- **Files modified:** `backend/src/yolo_trainer_worker/supervisor.py`, `backend/src/yolo_trainer_worker/queue.py`
- **Committed in:** `63c3bf8`

**3. [Rule 1 - Bug] Partial model file survived a failed copy**
- **Found during:** Task 2
- **Issue:** `register_model` set `created` only after `link_or_copy` returned, so a copy that failed half-way left `data/models/<id>.pt` behind with no row.
- **Fix:** `created` is set before the link/copy call.
- **Files modified:** `backend/src/yolo_trainer_worker/queue.py`
- **Committed in:** `63c3bf8`

**4. [Rule 3 - Blocking] `setup_project` could not make 64x64 images**
- **Found during:** Task 3
- **Issue:** The plan asks for 64x64 synthetic images; the helper hard-coded 96x96 with a matching rectangle.
- **Fix:** optional `size` parameter; the rectangle and the annotated box scale with it; the default is unchanged.
- **Files modified:** `backend/tests/training_helpers.py`
- **Committed in:** `4333b80`

---

**Total deviations:** 4 auto-fixed (1 bug, 2 missing critical, 1 blocking)
**Impact on plan:** All necessary for the plan's own truths ("the supervisor stops the child", "no model row or file remain"); no scope creep.

## Issues Encountered

- Ultralytics 8.4.159 stores its settings at `YOLO_CONFIG_DIR/Ultralytics/settings.json` (a sub-directory is appended) and silently falls back to `<cwd>/Ultralytics` when `YOLO_CONFIG_DIR` does not exist. The first version of the analytics-off test hit that fallback (it created a stray `Ultralytics/` folder in the repo root, since removed). Production is safe because the supervisor creates `data/worker/ultralytics` before spawning the child; the test now does the same and searches recursively for `settings.json`.
- `yolo26n.pt` is git-ignored and absent from a fresh worktree; I copied it from the main checkout to run the `training` test, and it stays git-ignored.
- Bash invocations in this worktree refuse chained git commands, so git steps were run as separate calls.

## Known Stubs

None.

## Threat Flags

None - no new network endpoints, auth paths or trust-boundary file access beyond the plan's threat model (T4-05-01..06 all have tests: child exit after stop, no PID signalling, sweep messages, ANSI-free log tail, analytics-off settings file, rollback plus file removal).

## User Setup Required

None - no external service configuration required. To run the real-training test locally: `uv run pytest -m training backend/tests/test_train_job.py` with `yolo26n.pt` in the repository root (or internet access).

## Next Phase Readiness

- Restart and stop semantics are in place for the UI plans (04-07/04-08) to rely on the `interrupted`, `failed` messages and the clean `log_tail`.
- Full suite: 456 passed, 1 deselected (`training`), ruff check and format clean.
- Not verified here: the SIGTERM path on POSIX inside the real container (`stop_grace_period` 20 s). The code uses `killpg(getpgid(pid), SIGTERM)` then SIGKILL after 10 s; the tests exercised it through `terminate()`/`kill()` on Windows only.

---
*Phase: 04-train-download*
*Completed: 2026-10-10*

## Self-Check: PASSED

All created files exist on disk and all five task commits (04c8c6b, 14c8f02, 7128af3, 63c3bf8, 4333b80) are ancestors of HEAD.
