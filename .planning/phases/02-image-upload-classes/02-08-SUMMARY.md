---
phase: 02-image-upload-classes
plan: 08
subsystem: storage
tags: [fastapi, sqlalchemy, column_property, orphan-cleanup, react, mantine, i18n, pytest, vitest]

requires:
  - phase: 02-image-upload-classes
    provides: "02-01 storage layout (project_dir/images/thumbs/.incoming, Image model); 02-02/02-05 classes; 02-06 UploadContext"
provides:
  - "storage.remove_project_dir, scan_projects_root, ProjectDirListing, find_orphans (pure), reconcile_orphans"
  - "Lifespan startup cleanup of orphaned files under data/projects/ with an empty-projects safety valve"
  - "Project delete removes data/projects/<id>/ after the DB commit; folder-removal failure is logged, not raised"
  - "Project.image_count / class_count (column properties) in every ProjectRead response"
  - "Counts on project cards and Overview, Upload images shortcut for an empty project, heading weight 600"
affects: [02-09, 02-10, 02-11, 02-12, phase-03]

plan_head_before: b3d043594d6a66c1aa27a686de571371456d5b44

actuals:
  tokens: 10900
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Destructive file cleanup is split into a pure decision function (find_orphans) and a thin I/O applier (reconcile_orphans) so hostile listings are unit-testable"
    - "Links and Windows junctions are never entered or followed (os.path.islink + isjunction, DirEntry.is_symlink/is_junction)"
    - "Read-only child counts as column_property scalar subqueries attached after both child classes exist"

key-files:
  created:
    - backend/tests/test_storage_cleanup.py
  modified:
    - backend/src/yolo_trainer_api/storage.py
    - backend/src/yolo_trainer_api/main.py
    - backend/src/yolo_trainer_api/routers/projects.py
    - backend/src/yolo_trainer_api/models.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/tests/test_projects_api.py
    - frontend/src/api/projects.ts
    - frontend/src/api/classes.ts
    - frontend/src/features/images/UploadContext.tsx
    - frontend/src/features/projects/ProjectCard.tsx
    - frontend/src/features/projects/ProjectsPage.test.tsx
    - frontend/src/features/project/ProjectOverviewPage.tsx
    - frontend/src/features/project/ProjectOverviewPage.test.tsx
    - frontend/src/i18n/locales/en/project.json
    - frontend/src/i18n/locales/ru/project.json
    - frontend/src/i18n/locales/en/projects.json
    - frontend/src/i18n/locales/ru/projects.json
    - frontend/src/theme.ts

key-decisions:
  - "Only canonical decimal directory names count as project folders (7, never 007 or unicode digits); anything else under data/projects/ is ignored"
  - "Safety valve skips ALL deletion (including .incoming) when the projects table is empty but numbered project folders exist, and logs an ERROR"
  - "Junctions are treated like symlinks, so the link tests run on this Windows machine without symlink privilege"

patterns-established:
  - "Startup cleanup never blocks startup: DB id loading and reconcile run in one try/except that logs the exception"
  - "DB first, then files (D-19): delete_project commits, then removes the folder in a thread"

requirements-completed: [DATA-01, PROJ-03]

coverage:
  - id: D1
    description: "Deleting a project removes its data/projects/<id>/ folder after the DB delete; images and classes rows cascade; a failed folder removal is logged and the delete still returns 204"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_delete_removes_project_folder_and_all_rows"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_delete_succeeds_and_logs_when_folder_removal_fails"
        status: pass
    human_judgment: false
  - id: D2
    description: "Startup removes orphaned originals, thumbnails, .incoming leftovers and folders of vanished projects; keeps every real image; never touches other paths, links or app.db; the empty-projects safety valve deletes nothing; a failing cleanup does not block /api/health"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "backend/tests/test_storage_cleanup.py#test_find_orphans_*"
        status: pass
      - kind: integration
        ref: "backend/tests/test_storage_cleanup.py#test_restart_removes_leftovers_and_keeps_real_files"
        status: pass
      - kind: integration
        ref: "backend/tests/test_storage_cleanup.py#test_empty_projects_table_is_a_safety_valve_not_a_mass_delete"
        status: pass
      - kind: integration
        ref: "backend/tests/test_storage_cleanup.py#test_startup_survives_a_failing_cleanup"
        status: pass
      - kind: integration
        ref: "backend/tests/test_storage_cleanup.py#test_symbolic_links_and_their_targets_survive_cleanup"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every project API response carries image_count and class_count, and get equals the matching list item"
    requirement: PROJ-03
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_counts_follow_uploads_and_classes_and_get_matches_list"
        status: pass
    human_judgment: false
  - id: D4
    description: "Project cards show Images: N; Overview shows Images and Classes counts and, for an empty project, the hint plus an Upload images link to the Images section"
    requirement: PROJ-03
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/project/ProjectOverviewPage.test.tsx#points an empty project at the Images section with an Upload images link"
        status: pass
      - kind: automated_ui
        ref: "frontend/src/features/projects/ProjectsPage.test.tsx#renders project cards in API order"
        status: pass
    human_judgment: false
  - id: D5
    description: "Counts refresh after uploads and class create/delete (query invalidation); headings render at weight 600; delete confirmation names images and classes"
    verification: []
    human_judgment: true
    rationale: "Query invalidation timing and the visual heading weight are not asserted by a dedicated test; they were verified only by code review and a green build"

