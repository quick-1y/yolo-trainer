---
phase: 02-image-upload-classes
plan: 13
subsystem: images
tags: [react, react-query, virtuoso, chunked-delete, pagination, tdd, gap-closure]

requires:
  - phase: 02-image-upload-classes
    provides: "useDeleteImages, pruneDeletedImages, DeleteImagesModal, selection (02-11); ImagesPage/ImageGrid cursor paging (02-01..02-10); POST /images/delete with ids max_length=1000"
provides:
  - "useDeleteImages sends ids in sequential chunks of DELETE_BATCH_SIZE (1000), sums `deleted`, and prunes the already-deleted prefix when a later chunk fails"
  - "ImagesPage loads the next page by itself when the loaded list is empty and a next page exists; empty states only when no next page exists"
affects: [phase-03-annotation-editor, 02-verify-work]

plan_head_before: 6ad44b64c0ac0a2ad8605fd97072f3e3f5afe2f6
actuals:
  tokens: 8300
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Client-side request chunking to honour a backend size bound instead of raising it; sequential awaits so a failure leaves a well-defined deleted prefix"
    - "Hook tests via renderHook with a route-only fetch stub that tracks max requests in flight"
    - "Empty-list effect guarded by !isFetching and !isFetchNextPageError so a failing endpoint is never hammered"

key-files:
  created:
    - frontend/src/api/images.test.ts
    - frontend/src/features/images/ImagesDeletePaging.test.tsx
  modified:
    - frontend/src/api/images.ts
    - frontend/src/features/images/ImagesPage.tsx

key-decisions:
  - "Backend ids max_length=1000 stays; the client splits into DELETE_BATCH_SIZE=1000 chunks sent one at a time"
  - "On a failed later chunk the succeeded prefix is pruned from the cache and counts invalidated before the original ApiError is rethrown"
  - "Next-page effect never retries after a failed load; only the footer Try again fetches again (same rule as handleEndReached)"

patterns-established:
  - "syncDeleted helper inside useDeleteImages shared by the success path and the partial-failure path"
  - "nothingLeft = items.length === 0 && !hasNextPage gates both empty states"

requirements-completed: [ANNO-01]

coverage:
  - id: D1
    description: "Deleting more than 1000 images works: ids are split into sequential chunks of at most 1000 and the toast shows the summed count (G-02-5 / WR-01)"
    requirement: ANNO-01
    verification:
      - kind: unit
        ref: "frontend/src/api/images.test.ts#splits 2500 ids into ordered chunks of 1000, one request at a time, and sums deleted"
        status: pass
      - kind: unit
        ref: "frontend/src/api/images.test.ts#sends 1001 ids as two requests: 1000, then 1"
        status: pass
      - kind: integration
        ref: "frontend/src/features/images/DeleteImagesModal.test.tsx (2-id delete is one request, unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A failed later chunk leaves the grid consistent with the server and keeps the API error in the dialog"
    requirement: ANNO-01
    verification:
      - kind: unit
        ref: "frontend/src/api/images.test.ts#when chunk 2 fails: rejects with the API error, sends no chunk 3 and prunes only chunk 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "After deleting every loaded image while more pages exist, the page loads the next page by itself and never shows a false empty state (G-02-5 / CR-01)"
    requirement: ANNO-01
    verification:
      - kind: integration
        ref: "frontend/src/features/images/ImagesDeletePaging.test.tsx#loads the next page by itself instead of showing the empty state"
        status: pass
      - kind: integration
        ref: "frontend/src/features/images/ImagesDeletePaging.test.tsx#loads the next page of a search result instead of 'No matching images'"
        status: pass
    human_judgment: false
  - id: D4
    description: "The automatic next-page load never loops; a failed load shows the footer error with Try again even with no tile loaded"
    requirement: ANNO-01
    verification:
      - kind: integration
        ref: "frontend/src/features/images/ImagesDeletePaging.test.tsx#does not loop on a failing next page and offers the footer retry with no tile loaded"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real-browser behaviour with 1067 selected images and a blocked cursor request (UAT test 5 re-run)"
    verification: []
    human_judgment: true
    rationale: "Large selection over a real Docker stack and DevTools request blocking are not asserted by jsdom tests; batched into /gsd-verify-work (human_verify_mode end-of-phase)"

duration: 9min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 13: Chunked delete and empty-list paging (G-02-5) Summary

**useDeleteImages now deletes any selection size via sequential 1000-id chunks with a summed count and partial-failure cache sync, and ImagesPage loads the next page by itself instead of showing a false empty state after every loaded image is deleted**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-10-03T16:27Z (approx.)
- **Completed:** 2026-10-03T16:36Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 (2 source, 2 new test files)

