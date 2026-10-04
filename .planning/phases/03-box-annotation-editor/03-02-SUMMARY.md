---
phase: 03-box-annotation-editor
plan: 02
subsystem: annotation-api
tags: [fastapi, sqlalchemy, alembic, pytest, optimistic-concurrency, react, mantine, i18n, vitest]

requires:
  - phase: 03-box-annotation-editor
    provides: "Plan 01 save contract (PUT annotations, compare-and-swap annotation_version, derived status), migration 0004"
provides:
  - "tests pinning every edge of the versioned replace-set save (validation, scoping, ordering, restart, segment projects, upload status)"
  - "concurrency tests: stale 409, idempotent retry, one-winner race, rollback on failure, stale background toggle"
  - "ProjectClass.object_count (column_property) on every class response"
  - "delete_class bumps annotation_version and clears is_reviewed of every image that held a box of the class, in the same transaction"
  - "migration test: a database at 0003 with data upgrades to head, images read unannotated"
  - "delete-class dialog paragraph with the number of objects that go with the class (en, ru)"
affects: [03-03, 03-06, phase-06-polygons, phase-08-ai-annotation]

plan_head_before: ac1651ce2059b670d09c295fe8eb081d6ae6e58f

actuals:
  tokens: 10800
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Tests read the stored version and ordered rows straight from SQLite (_stored) to prove a rejected save changed nothing"
    - "Class delete re-versions touched images with an ORM update(...).where(Image.id.in_(select(Annotation.image_id)...)) before the FK cascade removes the boxes"
    - "Derived per-class object count via correlated column_property, same pattern as Image.box_count"

key-files:
  created:
    - backend/tests/test_annotations_concurrency.py
  modified:
    - backend/tests/test_annotations_api.py
    - backend/tests/test_classes_api.py
    - backend/tests/test_migrations.py
    - backend/src/yolo_trainer_api/models.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/routers/classes.py
    - frontend/src/api/classes.ts
    - frontend/src/features/classes/DeleteClassModal.tsx
    - frontend/src/features/classes/DeleteClassModal.test.tsx
    - frontend/src/features/classes/ClassRow.test.tsx
    - frontend/src/i18n/locales/en/classes.json
    - frontend/src/i18n/locales/ru/classes.json

key-decisions:
  - "Class delete demotes and re-versions images in the same transaction as the cascade, before the class row is deleted (the boxes must still be findable); a stale editor tab then gets 409 instead of re-inserting boxes of the deleted class"
  - "Images that never had a box of the deleted class are left untouched (version and reviewed flag), proven by a test"
  - "object_count is derived (correlated count), never stored, like box_count"

patterns-established:
  - "Test helpers (_box, _payload, _put, _stored, _setup) in test_annotations_api.py are imported by sibling backend test files"

requirements-completed: [ANNO-03, ANNO-07, ANNO-10]