duration: 8min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 08: Project storage lifecycle and counts Summary

**Project delete now removes the project's folder after the DB commit, API start sweeps orphaned files under data/projects/ behind a strict pattern and empty-DB safety valve, and project cards and the Overview show image and class counts.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-03T13:18:48Z
- **Completed:** 2026-10-03T13:26:20Z
- **Tasks:** 3 (TDD, 6 commits)
- **Files modified:** 19

## Accomplishments
- D-19 delivered: rows are deleted first (FK cascade takes images and classes), then the folder in a worker thread; a folder failure is logged and never fails the request.
- `find_orphans` is pure and tested with hostile listings (non-canonical names, symlink flags, per-project id matching); `reconcile_orphans` re-checks every path component for links before deleting and refuses when the projects table is empty but project folders exist.
- Startup loads project ids and image keys and runs the cleanup in a thread inside try/except; the lifespan comment was rewritten (it previously promised no file deletion).
- `Project.image_count` / `class_count` as correlated scalar-subquery column properties, shown on cards (`Images: N`) and the Overview (`Images`, `Classes`, empty hint plus an `Upload images` link to `/projects/<id>/images`).
- Counts stay fresh: upload completion and class create/delete invalidate `projectKeys.all` and the project detail key.

## Task Commits

TDD gates for each task (RED then GREEN):

1. **Task 1: Deleting a project removes its image folder** - `471f64b` (test), `0e10b72` (feat)
2. **Task 2: Startup cleanup of orphaned files with a safety valve** - `f04769a` (test), `7a61c53` (feat)
3. **Task 3: Counts on cards and Overview with Upload shortcut** - `7527f48` (test), `4f62c8d` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `backend/src/yolo_trainer_api/storage.py` - remove_project_dir, ProjectDirListing, scan_projects_root, find_orphans, reconcile_orphans
- `backend/src/yolo_trainer_api/main.py` - lifespan orphan cleanup (`_cleanup_orphans`), rewritten comment
- `backend/src/yolo_trainer_api/routers/projects.py` - delete_project removes the folder after commit
- `backend/src/yolo_trainer_api/models.py` / `schemas.py` - count column properties and `ProjectRead` fields
- `backend/tests/test_storage_cleanup.py` - 14 test functions (22 cases), including junction-based link tests
- `backend/tests/test_projects_api.py` - delete-folder and count tests
- `frontend/src/features/project/ProjectOverviewPage.tsx`, `features/projects/ProjectCard.tsx` - counts and Upload CTA
- `frontend/src/api/{projects,classes}.ts`, `features/images/UploadContext.tsx` - type fields and invalidation
- `frontend/src/theme.ts`, `i18n/locales/{en,ru}/{project,projects}.json` - heading weight 600, new strings, changed delete warning

## Decisions Made
- Only canonical decimal names (`7`, never `007`) are treated as project folders, because `project_dir` builds `str(int(id))`; anything else is ignored (T2-08-01).
- The safety valve skips all deletion, including `.incoming`, when the projects table is empty but numbered folders exist.
- Junctions are handled like symlinks (`os.path.isjunction`, Python 3.12) so link tests actually run on Windows without symlink privilege.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED commit for Task 2 carries inert storage skeletons**
- **Found during:** Task 2 (RED)
- **Issue:** Without the names `ProjectDirListing`, `find_orphans`, `scan_projects_root`, `reconcile_orphans`, `storage.logger`, the test module failed at import (INVALID_RED), not on assertions.
- **Fix:** Added empty-returning skeletons to storage.py in the RED commit so seven tests failed on assertions for the planned behavior; they were replaced by the real code in the GREEN commit. One test (`test_startup_survives_a_failing_cleanup`) still failed at monkeypatch setup in RED because `main.reconcile_orphans` did not exist yet.
- **Files modified:** backend/src/yolo_trainer_api/storage.py
- **Committed in:** f04769a

**2. [Rule 2 - Missing Critical] Junction support**
- **Found during:** Task 2
- **Issue:** `Path.is_symlink()` is false for Windows junctions, which would let the cleanup enter a linked directory (T2-08-01 mitigation).
- **Fix:** Link checks use `os.path.islink or os.path.isjunction` and `DirEntry.is_junction()`; tests create junctions via `_winapi.CreateJunction` when symlinks are not permitted.
- **Committed in:** 7a61c53

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** No scope change; both strengthen the specified safety guarantees.

## Issues Encountered
- `ClassRow recolor ... restores the previous color` failed once in a full frontend run under load and passed in isolation (3 runs) and in the next full run; it is a timing flake unrelated to this plan.
- The Bash tool rejected two large heredoc payloads (`unexpected EOF`); the files were written with the Write tool and small patch scripts instead.

## Known Stubs

None. Frontend `project.image_count ?? 0` fallbacks are defensive defaults for older cached payloads, not placeholders.

## Threat Flags

None. The new filesystem deletions are covered by T2-08-01..04 and mitigated as planned (strict patterns, no link following, scope limited to data/projects/, safety valve, logging, startup resilience).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Storage lifecycle is closed: delete and startup both keep disk and DB consistent; later plans can rely on `Project.image_count`.
- Not exercised here: a Docker compose smoke run of the cleanup (the plan's verification is pytest and the frontend suite only).

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*

## Self-Check: PASSED
