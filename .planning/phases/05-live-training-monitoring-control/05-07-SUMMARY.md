---
phase: 05-live-training-monitoring-control
plan: 07
subsystem: training
tags: [active-time, resume, fastapi, sqlalchemy, react, mantine, i18n]

requires:
  - phase: 05-live-training-monitoring-control
    provides: "Plan 05-06 resume (resume_state, resume_run, cancel split, ResumeButton) and 05-04/05-05 supervisor, cancel and failure categories"
provides:
  - "Active-time accounting: terminal queue writes bank active_seconds (supervisor monotonic clock) and clear segment_started_at; restart sweeps (worker and api) add the last known running time in Python"
  - "RunSummary.active_seconds / segment_started_at; RunRead.resume_blocked (no_checkpoint | finished | not_resumable)"
  - "Resume re-checks the device like a start (422 No GPU is available.)"
  - "Cancel resume: cancel on a queued run with resume_count > 0 sets it back to cancelled keeping its progress; DELETE of such a run answers 409 (RUN_RESUMED_DETAIL)"
  - "runActiveSeconds(run, nowMs) and Training time / Duration from active time on the run page; Times resumed settings row"
  - "Resume lines per state with a visible, aria-describedby-referenced reason for every blocked code; Cancel resume and resumed queue body; failure alert action row; cancel modal without checkpoint"
affects: [05-08, 05-09, history-table]

tech-stack:
  added: []
  patterns:
    - "Segment accounting on time.monotonic() in the supervisor; restart sweeps compute in Python (no SQL date functions)"
    - "Guarded status UPDATEs race the worker claim; a re-select decides 404/409"
    - "Disabled action is never silent: aria-describedby points at visible reason text"

key-files:
  created:
    - frontend/src/features/training/progress/duration.ts
    - frontend/src/features/training/progress/duration.test.ts
    - frontend/src/features/training/ResumeInfo.tsx
    - frontend/src/features/training/CancelResumeButton.tsx
  modified:
    - backend/src/yolo_trainer_worker/queue.py
    - backend/src/yolo_trainer_worker/supervisor.py
    - backend/src/yolo_trainer_api/training/reconcile.py
    - backend/src/yolo_trainer_api/training/service.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/routers/runs.py
    - backend/tests/test_worker_queue.py
    - backend/tests/test_training_reconcile.py
    - backend/tests/test_runs_resume.py
    - backend/tests/test_runs_cancel.py
    - backend/tests/test_runs_remove.py
    - frontend/src/api/training.ts
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/RunSettingsCard.tsx
    - frontend/src/features/training/FailureAlert.tsx
    - frontend/src/features/training/RunFailureLog.tsx
    - frontend/src/features/training/CancelRunModal.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "Cancel resume is a guarded UPDATE tried before the running-flag UPDATE, so a worker claim between the two still ends in the normal cancel flag path"
  - "ensure_device_available is imported inside resume_run (options imports service; a module-level import would be circular)"
  - "A not_resumable failure reuses failure.not_resumable.hint as its visible reason (the hint element carries the id); other statuses render that hint as the resume line"
  - "run.interrupted.action is updated to the UI-SPEC text but no longer rendered: the resume line replaces it"

requirements-completed: [TRAN-07, TRAN-08]