coverage:
  - id: D1
    description: "Save validation: non-finite, out-of-range, zero-size, past-the-edge boxes, bad or duplicate ids, 2001 boxes, unknown fields, foreign class, foreign box id, background with boxes, reviewed without content all return 422 and leave version and rows unchanged"
    requirement: ANNO-03
    verification:
      - kind: integration
        ref: "backend/tests/test_annotations_api.py#test_invalid_box_is_rejected_and_nothing_changes (12 cases) and the non-finite, duplicate, background, reviewed and foreign tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "Round trip keeps payload order and exact coordinates, survives an app restart, replace semantics, identical and edge-touching boxes stay separate, empty list clears, segment projects behave like detect projects"
    requirement: ANNO-07
    verification:
      - kind: integration
        ref: "backend/tests/test_annotations_api.py#test_round_trip_returns_boxes_in_payload_order_with_their_coordinates and #test_saved_boxes_and_their_order_survive_an_app_restart"
        status: pass
    human_judgment: false
  - id: D3
    description: "Concurrency and retry: stale base 409, identical retry 200 with one set of rows, two racing PUTs give exactly one 200 and one 409, a failed save rolls back, five saves give versions 1..5, a stale background toggle is a 409"
    requirement: ANNO-10
    verification:
      - kind: integration
        ref: "backend/tests/test_annotations_concurrency.py (7 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Deleting a class bumps annotation_version and clears is_reviewed only on images that held its boxes; a stale save is a 409; classes report object_count on list, create and patch"
    requirement: ANNO-07
    verification:
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_deleting_a_class_rebumps_and_demotes_only_the_images_that_had_its_boxes and #test_classes_report_how_many_boxes_they_own_across_the_project"
        status: pass
    human_judgment: false
  - id: D5
    description: "A database at revision 0003 holding a project, image and class upgrades to head; the image reads is_background false, is_reviewed false, version 0, box_count 0, status unannotated"
    requirement: ANNO-07
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_a_database_at_0003_upgrades_to_head_and_keeps_its_images_unannotated"
        status: pass
    human_judgment: false
  - id: D6
    description: "Delete-class dialog shows the bold paragraph 'Objects that will be deleted with it: N.' (ru 'Вместе с ним будут удалены объекты: N.') only when N > 0"
    verification:
      - kind: unit
        ref: "frontend/src/features/classes/DeleteClassModal.test.tsx (three new tests)"
        status: pass
    human_judgment: true
    rationale: "Paragraph presence, weight and wording are asserted by tests; the visual spacing inside the dialog is a UI judgment for the end-of-phase browser check"

duration: 13min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 02: Pin the save contract and make class delete safe Summary

**The Plan 01 compare-and-swap save contract is now pinned edge by edge by real-app tests, deleting a class re-versions and demotes the images it touched (so a stale editor gets 409), classes report `object_count`, and the delete dialog tells the user how many objects go with the class.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-04T07:31:27Z
- **Completed:** 2026-10-04T07:44Z (approx.)
- **Tasks:** 3
- **Files modified:** 13 (1 created, 12 modified)

## Accomplishments

- 25 tests in `test_annotations_api.py` and 7 in the new `test_annotations_concurrency.py` pin validation (NaN and Infinity as raw JSON, range, zero size, past-the-edge, bad and duplicate ids, 2001 boxes, unknown fields), scoping (403 without the header, 404 for foreign project or image, 422 for a foreign class or foreign box id), payload ordering, restart persistence, replace semantics, edge-touching and identical boxes, the background lifecycle, segment projects (D-18), and the upload status guard. Every rejection test reads the version and rows from SQLite and asserts nothing changed.
- Concurrency tests cover stale 409, a lost-response retry (200, one set of rows), two racing PUTs behind a barrier over three images (exactly one 200 and one 409 each time), rollback after a failed save, versions 1..5, and a stale background toggle.
- `delete_class` now runs `UPDATE images SET annotation_version = annotation_version + 1, is_reviewed = false` for every image with a box of the class before the cascade removes the boxes, in the same transaction; untouched images keep version and reviewed flag. A tab holding the old version gets 409.
- `ProjectClass.object_count` (derived column_property) is returned by GET, POST and PATCH of classes.
- A database at revision 0003 with data upgrades to head and serves its image as unannotated.
- `DeleteClassModal` shows the bold objects paragraph when `object_count > 0`, in English and Russian.

## Task Commits

1. **Task 1: pin the save contract** - `0281909` (test). Tests only: Plan 01's implementation already satisfied the contract, so all tests passed on first run.
2. **Task 2: class delete re-versions, object_count, 0003 upgrade**
   - RED `373cee6` (test): object_count, delete re-versioning and migration tests; the two object_count tests and the delete test failed on assertions for the planned behavior (`KeyError: 'object_count'`, version 3 instead of 4).
   - GREEN `8cb9a7b` (feat)
3. **Task 3: delete-class dialog objects paragraph**
   - RED `2f46902` (test): the bold count paragraph and Russian wording tests failed (text not found).
   - GREEN `0b9da7b` (feat)

