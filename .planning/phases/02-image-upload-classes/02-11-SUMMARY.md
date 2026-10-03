---
phase: 02-image-upload-classes
plan: 11
subsystem: images
tags: [fastapi, sqlalchemy, react, mantine, react-query, selection, tdd]

requires:
  - phase: 02-image-upload-classes
    provides: "images API and storage helpers (remove_image_files), startup cleanup, ImagesPage/ImageGrid/ImageTile with onOpen(index), viewer (02-01..02-10)"
provides:
  - "POST /api/projects/{id}/images/delete: rows deleted and committed first, files removed after, idempotent, project-scoped"
  - "useDeleteImages: prunes cached infinite pages and totals in place, refreshes project counts"
  - "Tile selection checkboxes, Shift-click ranges, SelectionBar, DeleteImagesModal"
affects: [02-12, phase-03-annotation-editor]

plan_head_before: 94e804da7fb87843190d9c3f2751d5ed895858e1
actuals:
  tokens: 60000
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Rows-first delete: DELETE + COMMIT, then best-effort file removal in a thread; failures are logged and left to the startup cleanup"
    - "Cache pruning with setQueriesData over the project's infinite image lists instead of refetching every page"
    - "Stable memoized tile props: selection toggling reads items/anchor through refs, callbacks keep a constant identity"

key-files:
  created:
    - backend/tests/test_images_delete_api.py
    - frontend/src/features/images/SelectionBar.tsx
    - frontend/src/features/images/DeleteImagesModal.tsx
    - frontend/src/features/images/DeleteImagesModal.test.tsx
    - frontend/src/features/images/ImagesSelection.test.tsx
  modified:
    - backend/src/yolo_trainer_api/routers/images.py
    - backend/src/yolo_trainer_api/schemas.py
    - frontend/src/api/images.ts
    - frontend/src/features/images/ImageTile.tsx
    - frontend/src/features/images/ImageTile.module.css
    - frontend/src/features/images/ImageGrid.tsx
    - frontend/src/features/images/ImageGrid.test.tsx
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json
    - frontend/vite.config.ts
    - frontend/src/test-setup.ts

key-decisions:
  - "The delete route does not use require_xhr: it is a JSON POST, so the CORS preflight already protects it like the other JSON routes (as the plan states); the client sends X-Requested-With anyway"
  - "ImagesToolbar stays mounted (display none) while the selection bar is shown, so a pending debounced search still commits and then clears the selection"
  - "Shift range is additive and never moves the anchor; the anchor is the last tile toggled without Shift"
  - "Delete dialog works on a snapshot of the selected ids taken when it opens, so its text does not change to 0 while it fades out"
  - "useDeleteImages also marks all image lists of the project stale with refetchType none, so lists that are not on screen refetch when shown"

patterns-established:
  - "Selection checkbox: 32 x 32 hit area whose single click handler stops propagation (never opens the viewer) and also serves Space on the native input"
  - "Esc ownership: the page clears the selection only when no viewer and no delete dialog is open"

requirements-completed: [ANNO-01, DATA-01]

