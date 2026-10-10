---
phase: 04-train-download
plan: 09
subsystem: api
tags: [fastapi, sqlalchemy, sqlite, orphan-cleanup, react, mantine, i18n]

requires:
  - phase: 04-train-download
    provides: "TrainingRun/TrainedModel tables with FK cascades, storage.remove_run_dir/remove_model_file, Project run_count/model_count/active_run_count (04-01); startup run reconcile before the orphan sweep (04-05)"
provides:
  - "Guarded project delete: runs, models and their files go with the project; an active/queued/preparing run answers 409 and deletes nothing"
  - "storage.find_orphan_runs, storage.find_orphan_models, reconcile_orphans(settings, project_ids, image_keys, run_ids, model_ids) with per-tree empty-table safety valves"
  - "Delete-project dialog that names the runs and models that go with the project and blocks while a run is active"
affects: [04-10, 04-11, phase-05, phase-07]

actuals:
  tokens: 13100
  tasks: 2
  commits: 4

plan_head_before: c3f46925865ba87f03d9fa6c14046ef3e191c41d
plan_head_after: 1a44dc66988af9f2a81c1494c299d861992b1aa8
commits: 4

tech-stack:
  added: []
  patterns:
    - "One guarded DELETE ... WHERE NOT EXISTS (active run); rowcount 0 is split into 404 (project gone) or 409 (active run) by one follow-up SELECT"
    - "Ids collected before the delete, files removed by id afterwards in a thread, every failure logged and left to the startup sweep"
    - "Each swept tree (projects, runs, models) has its own empty-table safety valve"
    - "URL- and method-routed fetch stub in frontend tests; unknown requests answer 404 instead of throwing"

key-files:
  created:
    - backend/tests/test_training_cleanup.py
  modified:
    - backend/src/yolo_trainer_api/routers/projects.py
    - backend/src/yolo_trainer_api/storage.py
    - backend/src/yolo_trainer_api/main.py
    - backend/tests/test_projects_api.py
    - frontend/src/api/projects.ts
    - frontend/src/features/project/DeleteProjectModal.tsx
    - frontend/src/features/project/DeleteProjectModal.test.tsx
    - frontend/src/i18n/locales/en/project.json
    - frontend/src/i18n/locales/ru/project.json

key-decisions:
  - "find_orphan_runs/find_orphan_models return plain name lists (not Paths) because run folders and model files are direct children of one root; a dedicated _remove_child deletes a directory with rmtree and a file with unlink, refusing links and non-direct children"
  - "reconcile_orphans stays one entry point but delegates to three independent sweeps, so an empty runs table does not stop the models sweep and vice versa"
  - "delete_project passes synchronize_session=False to the bulk DELETE; FK cascades (not ORM) remove dependants and the session is discarded right after"
  - "The dialog refetches the project detail with invalidateQueries on every open, so the counts and the blocked state are current"

patterns-established:
  - "Guarded delete: put the precondition inside the DELETE statement, never in a separate pre-check"
  - "Sweeps list children without following links or junctions and only report canonical decimal names"

requirements-completed: [MODL-03, TRAN-03]

