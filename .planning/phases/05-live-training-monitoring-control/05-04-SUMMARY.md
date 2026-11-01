---
phase: 05-live-training-monitoring-control
plan: 04
subsystem: training
tags: [failure-categories, alembic, sqlite, fastapi, sse, react, mantine, i18n, pytest, vitest]

requires:
  - phase: 05-live-training-monitoring-control
    provides: "stream.STATUS_COLUMNS / status_payload (05-01), RunPage with stream wiring (05-02, 05-03)"
  - phase: 04-training
    provides: "training_runs table, supervisor/queue, train_job error.json, RunFailureLog"
provides:
  - "training_runs.error_category (migration 0006, String(32), NULL, no CHECK)"
  - "yolo_trainer_common.failures: seven codes, CATEGORIES allow-list, classify_exception, classify_exit, normalize_category"
  - "error.json key `category`; queue.mark_failed(..., category); supervisor._read_error_file"
  - "RunSummary/RunRead.error_category and the `error_category` key of the stream status frame"
  - "FailureAlert with a localized title and hint for seven codes (en + ru) above the raw message and the log"
affects: [05-07 resume (not_resumable, action row of FailureAlert), 05-10 history table, 05-09]

tech-stack:
  added: []
  patterns:
    - "Pure torch-free classifier shared by the training child, the supervisor and the api; ordered rules, first match wins, literal-message fixture tests"
    - "A code read from a file is checked against an allow-list (normalize_category) before any DB write; the UI falls back to `unknown`"

key-files:
  created:
    - backend/src/yolo_trainer_api/migrations/versions/0006_failure_category.py
    - backend/src/yolo_trainer_common/failures.py
    - backend/tests/test_failures.py
    - frontend/src/features/training/FailureAlert.tsx
  modified:
    - backend/src/yolo_trainer_api/models.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/training/service.py
    - backend/src/yolo_trainer_api/training/stream.py
    - backend/src/yolo_trainer_worker/queue.py
    - backend/src/yolo_trainer_worker/supervisor.py
    - backend/src/yolo_trainer_worker/train_job.py
    - backend/tests/fake_train_job.py
    - backend/tests/test_migrations.py
    - backend/tests/test_run_stream.py
    - backend/tests/test_train_job.py
    - backend/tests/test_training_pipeline.py
    - backend/tests/test_worker_supervisor.py
    - frontend/src/api/training.ts
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "Category codes are a fixed seven-value contract (out_of_memory, disk_full, invalid_dataset, weights_download, process_killed, not_resumable, unknown); validated in Python, no DB CHECK, so a new code never needs a table rebuild"
  - "Rule order is part of the contract: memory, disk, dataset, weights download, not resumable, unknown; classify_exit decides a killed process by exit code alone and never derives a network category from a log tail"
  - "Migration 0006 downgrade uses batch_alter_table with table_kwargs sqlite_autoincrement so the rebuild keeps AUTOINCREMENT (run folders and model files are named after the id)"

patterns-established:
  - "Failure path = classify at the source (child: classify_exception; supervisor: _classify(exc) / classify_exit), store allow-listed code, keep the raw message untouched"

requirements-completed: [TRAN-11]

actuals:
  tokens: 15600
  tasks: 2
  commits: 3
plan_head_before: d481553342a4cc4ef5dfdf590d96c76998a4ec6e
plan_head_after: ba63a455778cac85d50b2c1f350e6bb100b7eaa9

