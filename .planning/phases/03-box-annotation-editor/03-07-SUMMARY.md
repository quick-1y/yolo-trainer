---
phase: 03-box-annotation-editor
plan: 07
subsystem: ui
tags: [fastapi, sqlalchemy, keyset-pagination, react, react-query, mantine, vitest, tdd]

requires:
  - phase: 03-box-annotation-editor
    provides: "03-01 saver/registry and annotations router; 03-04 URL grid params (readGridParams, editorPath, imagesPath); 03-05 shortcut table and modal gate; 03-06 panels"
provides:
  - "grid_after / grid_before / grid_order: one shared ordering used by the image list and the neighbors route"
  - "GET /api/projects/{p}/images/{i}/neighbors?sort=&q= returning {position, total, prev_id, next_id}"
  - "useEditorNavigation: single in-flight goTo() that awaits saver.flush(), plus the leave-dialog state"
  - "Top bar arrows with 'N of M', A/D/left/right shortcuts, neighbor original prefetch"
  - "LeaveDialog ('Changes could not be saved') and a module-level beforeunload guard (anyUnsaved)"
affects: [03-08 next-unannotated (reuses grid_after and goTo with control nextUnannotated), 03-12 retry/backoff of the saver, 03-13]

actuals:
  tokens: 17700
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Shared keyset helpers: list, neighbors and (later) next-unannotated build their ordering from grid_after/grid_before/grid_order"
    - "All in-editor navigation goes through one awaited goTo(); a ref guard (not only state) makes it one-at-a-time"
    - "Tab-close guard lives in the module-level registry, not in a component, so it outlives the editor route"

key-files:
  created:
    - backend/tests/test_annotations_navigation.py
    - frontend/src/features/editor/useEditorNavigation.ts
    - frontend/src/features/editor/LeaveDialog.tsx
    - frontend/src/features/editor/EditorNavigation.test.tsx
    - frontend/src/features/editor/EditorLeave.test.tsx
  modified:
    - backend/src/yolo_trainer_api/routers/images.py
    - backend/src/yolo_trainer_api/routers/annotations.py
    - backend/src/yolo_trainer_api/schemas.py
    - frontend/src/api/images.ts
    - frontend/src/features/editor/EditorTopBar.tsx
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/features/editor/store/storeRegistry.ts
    - frontend/src/features/editor/lib/shortcuts.ts
    - frontend/src/features/editor/lib/shortcuts.test.ts
    - frontend/src/test/editorApi.ts
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json

key-decisions:
  - "Neighbors are computed on the server from the image's own (filename_key, id) pivot with the same helpers the list uses, so prev/next and 'N of M' survive a hard reload and equal filenames order by id"
  - "While a navigation waits for the save, every editor shortcut is switched off (not only drawing), so nothing new can slip in between the flush and the route change"
  - "The leave dialog keeps the target in a ref and ignores goTo while it is open; closing it bumps a generation counter so a retry still running cannot navigate after Esc"

patterns-established:
  - "goTo(path, control): flush -> navigate on 'saved', otherwise open the leave dialog; NavControl names the control that shows loading"
  - "editorApi stub: putMode ok|hold|error|conflict with setPutMode/releasePuts, configurable neighbors fixture, unknown image ids answer 404"

requirements-completed: [ANNO-02, ANNO-08]

