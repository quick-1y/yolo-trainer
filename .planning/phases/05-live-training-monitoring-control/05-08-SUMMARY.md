---
phase: 05-live-training-monitoring-control
plan: 08
subsystem: training
tags: [history-table, sorting, filtering, mAP50-95, alembic, fastapi, react, mantine, i18n]

requires:
  - phase: 05-live-training-monitoring-control
    provides: "Plan 05-07 active_seconds / segment_started_at and runActiveSeconds (duration source), RunSummary list read model, record_epoch / primary_metrics"
provides:
  - "Migration 0009 and training_runs.last_map50_95; supervisor records the last epoch's mAP50-95 (box for detect, mask for segment) next to last_map50"
  - "RunSummary.map50_95 | last_map50_95 | image_count | settings | resolved (DB-only list read model, no per-row filesystem access)"
  - "historyTable.ts: parseHistoryParams, historyParams, sortRuns, filterRuns, firstDirection, formatKeySettings, historyMetric, STATUS_ORDER"
  - "11-column sortable, status-filterable history table on TrainingPage with sort, direction and status kept in the URL"
affects: [05-09, history-table, run-list]

tech-stack:
  added: []
  patterns:
    - "URL view state through useSearchParams with replace, allow-listed values only, defaults omitted (ImagesPage idiom)"
    - "Stretched row link as a separate absolutely positioned anchor so a sticky name cell does not become its containing block"
    - "Missing values sort last in both directions; ties break by run id descending"

key-files:
  created:
    - backend/src/yolo_trainer_api/migrations/versions/0009_last_map50_95.py
    - frontend/src/features/training/historyTable.ts
    - frontend/src/features/training/historyTable.test.ts
  modified:
    - backend/src/yolo_trainer_api/models.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/training/service.py
    - backend/src/yolo_trainer_worker/queue.py
    - backend/src/yolo_trainer_worker/supervisor.py
    - backend/tests/fake_train_job.py
    - backend/tests/test_runs_api.py
    - backend/tests/test_migrations.py
    - backend/tests/test_quality.py
    - frontend/src/api/training.ts
    - frontend/src/features/training/TrainingPage.tsx
    - frontend/src/features/training/TrainingPage.module.css
    - frontend/src/features/training/TrainingPage.test.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "RunSummary.map50_95 folds the last epoch's value in when a run has no final metrics; the client tells a last-epoch value from a final one by the absence of the final map50 (historyMetric)"
  - "The row link is a separate absolutely positioned anchor (aria-label and title = run name) and the visible name is an aria-hidden span inside the sticky cell with pointer-events none, because a sticky cell would become the containing block of a stretched ::after"
  - "Status filter options are in lifecycle order (preparing, queued, running, completed, failed, interrupted, cancelled); the Status column sort uses the fixed attention-first order"
  - "The duration column is measured to the last fetch time (dataUpdatedAt), so it moves with the poll and not every second"

patterns-established:
  - "Pure view helpers (parse, serialize, sort, filter) in a tested module, the page only wires URL and render"

requirements-completed: [TRAN-08]

coverage:
  - id: D1
    description: "The supervisor records the last epoch's mAP50-95 and the list read model exposes map50_95, last_map50_95, image_count, settings and resolved without per-row file access"
    requirement: TRAN-08
    verification:
      - kind: unit
        ref: "backend/tests/test_runs_api.py#test_a_completed_run_lists_its_final_metrics_settings_and_snapshot_size, #test_a_run_cancelled_after_one_epoch_lists_the_last_epoch_mean_average_precision, #test_listing_the_history_checks_no_file_per_row"
        status: pass
      - kind: unit
        ref: "backend/tests/test_migrations.py#test_a_populated_0008_database_upgrades_with_no_last_epoch_value_and_round_trips"
        status: pass
    human_judgment: false
  - id: D2
    description: "The run list is an 11-column history table with duration, epochs, key settings, final or last-epoch mAP, snapshot size and download"
    requirement: TRAN-08
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/training/TrainingPage.test.tsx#TrainingPage"
        status: pass
      - kind: unit
        ref: "frontend/src/features/training/historyTable.test.ts#formatKeySettings, #historyMetric"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sort by nine columns and filter by status, with sort, direction and status in the URL and safe fallbacks"
    requirement: TRAN-08
    verification:
      - kind: unit
        ref: "frontend/src/features/training/historyTable.test.ts#parseHistoryParams, #historyParams, #sortRuns, #filterRuns, #firstDirection"
        status: pass
      - kind: automated_ui
        ref: "frontend/src/features/training/TrainingPage.test.tsx#TrainingPage sorting, #TrainingPage status filter"
        status: pass
    human_judgment: false
  - id: D4
    description: "Horizontal scroll with a sticky name column, ellipsis of 100-character names and Russian header fit at 1024px"
    requirement: TRAN-08
    verification: []
    human_judgment: true
    rationale: "Sticky and overflow layout, truncation and header fit are visual; jsdom applies no CSS modules, so only the markup (classes, roles) is asserted. This is the held-out backstop row of the plan."

