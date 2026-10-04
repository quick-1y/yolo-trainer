---
phase: 03-box-annotation-editor
plan: 09
subsystem: ui
tags: [react, mantine, react-query, vitest, tdd, i18n]

requires:
  - phase: 03-box-annotation-editor
    provides: "03-01 list items with box_count/status/flags; 03-04 grid URL params; 03-08 status fields, imageKeys.summary, syncAfterSave save path"
provides:
  - "ImageItem carries ImageAnnotationState; DisplayStatus and displayStatus (reviewed > background > annotated > unannotated)"
  - "Grid tile status chip (ThemeIcon, glyph + color + label) and bottom-left box count pill; tile accessible name '{filename}, {status}'"
  - "patchImageInListCache and syncAfterSave patching every cached list of the project, refreshing the status summary, marking classes stale"
  - "useImagesInfinite staleTime of 5 minutes (LIST_STALE_TIME_MS)"
  - "Shared test fixture makeImageItem"
affects: [03-11 grid summary counts, 03-12, Phase 4 export]

actuals:
  tokens: 9884
  tasks: 2
  commits: 4
plan_head_before: a7838239fda62347ecf99f50c4000e0d74a9ff7e

tech-stack:
  added: []
  patterns:
    - "Cache patch after mutation: setQueriesData with a helper that returns the same reference when nothing matches"
    - "Do not invalidate a list you just patched: an invalidated query is stale whatever its staleTime and refetches every loaded page on remount"

key-files:
  created:
    - frontend/src/test/fixtures.ts
    - frontend/src/features/images/ImageTile.test.tsx
    - frontend/src/api/annotations.test.ts
  modified:
    - frontend/src/api/images.ts
    - frontend/src/api/images.test.ts
    - frontend/src/api/annotations.ts
    - frontend/src/features/images/ImageTile.tsx
    - frontend/src/features/images/ImageTile.module.css
    - frontend/src/features/images/ImageGrid.test.tsx
    - frontend/src/features/images/ImagesPage.test.tsx
    - frontend/src/features/images/ImagesSearch.test.tsx
    - frontend/src/features/images/ImagesSelection.test.tsx
    - frontend/src/features/images/ImagesDeletePaging.test.tsx
    - frontend/src/features/images/ImagesUrlState.test.tsx
    - frontend/src/features/images/DeleteImagesModal.test.tsx
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json

key-decisions:
  - "syncAfterSave patches the cached lists but does not invalidate them: invalidation makes a list stale regardless of staleTime, so Back from the editor refetched every loaded page (measured: 2 requests instead of 1)"
  - "displayStatus reads the flags, not the server status, because the server folds background into annotated; the chip and the editor badge share the same precedence"

patterns-established:
  - "Tile status shown as glyph plus word (○ ● ✓ ∅), color is secondary"
  - "Tests that locate a tile use /^img-N\\.jpg,/ because its accessible name carries the status"

requirements-completed: [ANNO-09]

coverage:
  - id: D1
    description: "Grid tiles show a status chip (glyph, color, title and aria-label) in the top-right slot, a box count pill bottom-left hidden at 0, and an accessible name '{filename}, {status}' in en and ru"
    requirement: ANNO-09
    verification:
      - kind: unit
        ref: "frontend/src/features/images/ImageTile.test.tsx (10 tests)"
        status: pass
      - kind: unit
        ref: "frontend/src/api/images.test.ts#displayStatus"
        status: pass
    human_judgment: false
  - id: D2
    description: "A save patches the item in every cached list of the project (not other projects), updates detail and annotation set, invalidates the status summary and marks classes stale without refetching"
    requirement: ANNO-09
    verification:
      - kind: unit
        ref: "frontend/src/api/annotations.test.ts#syncAfterSave"
        status: pass
      - kind: unit
        ref: "frontend/src/api/images.test.ts#patchImageInListCache"
        status: pass
    human_judgment: false
  - id: D3
    description: "Back from the editor shows the patched tile and does not re-request the loaded pages (list staleTime 300000 ms, lists not invalidated by a save)"
    requirement: ANNO-09
    verification:
      - kind: unit
        ref: "frontend/src/api/annotations.test.ts#when the grid comes back"
        status: pass
      - kind: unit
        ref: "frontend/src/api/images.test.ts#useImagesInfinite"
        status: pass
    human_judgment: false
  - id: D4
    description: "Visual fit of the chip and the box count pill on a real thumbnail (pill 4px inside the bottom-left corner, clear of the caption strip, readable on light images)"
    requirement: ANNO-09
    verification: []
    human_judgment: true
    rationale: "jsdom does not lay out CSS; position, overlap with the caption and legibility on bright thumbnails need a look in a browser."

duration: 8 min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 9: Grid tile status and box count Summary

**Every grid tile shows its status chip (○ ● ✓ ∅ with color and label) and its box count pill, and an editor save patches the cached lists in place so Back shows the new state without refetching the loaded pages**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-04T11:55:51Z
- **Completed:** 2026-10-04T12:04:23Z
- **Tasks:** 2 (both TDD, RED and GREEN commits each)
- **Files modified:** 17 (3 created, 14 modified)

## Accomplishments