coverage:
  - id: D1
    description: "A failed run stores a stable category code (seven values) in training_runs.error_category while error_message keeps the raw text; existing runs keep NULL after migration 0006, which also downgrades and upgrades again"
    requirement: TRAN-11
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_a_populated_0005_database_upgrades_with_every_existing_run_uncategorized"
        status: pass
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_0006_downgrades_to_0005_and_back_keeping_the_runs"
        status: pass
      - kind: integration
        ref: "backend/tests/test_worker_supervisor.py#test_an_out_of_memory_failure_is_stored_with_its_category_and_the_raw_message"
        status: pass
    human_judgment: false
  - id: D2
    description: "The classifier assigns each failure kind its category in the specified order (memory, disk, dataset, weights download, not resumable, unknown) and classifies an exit without error.json (killed process, memory/disk in log tail, no network category from logs)"
    requirement: TRAN-11
    verification:
      - kind: unit
        ref: "backend/tests/test_failures.py (parametrized literal-message fixtures)"
        status: pass
      - kind: integration
        ref: "backend/tests/test_worker_supervisor.py#test_a_trainer_killed_by_the_system_is_a_killed_process"
        status: pass
    human_judgment: false
  - id: D3
    description: "train_job writes the category into error.json; the supervisor allow-lists a code read from a file and falls back to classify_exit; the api classifies preparing failures; WeightsDownloadError is typed"
    requirement: TRAN-11
    verification:
      - kind: unit
        ref: "backend/tests/test_train_job.py#test_main_writes_the_category_of_the_exception_next_to_its_type_and_message"
        status: pass
      - kind: integration
        ref: "backend/tests/test_worker_supervisor.py#test_a_category_in_an_error_file_outside_the_allow_list_is_stored_as_unknown"
        status: pass
      - kind: integration
        ref: "backend/tests/test_training_pipeline.py#test_a_dataset_that_cannot_be_written_fails_the_preparing_run_with_its_category"
        status: pass
    human_judgment: false
  - id: D4
    description: "The stream status frame carries error_category, so an open run page shows the categorized failure without a reload"
    requirement: TRAN-11
    verification:
      - kind: integration
        ref: "backend/tests/test_run_stream.py#test_the_status_frame_of_a_failed_run_carries_its_error_category"
        status: pass
      - kind: automated_ui
        ref: "frontend/src/features/training/RunPage.test.tsx#shows the categorized failure at once when a status frame reports the run failed"
        status: pass
    human_judgment: false
  - id: D5
    description: "The failed run page shows a localized (en/ru) category title and an actionable hint, then 'Original message' with the raw text, then the collapsible log; a null or unrecognized code shows 'Unexpected error'; text-only rendering, long text wraps with pre-wrap and overflow-wrap anywhere"
    requirement: TRAN-11
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/training/RunPage.test.tsx (RunPage failed run: seven codes, unrecognized code, Russian, 10,000-character message, hostile text)"
        status: pass
    human_judgment: true
    rationale: "Whether the wording and layout of the alert read well on a real screen (long raw message and 5,000-character log line inside the Alert at real widths) is a visual judgment; the held-out visual backstop row of the plan is not asserted by jsdom"

duration: 45min
completed: 2026-10-11
status: complete
---

# Phase 5 Plan 04: Failure categories Summary

**A failed run now carries one of seven allow-listed failure codes from the training process through error.json, the supervisor and migration 0006 to the stream and a localized FailureAlert (title, hint, original message, log), with the classifier pinned by literal-message fixture tests.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-10-11 (approx. 20:20 local; start time was not recorded exactly)
- **Completed:** 2026-10-11T17:46Z
- **Tasks:** 2 (Task 1 tracer, Task 2 TDD)
- **Files modified:** 23 (19 modified, 4 created)

## Accomplishments

- Tracer (Task 1): an out-of-memory failure travels end to end: fake trainer `oom` -> error.json {type, message, category} -> supervisor -> `training_runs.error_category` -> `GET run` -> red alert "Out of memory" with the hint, "Original message" and the collapsed log.
- Migration 0006 adds `error_category String(32) NULL` without a CHECK; populated 0005 databases keep their runs with NULL; downgrade keeps AUTOINCREMENT, the status CHECK and all four indexes.
- Task 2 filled the ordered classifier (disk incl. ENOSPC, dataset wrapper and substrings, weights download types, NotResumableError/CheckpointError), exit-code rules (below 0, 137, 143, 3221225786), `WeightsDownloadError`, classified supervisor/api failure writes and `error_category` in the stream status frame.
- i18n: `failure.raw` and `failure.<code>.title|hint` for seven codes in en and ru (UI-SPEC texts verbatim, DATA_DIR and the weights path untranslated).

## Task Commits

1. **Task 1: Tracer, out-of-memory end to end** - `87ad1f5` (feat)
2. **Task 2 RED: failing tests for every failure category** - `c1e446c` (test)
3. **Task 2 GREEN: classify every failure kind** - `ba63a45` (feat)

No REFACTOR commit (nothing to clean up).

**Plan metadata:** committed after this file (docs: complete plan).

## TDD Gate Compliance

- RED (`c1e446c`): 39 tests failed on assertions of the planned behavior (category values, exit-code classes, `WeightsDownloadError`, `error_category` in the status frame), not on imports or fixtures. `gsd_run check tdd-red-evidence` was not used: pytest output is not one of its supported report formats (TAP, JUnit XML, swift-testing, unittest text); the semantic assessment was done by reading the failing assertions in the pytest report. The frontend tests added in the RED commit already passed, because the tracer's `FailureAlert` handled all seven codes; they are regression tests, not RED evidence.
- GREEN (`ba63a45`): all 151 tests of the five touched backend files pass; full suite 755 passed.

## Files Created/Modified

