---
phase: 05-live-training-monitoring-control
plan: 09
subsystem: training
tags: [fastapi, sqlalchemy, react, mantine, i18n, run-delete, interim-download]

requires:
  - phase: 05-live-training-monitoring-control
    provides: "remove_queued_run, RESUMABLE_STATUSES, run_read, ResumeButton, CancelRunModal, shared alert action row (05-05..05-08)"
provides:
  - "DELETE /api/projects/{project_id}/runs/{run_id} hard-deletes a finished run with its folder and registered model (guarded)"
  - "storage.remove_run_files, the single removal path shared by project delete and run delete"
  - "GET /api/projects/{project_id}/runs/{run_id}/interim-best and RunRead.interim_best"
  - "DeleteRunModal, useDeleteRun, interimBestUrl, run page Delete run action and interim download (en + ru)"
affects: [05-verification, phase-06-model-management]

actuals:
  tokens: 60000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "One guarded DELETE statement (terminal status AND NOT EXISTS active dependent) instead of check-then-delete"
    - "Rows first, files after, through a shared log-and-skip file removal helper"
    - "Interim file derived from integer ids only; single-run read touches the disk in a thread, the list never does"

key-files:
  created:
    - backend/tests/test_runs_delete.py
    - backend/tests/test_runs_interim.py
    - frontend/src/features/training/DeleteRunModal.tsx
  modified:
    - backend/src/yolo_trainer_api/storage.py
    - backend/src/yolo_trainer_api/routers/projects.py
    - backend/src/yolo_trainer_api/routers/runs.py
    - backend/src/yolo_trainer_api/training/service.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/tests/test_runs_remove.py
    - backend/tests/test_training_cleanup.py
    - frontend/src/api/training.ts
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/FailureAlert.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "Task 1 decision (user, via the orchestrator): guarded-delete. D-15 as decided plus the base-in-use guard: DELETE is refused with 409 while this run's registered model is the base of a preparing, queued or running run. literal-delete was not chosen."
  - "The base-in-use guard is a NOT EXISTS clause inside the one DELETE statement (aliased TrainingRun), so a run claimed or resumed between the lookup and the delete can never be deleted."
  - "A never-resumed queued run still goes through remove_queued_run (queue removal); preparing/running answer RUN_ACTIVE_DETAIL; a resumed queued run keeps the 05-07 409."
  - "Interim download is offered for failed, interrupted and cancelled runs (UI-SPEC default 6 extends D-08); it is never registered and never listed in the base-model picker."
  - "UnfinishedActions (interrupted/cancelled alerts) and the FailureAlert action row carry the interim anchor; the note sits directly under the row."

patterns-established:
  - "Shared storage.remove_run_files: project delete and run delete use one removal path whose direct-child, non-symlink guards stay the only deletion calls"
  - "Header actions are one nowrap Group so the run title shrinks first"

requirements-completed: [TRAN-08, TRAN-06]

coverage:
  - id: D1
    description: "A finished run is hard-deleted with its folder, registered model row and file; fine-tuned models elsewhere keep the base name as text (base_model_id NULL)"
    requirement: "TRAN-08"
    verification:
      - kind: integration
        ref: "backend/tests/test_runs_delete.py#test_deleting_a_completed_run_removes_row_folder_and_model"
        status: pass
      - kind: integration
        ref: "backend/tests/test_runs_delete.py#test_a_model_fine_tuned_from_the_deleted_one_keeps_the_base_name"
        status: pass
    human_judgment: false
  - id: D2
    description: "Active runs cannot be deleted; a model that is the base of a preparing, queued or running run blocks the delete and nothing is removed; resumed queued run keeps 05-07's 409"
    requirement: "TRAN-08"
    verification:
      - kind: integration
        ref: "backend/tests/test_runs_delete.py#test_preparing_and_running_runs_answer_409_and_stay"
        status: pass
      - kind: integration
        ref: "backend/tests/test_runs_delete.py#test_a_model_that_is_the_base_of_an_active_run_blocks_the_delete"
        status: pass
      - kind: integration
        ref: "backend/tests/test_runs_delete.py#test_a_resumed_queued_run_answers_409_and_stays"
        status: pass
    human_judgment: false
  - id: D3
    description: "Project delete and run delete share storage.remove_run_files"
    requirement: "TRAN-08"
    verification:
      - kind: integration
        ref: "backend/tests/test_runs_delete.py#test_project_delete_removes_run_folders_and_models_through_the_shared_helper"
        status: pass
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_a_failing_run_folder_removal_does_not_fail_the_delete"
        status: pass
    human_judgment: false
  - id: D4
    description: "Run page Delete run (light red, before the primary action), confirm dialog naming the run and, when present, the model in bold; success navigates to the list with a green notification; 409 keeps the dialog open"
    requirement: "TRAN-08"
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage delete run"
        status: pass
    human_judgment: true
    rationale: "Visual weight (light red opener, 600-weight model sentence, 440px wrap) is specified by the UI-SPEC; automation asserts structure and text, not the look"
  - id: D5
    description: "Interim best.pt download for cancelled/interrupted/failed runs with a non-empty best.pt: attachment <project>_<run>_interim_best.pt, 404 for active/completed/missing/zero-size/foreign, never a registered model or base option"
    requirement: "TRAN-06"
    verification:
      - kind: integration
        ref: "backend/tests/test_runs_interim.py"
        status: pass
      - kind: automated_ui
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage interim best.pt"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-10-12
status: complete
plan_head_before: f17dc325c57447bbc231ed8fcb0efb39bcf86ef1
plan_head_after: bc7f59a406eed3205a656c157c64efd358f378bc
---