## Accomplishments
- WR-01: `DELETE_BATCH_SIZE = 1000` and a chunked, sequential `mutationFn`; the backend 1000-id limit is untouched. `deleted` is summed across chunks, so the existing toast shows the right count.
- Partial failure: when chunk N fails, the ids of chunks 1..N-1 are pruned from every cached list and counts are invalidated, then the original `ApiError` is rethrown so `DeleteImagesModal` keeps showing it. No further chunk is sent.
- CR-01: a `useEffect` in `ImagesPage` fetches the next page while the loaded list is empty and a next page exists (guarded by data loaded, `!isFetching`, `!isFetchNextPageError`). `nothingLeft` gates both `EmptyState` branches, so the grid (with its footer: "Loading more..." or the inline error with "Try again") stays mounted while pages remain.
- No backend, i18n, `ImageGrid` or `DeleteImagesModal` changes; no new strings or dependencies.

## Task Commits

TDD sequence per task:

1. **Task 1: Chunked, sequential image delete (WR-01)**
   - RED `eb79200` (test) - 3 of 6 hook tests failed on assertions (DELETE_BATCH_SIZE undefined, one request for 1001 ids, no chunk failure)
   - GREEN `c48db01` (feat)
2. **Task 2: Load the next page when every loaded image was deleted (CR-01)**
   - RED `fee6b85` (test) - all 3 integration tests failed (img-4/car-14 never loaded; "c1" request count 1 instead of 2)
   - GREEN `9e7d5f6` (feat)

No refactor commits were needed.

**Plan metadata:** docs commit (SUMMARY, STATE, ROADMAP, REQUIREMENTS) follows this file.

## Files Created/Modified
- `frontend/src/api/images.ts` - `DELETE_BATCH_SIZE`, `syncDeleted` helper, chunked `mutationFn` with partial-failure sync
- `frontend/src/api/images.test.ts` - 6 hook tests: chunk order, one in flight, summed deleted, 1000/1001 boundaries, cache pruning, failure on chunk 2 and chunk 1
- `frontend/src/features/images/ImagesPage.tsx` - empty-list next-page effect and `nothingLeft` gating of both empty states
- `frontend/src/features/images/ImagesDeletePaging.test.tsx` - 3 integration tests: auto-load, no loop with footer retry and exact request counts, search variant

## Decisions Made
- Followed the plan: chunk size equals the backend bound, sequential for the SQLite single writer and a well-defined deleted prefix.
- After a failed next-page load the page never refetches on its own; only the footer button does.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered
None. Note for the verifier: the pre-existing race where a prune that lands during a pending next-page fetch is overwritten by that fetch (documented in the plan interfaces) remains out of scope for G-02-5; tests avoid deleting while a next-page request is pending.

## Verification Results
- `npm --prefix frontend run test -- --run images.test DeleteImagesModal` - 13 passed
- `npm --prefix frontend run test -- --run ImagesDeletePaging ImagesPage ImagesSelection ImagesSearch DeleteImagesModal ImageGrid` - 40 passed
- `npm --prefix frontend run build` - tsc and vite build exit 0
- `npm --prefix frontend run test -- --run` - 27 files, 176 tests passed
- `uv run pytest backend/tests/test_images_delete_api.py -x` - 13 passed (backend 1000-id contract untouched)
- `git status --porcelain` for backend, DeleteImagesModal and i18n before the task commits: empty

## Known Stubs

None.

## Threat Flags

None. Mitigations T-02-13-01 (one request in flight, backend limit unchanged), T-02-13-02 (prefix pruned on partial failure) and T-02-13-03 (guarded effect, exact request counts asserted) are covered by tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- G-02-5 is closed in code and tests. Two human checks remain for `/gsd-verify-work` (end-of-phase): re-run UAT test 5 with 1100 seeded images (select 1067, expect no 422 and the toast "Deleted images: 1067"), and the CR-01 blocked-cursor check in Chrome DevTools.

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: frontend/src/api/images.test.ts
- FOUND: frontend/src/features/images/ImagesDeletePaging.test.tsx
- FOUND commits: eb79200, c48db01, fee6b85, 9e7d5f6
- `git rev-list --count 6ad44b6..HEAD` = 4 (matches `commits: 4`)
- Acceptance criteria re-run: DELETE_BATCH_SIZE grep PASS; backend max_length=1000 PASS; test suites and build PASS