duration: 31min
completed: 2026-10-12
status: complete
actuals:
  tokens: 60000
  tasks: 2
  commits: 4
plan_head_before: aff809c5bf1628267454bc6d031219737b895c8a
plan_head_after: 8fec4bf
---

# Phase 5 Plan 08: Sortable, filterable run history table Summary

**The run list is now an 11-column history table (duration from active time, epochs, key settings, final or last-epoch mAP50 and mAP50-95, snapshot size, download) sortable by nine columns and filterable by status, with the view kept in the URL; the supervisor stores the last epoch's mAP50-95 through migration 0009 so failed and cancelled runs show how good they got.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-10-12T06:10:00Z (approximate)
- **Completed:** 2026-10-12T06:42:00Z
- **Tasks:** 2 (Task 1 tracer, Task 2 TDD)
- **Files modified:** 19 (3 created)
- **Verification:** backend `pytest backend/tests` green, ruff check and format clean; frontend 908 tests passed, `npm run build` clean

## Accomplishments

- Migration `0009` adds `training_runs.last_map50_95` (Float NULL, existing runs keep NULL, downgrades to 0008 keeping AUTOINCREMENT). `queue.record_epoch(..., map50_95=None)` writes it and the supervisor passes `primary_metrics(task_type, metrics)["map50_95"]` for every real epoch (box metrics for detect, mask metrics for segment).
- `RunSummary` carries `map50_95` (final value, else the last epoch's), `last_map50_95`, `image_count` (train + valid + test of the snapshot), `settings` and `resolved` (moved up from `RunRead`); `run_summaries` still touches no file.
- `TrainingPage` renders the eleven UI-SPEC columns in a Paper that scrolls horizontally (inner min-width 1272px) with a sticky name column; key settings show the resolved batch and device once known and "Auto" before; mAP cells carry a "Value from the last completed epoch" title when they are not final.
- `historyTable.ts` holds all view logic as pure, tested helpers: allow-listed URL params (`?sort`, `?dir`, `?status`, defaults omitted), `sortRuns` (nulls last in both directions, id-descending tie-break, fixed status order, natural case-insensitive name order, duration from active time), `filterRuns`, `firstDirection` (text ascending, numbers and dates descending).
- Nine sortable headers are `UnstyledButton`s inside `role="columnheader"` cells with `aria-sort` and `aria-label` "Sort by: ..."; the active one is 600 with an aria-hidden arrow. A status `Select` filters; "Shown: X of Y" replaces the count when runs are hidden; a filter matching nothing shows "No matching runs" with "Show all runs" while the header row and title row stay. en/ru parity kept.

## Task Commits

1. **Task 1: see every run with duration, epochs, key settings, mAP50-95 and image count (tracer)**
   - `45d1da2` feat: backend (migration 0009, model, queue, supervisor, schemas, service, fake trainer, tests)
   - `1176b40` feat: frontend (types, `historyTable.ts` helpers, 11-column page, CSS, locales, tests)
2. **Task 2: sort the history by any column and filter by status (TDD)**
   - RED `ae05460` test (historyTable tests, page tests, signature stubs)
   - GREEN `8fec4bf` feat
   - REFACTOR: none needed

Tracer gate: Task 1 `<verify>` re-run end to end before expansion (backend `test_runs_api`, `test_migrations`, `test_worker_supervisor`, `test_training_pipeline` and frontend `TrainingPage RunPage locales` all passed) - "Tracer verified end-to-end - expanding".

## TDD Gate Compliance

RED `ae05460` precedes GREEN `8fec4bf`. RED evidence (vitest, run before implementation): 25 tests failed on the planned assertions - for example `expected 'stub=1' to be ''` (historyParams), `expected [ 1, 2, 3 ] to deeply equal [ 3, 1, 2 ]` (sortRuns), `expected [ 'asc', ... ] to deeply equal [ Array(6) ]` (firstDirection), `expected [ null, null, ... ] to deeply equal [ 'none', ... ]` (aria-sort headers), plus the page tests for sort clicks, URL state, the filter options and the filtered-empty state. Not load or syntax faults: the RED commit adds signature stubs to `historyTable.ts` that answer the defaults, so the target tests execute and fail on behavior. Semantic assessment: every failing test failed because the sort/filter/URL behavior was absent, none because of import, fixture or syntax errors; tests already covered by Task 1 code (defaults, formatKeySettings, historyMetric, hiding the filter with zero runs) passed in RED as expected. Machine classification with `gsd_run check tdd-red-evidence` was not run (vitest default reporter, no TAP record was captured).

## Files Created/Modified

- `backend/src/yolo_trainer_api/migrations/versions/0009_last_map50_95.py` - adds the nullable Float column, batch downgrade keeping AUTOINCREMENT
- `backend/src/yolo_trainer_worker/supervisor.py`, `queue.py` - last epoch's mAP50-95 recorded with every epoch
- `backend/src/yolo_trainer_api/schemas.py`, `training/service.py` - list read model fields
- `frontend/src/features/training/historyTable.ts` - pure view helpers
- `frontend/src/features/training/TrainingPage.tsx`, `.module.css` - the history table
- `frontend/src/api/training.ts`, `frontend/src/test/trainingApi.ts` - client types and test factory

## Decisions Made

See `key-decisions` above. Additionally, the page test uses a `LocationProbe` rendered next to `AppRoutes` to assert the URL, since `renderWithProviders` exposes no location.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `test_quality.py` built a `RunSummary` without `settings`**
- **Found during:** Task 1 (moving `settings` and `resolved` into `RunSummary`)
- **Issue:** `settings` is a required field of `RunSummary` now; the existing `_summary` helper in `backend/tests/test_quality.py` constructed one without it and would raise a validation error.
- **Fix:** the helper passes `RunSettings(epochs=100, imgsz=640, batch=-1, device="auto")`.
- **Files modified:** `backend/tests/test_quality.py` (a file not listed in the plan's `files_modified`)
- **Verification:** `pytest backend/tests/test_quality.py` passes
- **Committed in:** `45d1da2`

**2. [Rule 1 - Adjustment of existing tests] Row link and fixtures**
- **Found during:** Task 1
- **Issue:** the stretched `::after` of a name link cannot work from inside a `position: sticky` cell (the sticky cell becomes the containing block), and the old "single dash in a running row" and `0.812` assertions no longer describe a row with eleven cells.
- **Fix:** the row link became a separate absolute anchor carrying `aria-label` and `title`; the existing truncation test asserts the title on that link; the completed-run fixture follows the plan's behavior values (0.81 -> "0.810").
- **Files modified:** `TrainingPage.tsx`, `TrainingPage.module.css`, `TrainingPage.test.tsx`
- **Committed in:** `1176b40`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 test/markup adjustment). **Impact:** no scope change; the second one is an implementation detail of the sticky name column the plan required.

## Issues Encountered

- A completed run overwrites `last_map50` with the final headline at registration (existing behavior of `queue.register_model`), while `last_map50_95` keeps the last epoch's value; the list reads the final `map50_95` from `metrics`, so the table is unaffected. Noted only because the two "last" columns differ for completed runs.
- The worktree had no `.venv` or `node_modules`: backend ran on the main checkout interpreter with `PYTHONPATH` on the worktree code, `npm ci` was run in `frontend/`.

## Known Stubs

None. The signature stubs added in the RED commit were replaced by the real implementation in `8fec4bf`.

## Threat Flags

None. T-05-24 (URL params) is mitigated by `parseHistoryParams` allow-lists and covered by tests with unknown and `__proto__` / markup-like values; T-05-25 (stored XSS) by React text rendering and plain-string `title` attributes only; T-05-26 (list read model cost) by `test_listing_the_history_checks_no_file_per_row` and the `to_thread|is_file` grep returning 0 for `run_summaries`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The history list is complete for TRAN-08. The 1272px layout, sticky name column and the 100-character / Russian header fit are visual and remain for the held-out visual check at 1024px in en and ru (plan backstop row).

## Self-Check: PASSED

- Created files found: `0009_last_map50_95.py`, `historyTable.ts`, `historyTable.test.ts`.
- Commits found in HEAD: `45d1da2`, `1176b40`, `ae05460`, `8fec4bf`.
- Task 1 and Task 2 acceptance criteria re-run and passing: `down_revision` grep 1, `map50_95=` in supervisor 1, no `to_thread|is_file` in `run_summaries`, `min-width: 1272px` 1, `position: sticky` present, `it(` count 21, `aria-sort` and `replace: true` present, `sortRuns` / `parseHistoryParams` exported once.

---
*Phase: 05-live-training-monitoring-control*
*Completed: 2026-10-12*
