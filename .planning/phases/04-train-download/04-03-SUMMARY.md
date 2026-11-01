---
phase: 04-train-download
plan: 03
subsystem: ui
tags: [react, mantine, tanstack-query, vitest, dataset-split, fastapi]

requires:
  - phase: 04-train-download
    provides: "04-01 split route POST /api/projects/{id}/images/split, ImageRead.split, status-counts splits"
provides:
  - "Route contract tests for manual split assignment (backend/tests/test_splits_api.py)"
  - "api/splits.ts: SPLIT_BATCH_SIZE, SplitBatchError, patchSplitInListCache, useSetSplit (chunked, cache-patching)"
  - "SplitMenu shared by the selection bar and the editor top bar"
  - "Split pill on the grid tile and a per-split counts line under the status summary"
  - "Editor top bar split menu that never touches annotation state"
affects: [04-06 auto-split dialog, 04-07 new training form, 04-08 run page]

plan_head_before: 7133fedfa83ea578cfd3085009a8c922b6719bac
plan_head_after: 68238f49c32b214567948173443e5acde436c860

actuals:
  tokens: 18500
  tasks: 3
  commits: 8

tech-stack:
  added: []
  patterns:
    - "Sequential 1000-id chunks with an updated-prefix sync on partial failure (as useDeleteImages)"
    - "Split lives in the image-detail query owned by the page and is passed down; the top bar never adds a second observer of it"

key-files:
  created:
    - backend/tests/test_splits_api.py
    - frontend/src/api/splits.ts
    - frontend/src/api/splits.test.ts
    - frontend/src/features/images/SplitMenu.tsx
    - frontend/src/features/images/ImagesSplit.test.tsx
    - frontend/src/features/editor/EditorSplit.test.tsx
  modified:
    - frontend/src/api/images.ts
    - frontend/src/features/images/ImageTile.tsx
    - frontend/src/features/images/ImageTile.module.css
    - frontend/src/features/images/ImageTile.test.tsx
    - frontend/src/features/images/StatusSummary.tsx
    - frontend/src/features/images/StatusSummary.test.tsx
    - frontend/src/features/images/SelectionBar.tsx
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/features/images/AnnotateNext.test.tsx
    - frontend/src/features/editor/EditorTopBar.tsx
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/test/fixtures.ts
    - frontend/src/test/stubImagesApi.ts
    - frontend/src/test/editorApi.ts
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json

key-decisions:
  - "The editor top bar receives the image's split as a prop from EditorPage instead of calling useImage itself (a second observer restarted a failed detail query in a loop)"
  - "splitDone formats its count with Intl.NumberFormat; splitPartial passes raw done/total, as the plan's handler specifies"
  - "The 1001-id paths are covered at the hook level (api/splits.test.ts), not by rendering 1001 tiles"

patterns-established:
  - "SplitMenu({ variant: selection | editor }): glyphs are 4px-spaced aria-hidden spans, never Mantine sections"
  - "stubEditorApi tracks a split POST and answers later GET /images/5 with the new value"

requirements-completed: [DATA-05]

coverage:
  - id: D1
    description: "Split route contract: bulk/single update, null = unassigned, other project untouched, no annotation_version / is_reviewed / is_background change, 403 without X-Requested-With, 422 for empty list / >1000 ids / missing split key, 404 unknown project, split counts"
    requirement: DATA-05
    verification:
      - kind: integration
        ref: "backend/tests/test_splits_api.py (14 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Grid tile shows a neutral split pill (Train / Valid / Test, ru Валидация) at the bottom-right; unassigned shows none"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "frontend/src/features/images/ImageTile.test.tsx#ImageTile split pill"
        status: pass
    human_judgment: true
    rationale: "Non-overlap with the box-count pill and the visual placement are geometry that jsdom does not lay out"
  - id: D3
    description: "Second status-summary line 'Split — Train: N · Valid: N · Test: N · No split: N', hidden for zero images, while loading and on error"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "frontend/src/features/images/StatusSummary.test.tsx#StatusSummary split line"
        status: pass
    human_judgment: false
  - id: D4
    description: "Selection bar 'Set split' menu: one request per 1000 ids, green/red notifications, selection cleared only on success, cache patched without refetching the list, split counts refreshed, loading state"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "frontend/src/features/images/ImagesSplit.test.tsx"
        status: pass
      - kind: unit
        ref: "frontend/src/api/splits.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Editor top bar split menu (wide / 104 px narrow forms, check mark, ru fit), split route only, enabled in conflict, disabled only while a move waits for the save flush, no shortcut"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/EditorSplit.test.tsx (11 tests)"
        status: pass
    human_judgment: true
    rationale: "The 1024 px top bar fit in ru (filename shrinks first) is a layout property jsdom cannot measure; a person should look at it once"

