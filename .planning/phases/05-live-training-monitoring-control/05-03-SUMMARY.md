---
phase: 05-live-training-monitoring-control
plan: 03
subsystem: training
tags: [ultralytics-callbacks, progress-jsonl, schema-v2, react, mantine, vitest, i18n]
requires:
  - phase: 05-live-training-monitoring-control
    provides: "05-01 SSE stream and EVENT_TRAIN_START / EVENT_BATCH_PROGRESS / SCHEMA_VERSION constants, 05-02 foldProgress, RunCharts, FakeEventSource"
provides:
  - "train_job.make_callbacks: v2 progress events (train_start, throttled batch_progress, last_epoch and fitness on real epochs), BATCH_EVENT_MIN_INTERVAL = 2.0"
  - "foldProgress: phase, batch, segmentStart, segmentEpochEnds, resumedFrom"
  - "progress/eta.ts estimateRemainingSeconds, progress/BatchProgress.tsx, FinalResultsCard.tsx"
  - "Run page running card with batch bar, whole-run ETA and Final validation state; separate Final results (best.pt) card"
affects: [05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10]

actuals:
  tokens: 16800
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "make_callbacks returns a dict subclass (TrainCallbacks) carrying the shared state, with an injectable clock for the batch throttle"
    - "ETA is a pure function of the folded segment state, memoized on the progress object so it only changes when an event arrives"
    - "The stream's last_epoch/phase overrides a stale polled run.epoch for the shown epoch during final validation"

key-files:
  created:
    - frontend/src/features/training/progress/eta.ts
    - frontend/src/features/training/progress/eta.test.ts
    - frontend/src/features/training/progress/BatchProgress.tsx
    - frontend/src/features/training/FinalResultsCard.tsx
  modified:
    - backend/src/yolo_trainer_worker/train_job.py
    - backend/tests/test_train_job.py
    - backend/tests/fake_train_job.py
    - backend/tests/test_training_pipeline.py
    - frontend/src/features/training/progress/foldProgress.ts
    - frontend/src/features/training/progress/foldProgress.test.ts
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "make_callbacks returns TrainCallbacks (a dict subclass with a .state attribute) so _train keeps registering by name and reads final_metrics/last_epoch for result.json unchanged"
  - "The throttle timestamp is reset at every epoch start, so the first batch of each epoch is always reported and the bar restarts promptly"
  - "BatchProgress takes a formatted map50 string next to batch, because its caption row carries the latest mAP50 on the right"
  - "During final validation the epoch bar is full (value 100) while aria-valuenow keeps the shown epoch, which also covers an early stop"
  - "The elapsed key stays 'Elapsed' here; the rename to 'Training time' belongs to Plan 05-07"

patterns-established:
  - "Segment-local state in the fold (segmentStart, segmentEpochEnds, resumedFrom) is reset by every train_start, so a resume never mixes idle time into estimates"

requirements-completed: [TRAN-05]

coverage:
  - id: D1
    description: "train_job writes schema v2: v on every line, train_start once per segment, batch_progress throttled to one per 2 s plus the first and last batch of an epoch with no loss payload, last_epoch and fitness on real epochs only"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "backend/tests/test_train_job.py#test_batch_events_are_throttled_but_the_first_and_last_batch_always_get_one"
        status: pass
      - kind: unit
        ref: "backend/tests/test_train_job.py#test_a_real_epoch_reports_fitness_and_whether_it_is_the_last_one"
        status: pass
      - kind: unit
        ref: "backend/tests/test_training_pipeline.py#test_train_job_disables_sync_first_and_tags_the_final_validation"
        status: pass
    human_judgment: false
  - id: D2
    description: "A slow epoch shows a neutral Batch N of M bar and a whole-run ETA (Time left: ~h:mm:ss, rounded to 10 s) computed from segment-local epoch durations, unknown until a delta or batch fraction exists"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/progress/eta.test.ts#estimateRemainingSeconds"
        status: pass
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage batch progress and ETA"
        status: pass
    human_judgment: false
  - id: D3
    description: "Final validation reads as Final validation with a full epoch bar, no batch bar or ETA and never an epoch Y+1; early stop and Phase 4 files handled"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/progress/foldProgress.test.ts#foldProgress phase"
        status: pass
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage final validation"
        status: pass
    human_judgment: false
  - id: D4
    description: "Separate Final results (best.pt) card: tiles from the final-validation event while finishing, stored metrics with verdict once completed, never for failed, cancelled or interrupted runs; completed card notes an early stop"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage final validation"
        status: pass
    human_judgment: false
  - id: D5
    description: "The headline row (epoch left; training time and ETA right, nowrap) fits one line at 1024 in en and ru with a 3-digit epoch count, and the ru final-validation title and hint wrap inside the card without pushing the bars"
    requirement: TRAN-05
    verification: []
    human_judgment: true
    rationale: "jsdom has no layout; these are the held-out visual backstop checks from the UI-SPEC (RunningStatusCard overflow and long-text rows)"