coverage:
  - id: D1
    description: "Run duration and training time count only active running segments across resumes and restarts"
    requirement: TRAN-08
    verification:
      - kind: unit
        ref: "backend/tests/test_worker_queue.py, backend/tests/test_training_reconcile.py, backend/tests/test_runs_resume.py#test_a_run_cancelled_and_resumed_counts_only_its_running_segments"
        status: pass
      - kind: unit
        ref: "frontend/src/features/training/progress/duration.test.ts"
        status: pass
      - kind: automated_ui
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage progress, RunPage result"
        status: pass
    human_judgment: false
  - id: D2
    description: "Resume read model names why a run cannot be resumed; resume re-checks the device"
    requirement: TRAN-07
    verification:
      - kind: unit
        ref: "backend/tests/test_runs_resume.py#test_the_read_model_names_the_reason_a_run_cannot_be_resumed"
        status: pass
      - kind: unit
        ref: "backend/tests/test_runs_resume.py#test_a_gpu_run_is_not_resumed_on_a_host_without_a_gpu"
        status: pass
    human_judgment: false
  - id: D3
    description: "A queued resumed run can be taken back without losing progress; DELETE is refused"
    requirement: TRAN-07
    verification:
      - kind: unit
        ref: "backend/tests/test_runs_cancel.py#test_cancelling_a_queued_resume_keeps_the_progress_of_the_run, backend/tests/test_runs_remove.py#test_a_resumed_queued_run_is_not_removable_and_keeps_its_folder_and_checkpoint"
        status: pass
      - kind: automated_ui
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage queued resume"
        status: pass
    human_judgment: false
  - id: D4
    description: "Run page shows resume lines and a visible, referenced reason for each blocked code; settings card shows Times resumed"
    requirement: TRAN-07
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage resume lines, RunPage settings card"
        status: pass
    human_judgment: true
    rationale: "Layout, wording and visual hierarchy of the alerts and action rows are UX judgment that no assertion covers"

duration: 7h 50m (interrupted executor 2026-10-11, resumed and finished 2026-10-12)
completed: 2026-10-12
status: complete
actuals:
  tokens: 90000
  tasks: 2
  commits: 6
plan_head_before: 09484870f815eaaee1fbfd7699e1995d8d5402ac
plan_head_after: 4599566
---

# Phase 5 Plan 07: Active-time duration, gated and explained Resume, Cancel resume Summary

**Run duration is the sum of active running segments (supervisor monotonic clock plus Python restart sweeps), Resume always shows from which epoch it continues or a visible reason it cannot, and a queued resume can be cancelled without losing the run.**

## Performance

- **Tasks:** 2 (Task 1 tracer, Task 2 TDD)
- **Commits:** 6 (one from the interrupted executor)
- **Files modified:** 25 (4 created)
- **Verification:** backend 855 passed (`pytest backend/tests`), ruff check and format clean; frontend 869 passed, `npm run build` clean

## Accomplishments

- Terminal queue writes (`mark_failed`, `mark_interrupted`, `mark_cancelled`, `register_model`) bank `active_seconds` and clear `segment_started_at`; the supervisor measures the segment on `time.monotonic()`; worker and api restart sweeps add `progress_updated_at - segment_started_at` in Python.
- `RunSummary.active_seconds|segment_started_at`; run page "Training time" ticks from the banked seconds plus the live segment, "Duration" uses active time with the Phase 4 fallback (`runActiveSeconds`); settings row "Times resumed" from the first resume.
- `RunRead.resume_blocked` (`no_checkpoint` only for a missing last.pt, `finished`, `not_resumable`); `resume_run` re-checks the device ("No GPU is available.").
- "Cancel resume": cancel on a queued run with `resume_count > 0` returns it to `cancelled` with checkpoint, counters and charts intact; DELETE of such a run answers 409 `RUN_RESUMED_DETAIL`.
- Run page: shared `ResumeInfo` (last completed epoch, resume line with the epoch or the generic unknown-epoch line, or the blocked reason), disabled Resume referencing the reason via `aria-describedby` for all three codes, `CancelResumeButton`, resumed queued body, failure alert action row (New training + log toggle, `RunFailureLog` split), cancel modal no-checkpoint variant. en/ru parity kept.

## Task Commits

1. **Task 1: training time and duration count only active time (tracer)**
   - `b120201` feat: backend (queue, supervisor, reconcile, schemas, service) and its tests. Written by the interrupted executor, then verified here (see Issues).
   - `3a9896f` feat: frontend (`runActiveSeconds`, run page, settings row, locales, helpers).
2. **Task 2: resume gating, device re-check, Cancel resume (TDD)**
   - RED backend `ff88c98` test; GREEN backend `18645c7` feat.
   - RED frontend `fd972c3` test; GREEN frontend `4599566` feat.
   - REFACTOR: none needed.

