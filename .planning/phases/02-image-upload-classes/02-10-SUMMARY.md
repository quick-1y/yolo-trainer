---
phase: 02-image-upload-classes
plan: 10
subsystem: images
tags: [fastapi, fileresponse, react, mantine-modal, useHotkeys, tdd]

requires:
  - phase: 02-image-upload-classes
    provides: "images upload/list/thumbnail API, ImagesPage/ImageGrid/ImageTile, search and sort (02-01..02-09)"
provides:
  - "GET /api/projects/{id}/images/{image_id}/file (original bytes, stored media type, immutable cache)"
  - "ImageViewerModal with arrow and keyboard navigation across page boundaries"
  - "ImageTile button semantics with onOpen(index)"
affects: [02-11, 02-12, phase-03-annotation-editor]

plan_head_before: ac5b02073551bb1489ce1879c1d80e838a4c169e
actuals:
  tokens: 21000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Viewer mounted only while open: original is requested for the open image only (D-06/D-10)"
    - "Media type of served originals comes from the CHECK-constrained stored ext, never from client data"
    - "pending-advance flag in ImagesPage: viewer asks for the next page, page advances index once items are flattened"

key-files:
  created:
    - backend/tests/test_images_files_api.py
    - frontend/src/features/images/ImageViewerModal.tsx
    - frontend/src/features/images/ImageViewerModal.module.css
    - frontend/src/features/images/ImageViewerModal.test.tsx
  modified:
    - backend/src/yolo_trainer_api/routers/images.py
    - frontend/src/api/images.ts
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/features/images/ImageGrid.tsx
    - frontend/src/features/images/ImageGrid.test.tsx
    - frontend/src/features/images/ImageTile.tsx
    - frontend/src/features/images/ImageTile.module.css
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json

key-decisions:
  - "Thumbnail and original routes share one _IMMUTABLE_CACHE_CONTROL constant (renamed from _THUMBNAIL_CACHE_CONTROL)"
  - "Tile Enter handler only fires when the tile itself is the event target, so a future checkbox/inner control keeps its own keys"
  - "Viewer is unmounted (not hidden) when closed; closing also clears the pending page-advance flag"

requirements-completed: [ANNO-01]

coverage:
  - id: D1
    description: "GET /file returns the stored original byte-for-byte with media type from stored ext, immutable cache; 404 across projects / unknown id / missing file"
    requirement: ANNO-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_files_api.py"
        status: pass
    human_judgment: false
  - id: D2
    description: "Click or Enter on a tile opens the viewer with filename (title), original src, dimensions, size in MB and N of M; works after a thumbnail error"
    requirement: ANNO-01
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/images/ImageViewerModal.test.tsx#ImageViewerModal opening"
        status: pass
    human_judgment: false
  - id: D3
    description: "Arrow keys and on-screen arrows navigate in grid order, Esc closes, end of loaded list loads the next page and continues, stage loader and load-failure message"
    requirement: ANNO-01
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/images/ImageViewerModal.test.tsx#ImageViewerModal navigation / stage states"
        status: pass
    human_judgment: false
  - id: D4
    description: "Visual fit of the stage (object-fit contain on #141414, modal min(1200px, 92vw), no horizontal scroll, truncating header)"
    verification: []
    human_judgment: true
    rationale: "Layout and visual fit are CSS-only and cannot be asserted in jsdom"

duration: 25min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 10: Full-size image viewer Summary

**Original-file route plus a Mantine viewer modal: click or Enter on a tile opens the image full size, left/right keys and arrows walk the current grid order and seamlessly pull the next page.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-10-03
- **Tasks:** 2 (TDD, 4 task commits)
- **Files modified:** 13 (4 created, 9 modified)

## Accomplishments
- `GET /api/projects/{project_id}/images/{image_id}/file`: row lookup by id AND project_id, media type from `EXT_MEDIA[ext]` (a JPEG uploaded as `sneaky.png` is served as `image/jpeg`), `private, max-age=31536000, immutable`; 404 "Image not found." for other project, unknown id and missing file.
- `ImageTile` is a focusable `role="button"` (`aria-label` = filename), click and Enter call `onOpen(index)`; thumbnail failure ("No preview") keeps the tile clickable.
- `ImageViewerModal`: header filename with ellipsis and `title`, `#141414` stage with `object-fit: contain`, footer with dimensions, size via `Intl.NumberFormat` (MB) and "N of M"; Esc and a labelled close button close it.
- Navigation: `useHotkeys` for ArrowLeft/ArrowRight, 40x40 overlay arrows, Prev disabled at the first image, Next disabled at the end without a next page; at the end of the loaded list with more pages Next shows a Loader, calls `fetchNextPage` and ImagesPage advances to the next index when the page arrives.
- Per-image load state: centered Loader until `load`, "Could not load this image." on `error`, arrows keep working and the state resets on image change.

## Task Commits

TDD sequence (RED -> GREEN for each task):

1. **Task 1 RED** - `75d7702` (test): failing backend /file tests and viewer-opening tests
2. **Task 1 GREEN** - `2647580` (feat): /file route, tile button semantics, ImageViewerModal, i18n
3. **Task 2 RED** - `21e9b97` (test): failing navigation and stage-state tests
4. **Task 2 GREEN** - `f6f72cb` (feat): arrows, hotkeys, cross-page advance, loader/failure states

**Plan metadata:** docs commit follows this SUMMARY.

## Files Created/Modified
- `backend/src/yolo_trainer_api/routers/images.py` - `get_original` route, shared immutable cache constant
- `backend/tests/test_images_files_api.py` - 5 contract tests for the route
- `frontend/src/api/images.ts` - `fileUrl`
- `frontend/src/features/images/ImageViewerModal.tsx` / `.module.css` / `.test.tsx` - viewer, styles, 10 tests
- `frontend/src/features/images/ImagesPage.tsx` - `viewerIndex`, pending-advance, viewer mount
- `frontend/src/features/images/ImageGrid.tsx`, `ImageTile.tsx`, `ImageTile.module.css` - `onOpen`, button semantics, focus ring
- `frontend/src/i18n/locales/{en,ru}/images.json` - `viewer.*` strings

## Decisions Made
- Shared `_IMMUTABLE_CACHE_CONTROL` for thumbnail and original routes.
- Tile keydown handler reacts to Enter only when the tile itself is the target.
- Viewer is mounted only while open, which guarantees no original is requested for the grid.

## Deviations from Plan

None - plan executed exactly as written. (Task 1 `<files>` lists ImageViewerModal.module.css implicitly as part of the component; the CSS module was added as a new file. `ImageGrid.test.tsx` gained the now-required `onOpen` prop.)

**Total deviations:** 0

## Issues Encountered
- A Python-based edit with `\n` anchors silently missed on the CRLF `ImagesPage.tsx` (first run left `onOpen` undefined, caught immediately by the RED->GREEN tests); redone with line-ending normalization.
- The footer size uses MB with one fraction digit per UI-SPEC, so files under 50 KB read "0 MB". Left as specified; worth revisiting in a UI pass.

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model (T2-10-01 cross-project 404 tested; T2-10-02 media type fixed from stored ext, tested with a mislabelled upload; T2-10-03 filename rendered as React text plus `title`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Ready for 02-11. The tile click target (`onOpen`) is the seam Phase 3 swaps for the annotation editor.

## Self-Check: PASSED
- Files exist: test_images_files_api.py, ImageViewerModal.tsx/.module.css/.test.tsx
- Commits 75d7702, 2647580, 21e9b97, f6f72cb present
- `uv run pytest backend/tests` 297 passed; ruff clean; frontend build green; frontend suite 151/151 passed

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