coverage:
  - id: D1
    description: "Neighbors endpoint returns position/total/prev_id/next_id equal to the grid order for both sorts, equal filenames ordered by id, search, ends and a one-image project"
    requirement: ANNO-02
    verification:
      - kind: integration
        ref: "backend/tests/test_annotations_navigation.py#test_neighbors_equal_the_grid_order_for_every_image"
        status: pass
      - kind: integration
        ref: "backend/tests/test_annotations_navigation.py#test_walking_next_id_visits_the_filtered_list_order"
        status: pass
    human_judgment: false
  - id: D2
    description: "An image outside the search has position null with the nearest filtered neighbors; a foreign image is 404, a bogus sort or 256-char q is 422"
    requirement: ANNO-02
    verification:
      - kind: integration
        ref: "backend/tests/test_annotations_navigation.py#test_image_outside_the_search_has_no_position_but_nearest_filtered_neighbors"
        status: pass
      - kind: integration
        ref: "backend/tests/test_annotations_navigation.py#test_foreign_image_is_404"
        status: pass
    human_judgment: false
  - id: D3
    description: "Top bar prev/next arrows and counter follow the URL's sort and search, disabled at the ends and for 1 of 1, hidden counter when position is null; A/D/arrows (also Russian layout) navigate, held keys do not repeat"
    requirement: ANNO-08
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/editor/EditorNavigation.test.tsx"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/lib/shortcuts.test.ts#navigation rows"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every in-editor move awaits the image's saver flush, shows loading on the clicked control, disables drawing and runs one navigation at a time"
    requirement: ANNO-08
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/editor/EditorNavigation.test.tsx#saves the drawn box before the location changes"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/EditorNavigation.test.tsx#runs one navigation at a time"
        status: pass
    human_judgment: false
  - id: D5
    description: "A failed or conflicting flush opens the leave dialog (Retry focused, Leave anyway, Esc stays) and disables editor shortcuts; closing or reloading the tab with unsaved work triggers beforeunload, also after leaving the route"
    requirement: ANNO-02
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/editor/EditorLeave.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Originals of the previous and next images are requested in the background once neighbors are known"
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/editor/EditorNavigation.test.tsx#requests the originals of the previous and next images"
        status: pass
    human_judgment: true
    rationale: "That stepping through images feels instant (cache hit, no visible load) depends on real browser caching and network timing; tests only prove the requests are issued"

duration: ~20min
completed: 2026-10-04
status: complete
plan_head_before: e101ff113b0b6cf205509c87b4144abff9e94e2a
---

# Phase 3 Plan 07: Neighbors in grid order, top bar navigation and the leave dialog Summary

**Server-computed prev/next/"N of M" in the grid's exact order (shared keyset helpers), a single awaited goTo() that saves before every move, and a "Changes could not be saved" dialog plus a registry-level beforeunload guard so work is never lost silently**

## Performance

- **Duration:** ~20 min
- **Started:** ~2026-10-04T08:37Z (approximate; start time was not captured at spawn)
- **Completed:** 2026-10-04T08:57Z
- **Tasks:** 3 (all `tdd="true"`, each with a RED and a GREEN commit)
- **Files modified:** 17 (5 created, 12 modified)

## Accomplishments

- `GET /images/{id}/neighbors` answers "where is this image in the grid" for both sorts and any search, using `grid_after`, `grid_before` and `grid_order` that `build_page_query` now uses too; walking `next_id` reproduces the list order exactly, equal filenames included.
- The top bar has `‹` / `›` and "N of M" (hidden when the image is outside the search); A / left and D / right do the same, never repeat on a held key, and keep the grid's `sort` and `q` in the URL.
- Every move (prev, next, Back) goes through `useEditorNavigation().goTo`, which awaits the image's `saver.flush()`, marks the clicked control `loading`, disables drawing and the shortcuts while it waits, and allows only one navigation at a time.
- A flush that ends in `error` or `conflict` opens `LeaveDialog`: Retry (filled, autofocus) re-flushes and navigates on success, Leave anyway navigates at once, Esc stays; all editor shortcuts are off while it is open.
- `storeRegistry` installs one `beforeunload` listener when the first entry is created; it prompts while any entry is dirty, failed or in conflict, including after the editor route was left. `resetEditors()` removes it.
- Neighbor originals are warmed with `new Image().src = fileUrl(...)` once neighbors are known.

## Task Commits

1. **Task 1: Neighbors in grid order** - `ba3e3d0` (test, RED), `38fd7c7` (feat, GREEN)
2. **Task 2: Top bar and keyboard navigation, saving first** - `256abdc` (test, RED), `e6c6d4e` (feat, GREEN)
3. **Task 3: Leave dialog and beforeunload guard** - `914a244` (test, RED), `c1a6180` (feat, GREEN)

**Plan metadata:** recorded in the docs commit that follows this file (docs: complete plan)

## TDD Gate Compliance

All three tasks followed RED then GREEN with a `test(03-07)` commit before each `feat(03-07)` commit. RED failures were on the target behaviour (404 for the missing route; missing buttons, dialog and guard), apart from the `anyUnsaved` unit tests, which failed with "anyUnsaved is not a function" because the function did not exist yet. No REFACTOR commits were needed. Two mutation checks confirmed the tests discriminate: removing the one-at-a-time guard is caught by the hook-level test, and removing `useEditorModalOpen` is caught by the shortcuts-off assertion.

## Files Created/Modified