See the frontmatter `key-files`. Highlights: `yolo_trainer_common/failures.py` (pure classifier), `0006_failure_category.py`, `FailureAlert.tsx` (replaces RunPage's `FailedAlert`), `test_failures.py` (6 parametrize blocks).

## Decisions Made

- Exit code decides a killed process before any log text (`-9` with "CUDA out of memory" in the tail is `process_killed`).
- The supervisor classifies exceptions it catches itself (Popen OSError, registration failure) with `classify_exception` on type, message and errno, so a full disk during model registration is `disk_full`, not `unknown`; the class-name mismatch and the serve() catch-all stay `unknown`.
- The batch downgrade of migration 0006 passes `table_kwargs={"sqlite_autoincrement": True}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Batch downgrade dropped AUTOINCREMENT from training_runs**
- **Found during:** Task 1 (migration test for downgrade 0006 -> 0005)
- **Issue:** `op.batch_alter_table("training_runs")` rebuilds the table without `sqlite_autoincrement`, so after a downgrade SQLite could reuse the id of a deleted last run, and run folders and model files are named after that id.
- **Fix:** `batch_alter_table("training_runs", table_kwargs={"sqlite_autoincrement": True})`; the test asserts AUTOINCREMENT, the status CHECK and the four indexes survive.
- **Files modified:** `backend/src/yolo_trainer_api/migrations/versions/0006_failure_category.py`, `backend/tests/test_migrations.py`
- **Committed in:** `87ad1f5`

**2. [Rule 2 - Missing critical] Existing page tests asserted the old alert title**
- **Found during:** Task 1
- **Issue:** `RunPage.test.tsx` expected the title "Training failed" (en) / "Обучение не удалось" (ru) on the failed alert; the plan makes the category title the alert title ("Training failed" stays only in the live region).
- **Fix:** the `failed()` test helper now defaults `error_category: "out_of_memory"` and the two assertions expect "Out of memory" / "Не хватило памяти".
- **Files modified:** `frontend/src/features/training/RunPage.test.tsx`
- **Committed in:** `87ad1f5`

**3. [Rule 3 - Blocking] test_training_pipeline.py was not in the plan's file list**
- **Found during:** Task 2
- **Issue:** the plan names `test_train_job.py` for "the existing offline-download test", but the api-side flows it requires (vanished source image -> invalid_dataset, missing dataset, a preparing failure, the offline download via the stubbed Ultralytics) live in `test_training_pipeline.py`.
- **Fix:** assertions and one new test (preparing run with a full disk -> `disk_full`) added there; `test_train_job.py` got the real-Ultralytics offline-download assertions plus the `main()` category test.
- **Files modified:** `backend/tests/test_training_pipeline.py`
- **Committed in:** `c1e446c`

**4. [Rule 3 - Blocking] fake_train_job gained its `exit137` and `badcategory` modes in Task 1**
- **Found during:** Task 1
- **Issue:** the plan places `exit137` in Task 2; adding it with the other fake modes avoided touching the same file twice. `badcategory` (error.json with an HTML-looking category) is an extra mode that pins the T-05-11 allow-list through the whole supervisor path.
- **Files modified:** `backend/tests/fake_train_job.py`
- **Committed in:** `87ad1f5`

---

**Total deviations:** 4 (1 bug, 1 missing-critical test update, 2 blocking/scope-adjacent)
**Impact on plan:** none on behavior; fix 1 closes a real data-integrity gap in the downgrade path.

## Issues Encountered

- The worktree has no `node_modules`; `npm ci --maxsockets=1` was run in `frontend/` (lockfile install, no new packages).
- Backend tests/ruff were run with the main checkout interpreter and `PYTHONPATH` pointing at the worktree `backend/src`, as instructed. All 755 backend tests (3 deselected `training`-marker tests), ruff check and format check, `npm run build` and all 822 Vitest tests pass.

## Known Stubs

None. Not asserted by automated tests (plan backstop row, held-out visual test): a 10,000-character raw message and a 5,000-character log line staying inside the Alert at real widths. The styles (`pre-wrap`, `overflow-wrap: anywhere`, 320px log with its own scroll) are asserted in jsdom only.

## Threat Flags

None. T-05-10 (stored XSS) mitigated: `FailureAlert.tsx` renders text only (grep gate 0 matches for HTML injection APIs) and a hostile message test exists; T-05-11 mitigated: `normalize_category` before any DB write, `badcategory` supervisor test, `failureCategory` in the UI.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The code set, allow-list and rule order are fixed; Plan 05-07 (resume) can raise `NotResumableError` / `CheckpointError` and reuse `not_resumable`, and builds the Resume part and action row of `FailureAlert`.
- The Phase 5 history table (05-10) can read `error_category` from `RunSummary`.

## Self-Check: PASSED

- Created files exist: `0006_failure_category.py`, `failures.py`, `test_failures.py`, `FailureAlert.tsx`.
- Commits `87ad1f5`, `c1e446c`, `ba63a45` are ancestors of HEAD.
- Acceptance greps: `down_revision` 0005 (1), `ck_training_runs_status` in 0006 (0), `"category"` in train_job (1), `classify_exit` in supervisor (2), torch/ultralytics imports in failures.py (0), HTML injection API in FailureAlert (0), `class WeightsDownloadError` (1), `error_category` in stream.py (2), `parametrize` in test_failures (6).

---
*Phase: 05-live-training-monitoring-control*
*Completed: 2026-10-11*