**Plan metadata:** recorded in the docs commit that follows this file.

## Files Created/Modified

- `backend/tests/test_annotations_concurrency.py` - stale 409, idempotent retry, one-winner race, rollback, version sequence, stale background toggle.
- `backend/tests/test_annotations_api.py` - 16 added tests and shared helpers (`_box`, `_payload`, `_stored`, `_add_class`); `_setup` takes `task_type`.
- `backend/tests/test_classes_api.py` - object_count and class-delete demotion tests; key-set assertion extended with `object_count`.
- `backend/tests/test_migrations.py` - 0003 to head upgrade test.
- `backend/src/yolo_trainer_api/models.py`, `schemas.py`, `routers/classes.py` - `object_count`, `ClassRead.object_count`, demotion in `delete_class`.
- `frontend/src/api/classes.ts`, `features/classes/DeleteClassModal.tsx` (+ tests), `ClassRow.test.tsx`, `i18n/locales/{en,ru}/classes.json` - objects paragraph.

## Decisions Made

- The version bump and reviewed demotion run before `session.delete(project_class)` so the boxes of the class can still be selected; the comment in `delete_class` explains Pitfall 5.
- Followed the plan otherwise as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing class-create test asserted the exact response key set**
- **Found during:** Task 2 (RED run)
- **Issue:** `test_create_assigns_contiguous_index_and_palette_color` compared the body keys to a fixed set; the planned additive field `object_count` makes it fail.
- **Fix:** Extended the expected key set and asserted `object_count == 0` for a new class.
- **Files modified:** `backend/tests/test_classes_api.py`
- **Verification:** `uv run pytest backend/tests -x -q` gives 363 passed
- **Committed in:** `373cee6` (test) / `8cb9a7b` (feat)

---

**Total deviations:** 1 auto-fixed (1 stale test assertion)
**Impact on plan:** None; no scope change. No Plan 01 production bug was found by the Task 1 tests, so `annotations.py` and the 409/422 texts are unchanged.

## Issues Encountered

- A multi-heredoc `cat >> ... <<'EOF'` shell command failed to parse (same as in Plan 01) and wrote nothing; the tests were then written with the Write/Edit tools and a quoted-heredoc Python script.
- One full Vitest run reported 1 failed test of 204 (the failing test name was not captured); four immediate re-runs of the full suite were green (204 of 204). Treated as a one-off timing flake under load, not related to this plan's changes (the targeted class tests passed in every run).
- Mutation check for Task 1: replacing the compare-and-swap condition with `>= 0` made 5 tests fail; disabling the class-ownership check made 3 fail. Both mutations were reverted (`git status` clean for `annotations.py`).

## Self-Check: PASSED

All 13 files exist on disk; commits `0281909`, `373cee6`, `8cb9a7b`, `2f46902`, `0b9da7b` are present in `git log`. Acceptance criteria re-run: `uv run pytest backend/tests -x -q` 363 passed; `uv run ruff check backend` and `ruff format --check backend` clean; `-k "invalid or foreign or background"` selects 23 tests (pass); greps (CONFLICT text 1, `"segment"` 2, `ThreadPoolExecutor` 2, `object_count` in models/schemas, `annotation_version` and `is_reviewed` in classes router, `"0003"` in test_migrations, `delete.objects`, `"objects"` in both locales, `object_count` in classes.ts) all at or above their thresholds; Vitest targeted run 34 passed, `npx tsc --noEmit` and `npm --prefix frontend run build` succeed.

## Known Stubs

None.

## Threat Flags

None. No new network surface was added; T3-02-01..T3-02-04 are mitigated and pinned by the tests above, T3-02-05 is accepted as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The save contract is fully pinned for Plans 03-03 onward and Phases 6 and 8; `object_count` is available to the class panel in Plan 03-06.
- The unidentified Vitest flake should be watched in later runs.

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