- `ImageItem` now includes the annotation state the server already sends; `displayStatus` gives reviewed > background > annotated > unannotated, the same order as the editor badge.
- `ImageTile` fills the reserved top-right slot with a 24x24 light `ThemeIcon` (gray ○, cyan ●, green ✓, grape ∅; `title` and `aria-label` = status label), adds the bottom-left 20px count pill (hidden at 0, `aria-label` "Objects: N") and names the tile "{filename}, {status}" in en and ru.
- `syncAfterSave` writes the saved state into every cached list of the project through `patchImageInListCache` (same reference when the image is not loaded), refreshes the status summary and marks the class list stale without refetching.
- `useImagesInfinite` has a 5 minute `staleTime`, so a loaded list is not refetched page by page when the user comes back.
- Shared `makeImageItem` fixture replaces the per-file item literals in seven grid test files.

## Task Commits

1. **Task 1: Grid tiles show status and box count** - `c5ead6b` (test, RED), `5e46ec0` (feat, GREEN)
2. **Task 2: Saves in the editor update the grid in place** - `3214877` (test, RED), `cdc3ad5` (feat, GREEN)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Files Created/Modified

- `frontend/src/api/images.ts` - widened `ImageItem`, `DisplayStatus`, `displayStatus`, `patchImageInListCache`, `LIST_STALE_TIME_MS`
- `frontend/src/api/annotations.ts` - `syncAfterSave` patches lists, refreshes summary, marks classes stale
- `frontend/src/features/images/ImageTile.tsx`, `ImageTile.module.css` - chip, pill, tile aria name
- `frontend/src/test/fixtures.ts` - `makeImageItem`
- `frontend/src/i18n/locales/{en,ru}/images.json` - `tile.aria`, `tile.boxCountAria`
- tests: `ImageTile.test.tsx`, `annotations.test.ts` (new), `images.test.ts` and six grid test files (fixtures and tile lookups)

## Decisions Made

- Saves do not invalidate the cached image lists (see deviation 1). A save never changes which images a list holds or their order, since only filename search and sort do, so the in-place patch is the whole update and the list's own `staleTime` bounds its age.
- `displayStatus` reads the flags and box count, not the server `status`, because the server folds background into annotated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's list invalidation defeats its own staleTime**
- **Found during:** Task 2 (checking the "Back does not re-request all loaded pages" truth)
- **Issue:** The plan asked `syncAfterSave` to call `invalidateQueries({ queryKey: imageKeys.project(projectId), refetchType: "none" })`. An invalidated query counts as stale whatever its `staleTime`, so remounting the grid after a save refetched every loaded page. Measured with a scratch test: 2 fetches instead of 1.
- **Fix:** Dropped that one invalidation and kept the patch, the summary invalidation and the class-list stale mark. Added a test (`when the grid comes back`) that remounts the grid after a save, sees the patched item and asserts a single request. The T3-09-01 intent (state shown is server-confirmed) still holds: only `SaveResult` fields are written, and the 5 minute `staleTime` bounds how old a list can get.
- **Files modified:** `frontend/src/api/annotations.ts`, `frontend/src/api/annotations.test.ts`
- **Verification:** `npx vitest run` 43 files, 427 tests passed
- **Committed in:** `cdc3ad5`

**2. [Rule 3 - Blocking] Search tests assumed a re-request of the unfiltered list**
- **Found during:** Task 2 (full Vitest run)
- **Issue:** Three `ImagesSearch.test.tsx` tests asserted that clearing the search issues a new unfiltered request. With the planned `staleTime` the unfiltered list loaded seconds earlier is served from the cache, which is the intended behavior.
- **Fix:** The assertion now states that the unfiltered list comes from the cache (exactly one unfiltered request); the visible outcome checks are unchanged. One test title reworded.
- **Files modified:** `frontend/src/features/images/ImagesSearch.test.tsx`
- **Verification:** all three pass, full suite green
- **Committed in:** `cdc3ad5`

---

**Total deviations:** 2 auto-fixed (1 bug in the plan's design, 1 blocking test expectation)
**Impact on plan:** No scope creep. Deviation 1 makes the plan's own "no full refetch on Back" truth hold; the literal "marks the lists stale" wording of truth 5 is not implemented, by design.

## Issues Encountered

None beyond the deviations. The known `ClassRow` flake did not appear in the final full run.

## Known Stubs

None.

## Threat Flags

None. T3-09-01 and T3-09-02 are mitigated as planned (server-confirmed fields only; filename and status go through React attributes and i18next interpolation).

## Next Phase Readiness

- Plans 03-11 and later can read per-item status from list items; `displayStatus` is the single status rule for tiles.
- A visual check of the chip and the count pill on real thumbnails (position, caption clearance, legibility on light images) is left to end-of-phase human verification; jsdom does not lay out CSS.

## Self-Check: PASSED

Created files exist (`fixtures.ts`, `ImageTile.test.tsx`, `annotations.test.ts`); all four task commits present in `git log`; `npx tsc --noEmit` clean, `npm run build` ok, `npx vitest run` 43 files / 427 tests passed; acceptance greps pass (`ThemeIcon` 3, `displayStatus` 2 in ImageTile.tsx, `makeImageItem` 1 in fixtures.ts and 2 in ImagesSelection.test.tsx, `boxCountAria` 1 in ru, `patchImageInListCache` 1 definition and 2 uses in annotations.ts, `imageKeys.summary` 1 in annotations.ts, `staleTime` 1 in images.ts).

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