duration: 50min
completed: 2026-10-11
status: complete
plan_head_before: 1816e0758ba59b8967b02f9e350d75789a05b21f
plan_head_after: 6bbf5ce85d6ffa0d0ef37d41f463ebe0bbe5d5f8
commits: 3
---

# Phase 5 Plan 03: Batch progress, ETA and final validation Summary

**train_job now writes schema v2 progress (train_start, throttled batch_progress, last_epoch, fitness), and the run page shows a neutral "Batch N of M" bar, a whole-run ETA from segment-local epoch durations, a "Final validation…" state instead of a fake extra epoch, and a separate "Final results (best.pt)" card.**

## Performance

- **Duration:** about 50 min
- **Completed:** 2026-10-11T17:25:00Z
- **Tasks:** 2 (tracer plus one TDD task)
- **Files modified:** 14 (4 created, 10 modified)

## Accomplishments

- `make_callbacks(writer, clock)` moved out of `_train`: `v: 2` on every line, `train_start` per segment, `batch_progress` at most every 2 s plus the first and last batch of each epoch (no loss values, no GPU sync), `last_epoch` and `fitness` on real epochs only, the post-training event keeps `final_validation: true` without fitness. Covered by fake-clock unit tests; the `training`-marked real run asserts one `train_start`, a batch event per epoch and `v == 2`.
- The fold keeps the newest batch, the segment start, the epoch ends of the current segment and the resume marker; `estimateRemainingSeconds` averages up to five segment-local epoch durations (seeded by the segment start) and falls back to the batch fraction before the first epoch ends; it never reads the run's start timestamp.
- The running card headline reads "Elapsed · Time left: ~h:mm:ss" (or "Time left: —"), followed by the accent epoch bar and the neutral 4px batch bar with its caption; a resume adds "Resumed from epoch N.".
- After the last real epoch (or a Phase 4 run at epoch = epochs) the card reads "Final validation…" with the hint, a full epoch bar and no batch bar or ETA; the shown epoch trusts the stream over a slow poll and never exceeds the planned total.
- `FinalResultsCard` ("Final results (best.pt)") renders four tiles from the final-validation event while the run finishes, and the stored metrics with the verdict once completed; never for failed, cancelled or interrupted runs. The completed status card lost the tiles and notes an early stop.

## Task Commits

1. **Task 1: tracer, batch bar and whole-run ETA from v2 events** - `001ca9a` (feat)
2. **Task 2 RED: failing tests for final validation state and final results card** - `622c261` (test)
3. **Task 2 GREEN: final validation state and separate final results card** - `6bbf5ce` (feat)

**Plan metadata:** committed after this file (docs: complete plan). No REFACTOR commit: nothing worth changing after GREEN.

## Tracer gate

Interactive run, `human_verify_mode` default `end-of-phase`, the tracer `<verify>` carries only `<automated>`: the backend pytest files (`test_train_job`, `test_training_pipeline`, `test_worker_supervisor`: 57 passed) and the frontend `eta foldProgress RunPage locales` run (128 passed) were re-run on the committed slice, so execution continued (`Tracer verified end-to-end - expanding`).

## TDD Gate Compliance (Task 2, `tdd="true"`)

