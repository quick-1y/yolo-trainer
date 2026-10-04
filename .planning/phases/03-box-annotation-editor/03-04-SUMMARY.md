---
phase: 03-box-annotation-editor
plan: 04
subsystem: ui
tags: [react, react-router, useSearchParams, vitest, i18n]

requires:
  - phase: 03-box-annotation-editor
    provides: "editor route /projects/:projectId/annotate/:imageId, lib/urls.ts (readGridParams, editorPath, imagesPath), editor '← Images' button"
provides:
  - "Images page sort and filename search stored in the URL (?sort=name&q=...), written with replace"
  - "Tile click / Enter opens the annotation editor carrying the grid's sort and search"
  - "P2 full-size viewer modal removed (component, styles, test, images:viewer.* strings)"
affects: [03-05, 03-06, 03-07, 03-13, editor-navigation]

plan_head_before: c54baccdd5a382fb22392cb119641ab4d4dd3f78

actuals:
  tokens: 10400
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Grid view state (sort, q) lives in the URL via useSearchParams; writes use { replace: true } and skip no-op writes"
    - "Stable tile callback reads items and grid params through refs (ImageTile stays memoized)"

key-files:
  created:
    - frontend/src/features/images/ImagesUrlState.test.tsx
  modified:
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/features/images/ImageTile.tsx
    - frontend/src/features/images/ImagesSelection.test.tsx
    - frontend/src/features/images/DeleteImagesModal.test.tsx
    - frontend/src/api/images.ts
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json
  deleted:
    - frontend/src/features/images/ImageViewerModal.tsx
    - frontend/src/features/images/ImageViewerModal.module.css
    - frontend/src/features/images/ImageViewerModal.test.tsx

key-decisions:
  - "The page clamps q to 255 characters on read, on send and on write (trim, slice, trim), so the server limit is never exceeded even for a hand-edited URL; an oversized URL is rewritten to the capped value by the toolbar's mount echo"
  - "writeGrid skips the write when the canonical params equal the current ones, so the toolbar's mount-time echo of the committed search is not a navigation and a non-canonical URL (?sort=newest) is normalized once"
  - "Tile navigation builds { sort, q } explicitly for editorPath; the internal ref holds { sort, query }"

patterns-established:
  - "URL as the single source of truth for list view state shared with a second route (grid <-> editor)"

requirements-completed: []

coverage:
  - id: D1
    description: "Images page restores sort and search from the URL, writes changes with replace, omits defaults, falls back to newest for an unknown sort, never produces q over 255 characters"
    requirement: ANNO-02
    verification:
      - kind: unit
        ref: "frontend/src/features/images/ImagesUrlState.test.tsx (7 tests: restore, drop sort, write q next to sort, defaults omitted, unknown sort, 255 cap, REPLACE navigation type)"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/ImagesSearch.test.tsx (existing 7 tests stay green)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A tile click or Enter opens /projects/{id}/annotate/{imageId} with the grid's sort and search; the checkbox still only toggles selection"
    requirement: ANNO-02
    verification:
      - kind: unit
        ref: "frontend/src/features/images/ImagesSelection.test.tsx#clicking a tile opens the editor for that image with the grid's sort and search"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/ImagesSelection.test.tsx#Tab moves from the tile to its checkbox, Space toggles it, Enter on the tile opens the editor"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/ImagesUrlState.test.tsx#opens the editor on a tile click and carries the grid's sort and search"
        status: pass
    human_judgment: false
  - id: D3
    description: "The viewer modal and its strings are gone; selection, Shift-range, Esc-clears-selection and delete still work"
    requirement: ANNO-02
    verification:
      - kind: other
        ref: "test ! -e ImageViewerModal.{tsx,module.css,test.tsx}; grep -rc ImageViewerModal frontend/src -> 0 files; grep -c '\"viewer\"' en/ru images.json -> 0"
        status: pass
      - kind: unit
        ref: "npm --prefix frontend run test -- --run ImagesSelection ImagesUrlState ImagesPage DeleteImagesModal locales (38 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Round trip grid -> editor -> '← Images' lands on the same sorted and filtered grid in a real browser"
    requirement: ANNO-02
    verification:
      - kind: unit
        ref: "grid -> editor URL asserted here; editor -> grid via imagesPath(readGridParams(location.search)) from Plan 03-01"
        status: pass
    human_judgment: true
    rationale: "Both halves are unit-tested separately; the full browser round trip (scroll position, focus) is part of the end-of-phase browser check"

duration: 6min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 04: Images grid opens the editor, sort and search in the URL Summary

**Images page keeps sort and filename search in the URL via useSearchParams (replace writes, 255-char cap), tiles open the annotation editor carrying them, and the P2 viewer modal is removed.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-04T08:01:03Z
- **Completed:** 2026-10-04T08:07:15Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 12 (1 created, 8 modified, 3 deleted)

## Accomplishments

