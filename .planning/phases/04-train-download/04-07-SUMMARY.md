---
phase: 04-train-download
plan: 07
subsystem: training
tags: [fastapi, sqlalchemy, react, mantine, vitest, pytest, tdd]

requires:
  - phase: 04-train-download
    provides: "Plan 04-01 queue/worker/download route, Plan 04-02 run page and training API client, Plan 04-05 restart/interrupted handling"
provides:
  - "DELETE /api/projects/{project_id}/runs/{run_id} with training.service.remove_queued_run and RUN_NOT_QUEUED_DETAIL"
  - "Pinned .pt download contract tests (headers, sanitized filename, 404s)"
  - "RunPage cards for failed, interrupted and cancelled runs; RunSettingsCard; RunFailureLog; RemoveFromQueueModal; useRemoveQueuedRun"
affects: [04-06, 04-09, phase-05-resume]

actuals:
  tokens: 60000
  tasks: 2
  commits: 4
plan_head_before: c3f46925865ba87f03d9fa6c14046ef3e191c41d
plan_head_after: 3604dd0d82c369706a043d5b10302095fc1720cb

tech-stack:
  added: []
  patterns:
    - "Guarded DELETE ... WHERE status = 'queued' racing the worker's guarded claim UPDATE; rows first, files after"
    - "Process output (error_message, log_tail) rendered as text only in Code/Text"

key-files:
  created:
    - backend/tests/test_runs_remove.py
    - backend/tests/test_models_download.py
    - frontend/src/features/training/RunSettingsCard.tsx
    - frontend/src/features/training/RunFailureLog.tsx
    - frontend/src/features/training/RemoveFromQueueModal.tsx
  modified:
    - backend/src/yolo_trainer_api/routers/runs.py
    - backend/src/yolo_trainer_api/training/service.py
    - frontend/src/api/training.ts
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "Dataset-counts template lives at training:settings.dataset_counts because the UI-SPEC uses settings.dataset for both the row label and the template"
  - "remove_queued_run reuses the existing _remove_folder helper (to_thread, failures logged) after the commit"
  - "Collapse uses the Mantine 'expanded' prop of the installed version; tests wait for the deferred reveal"

requirements-completed: [TRAN-03, TRAN-04, MODL-04]

duration: 75min
completed: 2026-10-10
status: complete
---

# Phase 4 Plan 07: Run page states, settings card, queue removal and download contract Summary

**Race-safe removal of queued runs (guarded DELETE vs. the worker claim), a pinned `.pt` download contract, and a run page that explains failed, interrupted and cancelled runs and shows each run's frozen settings.**

## Performance

- **Tasks:** 2 (both TDD)
- **Files modified:** 13 (5 created, 8 modified)
- **Commits:** 4 (RED/GREEN for backend, RED/GREEN for frontend)

## Accomplishments

- `DELETE /api/projects/{project_id}/runs/{run_id}`: 204 for a queued run (row and folder gone, later runs move up), 409 with the pinned message for preparing/running/completed/failed runs, 404 for unknown or foreign runs, 403 without `X-Requested-With`.
- The race with `claim_next` is covered: a claimed run answers 409, a removed run is never claimed.
- Download contract pinned by 7 tests: `application/octet-stream`, attachment, `Plates_run-3_best.pt`, Cyrillic as `filename*=utf-8''...`, leading dots stripped, at most 120 characters, 404 for unknown id and for a missing file.
- Run page: red failed Alert with message (or fallback) and a collapsed log with copy; orange interrupted Alert with last epoch and "New training" link; gray cancelled Alert; "Settings used" card on every status ("Auto (CPU)", "Auto (16)", "Auto" before resolution; unknown started/finished rows omitted); "Remove from queue" modal with Cancel focus, pending lock, 409 inside the modal and run re-fetch on close.

## Task Commits

1. **Task 1 RED:** `1aa9af8` (test) - 8 remove tests failing with 405, 7 download tests
2. **Task 1 GREEN:** `7415a7e` (feat) - `remove_queued_run`, DELETE route
3. **Task 2 RED:** `1ce6310` (test) - 16 new RunPage tests failing, stub DELETE handler
4. **Task 2 GREEN:** `3604dd0` (feat) - components, hook, RunPage cards, i18n

## TDD Gate Compliance

- Task 1 RED: `test(04-07)` commit `1aa9af8`; the 8 remove tests failed on `405 Method Not Allowed` (route missing), i.e. on the planned status assertions. Semantic assessment: valid RED for the remove behavior. The 7 download tests passed at RED because the contract was implemented in Plan 04-01; the plan says to fix only what fails, so they pin existing behavior and no code change was needed (expected unexpected-green, recorded here).
- Task 1 GREEN: `feat(04-07)` `7415a7e`, 15 passed; full backend suite 530 passed, ruff check and format clean.
- Task 2 RED: `test(04-07)` `1ce6310`; the 16 new tests timed out on missing UI text/roles while the 38 pre-existing tests passed.
- Task 2 GREEN: `feat(04-07)` `3604dd0`; 664 frontend tests pass, build passes.
- No REFACTOR commit. The machine classifier `gsd check tdd-red-evidence` was not run (pytest/Vitest default reporters are not in its supported formats and TDD_MODE was not requested); RED was assessed from the real run output.

## Decisions Made

- Template key `training:settings.dataset_counts` (label stays `settings.dataset`), see key-decisions.
- A 404 on DELETE is shown as the API error in the modal (not treated as idempotent success).
- Closing the modal is disabled while the request is pending.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mantine Collapse prop and deferred reveal**
- **Found during:** Task 2 (GREEN)
- **Issue:** The installed Mantine uses `<Collapse expanded>` (React Activity) instead of `in`; hidden content is mounted a render pass late, which made one test flaky under load.
- **Fix:** Used `expanded`; tests wait for visibility and tolerate the hidden title not being mounted yet.
- **Files modified:** `RunFailureLog.tsx`, `RunPage.test.tsx`
- **Committed in:** `3604dd0`

**2. [Rule 3 - Blocking] Worktree had no frontend/node_modules**
- **Found during:** Task 2 (RED run)
- **Fix:** Created a local, gitignored copy only to run Vitest/build; removed afterwards. Nothing committed.

**Total deviations:** 2 auto-fixed (both blocking, no scope change).

Plan item "Fix `model_download_name` / `routers/models.py` only where the download tests fail": no fixes were needed.

## Issues Encountered

- The plan's per-plan commit ledger (`gsd-plan-head-before-04-07`) could not be written because the worktree sandbox refused compound `git rev-parse --git-dir` commands; `plan_head_before` is the dispatch base `c3f4692` recorded from the prompt.

## Known Stubs

None.

## Threat Flags

None. T4-07-01..04 mitigations are implemented and covered: guarded DELETE plus race tests, text-only log/message rendering (no `dangerouslySetInnerHTML`), sanitized download name, `require_xhr` with a 403 test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Run page handles every status; Phase 5 can add resume next to the interrupted card. Plans 04-06 and 04-09 are untouched by this plan's files.

## Self-Check: PASSED

Created files exist, commits `1aa9af8`, `7415a7e`, `1ce6310`, `3604dd0` are ancestors of HEAD.
