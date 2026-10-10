---
phase: 04-train-download
plan: 08
subsystem: training
tags: [fastapi, pydantic, sqlalchemy, react, mantine, i18next, vitest, pytest]

requires:
  - phase: 04-train-download
    provides: "RunCreate contract, capture_snapshot, TrainedModel registry, the New training form (04-02), AutoSplitDialog (04-06)"
provides:
  - "GET training/options now carries models, summary, blockers and warnings"
  - "A model trained in this service can be the base of a new run (API and worker)"
  - "One blocker rule shared by the options and POST /runs"
  - "DatasetSummary and DatasetNotes components and the two-column New training form"
affects: [04-10, 04-11, phase-05-training-control, phase-07-model-library]

actuals:
  tokens: 65000
  tasks: 2
  commits: 4
plan_head_before: d486b9e00d3e8a3f7863ea246a6ed3d5f9e1b598
plan_head_after: 43709ab7d9138d5658331c855490ec7e0ca69a0d

tech-stack:
  added: []
  patterns:
    - "Discriminated union RunBase (kind: official | model) with extra=forbid on both branches; a path is never accepted"
    - "Blockers and warnings as codes with parameters; the server decides, the client words them"
    - "Keyed siblings reordered at a media-query breakpoint keep form state"

key-files:
  created:
    - backend/tests/test_runs_api.py
    - frontend/src/features/training/DatasetSummary.tsx
    - frontend/src/features/training/DatasetNotes.tsx
  modified:
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/training/options.py
    - backend/src/yolo_trainer_api/training/service.py
    - backend/src/yolo_trainer_api/routers/runs.py
    - backend/src/yolo_trainer_worker/train_job.py
    - backend/tests/test_training_options.py
    - backend/tests/training_helpers.py
    - backend/tests/test_training_pipeline.py
    - frontend/src/api/training.ts
    - frontend/src/features/training/NewRunPage.tsx
    - frontend/src/features/training/NewRunPage.test.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "Blockers list every applicable reason (noClasses, trainEmpty, validEmpty) so the form shows all of them; POST /runs refuses with the first one, through the same service.blocker_codes rule"
  - "Models are offered by id as model:<id> option values; the worker resolves data/models/<id>.pt from an integer id only and rejects any non-integer id"
  - "The 409 for a duplicate run name quotes the already-stored name (same rule as projects and classes), not the requested one"
  - "unannotated_clause() is used for 'Not annotated' per split: reviewed implies boxes or background at save time, so it equals the snapshot's exclusion rule in every reachable state"

patterns-established:
  - "Shared pure rule in service.py (blocker_codes) imported by options.py, so the form and the create endpoint cannot drift"
  - "Summary/notes components take plain data props; the page owns the single AutoSplitDialog and opens it from the summary button and from blocker links"

requirements-completed: [TRAN-01, MODL-01, DATA-05]

duration: 60min
completed: 2026-10-10
status: complete
---

# Phase 4 Plan 08: Dataset summary, blockers and trained-model bases Summary

**Training options now explain exactly why a run cannot start (server-computed blockers and warnings shared with POST /runs), and a model trained in this service can be the base of a new run end to end, with a two-column New training form showing the dataset and one-click fixes.**

## Performance

- **Duration:** ~60 min
- **Completed:** 2026-10-10
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files modified:** 17 (3 created, 14 modified)

## Accomplishments