duration: 60min
completed: 2026-10-10
status: complete
---

# Phase 4 Plan 03: Manual split assignment Summary

**Manual Train / Valid / Test assignment from a grid selection (chunked by 1000, cache patched in place) and from the editor top bar, with a split pill on every tile and per-split counts under the grid, none of it touching annotation state.**

## Performance

- **Duration:** about 60 min (start time was not captured; estimate)
- **Completed:** 2026-10-10T09:58:54Z
- **Tasks:** 3
- **Files modified:** 22 (1427 insertions, 49 deletions)

## Accomplishments

- Backend route pinned by 14 contract tests, including the cross-project, no-annotation-state-change, CSRF and bound checks (T4-03-01, T4-03-04).
- `api/splits.ts`: `useSetSplit` sends sequential chunks of 1000 ids, patches cached lists and image details in place, refetches only the split counts, and on a failed chunk syncs the updated prefix and throws `SplitBatchError(done, total, message)`.
- Tile pill, summary line, selection-bar "Set split" menu and the editor split menu, all in en and ru.

## Task Commits

1. **Task 1: split on the grid and per-split counts**
   - RED `8c28411` (test) - backend contract tests plus failing tile and summary tests
   - GREEN `8648dd1` (feat)
2. **Task 2: assign a split to many selected images**
   - RED `2ff9136` (test)
   - GREEN `5c873db` (feat)
   - `09a9882` (test) - made the Task 2 tests cheap under load (see Issues)
3. **Task 3: editor top bar split menu**
   - RED `5a13c95` (test)
   - GREEN `4c21ca2` (feat)
   - `68238f4` (refactor) - doc comment reworded so the acceptance grep for `leftSection|rightSection` returns 0

**Plan metadata:** the SUMMARY commit that follows this file (docs).

## TDD Gate Compliance

Each `tdd="true"` task has a `test(04-03)` commit before its `feat(04-03)` commit.

- **Task 1 RED:** the frontend tests failed on their target assertions (10 failures: pill label missing, `split-summary` testid missing). The "unassigned shows no pill" test passed at once, which is expected for a negative case. The backend tests in `test_splits_api.py` were green on arrival: the route shipped in Plan 04-01, so this plan pins existing behavior (characterization tests), not new behavior. No semantic gap: each test asserts the planned contract, and the route was verified to enforce it.
- **Task 2 RED:** all 8 tests failed with `Unable to find an accessible element with the role "button" and name /Set split/` (the planned control did not exist), not with setup or import errors.
- **Task 3 RED:** all 11 tests failed with `Unable to find role="button" and name "Split: ..."` for the same reason.
- The RED evidence was not run through `gsd_run check tdd-red-evidence`: the plan is `type: execute` and the Vitest output used here is not one of the supported report formats. The semantic assessment above stands in for it.

## Decisions Made

