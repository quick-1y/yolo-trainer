---
phase: 02-image-upload-classes
plan: 07
subsystem: ui
tags: [react, mantine, dropzone, react-virtuoso, react-query, vitest, i18n]

requires:
  - phase: 02-image-upload-classes
    provides: "02-06 UploadContext/startUpload, UploadButtons, UploadPanel; 02-01 ImageGrid/ImageTile/useImagesInfinite"
provides:
  - "UploadDropzone: window-wide Dropzone.FullScreen feeding startUpload (files and whole folders)"
  - "Images grid states: 24-tile skeleton, EmptyState with hint and upload buttons, first-page error with retry, loading-more / next-page-error footer"
  - "ImageTile No preview fallback; exported handleEndReached guard"
  - "Automated virtualization bound: 5000 images mount fewer than 300 tiles"
affects: [02-09, 02-10, 02-11]

plan_head_before: 20f38059653ff16b334140005a157498fad4b4a7

actuals:
  tokens: 8450
  tasks: 2
  commits: 5

tech-stack:
  added: ["@mantine/dropzone 9.6.3 (react-dropzone 20.1.1, file-selector 5.0.1, attr-accept 4.0.0)"]
  patterns:
    - "Drop wiring tested by mocking @mantine/dropzone and capturing Dropzone.FullScreen props (jsdom cannot drive document drag events)"
    - "Virtuoso Footer receives paging state through the `context` prop (stable component identity, no closures)"
    - "Page tests wrap AppRoutes in VirtuosoGridMockContext so tiles render in jsdom"

key-files:
  created:
    - frontend/src/features/images/UploadDropzone.tsx
    - frontend/src/features/images/UploadDropzone.module.css
    - frontend/src/features/images/UploadDropzone.test.tsx
    - frontend/src/features/images/ImageGrid.test.tsx
    - frontend/src/features/images/ImagesPage.test.tsx
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/main.tsx
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/features/images/ImageGrid.tsx
    - frontend/src/features/images/ImageTile.tsx
    - frontend/src/features/images/ImageTile.module.css
    - frontend/src/features/images/UploadFlow.test.tsx
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json

key-decisions:
  - "Dropzone has no `accept` and useFsAccessApi=false, so a folder drop reports non-images as rejected through the existing startUpload pre-filter"
  - "Header upload buttons stay in every state; the EmptyState repeats them (plan truth: both are entry points), so tests use getAllByRole"
  - "handleEndReached also refuses to fetch after a failed page: the footer retry button is the only way on, so scrolling cannot hammer a broken endpoint"
  - "First-page error is `data === undefined`, not isError: a failed next page also flips isError but keeps loaded pages and must stay in the grid"

patterns-established:
  - "Mantine FullScreen dropzone styled through a CSS module with doubled selectors (.x.x) to beat Mantine scheme and accept/reject rules independent of stylesheet order"

requirements-completed: [DATA-01, ANNO-01]

coverage:
  - id: D1
    description: "Files and folders dropped anywhere on the Images page start the same batched upload as the buttons; non-images reported as rejected; a drop while running shows the busy notification and is ignored"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "frontend/src/features/images/UploadDropzone.test.tsx (3 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Grid states: 24 skeleton tiles, EmptyState with hint and both upload buttons, first-page error with API message and retry, loading-more footer, next-page error footer with retry, No preview tile fallback"
    requirement: ANNO-01
    verification:
      - kind: unit
        ref: "frontend/src/features/images/ImagesPage.test.tsx (6 tests), ImageGrid.test.tsx (footer + handleEndReached)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Virtualized grid mounts a bounded tile count (under 300) for 5000 images"
    requirement: ANNO-01
    verification:
      - kind: unit
        ref: "frontend/src/features/images/ImageGrid.test.tsx#mounts a bounded number of tiles for 5000 images"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dropping a folder with subfolders uploads every image in Chrome, Firefox and Safari, and shows the overlay (dashed 2px accent border, 12% tint)"
    requirement: DATA-01
    verification: []
    human_judgment: true
    rationale: "react-dropzone folder recursion and the visual overlay cannot be exercised in jsdom; planned manual end-of-phase browser check (RESEARCH A3 verified from library source only)"

duration: 9min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 07: Drop anywhere and always see a sensible grid Summary

**Window-wide drag and drop of files or whole folders via Mantine Dropzone.FullScreen feeding the shared upload queue, plus skeleton / empty / loading-more / error / No-preview grid states and a tested 300-tile DOM bound at 5000 images.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-03T13:08:10Z
- **Completed:** 2026-10-03T13:17:00Z
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files modified:** 15

## Accomplishments

- `UploadDropzone` renders `Dropzone.FullScreen` (no `accept`, `useFsAccessApi={false}`) inside `ImagesPage`; `onDrop` calls `startUpload`, so client pre-filter, busy notification, batching and the report panel are shared with the buttons.
- Overlay styling: dashed 2px accent border and a 12% accent tint over the page body; invisible while idle.
- `ImagesPage`: 24 `Skeleton` tiles (176 x 200) while pending; red `Alert` with the API message and "Try again" (`refetch`) on first-page failure; `EmptyState` with title, body, hint (`{{max}}` from `/api/config`) and `UploadButtons`.
- `ImageGrid`: Virtuoso `Footer` (48px) with "Loading more…" or "Could not load more images." plus retry; exported `handleEndReached` guard.
- `ImageTile`: `onError` swaps the `<img>` for a 176 x 176 "No preview" block; tile and caption stay.
- Tests: 3 + 7 + 6 new; whole suite 132 passed, `npm run build` green.

## Task Commits

1. **Task 1: drag and drop files or folders** - `6530ab9` (chore: dependency), `a21bf19` (test, RED), `d14fb87` (feat, GREEN)
2. **Task 2: grid states and virtualization bound** - `c8522c4` (test, RED), `011398b` (feat, GREEN)