coverage:
  - id: D1
    description: "Deleting a project removes its runs, models, run folders and data/models/<id>.pt files; other projects' runs keep base_name and get a null base_model_id"
    requirement: "MODL-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_deleting_a_project_removes_its_runs_models_and_files"
        status: pass
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_another_projects_run_keeps_its_base_name_when_the_base_model_goes"
        status: pass
    human_judgment: false
  - id: D2
    description: "A project with a preparing, queued or running run answers 409 and nothing is deleted, including a run queued after the project lookup"
    requirement: "TRAN-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_a_project_with_an_active_run_cannot_be_deleted"
        status: pass
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_a_run_queued_after_the_delete_looked_at_the_project_still_blocks_it"
        status: pass
    human_judgment: false
  - id: D3
    description: "Startup sweep removes run folders and model files no row refers to, never follows links, never touches data/weights, ignores non-canonical names and skips a tree whose table is empty"
    requirement: "MODL-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_startup_removes_stray_run_folders_and_model_files_and_keeps_the_rest"
        status: pass
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_links_under_data_runs_are_neither_followed_nor_removed"
        status: pass
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_an_empty_models_table_is_a_safety_valve_for_data_models"
        status: pass
    human_judgment: false
  - id: D4
    description: "The project payload reports run_count, model_count and active_run_count"
    requirement: "MODL-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_new_project_reports_zero_run_model_and_active_run_counts"
        status: pass
      - kind: integration
        ref: "backend/tests/test_training_cleanup.py#test_the_project_payload_counts_runs_models_and_active_runs"
        status: pass
    human_judgment: false
  - id: D5
    description: "The delete dialog adds the run and model sentences (only above zero), and with an active run shows the yellow alert, hides the name input and disables the red confirm; a 409 shows the API message"
    requirement: "TRAN-03"
    verification:
      - kind: unit
        ref: "frontend/src/features/project/DeleteProjectModal.test.tsx"
        status: pass
    human_judgment: true
    rationale: "Wording, weight and the yellow-versus-red emphasis of the dialog are visual judgments that jsdom assertions only approximate"

duration: 50min
completed: 2026-10-10
status: complete
---

# Phase 4 Plan 09: Project delete with runs and models Summary

**Guarded project delete (one `DELETE ... WHERE NOT EXISTS active run` answering 409) that removes runs, models and their files, a startup sweep of `data/runs` and `data/models` with link and empty-table guards, and a delete dialog that names what goes and blocks during training**

## Performance

- **Duration:** about 50 min
- **Completed:** 2026-10-10T16:05Z
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files modified:** 10

## Accomplishments

- `DELETE /api/projects/{id}` collects run and model ids first, runs one guarded delete, answers 409 with `PROJECT_HAS_ACTIVE_RUN_DETAIL` when a run is preparing, queued or running (404 if the project vanished meanwhile), then removes the project folder, each run folder and each model file in a thread, logging failures.
- FK cascades delete the dependants; runs of other projects that used a deleted model as base keep `base_name` and get `base_model_id = NULL` (pinned by a test).
- `storage.reconcile_orphans` now sweeps `data/runs/<id>` and `data/models/<id>.pt` too: canonical decimal names only, links and junctions never listed, followed or removed, `data/weights` and temp files like `.x.tmp-1` untouched, and each tree skipped with an error log when its table is empty but numbered entries exist. `_cleanup_orphans` passes the run and model ids.
- `DeleteProjectModal` refetches the project when it opens, shows "Training runs that will be deleted with it: N." and "Models that will be deleted with it: N." (weight 600, only above zero), and with `active_run_count > 0` shows a yellow Alert, hides the typed-name input, disables the red confirm and leaves Cancel (autofocused) as the way out. A server 409 lands in the existing red Alert.

## Task Commits

1. **Task 1 RED:** `c3af532` (test) - failing tests for delete with runs/models and the orphan sweep
2. **Task 1 GREEN:** `2ab4b69` (feat) - guarded delete, file removal, orphan reconcile for runs/models
3. **Task 2 RED:** `0ac336f` (test) - failing dialog tests on a method/URL-routed fetch stub
4. **Task 2 GREEN:** `1a44dc6` (feat) - counts, blocked state, refetch on open, en/ru strings

**RED evidence (semantic assessment):** Task 1 RED failed on the planned assertions only (204 where 409 was expected, run folders and model files still present after delete, `AttributeError` for the not-yet-existing `find_orphan_runs`/`find_orphan_models`/`remove_run_dir` binding, no safety-valve error log, `TypeError` for the 5-argument `reconcile_orphans`); the 56 characterization tests that already held (counts, base_name kept via the existing FK) passed. Task 2 RED failed on the missing run/model sentences and the missing blocked alert (`delete.blocked` key text not found); the 9 retained-behaviour tests passed on the new routed stub. The plan is `type: execute`, so the `tdd-red-evidence` classifier file was not required.