- `ImagesPage` derives `sort` and `q` from `?sort=name&q=...` through `readGridParams`; the toolbar's debounced search and the sort toggle write the URL with `replace`, so typing adds no history entries and a reload restores the same view. Defaults (`newest`, empty search) are omitted from the URL; an unknown `sort` falls back to newest; a search over 255 characters is capped before it is sent or written.
- Clicking a tile or pressing Enter on a focused tile navigates to `/projects/{id}/annotate/{imageId}` with the grid's current sort and search. Together with Plan 01's "← Images" button the grid <-> editor round trip preserves the view (D-01, D-03).
- `ImageViewerModal` (component, CSS module, test) and the `images:viewer.*` strings (en, ru) are deleted, along with the `viewerIndex` / `advancePending` state, the advance effect and the viewer condition of the Esc effect. Selection, Shift-range, Esc-clears-selection and delete are unchanged and their tests pass.

## Task Commits

TDD sequence, four commits:

1. **Task 1 RED: failing tests for URL-backed sort and search** - `087ab51` (test)
2. **Task 1 GREEN: sort and search in the page URL** - `a960804` (feat)
3. **Task 2 RED: failing tests for tile to editor navigation** - `0c9ab8d` (test)
4. **Task 2 GREEN: tile opens the editor, viewer removed** - `381d5ef` (feat)

**Plan metadata:** recorded in the docs commit that follows this file.

## Files Created/Modified

- `frontend/src/features/images/ImagesPage.tsx` - URL-backed sort/search (`useSearchParams`, `writeGrid`), `handleOpen` navigation, viewer code removed.
- `frontend/src/features/images/ImagesUrlState.test.tsx` - new: URL round trip, defaults, cap, REPLACE type, tile -> editor navigation.
- `frontend/src/features/images/ImagesSelection.test.tsx` - viewer tests replaced by editor-navigation tests; stub answers the editor's GETs with 404; `LocationProbe`.
- `frontend/src/features/images/ImageTile.tsx` - doc comments now say click/Enter opens the editor.
- `frontend/src/features/images/DeleteImagesModal.test.tsx` - one test title reworded (viewer -> editor); no logic change.
- `frontend/src/api/images.ts` - doc comment on `fileUrl` no longer mentions the viewer.
- `frontend/src/i18n/locales/{en,ru}/images.json` - `viewer` group removed.
- Deleted: `ImageViewerModal.tsx`, `ImageViewerModal.module.css`, `ImageViewerModal.test.tsx`.

## Decisions Made

See `key-decisions`. In short: the 255 cap is applied on read, send and write; no-op URL writes are skipped; the tile navigation builds the `{ sort, q }` object explicitly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tile navigation dropped the search term**
- **Found during:** Task 2 (GREEN run)
- **Issue:** First version passed the internal ref `{ sort, query }` straight to `editorPath`, which reads `q`, so `?q=` was lost from the editor URL (test saw `?sort=name`).
- **Fix:** Destructure the ref and pass `{ sort, q: query }`.
- **Files modified:** `frontend/src/features/images/ImagesPage.tsx`
- **Verification:** the two navigation tests now assert `?sort=name&q=...` and pass.
- **Committed in:** `381d5ef`

### Small additions outside the listed files (Rule 3 - leftover references)

- `DeleteImagesModal.test.tsx` (test title) and `api/images.ts` (doc comment) mentioned the viewer; both were reworded so nothing in `frontend/src` refers to the removed modal. No behavior change.

---

**Total deviations:** 1 auto-fixed (1 bug caught by the new tests before commit), 2 comment/title rewordings.
**Impact on plan:** none; no scope creep.

## Issues Encountered

- ESLint is not configured in the repo (`npx eslint` prints the migration notice), so only `tsc --noEmit`, the Vitest suite and the production build were used as gates.
- No intermittent frontend failure was seen: the full Vitest run (33 files, 245 tests) was green on the first run.
- Intentional deletions: the three `ImageViewerModal.*` files (post-commit deletion check listed exactly these).

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None. T3-04-01 (URL `sort`/`q` tampering) is mitigated: `readGridParams` allow-lists `sort`, `q` is trimmed and capped at 255 characters, passes only through `URLSearchParams`, and is rendered as React text. T3-04-02 (open redirect) is mitigated: navigation uses `editorPath` with an integer project id, an integer image id and the allow-listed params only.

## Next Phase Readiness

- The editor is now reachable from the grid with the grid's order in its URL; Plans that add previous/next navigation (D-01) can read the same `sort`/`q` from `location.search`.
- Browser-level round trip (scroll restoration, focus) belongs to the end-of-phase check in Plan 03-13.

## Self-Check: PASSED

- Created file exists: `frontend/src/features/images/ImagesUrlState.test.tsx`; deleted files absent (`test ! -e` x3).
- Commits `087ab51`, `a960804`, `0c9ab8d`, `381d5ef` present (`git log`).
- Acceptance criteria re-run: Vitest for the listed files exits 0 (38 tests); `useSearchParams`, `replace: true`, `readGridParams`, `editorPath` all present in `ImagesPage.tsx`; `ImageViewerModal` referenced by 0 files; `"viewer"` count 0 in both `images.json`; `npm --prefix frontend run build` built; full Vitest run 33 files / 245 tests pass; `tsc --noEmit` clean.

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