- The top bar gets `split` as a prop (EditorPage -> Workspace -> EditorTopBar) rather than calling `useImage`, see Deviation 1.
- `splitDone` formats the count (`1,001`); `splitPartial` shows raw `done`/`total` (`1000 of 1001`), matching the plan text for each.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A second `useImage` observer in the editor top bar looped a failed detail load**
- **Found during:** Task 3, full-suite run (`EditorLoadErrors` "image detail fails and Try again refetches it" stopped finding its alert)
- **Issue:** The plan has `EditorTopBar` call `useImage(projectId, imageId)`. When the detail request fails, the page keeps the editor frame, so the top bar mounts a new observer on an errored query. TanStack Query refetches on mount, which resets the query to pending and the page flips back to its spinner; the top bar unmounts and the cycle repeats.
- **Fix:** `EditorPage` reads the image once and passes `split` down through `Workspace` to `EditorTopBar` (new `split` prop). The top bar keeps `useSetSplit`, which patches the shared detail cache, so the button still updates.
- **Files modified:** `frontend/src/features/editor/EditorPage.tsx` (not in the plan's file list), `frontend/src/features/editor/EditorTopBar.tsx`
- **Verification:** `EditorLoadErrors`, `EditorSplit`, `EditorStatus`, `EditorSaving`, `EditorKeyboard` pass; full suite green
- **Committed in:** `4c21ca2`

**2. [Rule 3 - Blocking] Type and test-helper updates outside the listed files**
- **Found during:** Task 1 (`tsc` via `npm run build`)
- **Issue:** `StatusCounts.splits` is required, so `AnnotateNext.test.tsx` no longer type-checked.
- **Fix:** added `splits` to its `COUNTS` fixture.
- **Files modified:** `frontend/src/features/images/AnnotateNext.test.tsx`
- **Committed in:** `8648dd1`

**3. [Rule 2 - Missing coverage] Added `frontend/src/api/splits.test.ts`**
- **Issue:** the plan's tests reach `useSetSplit` only through the UI, which cannot cheaply exercise the 1001-id path (see Issues).
- **Fix:** hook-level tests for `patchSplitInListCache`, single request, chunking in sequence, and the updated-prefix report on a failed second chunk.
- **Committed in:** `8648dd1`, `09a9882`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing coverage)
**Impact on plan:** Deviation 1 changes where the top bar gets the split but not any user-visible behavior. No scope creep.

## Issues Encountered

- **1001-id UI tests dropped.** The first version of `ImagesSplit.test.tsx` rendered 1001 tiles to drive two chunks through the UI. It passed alone but each test cost 25 to 30 s and made neighbouring tests in the full run time out waiting for Mantine menu items. They were replaced by the hook-level tests in `api/splits.test.ts`; the UI keeps a single-chunk failure test ("Updated: 0 of 2 images. Database is busy."). The literal "Updated: 1000 of 1001 images." string is therefore asserted only through the `SplitBatchError` fields, not through the notification text.
- **Flaky tests under full-suite load.** `ImagesUrlState` ("writes the debounced search into the URL next to the sort") failed once in a full run and passed alone. It is a pre-existing test and was not touched; the repository already documents this load sensitivity in `test-setup.ts`. After switching `ImagesSplit` to text and label queries the final full run was fully green (54 files, 597 tests).
- **Backend tests ran against the main checkout's code.** `.venv` is an editable install pointing at the main checkout; at this base commit the backend code is identical, and the final run used `-o pythonpath=src` to import the worktree's sources (14 passed). No backend source changed in this plan.

## Known Stubs

None.

## Threat Flags

None. The split POST, its CSRF guard and the 1000-id bound were already in the plan's threat model and are covered by tests (T4-03-01 cross-project test, T4-03-02 editor test asserting no PUT and an unchanged reviewed flag, T4-03-03 chunking test, T4-03-04 403 test).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `SplitMenu`, `useSetSplit`, `ImageSplit` and `StatusCounts.splits` are ready for the auto-split dialog (04-06) and the dataset summary on the New training form.
- Worth a quick look by a person: tile pill vs. box-count pill with the longest ru label, and the editor top bar at 1024 px in ru.

## Self-Check: PASSED

- Created files exist: `backend/tests/test_splits_api.py`, `frontend/src/api/splits.ts`, `frontend/src/api/splits.test.ts`, `frontend/src/features/images/SplitMenu.tsx`, `frontend/src/features/images/ImagesSplit.test.tsx`, `frontend/src/features/editor/EditorSplit.test.tsx`.
- Task commits are ancestors of HEAD: `8c28411`, `8648dd1`, `2ff9136`, `5c873db`, `09a9882`, `5a13c95`, `4c21ca2`, `68238f4`.
- `npm --prefix frontend run build` exits 0; `npm --prefix frontend run test -- --run` 54 files / 597 tests pass; `test_splits_api.py` 14 passed.
- Acceptance greps: `SPLIT_BATCH_SIZE = 1000` and `setQueriesData` in `splits.ts`; `splitPill` in the tile CSS; `"splits"` in ru `images.json`; `fw={600}` present and `fw={500}` absent in `SelectionBar.tsx`; no `leftSection`/`rightSection` in `SplitMenu.tsx`; `SplitMenu` and `useSetSplit` in `EditorTopBar.tsx`; `splitPosts` in `editorApi.ts`.

---
*Phase: 04-train-download*
*Completed: 2026-10-10*
