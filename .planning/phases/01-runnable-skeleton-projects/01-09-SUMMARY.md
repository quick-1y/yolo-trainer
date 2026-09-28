---
phase: 01-runnable-skeleton-projects
plan: 09
subsystem: api
tags: [fastapi, sqlalchemy, pydantic, react-query, mantine, mantine-notifications, react-i18next, vitest]

# Dependency graph
requires:
  - phase: 01-runnable-skeleton-projects (plan 03)
    provides: "ProjectName/ProjectDescription reusable Annotated validator types, 409-uses-stored-name pattern"
  - phase: 01-runnable-skeleton-projects (plan 08)
    provides: "GET /api/projects/{project_id}, get_project_or_404 helper, useProject(id), ProjectLayout sidebar shell with a SECTIONS array"
provides:
  - "PATCH /api/projects/{project_id}: rename + description edit, task_type refused with a D-09 message, extra=forbid, model_fields_set-scoped partial update"
  - "DELETE /api/projects/{project_id}: hard delete, 204, idempotent on repeat"
  - "useUpdateProject(id) / useDeleteProject(id) React Query mutations (DELETE treats a 404 as idempotent success)"
  - "/projects/:projectId/settings route -> ProjectSettingsPage (rename/description form + Danger zone)"
  - "DeleteProjectModal: GitHub-style typed-name delete confirmation (D-10)"
  - "@mantine/notifications wired into App.tsx for the post-delete confirmation toast"
affects: [10]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 13105
  tasks: 3
  commits: 3
plan_head_before: 591542010c19781d97083111d0a718a2dbd7d537

# Tech tracking
tech-stack:
  added: ["@mantine/notifications 9.6.3"]
  patterns:
    - "ProjectUpdate uses a model_validator(mode='before') to intercept task_type presence and explicit name:null BEFORE Pydantic's extra=forbid/field validation runs, so the 422 detail is the friendly D-09 sentence rather than a generic 'extra field' error"
    - "PATCH captures the attempted new normalized_name in a local variable before commit(), because on IntegrityError a persistent (already-existing) ORM object is expired by rollback and re-reads its PRE-update value from the DB - unlike a still-pending INSERT, where the in-memory attribute survives rollback"
    - "useDeleteProject's mutationFn swallows a 404 from DELETE and resolves normally - deleting an already-gone resource is idempotent, so the 'someone else deleted it first' case and the normal-delete case share one onSuccess path (navigate + invalidate + notify)"
    - "ProjectLayout's SECTIONS NavLink now derives `to` and `active` from each section's own path/route match instead of hardcoding the project root and `active=true` - the single-section version only worked by accident"

key-files:
  created:
    - frontend/src/features/project/ProjectSettingsPage.tsx
    - frontend/src/features/project/ProjectSettingsPage.test.tsx
    - frontend/src/features/project/DeleteProjectModal.tsx
    - frontend/src/features/project/DeleteProjectModal.test.tsx
  modified:
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/routers/projects.py
    - backend/tests/test_projects_api.py
    - frontend/src/api/projects.ts
    - frontend/src/app/routes.tsx
    - frontend/src/app/App.tsx
    - frontend/src/features/project/ProjectLayout.tsx
    - frontend/src/features/project/ProjectOverviewPage.test.tsx
    - frontend/src/i18n/locales/en/project.json
    - frontend/src/i18n/locales/ru/project.json
    - frontend/package.json
    - frontend/package-lock.json

key-decisions:
  - "ProjectUpdate's model_validator(mode='before') raises before field validation runs, so both the task_type-refusal message and the explicit-null-name rejection surface as the model-level message with no field prefix (matches errors.py's 'Value error, ' stripping and the exact D-09 wording the plan requires)."
  - "PATCH's conflict handler captures `attempted_normalized_name` in a local variable right after `project.set_name(...)`, not by re-reading `project.normalized_name` after rollback - a persistent object's rollback reloads pre-transaction DB state, which would silently look up the WRONG (pre-rename) name in the 409 re-query."
  - "useDeleteProject treats DELETE 404 as success (idempotent semantics) rather than making DeleteProjectModal special-case it - this keeps exactly one success path (navigate + invalidate + notify) instead of duplicating that logic for the 'already deleted elsewhere' case."
  - "delete.confirm ('Delete permanently' / 'Удалить навсегда') is deliberately worded differently from delete.button ('Delete project') even though both trigger the same underlying action - identical text on the danger-zone button and the modal's confirm button is ambiguous for both a screen reader and `getByRole('button', {name})`."
  - "Fixed a real bug in ProjectLayout while adding Settings (Rule 1): every section NavLink hardcoded `to={project root}` and `active` to `true` unconditionally - correct by accident with exactly one section, but Settings would have linked to Overview's URL and always rendered as 'active' without this fix."

