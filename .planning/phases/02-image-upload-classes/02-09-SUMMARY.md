---
phase: 02-image-upload-classes
plan: 09
subsystem: images
tags: [fastapi, sqlalchemy, keyset-pagination, sqlite, react, mantine, tanstack-query, i18n]

requires:
  - phase: 02-image-upload-classes
    provides: "plan 01 keyset list endpoint, cursor helpers and composite indexes; plan 07 grid empty/skeleton/error states"
provides:
  - "GET /api/projects/{id}/images accepts sort=newest|name and q (server-side filename search)"
  - "build_page_query(project_id, sort, q_key, cursor, limit) with row-value keyset cursor for name order"
  - "ImagesToolbar: debounced filename search, clear button, Esc, newest/by-filename toggle"
  - "Found: N count and No matching images state"
affects: [03-viewer, image-selection, tags]

actuals:
  tokens: 36000
  tasks: 2
  commits: 4

plan_head_before: a15f337364be35cc414f0e3e5c417aa1c5fcbfb6
commits: 4

tech-stack:
  added: []
  patterns:
    - "Keyset cursor carries the sort name; decoding rejects a cursor issued for another sort (422 Invalid cursor.)"
    - "Row-value comparison tuple_(filename_key, id) > tuple_(k, i) for ties-safe, Postgres-portable paging"
    - "LIKE search via contains(autoescape=True) on the pre-normalized filename_key"
    - "Toolbar owns raw input text and debounces it; the page owns the committed search"

key-files:
  created:
    - backend/tests/test_images_list_api.py
    - frontend/src/features/images/ImagesToolbar.tsx
    - frontend/src/features/images/ImagesSearch.test.tsx
  modified:
    - backend/src/yolo_trainer_api/routers/images.py
    - frontend/src/api/images.ts
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json

key-decisions:
  - "Name-sort cursor requires a string key (null key is rejected); newest cursors stay lenient about k"
  - "Search text is normalized with normalize_project_name (NFKC + casefold) on the server, matching how filename_key is stored, so matching is case-insensitive for all scripts"
  - "Page trims the search before keying the query and sending q, so whitespace-only input is the unfiltered list"
  - "No keepPreviousData: a new query shows the skeleton and the grid remounts at the top"

patterns-established:
  - "Shared _scoped(stmt, project_id, q_key) applies the project scope and search filter to both the page query and the count query"

requirements-completed: [ANNO-01]

coverage:
  - id: D1
    description: "List API sorts by newest or filename; keyset paging walks 5000 images in both orders with no gaps or duplicates, ties broken by id"
    requirement: ANNO-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_list_api.py#TestKeysetWalks"
        status: pass
    human_judgment: false
  - id: D2
    description: "Server-side case-insensitive filename search treating % and _ literally, total honors q, no cross-project leakage"
    requirement: ANNO-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_list_api.py#TestSearch"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cursor, limit, q length and sort validation return 422 with detail 'Invalid cursor.' for bad cursors"
    verification:
      - kind: integration
        ref: "backend/tests/test_images_list_api.py#TestValidation"
        status: pass
    human_judgment: false
  - id: D4
    description: "Page queries are index-backed (ix_images_project_id_id for newest, ix_images_project_filename_key for name, no temp b-tree)"
    verification:
      - kind: integration
        ref: "backend/tests/test_images_list_api.py#TestIndexUsage"
        status: pass
    human_judgment: false
  - id: D5
    description: "Grid toolbar: 300 ms debounced search, clear button and Esc, sort toggle, Found: N count, No matching images state, grid restarts at the top for a new query"
    requirement: ANNO-01
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/images/ImagesSearch.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Perceived smoothness and layout of the toolbar next to the upload buttons in a real browser"
    verification: []
    human_judgment: true
    rationale: "Visual spacing and typing feel are not asserted by jsdom tests"

duration: 11min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 09: Image search and sort Summary

**Server-side filename search and newest/by-filename sort on one keyset cursor (row-value for name, id tiebreak), proven over 5000 rows with index-backed plans, plus the debounced search and sort toolbar on the Images page**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-03T13:28:32Z
- **Completed:** 2026-10-03T13:39:08Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 8

## Accomplishments

