---
phase: 04-train-download
plan: 04
subsystem: testing
tags: [pytest, ultralytics, yaml, sqlite, alembic, hard-links, snapshot]

requires:
  - phase: 04-train-download
    provides: "training.labels, training.snapshot, training.catalog, training.service from plan 04-01"
provides:
  - "Tests pinning label rows, data.yaml, manifest ordering and the 20-name official catalog"
  - "Tests proving a run's dataset snapshot is linked, complete, consistent and immutable"
  - "A populated 0004 -> head migration test (annotations, AUTOINCREMENT, ck_images_split)"
  - "manifest.json images carry box_count"
affects: [05-resume, 09-export, 11-evaluation]

actuals:
  tokens: 9000
  tasks: 2
  commits: 4
plan_head_before: 7133fedfa83ea578cfd3085009a8c922b6719bac
plan_head_after: bdd41f20d2372f7714f9357e7b01564ecf4a8639

tech-stack:
  added: []
  patterns:
    - "Characterization tests over real API + temp-file SQLite for the reproducibility contract"
    - "Module-level no-op seam (_after_image_select) patched by tests to probe lock behavior"

key-files:
  created:
    - backend/tests/test_training_labels.py
    - backend/tests/test_training_snapshot.py
  modified:
    - backend/tests/test_migrations.py
    - backend/src/yolo_trainer_api/training/labels.py
    - backend/src/yolo_trainer_api/training/snapshot.py

key-decisions:
  - "Kept the full per-image box list in the manifest and added box_count next to it, so the manifest satisfies the contract's box count without losing reproducibility detail"
  - "Added the _after_image_select no-op seam (allowed by the plan) so the lock test can write between the two capture reads, not only before them"

patterns-established:
  - "Consistency test: a second sqlite3 connection with timeout=0 must get 'database is locked' during capture"
  - "Immutability test: hash the whole dataset tree and re-compare after each kind of project edit"

requirements-completed: [TRAN-03]

coverage:
  - id: D1
    description: "Label rows, data.yaml and manifest are exactly what Ultralytics and the D-13/D-19 contract expect, including edge boxes, empty Test split and awkward class names"
    requirement: TRAN-03
    verification:
      - kind: unit
        ref: "backend/tests/test_training_labels.py (18 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 20 official model names (yolo26/yolo11, n..x, with and without -seg) exist in Ultralytics GITHUB_ASSETS_NAMES"
    requirement: TRAN-03
    verification:
      - kind: unit
        ref: "backend/tests/test_training_labels.py#test_every_official_name_is_a_real_ultralytics_asset"
        status: pass
    human_judgment: false
  - id: D3
    description: "Snapshot images are hard links, copied when os.link fails, and the manifest/exclusion/background/segment/cross-project behavior holds"
    requirement: TRAN-03
    verification:
      - kind: integration
        ref: "backend/tests/test_training_snapshot.py"
        status: pass
    human_judgment: false
  - id: D4
    description: "After a run is queued, annotation moves, class rename/delete, split changes and image deletes change nothing in the run's dataset, manifest, counts or class names"
    requirement: TRAN-03
    verification:
      - kind: integration
        ref: "backend/tests/test_training_snapshot.py#test_project_edits_after_start_never_change_the_run_dataset"
        status: pass
    human_judgment: false
  - id: D5
    description: "Capture runs under the run INSERT's write lock; a vanished source image fails the run with the plain message and leaves no folder"
    requirement: TRAN-03
    verification:
      - kind: integration
        ref: "backend/tests/test_training_snapshot.py#test_a_concurrent_annotation_write_cannot_interleave_with_the_capture"
        status: pass
      - kind: integration
        ref: "backend/tests/test_training_snapshot.py#test_a_source_image_deleted_before_materialization_fails_the_run_and_leaves_no_folder"
        status: pass
    human_judgment: false
  - id: D6
    description: "A populated 0004 database upgrades to head with images unassigned, annotations intact, images still AUTOINCREMENT and split 'bogus' rejected"
    requirement: TRAN-03
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_a_populated_0004_database_upgrades_keeping_annotations_and_autoincrement"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-10
status: complete
---

# Phase 4 Plan 04: Snapshot Reproducibility Summary

**Pinned the run dataset snapshot (labels, data.yaml, manifest, hard links, immutability after edits, lock-based consistent capture, 0004 migration) with 35 new tests; the only code fixes were `box_count` in the manifest and a no-op capture seam.**

## Performance