**Plan metadata:** docs commit follows (SUMMARY, STATE, ROADMAP, REQUIREMENTS).

## TDD Gate Compliance

Both tasks have a `test(02-07)` RED commit before the `feat(02-07)` GREEN commit. RED evidence: Task 1 - all 3 tests failed with "Dropzone.FullScreen was not rendered" (feature absent); Task 2 - 12 of 14 tests failed on missing behavior (`handleEndReached is not a function`, missing texts/testids). Two Task 2 tests (5000-image bound, "no footer when loaded") passed already in RED: they characterize behavior from Plan 01 that this plan must keep, not new behavior. No REFACTOR commits were needed.

## Files Created/Modified

- `frontend/src/features/images/UploadDropzone.tsx` / `.module.css` - window-wide dropzone and overlay styling
- `frontend/src/features/images/ImagesPage.tsx` - skeleton, error, EmptyState and dropzone wiring
- `frontend/src/features/images/ImageGrid.tsx` - Footer, `handleEndReached`, `isFetchNextPageError` prop
- `frontend/src/features/images/ImageTile.tsx` / `.module.css` - No preview fallback
- `frontend/src/main.tsx` - `@mantine/dropzone/styles.css`
- `frontend/src/i18n/locales/{en,ru}/images.json` - dropOverlay, empty.*, loadingMore, error.nextPage, tile.noPreview
- `frontend/src/features/images/{UploadDropzone,ImageGrid,ImagesPage}.test.tsx` - new tests; `UploadFlow.test.tsx` adjusted

## Decisions Made

See `key-decisions` above. `@mantine/dropzone` was installed as `^9.6.3`, resolving to 9.6.3 exactly like the other Mantine packages; the repository was checked as `github.com/mantinedev/mantine` before installing (T2-07-SC), and the lockfile is committed (Docker uses `npm ci`; all four new packages require Node >= 22, the image uses `node:24-alpine`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing UploadFlow tests broke after the dropzone and EmptyState were added**
- **Found during:** Task 1 and Task 2
- **Issue:** (a) The real Dropzone renders its own hidden file input (no `accept`, `pointer-events: none`), which the test's `input[type="file"]:not([webkitdirectory])` selector matched first. (b) The EmptyState repeats the two upload buttons, so `getByRole("button", { name: "Upload images" })` found several elements.
- **Fix:** Select the picker input with `[accept]`; use `getAllByRole` for the buttons in `UploadFlow.test.tsx` and `UploadDropzone.test.tsx`.
- **Files modified:** frontend/src/features/images/UploadFlow.test.tsx, UploadDropzone.test.tsx
- **Committed in:** d14fb87, 011398b

**2. [Rule 1 - Bug] Pre-existing failing test: folder upload "rejected files" visibility**
- **Found during:** Task 1 (full-suite run)
- **Issue:** `UploadFlow > uploads a chosen folder...` failed deterministically at the plan's base commit 20f3805 (verified in a clean worktree, unrelated to this plan): `notes.txt` inside the `Collapse` is not yet visible right after the click (Mantine Collapse reveals its content through React `Activity` after a render pass).
- **Fix:** wrap the visibility assertion in `waitFor`.
- **Files modified:** frontend/src/features/images/UploadFlow.test.tsx
- **Committed in:** d14fb87

**3. [Rule 1 - Bug] First-page error branch swallowed next-page failures**
- **Found during:** Task 2 (GREEN)
- **Issue:** TanStack sets `isError` when a next page fails (loaded pages are kept), so branching on `images.isError` replaced the whole grid with the first-page Alert and the footer error never showed.
- **Fix:** branch on `images.data === undefined` for the first-page error.
- **Files modified:** frontend/src/features/images/ImagesPage.tsx
- **Committed in:** 011398b

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All necessary for a green suite and correct behavior; no scope creep.

## Issues Encountered

- `CreateProjectModal > blocks submission ... over 100 characters` timed out once (5 s) in one full-suite run while the machine was loaded; it passed on the next full run. Not related to this plan; noted for the verifier.
- `Dropzone.FullScreen` exists in the installed 9.6.3, so the documented `Dropzone` fallback was not needed.

## Known Stubs

None. (`ImageTile` still renders the empty `status-badge-slot`, which is the intentional Phase 3 reserved slot from Plan 01.)

## Threat Flags

None. Threats T2-07-01 (non-image drops pass through the same pre-filter and server decode; no `accept` shortcut), T2-07-02 (counters-only upload state, bounded tile count proven by test), T2-07-03 (text rendered through React only) and T2-07-SC (repository checked, version pinned to Mantine core, lockfile committed) are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Drop zone and grid states are in place for the selection bar / delete (02-09) and the viewer (02-10).
- Manual end-of-phase check still open (D4): drop a folder with subfolders in Chrome, Firefox and Safari, and look at the overlay.

## Self-Check: PASSED

- Created files exist: UploadDropzone.tsx, UploadDropzone.module.css, UploadDropzone.test.tsx, ImageGrid.test.tsx, ImagesPage.test.tsx.
- Commits 6530ab9, a21bf19, d14fb87, c8522c4, 011398b found; `git rev-list --count` from the ledger base = 5.
- Acceptance greps: `@mantine/dropzone` in package.json = 1, styles import = 1, `useFsAccessApi={false}` = 1, `accept=` = 0, `VirtuosoGridMockContext` = 3, `noPreview` = 1, `Skeleton` = 4, `EmptyState` = 7, `"nextPage"` = 1 in en and ru.
- `npm --prefix frontend run build` exit 0; `npm --prefix frontend run test -- --run`: 21 files, 132 tests passed.

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