- `GET /api/projects/{id}/images` takes `sort` (`newest` default, `name`) and `q`. Name order is `(filename_key, id)` paged with a row-value cursor; newest order is unchanged. `q` is normalized like the stored `filename_key` and applied with `contains(..., autoescape=True)`, so `%` and `_` match themselves; `total` honors `q`.
- Cursors record their sort; a cursor for the other sort, a malformed one, a non-int id, or a name cursor without a string key returns 422 "Invalid cursor.". `limit` outside 1..500, `q` over 255 characters and an unknown `sort` return 422.
- `test_images_list_api.py` (32 tests): 5000 + 50 row walks in both orders (limit 500, last page `next_cursor` null), ties on `same.jpg` crossing page boundaries, search escaping, SQL metacharacters, cross-project isolation, and `EXPLAIN QUERY PLAN` checks naming `ix_images_project_id_id` / `ix_images_project_filename_key` with no temp b-tree, with and without a cursor.
- `ImagesToolbar`: 320 px search box (300 ms debounce, clear button only when non-empty, Esc clears) and a `SegmentedControl` (Newest first / By filename). `ImagesPage` holds `sort` and `search`, shows "Found: N" while searching, "No matching images" with the quoted query and a Clear search button at zero results (the first-run empty state stays for the no-search case), and keys the grid by `sort|query` so every new query starts at the top.
- en/ru i18n keys added with identical structure (`locales` parity test passes).

## Task Commits

TDD: each task has a RED test commit and a GREEN implementation commit.

1. **Task 1: Sort by filename and server-side search on the keyset list API**
   - RED `13734d6` (test) - 13 of 32 tests failing on missing sort/q/validation
   - GREEN `3df10c4` (feat)
2. **Task 2: Grid toolbar - filename search and sort toggle**
   - RED `7702d5b` (test) - 7 of 7 failing (no sort param, no search box)
   - GREEN `771269a` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified

- `backend/src/yolo_trainer_api/routers/images.py` - `sort`/`q` params, `build_page_query` with both orders, strict sort-aware cursor decoding
- `backend/tests/test_images_list_api.py` - keyset walks, search, validation, index-usage tests
- `frontend/src/api/images.ts` - `ImageSort`, `listImages`/`useImagesInfinite` with sort and q
- `frontend/src/features/images/ImagesToolbar.tsx` - debounced search + sort toggle
- `frontend/src/features/images/ImagesPage.tsx` - state, count line, no-results state, grid key
- `frontend/src/features/images/ImagesSearch.test.tsx` - 7 UI tests asserting request URLs
- `frontend/src/i18n/locales/{en,ru}/images.json` - search, sort, countFiltered, noResults keys

## Decisions Made

- A name-sort cursor must carry a string key; a null key is rejected (a null would make the row-value comparison match nothing). Newest cursors stay lenient about `k`, as in plan 01.
- The query is `_scoped(stmt, project_id, q_key)` for both the page and the count, so the project filter and the search can never diverge between `items` and `total`.
- The page trims the search before it keys the query and builds the request, so a whitespace-only box is the unfiltered list (the server normalizes with `strip()` as well).
- No `keepPreviousData`: the skeleton shows while a new query loads and the grid remounts, which is what puts it back at the top; the count line is not shown stale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Accessible name for the search clear button**
- **Found during:** Task 2
- **Issue:** The plan lists no i18n key for the X button's label; an unlabelled icon button is inaccessible, and reusing `noResults.clear` ("Clear search") would give two buttons the same name when the no-results state shows.
- **Fix:** Added `images:search.clear` ("Clear" / "Очистить") in en and ru.
- **Files modified:** `frontend/src/i18n/locales/{en,ru}/images.json`, `ImagesToolbar.tsx`
- **Committed in:** 771269a

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Accessibility label only; no scope change.

## Issues Encountered

- Full-suite frontend run is not fully green on this machine, for reasons unrelated to 02-09 (logged in `deferred-items.md`): `UploadPanel > reveals filename and reason rows ... Copy list` fails on `toBeVisible()` even in isolation and with the 02-09 frontend changes reverted (verified), and `CreateProjectModal` timeouts occur under load (known flaky; passes alone). All 02-09 tests, the images/locales tests, `tsc` + `vite build`, backend pytest (292 passed) and ruff are green.
- `npx prettier` defaulted to 80 columns and reformatted whole files; re-ran with `--print-width 100` to match the repo style before committing.

## Known Stubs

None.

## Threat Flags

None - the new query parameters (`sort`, `q`, `cursor`) are exactly the surface covered by T2-09-01..04; all four are mitigated and tested (autoescape, strict cursor decode, keyset with capped limit and index plans, project-scoped queries with a second project in the 5000-row test).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 02-10. The list API and `useImagesInfinite(projectId, sort, q)` are the surface the selection/viewer plans build on.
- Open item: the pre-existing `UploadPanel` test failure (plan 02-06) should be fixed before phase verification.

## Self-Check: PASSED

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