# Phase 5 Plan 09: Run delete and interim best.pt Summary

**Guarded one-way run delete (one DELETE statement: terminal status and no active dependent run) sharing `storage.remove_run_files` with project delete, plus a clearly-incomplete interim best.pt download for unfinished runs, with a confirm dialog that names the model**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-12T06:54:00Z
- **Completed:** 2026-10-12T07:07:11Z
- **Tasks:** 3 (1 decision checkpoint resolved by the orchestrator, 1 tracer, 1 TDD)
- **Files modified:** 17 (3 created)

## Task 1 decision record (checkpoint:decision, resolved before dispatch)

The orchestrator presented the one-way door to the user, who selected **guarded-delete**: D-15 as decided plus the base-in-use guard. `DELETE` is refused with 409 "The model of this run is the base of a run that is still active. Wait until that run finishes." while the run's registered model is the base of a preparing, queued or running run, and nothing is removed. There is no code commit for Task 1; Tasks 2 and 3 were built with the guard.

## Accomplishments

- Run delete: `service.delete_run` selects the run by (id, project_id), delegates a queued run to the existing queue removal, refuses preparing/running with `RUN_ACTIVE_DETAIL`, and for a finished run issues ONE `DELETE ... WHERE id, project_id, status IN terminal AND NOT EXISTS (another run with base_model_id IN model_ids AND status IN preparing/queued/running)`. A rowcount of 0 is re-selected to answer 404, the active 409 or the in-use 409. Model rows follow through the `source_run_id` cascade; `base_model_id` on other runs becomes NULL while `base_name` stays as text. Files are removed afterwards through `storage.remove_run_files`.
- `storage.remove_run_files(settings, run_ids, model_ids)` replaces the inline loops of `_remove_project_files`; project delete behavior is unchanged and `remove_run_dir` / `remove_model_file` remain the only deletion calls (no `shutil.rmtree` in the service).
- Interim download: `GET .../interim-best` (404 `INTERIM_NOT_FOUND_DETAIL` for active, completed, missing, zero-size and foreign runs), `interim_best_file` helper, `RunRead.interim_best` on the single-run read only (the list never touches the disk). Nothing registers the file.
- Frontend: `DeleteRunModal` (440px, Keep run focused, bold model sentence only when the run has a model, loading/disabled while pending, 409 shown in a red Alert), `useDeleteRun` (removes the run query, invalidates runs, the base-model options and the project), header actions as one nowrap group, interim anchor with the incomplete note in the interrupted/cancelled alerts and the failure alert, en + ru copy.

## Task Commits

1. **Task 1: Confirm the irreversible run-delete contract** - no commit (decision recorded above: guarded-delete)
2. **Task 2: Delete a finished run with its folder and model (tracer)**
   - `0cae7fd` feat(05-09): backend delete contract, `remove_run_files`, `RunModelRef.name`
   - `4ea292d` feat(05-09): `DeleteRunModal`, run page action, i18n
3. **Task 3: Interim best.pt download (TDD)**
   - `8118195` test(05-09): failing backend tests (RED)
   - `116ab0d` test(05-09): failing run page tests (RED)
   - `6a29b85` feat(05-09): `interim-best` route, `interim_best_file`, `RunRead.interim_best` (GREEN)
   - `bc7f59a` feat(05-09): interim anchor and note on the run page (GREEN)

**Plan metadata:** the commit containing this SUMMARY (docs: complete plan)

## TDD evidence (Task 3)

- RED: `backend/tests/test_runs_interim.py` failed on the planned behavior (10 failed, 1 passed: the missing route answered 404/AttributeError where 200 and the filename header were expected); `RunPage interim best.pt` failed 5 of 9 on the missing link. Semantic assessment: both failed because the feature did not exist, not because of setup or syntax faults. The RED run output was inspected directly; the repo's `check tdd-red-evidence` classifier was not run (this plan is not `type: tdd`).
- GREEN: backend 29 passed on the targeted files, 883 passed on the full suite; frontend 927 passed.
- No REFACTOR commit.