- **Duration:** about 25 min
- **Completed:** 2026-10-10T09:35:30Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `test_training_labels.py` (18 tests): detect centre rows and segment corner rows, edge-touching and overshoot clamping to 1.000000, duplicate boxes kept in order, `data.yaml` round-trip through `yaml.safe_load` for ten awkward class names with no `path:` key and no `test:` key without a Test split, manifest ordering/determinism, and all 20 official names found in `GITHUB_ASSETS_NAMES`.
- `test_training_snapshot.py` (14 tests): same-inode hard links (`samefile`, `st_nlink >= 2`), `OSError(EXDEV)` copy fallback with the run still queued, manifest sha256/filename equal to the stored rows and per-split excluded counts, zero-byte background labels, polygon-only segment rows, two-project isolation, whole-tree hash unchanged after annotation move, class rename, split change, class delete and image delete (deleted image still readable through its link), vanished source image failing the run and leaving no folder, and a second `sqlite3` connection (`timeout=0`) getting `database is locked` both before and between the capture reads.
- `test_migrations.py`: a populated 0004 database (project, class, two images, three boxes) upgrades to head with images unassigned, annotations byte-for-byte intact, `images` still AUTOINCREMENT, `ck_images_split` rejecting `'bogus'`, and `alembic_version == migration_head()`.

## TDD Gate Compliance

- **RED (labels):** `test(04-04)` commit `5a73d01`. `test_manifest_describes_every_image_and_the_run_settings` failed with `KeyError: 'box_count'` on the planned manifest assertion; the other 17 tests passed. The first draft of the overshoot test was wrong (for detect rows the maximum value is a centre, not 1.0); it was corrected in the test before the RED commit, not in production code. Semantic assessment: the target test executed and failed on the intended assertion.
- **GREEN (labels):** `feat(04-04)` commit `a6ddbc8` adds `box_count`; 18 passed.
- **RED (snapshot):** `test(04-04)` commit `ba4c528`. Only `test_a_concurrent_annotation_write_cannot_interleave_with_the_capture` failed (`AttributeError`: the seam did not exist yet). The remaining 17 tests in the two files are characterization tests of 04-01 behavior that already passed; the plan asks for exactly this (pin the contract, fix whatever is exposed), and nothing else was exposed.
- **GREEN (snapshot):** `feat(04-04)` commit `bdd41f2` adds the no-op `_after_image_select` seam; 18 passed.
- No REFACTOR commit. The RED evidence was not run through `gsd_run check tdd-red-evidence` (pytest text output, not a supported report format); the semantic inspection above stands in for it.

## Task Commits

1. **Task 1: labels, data.yaml, manifest, catalog** - `5a73d01` (test), `a6ddbc8` (feat)
2. **Task 2: snapshot, consistency, immutability, migration** - `ba4c528` (test), `bdd41f2` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified

- `backend/tests/test_training_labels.py` - pure-function tests for labels, data.yaml, manifest, catalog
- `backend/tests/test_training_snapshot.py` - API-level tests for linking, manifest content, immutability, vanished source, lock consistency
- `backend/tests/test_migrations.py` - populated 0004 -> head test
- `backend/src/yolo_trainer_api/training/labels.py` - `box_count` per manifest image
- `backend/src/yolo_trainer_api/training/snapshot.py` - `_after_image_select` no-op test seam

## Decisions Made

- Added `box_count` and kept the `boxes` list in the manifest rather than replacing it; the list is the stronger reproducibility record and `box_count` satisfies the contract wording.
- Used the plan's allowed seam (`_after_image_select`) for the consistency test so a write is attempted between the two reads, in addition to one before the capture starts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Manifest missing the per-image box count**
- **Found during:** Task 1
- **Issue:** The plan's truth lists a box count per manifest image; `manifest_dict` only emitted the full `boxes` list.
- **Fix:** Added `"box_count": len(item.boxes)` per image.
- **Files modified:** `backend/src/yolo_trainer_api/training/labels.py`
- **Verification:** `test_manifest_describes_every_image_and_the_run_settings` and the manifest content test pass.
- **Committed in:** `a6ddbc8`

**2. [Plan-sanctioned] Capture seam added**
- **Found during:** Task 2
- **Issue:** Writing between the image and annotation selects needs a hook.
- **Fix:** Module-level no-op `_after_image_select`, documented as a test seam.
- **Files modified:** `backend/src/yolo_trainer_api/training/snapshot.py`
- **Committed in:** `bdd41f2`

---

**Total deviations:** 1 auto-fixed (1 bug), 1 plan-sanctioned seam
**Impact on plan:** Snapshot, labels and catalog behavior from 04-01 was otherwise already correct; no scope creep.

## Issues Encountered

- The first overshoot test asserted a maximum of 1.0 on detect rows, where the maximum value is a centre; the test input was changed to a box whose width overshoots, so both row forms exercise the clamp.
- Windows hosts: `os.link` is patched on the shared `os` module for the copy-fallback test only, restored by `monkeypatch`.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The reproducibility contract (TRAN-03, D-19, D-20) is covered by automated tests that Phase 5 resume, Phase 9 export and Phase 11 evaluation can rely on.
- Full backend suite: 461 passed; `ruff check` and `ruff format --check` clean.

## Self-Check: PASSED

- Files exist: `backend/tests/test_training_labels.py`, `backend/tests/test_training_snapshot.py`, `backend/tests/test_migrations.py`, `labels.py`, `snapshot.py`.
- Commits present on this branch: `5a73d01`, `a6ddbc8`, `ba4c528`, `bdd41f2`.
- All acceptance criteria of both tasks re-run and passing.

---
*Phase: 04-train-download*
*Completed: 2026-10-10*