- **RED** (`622c261`): `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (format `tap`, reason `target_test_failed`) for the single-test rerun `npx vitest --run --reporter=tap-flat -t "enters final validation when a real epoch reports last_epoch" src/features/training/progress/foldProgress.test.ts` (`expected 'training' to be 'final_validation'`). Semantic assessment: the target executed and failed on the planned assertion because `foldProgress` had no phase transition yet; no import, collection or fixture fault. The page tests of the same commit also failed on missing UI (Final validation text, final results card), and needed no signature stubs.
- **GREEN** (`6bbf5ce`): whole frontend suite passes (62 files, 809 tests), `npm run build` ok.
- **REFACTOR:** none.

## Files Created/Modified

- `backend/src/yolo_trainer_worker/train_job.py` - `make_callbacks`, `TrainCallbacks`, `BATCH_EVENT_MIN_INTERVAL`, `v` on every record
- `backend/tests/test_train_job.py` - fake-clock tests of the callbacks and the real-run schema assertions
- `backend/tests/fake_train_job.py` - v2 events (train_start, four batch events per epoch, last_epoch, fitness)
- `backend/tests/test_training_pipeline.py` - stub trainer gets `stop` and `fitness`; asserts `last_epoch`, `fitness`, `v`
- `frontend/src/features/training/progress/foldProgress.ts` - phase, batch, segment state, resume marker
- `frontend/src/features/training/progress/eta.ts` - `estimateRemainingSeconds`
- `frontend/src/features/training/progress/BatchProgress.tsx` - the neutral batch bar with caption
- `frontend/src/features/training/FinalResultsCard.tsx` - the final results card
- `frontend/src/features/training/RunPage.tsx` - running card, completed card, card order, numeric gap on the not-found stack
- `frontend/src/features/training/*.test.*` - unit and page tests
- `frontend/src/i18n/locales/{en,ru}/training.json` - eta, batch, resume, final validation, early stop and final results keys; `run.running.finishing` removed

## Decisions Made

- `make_callbacks` returns a dict subclass with a `.state` attribute (the plan allowed either that or a tuple), so `_train` keeps registering by name.
- The batch throttle timestamp resets at each epoch start so the first batch of every epoch is reported at once and the bar restarts promptly; this adds at most one event per epoch beyond the 2 s rule.
- During final validation the epoch bar is drawn full while `aria-valuenow` keeps the shown epoch; this also covers an early stop.
- The elapsed label stays "Elapsed" (its rename and `active_seconds` source belong to Plan 05-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stub trainer in test_training_pipeline.py lacked `stop` and `fitness`**
- **Found during:** Task 1 (full backend suite)
- **Issue:** `on_fit_epoch_end` now reads `trainer.stop` and `trainer.fitness`; the stubbed Ultralytics trainer in `test_training_pipeline.py` (not in the plan's `files_modified`) had neither, so two tests failed with `AttributeError`.
- **Fix:** the stub trainer gets `stop` (true on the last real epoch) and `fitness`; the sync/final-validation test now also asserts `last_epoch`, `fitness` and `v`.
- **Files modified:** backend/tests/test_training_pipeline.py
- **Committed in:** 001ca9a

**2. [Rule 1 - Bug] Page showed a stale epoch during final validation**
- **Found during:** Task 2 (GREEN)
- **Issue:** the headline used only the polled `run.epoch`, which lags the stream by up to 15 s, so after the last real epoch it could read "Epoch 9 of 10" next to "Final validation…".
- **Fix:** while the fold phase is `final_validation`, the shown epoch is the larger of the polled epoch and the last stream row epoch, still capped at the planned total.
- **Files modified:** frontend/src/features/training/RunPage.tsx, RunPage.test.tsx
- **Committed in:** 6bbf5ce

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug).
**Impact on plan:** one extra test file touched; no scope change.

## Issues Encountered

- The worktree venv does not exist; the main checkout interpreter imports `yolo_trainer_*` from the main checkout, so backend tests were run with `PYTHONPATH` pointing at the worktree `backend/src` (otherwise they silently test the old code).
- Several chained shell commands were refused by the worktree command guard and were split into plain calls or script files.
- `uv run` was replaced by the main checkout interpreter as instructed (`uv` would pull torch); the plan's literal `uv run pytest ...` commands were run that way.

## Known Stubs

None. No placeholder or empty-data stubs were introduced.

## Threat Flags

None. No new network surface. T-05-08 is mitigated (batch events throttled to one per 2 s plus the first and last batch of an epoch, no loss payload; replay compaction is Plan 05-01). T-05-09 is mitigated (numbers and translated labels are React text, no HTML injection API).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 05-04..05-10 can read `ProgressState.phase|batch|segmentStart|segmentEpochEnds|resumedFrom` and the v2 event schema; the real CPU training run (`-m training`, Plan 05-10 gate) carries the new schema assertions but was not executed here.
- Held-out visual checks (UI-SPEC backstop rows): the headline row on one line at 1024 in en and ru with a 3-digit epoch count, and the ru final-validation text wrapping inside the card.

## Self-Check: PASSED

- Created files exist (eta.ts, eta.test.ts, BatchProgress.tsx, FinalResultsCard.tsx).
- Commits 001ca9a, 622c261, 6bbf5ce are ancestors of HEAD.
- Plan-level verification re-run: backend suite 681 passed (before a ruff format of the test file), `ruff check` and `ruff format --check` clean, `npm run build` ok, frontend suite 62 files / 809 tests passed.