## TDD Gate Compliance

RED commits `ff88c98` and `fd972c3` precede GREEN `18645c7` and `4599566`. RED evidence: backend run failed on `KeyError: 'resume_blocked'`, `assert 200 == 422` (no device check), `assert 204 == 409` (DELETE of resumed run) and the cancel-resume test; frontend run failed 15 tests on the missing resume lines, Cancel resume and no-checkpoint modal text (assertions on the planned behavior, not load or syntax faults). One RED test, `explains a restart...`, failed because the renamed `run.reached` key was already in place; it stays valid as a regression test.

## Files Created/Modified

- `backend/src/yolo_trainer_api/training/service.py` - `resume_blocked`, device re-check in `resume_run`, Cancel-resume branch in `cancel_run`, resumed guard in `remove_queued_run`, `RUN_RESUMED_DETAIL`
- `backend/src/yolo_trainer_api/schemas.py` - `RunRead.resume_blocked`, `RunSummary.active_seconds|segment_started_at`
- `frontend/src/features/training/ResumeInfo.tsx` - shared resume lines, reason ids, New training button
- `frontend/src/features/training/CancelResumeButton.tsx` - no-dialog Cancel resume
- `frontend/src/features/training/progress/duration.ts` - `runActiveSeconds`

## Decisions Made

See `key-decisions` above. Additionally, `ResumeInfo` lives in its own file (the plan allowed this) because `FailureAlert` is imported by `RunPage`.

## Deviations from Plan

### Auto-fixed Issues

None needed against the plan's rules; no production code had to be corrected after the verification of the backend portion.

### Execution notes

**1. Resumed execution (not a rule deviation)**
- Task 1 backend (`b120201`) came from an earlier executor whose session was interrupted. Verified before use: `test_worker_queue.py`, `test_training_reconcile.py`, `test_runs_resume.py`, `test_runs_cancel.py`, `test_worker_supervisor.py` (72 passed), ruff check and format clean, `active_seconds=` appears 7 times in `supervisor.py`, no `julianday`/`strftime` anywhere under `backend/src`, and the code was read against every Task 1 behavior bullet. No fix was needed.
- The earlier executor's uncommitted `duration.ts` / `duration.test.ts` were checked against the plan's `runActiveSeconds` behavior and used unchanged (renamed one local helper).

**2. Test-only adjustments**
- Existing cancel-modal tests now set `resume_epoch`, since the modal derives the epoch from the saved checkpoint and shows the no-checkpoint text otherwise. The old interrupted-run assertion for "Start a new run to train again." was replaced by the resume lines.
- One of my own new tests first failed on a duplicate "Run cancelled" match (visible alert plus the live region); the query was narrowed to the alert label.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- `run.interrupted.action` was updated to the UI-SPEC text as the plan lists, but the resume line replaces it, so the key is currently unused. Harmless; a later plan can delete it or reuse it.
- The worktree has no `.venv` or `node_modules`: ran the main checkout interpreter with `PYTHONPATH` on the worktree code and `npm ci` in `frontend/`.

## Known Stubs

None.

## Threat Flags

None. T-05-21 (data loss through queue removal of a resumed run), T-05-22 (device re-check) and T-05-23 (filesystem probes only in the single-run read and the resume route) are mitigated and covered by tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`active_seconds` is the duration source for the history table (TRAN-08); the run list stays DB-only (no per-row filesystem check).

## Self-Check: PASSED

- Created files found: `duration.ts`, `duration.test.ts`, `ResumeInfo.tsx`, `CancelResumeButton.tsx`.
- Commits found in HEAD: `b120201`, `3a9896f`, `ff88c98`, `18645c7`, `fd972c3`, `4599566`.
- Task 1 and Task 2 acceptance criteria re-run and passing (greps, backend suite, ruff, frontend tests, build).

---
*Phase: 05-live-training-monitoring-control*
*Completed: 2026-10-12*