- `GET /api/projects/{id}/training/options` returns `summary` (per split `used` / `unannotated`, `unassigned`, `class_count`), `blockers`, `warnings` and `models`.
- Blockers (no classes, Train empty, Valid empty) come from one rule, `service.blocker_codes`, used both by the options and by the `POST /runs` refusal, so the UI and the API never disagree. An empty Test is not a blocker.
- Warnings: unannotated images that will not be used, images without a split, classes with no example in Train or Valid (all names, the UI shows 3 then "…and N more"), stale worker heartbeat. None disables Start.
- `RunBase` is a discriminated union on `kind`; `ModelBase(model_id)` is refused with 422 for an unknown id, a different task type or a missing file. The run records `base_kind "model"`, the model's name and `base_model_id`, and job.json carries the model id.
- `train_job` starts from `data/models/<id>.pt` for a model base ("The base model file is missing." when absent; non-integer ids rejected).
- New training form: form and 320 px summary side by side from 1200 px, summary first below it; blockers with a "Split dataset" link (opens the shared `AutoSplitDialog`, options refetch after Apply) or a "Go to Classes" link; grouped base select with "Models trained here" and a non-blocking classes-differ note.

## Task Commits

1. **Task 1 RED: backend tests** - `da1f8d0` (test)
2. **Task 1 GREEN: options, service, schemas, worker** - `4e97377` (feat)
3. **Task 2 RED: frontend tests** - `463a78d` (test)
4. **Task 2 GREEN: components, form, i18n** - `43709ab` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## TDD Gate Compliance

Both tasks followed RED -> GREEN; no REFACTOR commit was needed.

- Task 1 RED (`da1f8d0`): 20 new tests failed for the intended reasons (`KeyError: 'summary'|'blockers'|'models'|'warnings'`, `base.kind: Input should be 'official'`, `Only official base models can be trained from yet.`, the 409 quoting the requested name). Tests that already held (bounds, name rules) stayed green as regression pins. After GREEN: `uv run pytest backend/tests` 639 passed.
- Task 2 RED (`463a78d`): 19 new NewRunPage tests failed (missing `newrun-layout`, `dataset-summary`, `notes-blockers`, trained group). After GREEN: full Vitest run 711 passed (58 files).

## Files Created/Modified

- `backend/src/yolo_trainer_api/training/options.py` - `dataset_summary`, `dataset_notes`, `eligible_models`, `build_options`
- `backend/src/yolo_trainer_api/training/service.py` - `blocker_codes`, `_resolve_base`, `create_run(..., settings)`, model-related 422 details, stored-name 409
- `backend/src/yolo_trainer_api/schemas.py` - `ModelBase`, `RunBase`, `SplitUsage`, `DatasetSummary`, `TrainingNote`, `TrainedModelOption`, new `TrainingOptions` fields
- `backend/src/yolo_trainer_worker/train_job.py` - `_resolve_weights` handles `kind "model"`
- `backend/tests/test_runs_api.py` - new: model bases, names, bounds, worker model loading
- `backend/tests/training_helpers.py` - `seed_model` helper
- `frontend/src/features/training/DatasetSummary.tsx`, `DatasetNotes.tsx` - new components
- `frontend/src/features/training/NewRunPage.tsx` - two-column layout, grouped base select, notes, single AutoSplitDialog
- `frontend/src/api/training.ts`, `frontend/src/test/trainingApi.ts`, `en|ru/training.json` - types, stub, strings

## Decisions Made