## Files Created/Modified

- `backend/src/yolo_trainer_api/storage.py` - `remove_run_files`
- `backend/src/yolo_trainer_api/routers/projects.py` - `_remove_project_files` calls `remove_run_files`
- `backend/src/yolo_trainer_api/training/service.py` - `delete_run`, `TERMINAL_RUN_STATUSES`, `RUN_ACTIVE_DETAIL`, `RUN_MODEL_IN_USE_DETAIL`, `INTERIM_NOT_FOUND_DETAIL`, `interim_best_file`, `_model_ref` sets `name`
- `backend/src/yolo_trainer_api/routers/runs.py` - DELETE route calls `delete_run`; `interim-best` route
- `backend/src/yolo_trainer_api/schemas.py` - `RunModelRef.name`, `RunRead.interim_best`
- `backend/tests/test_runs_delete.py`, `test_runs_interim.py` - new; `test_runs_remove.py`, `test_training_cleanup.py` - updated
- `frontend/src/features/training/DeleteRunModal.tsx` - new confirm dialog
- `frontend/src/features/training/RunPage.tsx`, `FailureAlert.tsx` - Delete run action, interim anchor and note
- `frontend/src/api/training.ts`, `frontend/src/test/trainingApi.ts`, en/ru `training.json`, `RunPage.test.tsx`

## Decisions Made

See `key-decisions`. In short: guarded-delete chosen by the user; the guard lives inside the single DELETE statement; interim download covers failed, interrupted and cancelled runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated the existing test that monkeypatched the project router's removal call**
- **Found during:** Task 2
- **Issue:** `test_training_cleanup.py::test_a_failing_run_folder_removal_does_not_fail_the_delete` patched `projects_router.remove_run_dir`; after the move into `storage.remove_run_files` the router no longer owns that name.
- **Fix:** it now patches `storage.remove_run_dir`; the assertion (delete still 204, error logged with the run id, model file removed) is unchanged and still passes, which also proves the shared helper keeps the log-and-skip behavior.
- **Files modified:** `backend/tests/test_training_cleanup.py` (not in the plan's `files_modified`)
- **Committed in:** `0cae7fd`

**2. [Rule 1 - Behavior change in existing tests] `test_runs_remove.py` assertions for completed/failed/preparing runs**
- **Issue:** the plan announced that completed and failed runs no longer answer 409; a preparing/running run now answers `RUN_ACTIVE_DETAIL` instead of `RUN_NOT_QUEUED_DETAIL`.
- **Fix:** tests updated (failed and completed are deleted with 204; running and preparing answer `RUN_ACTIVE_DETAIL`).
- **Committed in:** `0cae7fd`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 announced test update). **Impact:** none on scope; both follow directly from the plan's own contract change.

## Issues Encountered

- The frontend tests for Task 2 passed on the first run because the implementation and tests were written together for the tracer slice (not a `tdd="true"` task); the backend tests for Task 2 were run RED first (409 instead of 204).
- Worktree harness rejects compound shell commands; steps were split into plain commands.

## Known Stubs

None.

## Threat Flags

None. The new endpoint (`interim-best`) and the widened DELETE are the ones in the plan's threat model (T-05-27..T-05-32): DELETE keeps `require_xhr`, paths come from integer ids, runs are looked up by (id, project_id), the download name reuses `model_download_name` sanitization.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 05-09 is the last plan of Phase 5; phase verification can check TRAN-06 and TRAN-08 end to end.
- Not covered by automation: the real worker-driven cancel producing a best.pt with a real Ultralytics run (the interim tests write a fake file) and a visual check of the delete dialog.

## Self-Check: PASSED

- Created files exist: `backend/tests/test_runs_delete.py`, `backend/tests/test_runs_interim.py`, `frontend/src/features/training/DeleteRunModal.tsx`.
- Commits `0cae7fd`, `4ea292d`, `8118195`, `116ab0d`, `6a29b85`, `bc7f59a` are ancestors of HEAD (6 measured commits from `plan_head_before`).
- Acceptance criteria re-run: `def test_` count in `test_runs_delete.py` is 11 (>= 6); `remove_run_files` defined once in `storage.py` and used in `routers/projects.py`; no `shutil.rmtree` in `service.py`; `useDeleteRun` in `DeleteRunModal.tsx`; `interim-best` and `_interim` in `routers/runs.py`; `interimBestUrl` in `RunPage.tsx` and `FailureAlert.tsx`.
- Plan verification: backend 883 passed (5 deselected `-m training`), `ruff check` and `ruff format --check` clean; frontend `npm run build` OK and 927 tests passed.

---
*Phase: 05-live-training-monitoring-control*
*Completed: 2026-10-12*