requirements-completed: [PROJ-02]

coverage:
  - id: D1
    description: "Renaming a project to a case variant of its own name succeeds (200, new casing stored); renaming to a case variant of another project's name returns 409 naming the already-stored project, and the target project is left unchanged"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_rename_to_own_case_variant_succeeds"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_rename_to_case_variant_of_other_project_conflicts"
        status: pass
    human_judgment: false
  - id: D2
    description: "PATCH {} returns 200 with the project unchanged and updated_at not bumped"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_empty_body_leaves_project_unchanged"
        status: pass
    human_judgment: false
  - id: D3
    description: "PATCH with task_type present returns 422 with the exact D-09 sentence and leaves the stored task type unchanged; empty/null name is rejected with 422"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_task_type_rejected"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_empty_name_rejected"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_null_name_rejected"
        status: pass
    human_judgment: false
  - id: D4
    description: "Renaming bumps updated_at and moves the project first in the list; PATCH description null (and blank-string) clears it to null"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_rename_bumps_updated_at_and_moves_project_first"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_null_description_clears_it"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_blank_description_clears_it"
        status: pass
    human_judgment: false
  - id: D5
    description: "DELETE returns 204 with an empty body, the project disappears from GET and the list; repeating DELETE and PATCHing/GETting an unknown id return 404 'Project not found.'"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_delete_returns_204_removes_project_and_repeat_delete_404s"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_delete_unknown_id_returns_404"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_patch_unknown_id_returns_404"
        status: pass
    human_judgment: false
  - id: D6
    description: "Two concurrent renames of different projects to the same name never both succeed: the unique index on normalized_name lets one commit and the other raises IntegrityError (backstop)"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_concurrent_renames_to_same_name_one_wins_one_409s"
        status: pass
    human_judgment: false
  - id: D7
    description: "The project sidebar lists Overview and Settings; Settings lets the user rename and edit the description (prefilled, Save disabled until changed, only changed fields sent), shows the API's error text verbatim on 409/422, and has no control that can change the task type"
    requirement: "PROJ-02"
    verification:
      - kind: component
        ref: "frontend/src/features/project/ProjectSettingsPage.test.tsx (5 tests)"
        status: pass
      - kind: component
        ref: "frontend/src/features/project/ProjectOverviewPage.test.tsx#shows the back link, Overview, and Settings - but no unbuilt-section links"
        status: pass
    human_judgment: false
  - id: D8
    description: "The delete button in the Settings danger zone stays disabled until the typed text exactly equals the project name (case-sensitive, Enter included); confirming issues exactly one DELETE, navigates to /projects, and shows a translated confirmation - a 404 (already deleted elsewhere) does the same, a 500 keeps the modal open with the API's detail text"
    requirement: "PROJ-02"
    verification:
      - kind: component
        ref: "frontend/src/features/project/DeleteProjectModal.test.tsx (5 tests)"
        status: pass
    human_judgment: false
  - id: D9
    description: "In the running compose stack, a full rename-then-delete pass (including attempting a case-variant conflict) works end-to-end in the browser in both languages, and the project stays gone after docker compose down/up"
    verification: []
    human_judgment: true
    rationale: "Requires the actual compose stack, real browser interaction, and a container restart - deferred to the phase's end-of-phase human-check batch (Plan 10) per this plan's Task 3 <human-check> verify block and workflow.human_verify_mode: end-of-phase."

# Metrics
duration: 23min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 9: Manage a Project (Rename & Delete) Summary