See `key-decisions` above. The three worth repeating: all applicable blockers are listed (the plan's literal "[noClasses]" example would hide the Train/Valid reasons); the 409 quotes the stored run name; `unannotated_clause()` is kept for the "Not annotated" count because it is equivalent to the snapshot's exclusion rule in every reachable state (a reviewed image always has boxes or the background flag).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 409 on a run name quoted the requested name instead of the stored one**
- **Found during:** Task 1 (names contract: "Run-1" when "run-1" exists)
- **Issue:** `create_run` built the message from the attempted name, unlike projects and classes which quote the stored name
- **Fix:** after the IntegrityError rollback the stored name is read by `normalized_name`; if no row matches (the chosen model was deleted in between) the answer is 422 "Unknown model." instead of a misleading 409
- **Files modified:** `backend/src/yolo_trainer_api/training/service.py`
- **Verification:** `test_a_name_that_differs_only_by_case_is_a_409_quoting_the_stored_name`
- **Committed in:** `4e97377`

**2. [Rule 3 - Blocking] Existing pipeline test expected the old error text for an unknown base kind**
- **Found during:** Task 1 (after switching `RunCreate.base` to a discriminated union)
- **Issue:** `test_run_requests_are_validated_on_the_server` expected `base.kind` in the 422 message; the union reports `base: Input tag 'path' found using 'kind' ...`
- **Fix:** the expected fragment is now `base: Input tag 'path'`
- **Files modified:** `backend/tests/test_training_pipeline.py`
- **Committed in:** `4e97377`

**3. [Rule 2 - Missing critical] Worker validated no model id**
- **Found during:** Task 1 (threat T4-08-01)
- **Issue:** a hand-edited job.json could carry a string id; only integers may select a file
- **Fix:** `_resolve_weights` rejects non-integer ids (and booleans) with `ValueError` before any path is built; covered by `test_train_job_refuses_a_model_id_that_is_not_a_whole_number`
- **Files modified:** `backend/src/yolo_trainer_worker/train_job.py`
- **Committed in:** `4e97377`

**4. [Rule 3 - Blocking] `<link>` is a void HTML tag in the i18n markup**
- **Found during:** Task 2 (summary hint "Images page" link)
- **Issue:** `<link>…</link>` was parsed as self-closing, so the anchor rendered empty
- **Fix:** the tag is named `<pagelink>` in both locales
- **Files modified:** `frontend/src/i18n/locales/{en,ru}/training.json`, `DatasetSummary.tsx`
- **Committed in:** `43709ab`

**5. [Rule 2 - Missing critical] Added optional `unassigned` prop to `DatasetNotes` and a `noClassesLink` string**
- **Issue:** the plan's `DatasetNotes` props give no direct way to know whether images without a split exist, and the no-classes blocker had no link label in the UI-SPEC strings
- **Fix:** `unassigned?: number` (falls back to the server's `unassigned` warning) and `notes.blocker.noClassesLink` ("Go to Classes" / "Перейти к классам")
- **Committed in:** `43709ab`

---

**Total deviations:** 5 auto-fixed (1 bug, 2 blocking, 2 missing critical). **Impact:** all necessary for correctness or to complete the tasks; no scope creep.

## Issues Encountered

None beyond the deviations above. Running the plan's `<automated>` commands from the worktree root worked as written.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Every new component is wired to the options payload; no placeholder data flows to the UI.

## Threat Flags

None. The new surface (an integer `model_id` in the run POST) is the one covered by T4-08-01 and T4-08-02 in the plan's threat model: only rows of the `models` table are loadable, no path field exists (extra keys 422), and task type equality is enforced.

## Next Phase Readiness

- The start form is complete for success criteria 1 and 2; a run can be started from an official or a trained model, and the form explains every refusal.
- Requirements TRAN-01, MODL-01, DATA-05 are listed as completed in the frontmatter; STATE.md, ROADMAP.md and REQUIREMENTS.md are left to the orchestrator as instructed.

## Self-Check: PASSED

- Files exist: `backend/tests/test_runs_api.py`, `DatasetSummary.tsx`, `DatasetNotes.tsx`, this SUMMARY
- Commits reachable from HEAD: `da1f8d0`, `4e97377`, `463a78d`, `43709ab`
- `uv run pytest backend/tests` 639 passed; `uv run ruff check backend` and `ruff format --check backend` clean; `npm run build` exits 0; `npm run test -- --run` 711 passed
- Acceptance greps: `discriminator="kind"` 1, `def eligible_models` 1, task-mismatch detail 1, `model_file` in train_job >= 1, `def test_` in test_runs_api >= 8, `min-width: 1200px` 1, `"classesDiffer"` 1, `"more"` 1

---
*Phase: 04-train-download*
*Completed: 2026-10-10*