## Files Created/Modified

- `backend/src/yolo_trainer_api/routers/projects.py` - `PROJECT_HAS_ACTIVE_RUN_DETAIL`, guarded `delete_project`, `_remove_project_files`
- `backend/src/yolo_trainer_api/storage.py` - `find_orphan_runs`, `find_orphan_models`, link-safe child listing and removal, three-tree `reconcile_orphans`
- `backend/src/yolo_trainer_api/main.py` - `_cleanup_orphans` passes run and model ids
- `backend/tests/test_training_cleanup.py` - new: delete, 409 guard (incl. race), base_name survival, sweep, links, safety valves
- `backend/tests/test_projects_api.py` - zero run/model/active counts on create, get, list and patch
- `frontend/src/api/projects.ts` - `Project.run_count|model_count|active_run_count`
- `frontend/src/features/project/DeleteProjectModal.tsx` - counts, blocked state, refetch on open
- `frontend/src/features/project/DeleteProjectModal.test.tsx` - rewritten on a method/URL-routed `fetch` stub (13 tests)
- `frontend/src/i18n/locales/{en,ru}/project.json` - `delete.runs`, `delete.models`, `delete.blocked`

## Decisions Made

- Orphan finders return name lists, and removal uses a dedicated direct-child guard that distinguishes directories (`rmtree`) from files (`unlink`); the old `_remove_orphan` (always `rmtree` for single-part paths) stays for projects.
- The three sweeps are independent so one wrong or restored table cannot disable the others, and a wrong table can never trigger deletion in its own tree.
- Bulk `delete(Project)` uses `synchronize_session=False`: the dependants go by FK cascade and the session ends with the request.
- The race test patches `get_project_or_404` to queue a run right after the lookup (after ending the read transaction), which proves the guard sits inside the DELETE statement and not in a pre-check.

## Deviations from Plan

None - plan executed exactly as written.

The plan listed `ProjectSettingsPage` and `locales` as extra test selectors for Task 2's verify; both pass unchanged (26 tests in the three selected files). `npm ci` was run once in the worktree (lockfile install, no new package) because `frontend/node_modules` does not exist in a fresh worktree.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: startup-sweep-vs-model-registration | backend/src/yolo_trainer_api/storage.py | The startup sweep reads model ids once; `register_model` in the worker links the model file while its transaction is still open, so an api start in that few-millisecond window would see a file without a row and remove it. Not mitigated here (plan scope, T4-09-02 lists no age guard); window is only at api start while the worker is registering. A later plan could skip files younger than a few seconds. |

## User Setup Required

None - no external service configuration required.

## Verification

- `uv run pytest backend/tests -x`: 535 passed (1 deselected, pre-existing marker)
- `uv run ruff check backend` and `uv run ruff format --check backend`: clean
- `npm --prefix frontend run build`: green (tsc + vite)
- `npm --prefix frontend run test -- --run`: 57 files, 656 tests passed
- Acceptance greps: `PROJECT_HAS_ACTIVE_RUN_DETAIL` x2, `find_orphan_runs` x1, `find_orphan_models` x1, `run_ids` in main.py x2, `active_run_count` in the modal x1 and in `projects.ts` x1, `mockResolvedValueOnce` in the modal test x0, `"blocked"` in ru x1

## Next Phase Readiness

Project deletion is correct for the new run and model trees; the delete dialog covers D-21. Ready for the remaining wave-3 plans. STATE.md and ROADMAP.md were not touched (the orchestrator owns them).

## Self-Check: PASSED

- Created/modified files exist on disk; commits `c3af532`, `2ab4b69`, `0ac336f`, `1a44dc6` are ancestors of HEAD.

---
*Phase: 04-train-download*
*Completed: 2026-10-10*