- `backend/src/yolo_trainer_api/routers/images.py` - `grid_after`, `grid_before`, `grid_order`; `build_page_query` rewritten on them (behaviour unchanged)
- `backend/src/yolo_trainer_api/routers/annotations.py` - `get_neighbors` route
- `backend/src/yolo_trainer_api/schemas.py` - `Neighbors`
- `backend/tests/test_annotations_navigation.py` - order equality, walk, ties, search, ends, 404/422
- `frontend/src/api/images.ts` - `Neighbors`, `imageKeys.neighbors`, `getNeighbors`, `useNeighbors`
- `frontend/src/features/editor/useEditorNavigation.ts` - `goTo`, `pending`, leave-dialog state; `NavControl`
- `frontend/src/features/editor/LeaveDialog.tsx` - the dialog
- `frontend/src/features/editor/EditorTopBar.tsx`, `EditorPage.tsx` - arrows, counter, prefetch, hotkey wiring, dialog mount
- `frontend/src/features/editor/store/storeRegistry.ts` - `anyUnsaved`, `beforeunload` guard
- `frontend/src/features/editor/lib/shortcuts.ts` (+ test) - `prev` and `next` rows
- `frontend/src/test/editorApi.ts` - neighbors route, `putMode` (ok/hold/error/conflict), 404 for other images, empty grid list
- `frontend/src/i18n/locales/{en,ru}/editor.json` - `topBar.position|prevAria|nextAria`, `shortcuts.group.navigation|prev|next`, `leave.*`
- `frontend/src/features/editor/EditorNavigation.test.tsx`, `EditorLeave.test.tsx` - 20 and 17 tests

## Decisions Made

- Neighbors use the image's own sort key as the pivot, not a client-held list, so a hard reload still works (D-03); `position` is `null` when the image does not match `q`.
- While `goTo` waits for the save, all editor hotkeys are disabled (the plan only required disabling drawing). This keeps a late delete or undo from landing after the flush.
- The leave dialog's target and a generation counter live in refs, so a pending Retry cannot navigate after the user pressed Esc.
- The backend test inserts rows directly (like `test_images_list_api.py`) instead of uploading files; the ordering depends only on the rows, and it keeps the walks fast.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Editor shortcuts off while a navigation waits for the save**
- **Found during:** Task 2
- **Issue:** The plan disables only drawing while the flush is pending; a delete, undo or class change could still be made after the flush started and be left unsaved by the route change.
- **Fix:** `useEditorHotkeys` is enabled only when no modal is open and `navigation.pending === null`.
- **Files modified:** `frontend/src/features/editor/EditorPage.tsx`
- **Verification:** EditorNavigation tests (burst and loading-state cases) pass; full Vitest suite green.
- **Committed in:** `e6c6d4e`

**2. [Rule 2 - Missing Critical] Test stub tolerant of navigation targets**
- **Found during:** Task 2 and Task 3 (tests)
- **Issue:** `stubEditorApi` threw on any unknown request, so navigating to image 6 or to the grid would surface as unhandled stub errors.
- **Fix:** Other image ids answer 404, the grid list answers an empty page, PUT gained `hold`, `error` and `conflict` modes.
- **Files modified:** `frontend/src/test/editorApi.ts`
- **Committed in:** `256abdc`, `914a244`

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both are small and stay inside the plan's files; no scope creep.

## Issues Encountered

- The first version of the burst test did not discriminate: React batches three simultaneous `navigate` calls into one render, so a location probe cannot count them. Added a hook-level test that spies `saver.flush` and asserts a single call; verified by removing the guard (test fails) and restoring it.
- `<output>` has an implicit `status` role and collided with the save indicator query in the leave tests; the probe there is a `div`.
- The known intermittent Vitest failure did not appear: the full suite passed on every run (356 tests after Task 2, 373 after Task 3).

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None. The new route is covered by T3-07-01..03 (project-scoped queries, `Literal` sort, `max_length` on `q`) and the navigation/beforeunload behaviour by T3-07-04.

## Next Phase Readiness

- Plan 03-08 can reuse `grid_after` / `grid_order` for next-unannotated and `goTo(path, "nextUnannotated")` for the button; the `NavControl` union already includes it.
- Plan 03-12 (saver retry/backoff): Leave anyway keeps the saver in the registry, and the beforeunload guard already covers entries that are still failing.
- A conflict entry keeps the tab-close prompt for as long as the page lives; resolving conflicts belongs to the later conflict plan.

## Self-Check: PASSED

All created files exist, all six commits exist, `uv run pytest backend/tests` (376 passed), ruff check and format, `tsc --noEmit`, `npm run build` and the full Vitest suite (373 passed) are green.

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