coverage:
  - id: D1
    description: "POST /images/delete removes rows then files, ignores other projects' ids, is idempotent, validates 1..1000 ids, never reuses ids, tolerates file-removal failure"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_delete_api.py (13 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Select tiles by checkbox, selection bar, confirm-then-delete dialog updating grid, count and notification in place; no request before the confirm click"
    requirement: ANNO-01
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/images/DeleteImagesModal.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shift-click ranges, Esc and search/sort clearing, tab/space/enter keyboard rules"
    requirement: ANNO-01
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/images/ImagesSelection.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Visual result of the selection UI: checkbox appears on hover/focus, 2px accent ring on selected tiles, selection bar layout"
    verification: []
    human_judgment: true
    rationale: "CSS is disabled in the jsdom tests (css: false); hover visibility and the ring are only observable in a real browser"

duration: 16 min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 11: Select and Delete Images Summary

**Hard-delete of images through `POST /images/delete` (rows committed first, files after, ids never reused) with tile checkboxes, Shift-click ranges, a selection bar and a confirm-only delete dialog that prunes the cached grid pages in place**

## Performance

- **Duration:** 16 min
- **Started:** 2026-10-03T13:49:00Z
- **Completed:** 2026-10-03T14:05:00Z
- **Tasks:** 3 (all TDD: RED, GREEN)
- **Files modified:** 17

## Accomplishments

- Backend `POST /api/projects/{id}/images/delete`: de-duplicated ids, rows selected and deleted by `project_id AND id IN ids`, commit, then `remove_image_files` per row in a thread; a failure there is logged (`logger.exception`) and the response is still 200; repeated call returns `{"deleted": 0}`; 1..1000 ids enforced (422), extra fields forbidden, unknown project 404. Id non-reuse (AUTOINCREMENT) is covered by a delete-newest-then-upload test.
- `useDeleteImages(projectId)`: `setQueriesData` removes the deleted ids from every cached page of every list and lowers each page's `total` by the number removed from that list; project lists/detail are invalidated so counts refresh.
- Tile checkbox (Mantine `Checkbox` in a 32 x 32 hit area, own tab stop, label `tile.select`), visible on hover, focus-within and on every tile while anything is selected (`data-selecting`), 2px inset accent ring on selected tiles (`data-selected`), tile body still opens the viewer.
- `SelectionBar` replaces the toolbar; `DeleteImagesModal` (title, count body, Cancel with `data-autofocus`, red confirm with loading, both disabled and Esc/outside-click blocked while pending, red Alert with the API message on error, green notification on success).
- Shift-click range from `anchorIndex` (last tile toggled without Shift) within the loaded list; Esc clears the selection only when neither the viewer nor the dialog is open; search or sort change clears it.

## Task Commits

1. **Task 1: Delete images through the API** - `c56acc7` (test, RED: all 13 failing on the missing route), `399bf8d` (feat, GREEN)
2. **Task 2: Select tiles and delete them after confirmation** - `acbc42c` (test, RED: 7 failing, no checkbox), `19c9751` (feat, GREEN)
3. **Task 3: Range selection and keyboard rules** - `862f74f` (test, RED: 5 of 9 failing), `03b9d22` (feat, GREEN)
4. **Test stability (deviation)** - `1ed9bb3` (chore)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified

- `backend/src/yolo_trainer_api/routers/images.py` - delete route (rows first, files after, logged failures)
- `backend/src/yolo_trainer_api/schemas.py` - `ImageDeleteRequest`, `ImageDeleteResult`
- `backend/tests/test_images_delete_api.py` - 9 test functions (13 cases with parametrization)
- `frontend/src/api/images.ts` - `useDeleteImages`, `pruneDeletedImages`
- `frontend/src/features/images/ImageTile.tsx`, `ImageTile.module.css`, `ImageGrid.tsx` - checkbox, selected ring, selection props
- `frontend/src/features/images/ImagesPage.tsx` - `selected`, `anchorIndex`, Esc handler, clearing, bar/dialog wiring
- `frontend/src/features/images/SelectionBar.tsx`, `DeleteImagesModal.tsx` - new components
- `frontend/src/features/images/DeleteImagesModal.test.tsx`, `ImagesSelection.test.tsx` - 7 + 9 tests
- `frontend/src/i18n/locales/{en,ru}/images.json` - `tile.select`, `selection.*`, `delete.*`

## Decisions Made

See `key-decisions` above. In particular the delete route relies on the CORS preflight for JSON POSTs rather than `require_xhr`, matching the other JSON routes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Full frontend suite became timing-unstable under parallel load**
- **Found during:** Task 3 (full-suite run)
- **Issue:** with 25 test files running in parallel, `ImageViewerModal > loads the next page...` (about 3 s alone) hit the 5 s default timeout and `ClassRow` recolor hit the 1 s `findBy` default. Both pass alone; the timings are pre-existing (see `deferred-items.md`, 02-09) and not caused by the checkbox (verified by swapping in a native input: same 3.1 s).
- **Fix:** `testTimeout: 15000` in `frontend/vite.config.ts` and `configure({ asyncUtilTimeout: 4000 })` in `frontend/src/test-setup.ts`.
- **Verification:** three consecutive full runs 167/167 green.
- **Committed in:** `1ed9bb3`

**2. [Rule 2 - Missing critical] Toolbar kept mounted (hidden) instead of replaced**
- **Found during:** Task 3 (search clears selection test design)
- **Issue:** unmounting `ImagesToolbar` while selecting would drop its pending debounced search, so the "search change clears selection" rule could never fire.
- **Fix:** the toolbar stays mounted with `display: none` while the `SelectionBar` is shown.
- **Files modified:** `frontend/src/features/images/ImagesPage.tsx`
- **Committed in:** `03b9d22`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** no scope creep; the first keeps the suite deterministic, the second makes a plan rule reachable.

## Issues Encountered

- Hover visibility of the checkbox and the selected ring are pure CSS and not asserted in jsdom (`css: false`); the tests assert the `data-selecting` / `data-selected` hooks the CSS keys on. Needs a quick manual look in a browser (recorded as D4 `human_judgment`).
- The plan's `ImagesSelection.test.tsx` "search clears selection" case types in the search box and selects a tile within the 300 ms debounce window; it is timing-based by nature but passed in every run.

## Known Stubs

None. The reserved empty 24 x 24 badge slot is the intentional Phase 3 placeholder (D-07), unchanged.

## Threat Flags

None. The new route and filesystem access are exactly those in the plan's threat model (T2-11-01..05): project-scoped row selection, 1..1000 id cap, nginx 1 MiB default body cap applies (`/images/delete` does not match the upload location), confirmation dialog with focus on Cancel, AUTOINCREMENT test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 02-12 (final plan of the phase). Images can now be uploaded, browsed, searched, viewed and deleted; the tile keeps its empty badge slot for Phase 3.
- Backend 310 tests, ruff clean; frontend 167 tests, `tsc` + build clean.

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