**PATCH/DELETE /api/projects/{project_id} (task type permanently locked, D-09) plus a Settings page for rename/description editing and a GitHub-style typed-name delete confirmation with a post-delete Mantine notification, completing PROJ-02.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-28T14:02:32+03:00 (previous plan's completion commit)
- **Completed:** 2026-09-28T14:25:23+03:00
- **Tasks:** 3
- **Files modified:** 16 (4 created, 12 modified)

## Accomplishments

- `ProjectUpdate` schema (`extra="forbid"`) refuses `task_type` outright with the exact D-09 sentence and rejects an explicit `null` name, while reusing Plan 03's `ProjectName`/`ProjectDescription` validators for everything else.
- `PATCH /api/projects/{project_id}` applies only the fields the client actually sent (`model_fields_set`), re-queries the already-stored display name on a 409 conflict (mirroring create/Plan 03), and correctly captures the *attempted* new name before a failed commit's rollback reverts the in-memory object to its pre-update state.
- `DELETE /api/projects/{project_id}` hard-deletes and returns 204; repeating it, or PATCHing/GETting the same id afterward, returns 404 (D-10).
- 14 new backend edge-case tests: case-variant rename (own vs. other project), empty-body no-op, task-type refusal, empty/null name rejection, null/blank description clearing, `updated_at` bump + list reorder, 404s, repeat delete, and a concurrent-rename backstop using two synchronous SQLAlchemy sessions.
- `useUpdateProject(id)` / `useDeleteProject(id)` React Query mutations; the delete mutation treats a 404 as an idempotent success so "someone else already deleted it" and a normal delete share one success path.
- New `/projects/:projectId/settings` route -> `ProjectSettingsPage`: prefilled name/description form (Save disabled until a value changes, only changed fields sent), the task type shown as read-only text with a locked hint, and a verbatim 409/422 error display.
- `DeleteProjectModal`: exact, case-sensitive typed-name confirmation (D-10) - the confirm button is disabled for any partial or case-variant match and Enter with a non-matching name sends no request; on success it navigates to `/projects`, invalidates the list, and shows a translated Mantine notification (`@mantine/notifications`, newly installed and approved in RESEARCH's package audit).
- Fixed a real, pre-existing bug in `ProjectLayout` while adding the Settings nav entry (Rule 1): every section link hardcoded its target to the project root and was always marked `active`, which only worked by coincidence with a single section.
- 10 new frontend tests (5 in `ProjectSettingsPage.test.tsx`, 5 in `DeleteProjectModal.test.tsx`) plus one existing `ProjectOverviewPage.test.tsx` assertion updated to reflect that Settings is now a real, built section.

## Task Commits

Each task was committed atomically:

1. **Task 1: PATCH (rename/description, task type refused) and DELETE endpoints with edge tests** - `edc021e` (feat)
2. **Task 2: Settings section with rename and description form** - `0df12e4` (feat)
3. **Task 3: Danger-zone delete with typed-name confirmation, redirect and confirmation notice** - `adf16f3` (feat)

**Plan metadata:** commit to follow this SUMMARY (docs(01-09): complete plan)

_Note: all three tasks carried `tdd="true"` (tests-first within the task), but this plan is `type: execute`, not `type: tdd` - each task lands as a single atomic commit containing its tests and implementation together, matching the precedent set in Plans 01/03/07/08._

## Files Created/Modified

- `backend/src/yolo_trainer_api/schemas.py` - `ProjectUpdate` schema (task_type refusal, null-name rejection)
- `backend/src/yolo_trainer_api/routers/projects.py` - `PATCH`/`DELETE /{project_id}`
- `backend/tests/test_projects_api.py` - 14 new edge-case tests
- `frontend/src/api/projects.ts` - `useUpdateProject`, `useDeleteProject`
- `frontend/src/app/routes.tsx` - `/projects/:projectId/settings` route
- `frontend/src/app/App.tsx` - `<Notifications />` provider
- `frontend/src/features/project/ProjectLayout.tsx` - Settings nav entry + `to`/`active` bug fix
- `frontend/src/features/project/ProjectSettingsPage.tsx` - rename/description form + Danger zone
- `frontend/src/features/project/ProjectSettingsPage.test.tsx` - 5 tests
- `frontend/src/features/project/DeleteProjectModal.tsx` - typed-name delete confirmation
- `frontend/src/features/project/DeleteProjectModal.test.tsx` - 5 tests
- `frontend/src/features/project/ProjectOverviewPage.test.tsx` - nav-link assertion updated for the new Settings link
- `frontend/src/i18n/locales/{en,ru}/project.json` - `nav.settings`, `settings.*`, `delete.*` keys
- `frontend/package.json` / `package-lock.json` - `@mantine/notifications` dependency

## Decisions Made

See frontmatter `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ProjectLayout's section NavLinks hardcoded the project root and `active=true`**
- **Found during:** Task 2 (adding the Settings entry to the `SECTIONS` array)
- **Issue:** With a single "overview" section, `ProjectLayout` rendered every `NavLink` with `to={`/projects/${parsedId}`}` and `active` unconditionally `true`. That was correct by coincidence (there was only one link, and it pointed at the only route that existed). Adding Settings without fixing this would have made the new link navigate to the Overview page instead of `/settings`, and both links would always show as "active".
- **Fix:** Each `SECTIONS` entry's own `to` is now used to build its href (`.` -> project root, otherwise a sub-path), and `active` is derived from whether the current path ends in `/settings`.
- **Files modified:** `frontend/src/features/project/ProjectLayout.tsx`
- **Verification:** `ProjectOverviewPage.test.tsx` and the new `ProjectSettingsPage.test.tsx`/`DeleteProjectModal.test.tsx` all navigate through the real route tree and pass; full frontend suite green (50 passed).
- **Committed in:** `0df12e4` (Task 2 commit)

**2. [Rule 1 - Bug] Plan 08's `ProjectOverviewPage.test.tsx` asserted no Settings link existed**
- **Found during:** Task 2 (running the full frontend suite after adding the Settings section)
- **Issue:** A Plan 08 test explicitly asserted that no nav link matching `/settings|classes|training|models/i` was rendered, encoding a snapshot of D-11's "only build what exists" state at Plan 08 time. Adding the real Settings section in this plan makes that assertion false by design.
- **Fix:** Updated the test to assert the back link, Overview, and the now-real Settings link are all present, while still asserting the genuinely unbuilt sections (Classes/Training/Models) are absent.
- **Files modified:** `frontend/src/features/project/ProjectOverviewPage.test.tsx`
- **Verification:** Full frontend suite green (50 passed) both before and after this fix, confirming no other regression.
- **Committed in:** `0df12e4` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs, both directly caused by this plan's own Settings-section addition)
**Impact on plan:** Both fixes were necessary for the new Settings nav entry to actually function and for the pre-existing test suite to correctly reflect the new, intentional state. No scope creep.

## Issues Encountered

- A test-writing subtlety (not a product bug): `useUpdateProject`/`useDeleteProject` invalidate both `projectKeys.all` and `projectKeys.detail(id)` on success. Because `projectKeys.all` (`["projects"]`) is a prefix of `projectKeys.detail(id)` (`["projects", id]`), React Query's default key matching means both `invalidateQueries` calls can independently trigger a refetch of the same active detail query, producing more GET requests than a naive count would predict. Tests that assert on `fetch` call counts/bodies were written mock-implementation-based (a fresh `Response` per call) rather than assuming an exact call count, so this is accounted for rather than worked around.
- Discovered while writing `DeleteProjectModal.test.tsx`: `delete.button` (danger-zone button) and `delete.confirm` (modal's confirm button) were initially both worded "Delete project"/"Удалить проект", which made `getByRole('button', { name: ... })` ambiguous once the modal was open (two buttons with identical accessible names). Reworded `delete.confirm` to "Delete permanently"/"Удалить навсегда" - a real accessibility issue this plan's own new UI would otherwise have shipped, not just a test artifact.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PROJ-02 (list, open, rename, delete) is now fully delivered: 79 backend tests and 50 frontend tests passing, both builds green.
- The end-of-phase UAT batch (Plan 10) should exercise: renaming a project to a case-variant of another project's name (expect 409, verbatim API text shown), then deleting a project by typing its exact name, confirming it is gone from the grid, and confirming it stays gone after `docker compose down`/`up` (D9 above).
- No new blockers. Pre-existing STATE.md blockers (DEPL-01 on Linux/macOS, GPU-path acceptance, job-crossing-containers design, click-to-segment research) remain open and are unaffected by this plan.

## Self-Check: PASSED

All key files confirmed present on disk. All three task commits (`edc021e`, `0df12e4`, `adf16f3`) confirmed in `git log --oneline --all`. Re-run clean at SUMMARY time: `uv run pytest backend/tests -x -q` -> 79 passed; `uv run ruff check backend` and `uv run ruff format --check backend` both clean; `npm --prefix frontend run test -- --run` -> 50 passed (0 failed), including `locales.test.ts` key-parity; `npm --prefix frontend run build` -> succeeds with no TypeScript errors. All plan-level acceptance-criteria checks re-verified: `grep -c "def test_.*\(patch\|rename\|delete\|task_type\)" backend/tests/test_projects_api.py` = 14; `grep -c "The task type cannot be changed after a project is created." backend/src/yolo_trainer_api/schemas.py` = 1; `grep -c "status_code=204" backend/src/yolo_trainer_api/routers/projects.py` = 1; `grep -c "useUpdateProject" frontend/src/api/projects.ts` = 1; `grep -c "@mantine/notifications" frontend/package.json` = 1; `grep -c "Notifications" frontend/src/app/App.tsx` = 2; `grep -c "project.name" frontend/src/features/project/DeleteProjectModal.tsx` = 4.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
