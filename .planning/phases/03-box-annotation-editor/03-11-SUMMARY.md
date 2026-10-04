---
phase: 03-box-annotation-editor
plan: 11
subsystem: ui
tags: [react, react-query, mantine, i18n, vitest, images-grid]

requires:
  - phase: 03-box-annotation-editor
    provides: "status-counts and next-unannotated endpoints, getNextUnannotated / useStatusCounts / imageKeys.summary, editorPath / readGridParams, tile status and makeImageItem fixture (plans 03-04, 03-08, 03-09)"
provides:
  - "StatusSummary: project-wide 'Annotated N of M · Reviewed R' row under the Images title row"
  - "AnnotateNextButton: one-click entry to the first unannotated image in the grid's sort and search order"
  - "UploadButtons primary prop: Upload images steps back to the default variant once the project has images"
  - "test/stubImagesApi.ts handleImagesSideRequest: shared answer for status-counts and next-unannotated in strict grid stubs"
  - "Summary refetch after an upload finishes and after image deletes"
  - "i18n for images:summary.progress|reviewed|allDone and images:annotateNext (en and ru)"
affects: [03-12, 03-13, end-of-phase UAT, any new strict grid test stub]

actuals:
  tokens: 7400
  tasks: 2
  commits: 4

plan_head_before: d3f65f4034b10f4524054dfcf7180da66a31c807

tech-stack:
  added: []
  patterns:
    - "Strict fetch stubs delegate the page's side requests to one shared helper before their own Unexpected request throw"
    - "A hidden-on-purpose row (summary) always calls its query hook and renders null, so invalidation still refetches it"
    - "Mantine Button leaves data-variant off for the default filled variant; tests assert filled as the absence of the attribute"

key-files:
  created:
    - frontend/src/test/stubImagesApi.ts
    - frontend/src/features/images/StatusSummary.tsx
    - frontend/src/features/images/StatusSummary.test.tsx
    - frontend/src/features/images/AnnotateNextButton.tsx
    - frontend/src/features/images/AnnotateNext.test.tsx
  modified:
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/features/images/UploadButtons.tsx
    - frontend/src/features/images/UploadContext.tsx
    - frontend/src/api/images.ts
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json
    - frontend/src/features/images/ImagesPage.test.tsx
    - frontend/src/features/images/ImagesSearch.test.tsx
    - frontend/src/features/images/ImagesSelection.test.tsx
    - frontend/src/features/images/ImagesDeletePaging.test.tsx
    - frontend/src/features/images/ImagesUrlState.test.tsx
    - frontend/src/features/images/DeleteImagesModal.test.tsx
    - frontend/src/features/images/UploadFlow.test.tsx
    - frontend/src/features/images/UploadDropzone.test.tsx

key-decisions:
  - "The title row and the summary share one wrapper Box with the 16px bottom margin the title row had before, so a hidden summary leaves the layout unchanged and a shown one adds a single 20px line after an 8px gap"
  - "'Annotate next' is shown when the project-wide counts say total > 0; while the counts are loading or failed, the grid's own list decides, because the server resolves the lookup either way"
  - "AnnotateNextButton receives the grid's already-normalized sort and query as props instead of re-reading the URL, so it sends the same capped, allow-listed values the list request does (T3-11-01)"
  - "A null lookup answer (race) also invalidates the summary, so the stale counts that caused it are refreshed"

patterns-established:
  - "handleImagesSideRequest(url, { counts, next }) first in every strict Images-page stub (RESEARCH Pitfall 13)"

requirements-completed: [ANNO-09]

coverage:
  - id: D1
    description: "Images page shows 'Annotated: N of M · Reviewed: R' (N = total - unannotated), project-wide, en and ru, with the all-done tail at zero unannotated"
    requirement: ANNO-09
    verification:
      - kind: unit
        ref: "frontend/src/features/images/StatusSummary.test.tsx#reads annotated of total, counting reviewed and background as annotated, then reviewed"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/StatusSummary.test.tsx#ends with 'All images are annotated.' when no image is left unannotated"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/StatusSummary.test.tsx#speaks Russian"
        status: pass
    human_judgment: false
  - id: D2
    description: "The summary row is hidden for an empty project, while loading and on error (no message), and wraps with tabular figures"
    requirement: ANNO-09
    verification:
      - kind: unit
        ref: "frontend/src/features/images/StatusSummary.test.tsx#renders nothing, and no error text, when the counts request fails"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/StatusSummary.test.tsx#uses tabular figures and wraps instead of truncating"
        status: pass
    human_judgment: false
  - id: D3
    description: "The summary refreshes after an upload finishes and after image deletes (editor saves already invalidate it)"
    requirement: ANNO-09
    verification:
      - kind: unit
        ref: "frontend/src/features/images/UploadFlow.test.tsx#asks for new status counts once when an upload finishes"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/DeleteImagesModal.test.tsx#asks for new status counts after the images are deleted"
        status: pass
    human_judgment: false
  - id: D4
    description: "'Annotate next' opens the editor on the first unannotated image in the grid's sort and search; disabled at zero unannotated; green notice on null, red notice with the API message on failure; absent for an empty project"
    requirement: ANNO-09
    verification:
      - kind: unit
        ref: "frontend/src/features/images/AnnotateNext.test.tsx#looks up the first unannotated image in the grid's sort and search, then opens the editor"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/AnnotateNext.test.tsx#shows the API message in a red notification when the lookup fails"
        status: pass
      - kind: unit
        ref: "frontend/src/features/images/AnnotateNext.test.tsx#is absent for a project without images, and Upload images stays filled"
        status: pass
    human_judgment: false
  - id: D5
    description: "'Annotate next' is the single filled primary action in the title row; Upload images is the default variant once the project has images"
    requirement: ANNO-09
    verification:
      - kind: unit
        ref: "frontend/src/features/images/AnnotateNext.test.tsx#is the filled primary action, and Upload images steps back to default"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual fit of the title row and summary line at narrow widths (wrapping, 8px gap, one primary button)"
    verification: []
    human_judgment: true
    rationale: "jsdom has no layout; the wrap and spacing are checked by eye in the end-of-phase browser pass"

duration: 19min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 11: Images grid progress and Annotate next Summary

**The Images page now shows project-wide 'Annotated N of M · Reviewed R' (en/ru, refreshed after uploads and deletes) and a filled 'Annotate next' button that opens the editor on the first unannotated image in the grid's sort and search order.**

## Performance

- **Duration:** 19 min (start time was not captured at spawn; estimated from the first commit)
- **Started:** 2026-10-04T12:17:00Z (approx.)
- **Completed:** 2026-10-04T12:36:00Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- `StatusSummary` reads `useStatusCounts`, renders `done = total - unannotated`, the reviewed count and, at zero unannotated, the all-done sentence. It is hidden while loading, on error and for an empty project. Numbers go through `Intl.NumberFormat(i18n.language)` with tabular figures, and the `Group` wraps at the separators.
- `AnnotateNextButton` calls `getNextUnannotated` with the grid's sort and search (no `after`) and navigates with `editorPath`. A null answer shows a green notice, a failure a red notice with the API message, and it is disabled when the counts say nothing is left.
- `UploadButtons` takes `primary`: once the project has images the title row passes `false`, so Upload images is `variant="default"` and Annotate next is the only filled button; the empty state keeps the filled default.
- The summary query is invalidated after an upload finishes (`UploadContext`) and after image deletes (`useDeleteImages.syncDeleted`); `syncAfterSave` already covered editor saves.
- `test/stubImagesApi.ts` `handleImagesSideRequest` answers status-counts (default all zeros, so older tests see no summary) and next-unannotated; all eight strict grid stubs call it before their `Unexpected request` throw.

## Task Commits

Each task followed the TDD cycle:

1. **Task 1: The Images page shows annotation progress**
   - RED: `cad0594` (test) - shared stub helper, StatusSummary tests, refetch tests; `StatusSummary.tsx` was a null-returning skeleton so the tests failed on assertions, not on a missing module
   - GREEN: `808dcfe` (feat) - StatusSummary, ImagesPage wiring, invalidations, i18n, two test hardenings
2. **Task 2: "Annotate next" opens the editor on the first image that needs work**
   - RED: `b0481f5` (test) - 10 of 11 AnnotateNext tests failed; the empty-project case already held and stays as a regression guard
   - GREEN: `c7804f7` (feat) - AnnotateNextButton, ImagesPage title row, UploadButtons `primary`, i18n

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Files Created/Modified

- `frontend/src/test/stubImagesApi.ts` - shared answer for status-counts and next-unannotated in strict grid stubs
- `frontend/src/features/images/StatusSummary.tsx` / `StatusSummary.test.tsx` - the progress row and its states
- `frontend/src/features/images/AnnotateNextButton.tsx` / `AnnotateNext.test.tsx` - the grid's entry to the annotate loop
- `frontend/src/features/images/ImagesPage.tsx` - title row wrapper, summary, Annotate next, `hasImages`
- `frontend/src/features/images/UploadButtons.tsx` - `primary` prop
- `frontend/src/features/images/UploadContext.tsx`, `frontend/src/api/images.ts` - summary invalidation after uploads and deletes
- `frontend/src/i18n/locales/{en,ru}/images.json` - `summary.progress|reviewed|allDone`, `annotateNext`
- Eight grid test files - stubs delegate to `handleImagesSideRequest`; UploadFlow and DeleteImagesModal gained refetch tests

## Decisions Made

See `key-decisions` in the frontmatter. In short: one wrapper Box keeps a hidden summary layout-neutral; the button's visibility follows the project-wide counts with the grid list as the fallback; the button takes the page's normalized sort and query as props.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hardened two timing-sensitive grid tests**
- **Found during:** Task 1 (full images test run)
- **Issue:** `ImagesSelection.test.tsx` "changing the search clears the selection" failed once and passed on rerun. After the search change the grid remounts and shows its skeleton until the list answers, so reading every checkbox right after the selection bar disappeared could find none. `ImagesUrlState.test.tsx` "writes the debounced search into the URL next to the sort" waits on a 300 ms debounce inside the default 1 s `waitFor`, which is tight under a loaded suite. This plan's changes did not cause either race.
- **Fix:** the selection test now waits for `selectedIndexes()` to be empty; the URL-state test gives the debounced URL write a 4 s timeout and waits for the last request.
- **Files modified:** `frontend/src/features/images/ImagesSelection.test.tsx`, `frontend/src/features/images/ImagesUrlState.test.tsx`
- **Verification:** both files pass; the full suite passed (47 files, 503 tests)
- **Committed in:** `808dcfe`

**2. [Plan wording] AnnotateNextButton takes sort and query as props**
- **Found during:** Task 2
- **Issue:** The plan says to call `getNextUnannotated(projectId, readGridParams(searchParams))`. `readGridParams` does not cap `q` at the server's 255-character limit; `ImagesPage` does, in `normalizeQuery`.
- **Fix:** `ImagesPage` passes its own normalized `sort` and `query`, so the lookup sends exactly what the list request sends. Behavior is unchanged for every ordinary input.
- **Files modified:** `frontend/src/features/images/AnnotateNextButton.tsx`, `frontend/src/features/images/ImagesPage.tsx`
- **Committed in:** `c7804f7`

---

**Total deviations:** 2 (1 Rule 1 test hardening, 1 wording-level adjustment)
**Impact on plan:** No scope change. The first removes two flakes in files this plan already touched; the second applies the plan's own T3-11-01 mitigation more strictly.

## Issues Encountered

- Mantine's `Button` omits `data-variant` for the default filled variant, so the tests assert "filled" as the absence of that attribute and "default" as `data-variant="default"`.
- One-off failure in the first images-test run: `ImagesSelection.test.tsx` "changing the search clears the selection" (see Deviation 1; it passed on every later run). No other test failed in the final full run.

## Known Stubs

None. The null-returning `StatusSummary` skeleton existed only in the RED commit and was replaced in `808dcfe`.

## Threat Flags

None. The two endpoints were already covered by T3-11-01 (project-scoped, grid passes only its own project id and its allow-listed sort and q); no new surface was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The grid is now the start of the annotate loop; plans 03-12 and 03-13 can rely on `handleImagesSideRequest` for any new strict Images-page stub.
- End-of-phase browser check should look at the title row and summary line at narrow widths (D6 in the coverage block).

## Self-Check

PASSED. All five created source and test files exist on disk, all four task commits (`cad0594`, `808dcfe`, `b0481f5`, `c7804f7`) are in the log, the task acceptance greps return their required counts, and the final `npm run build` plus the full Vitest run (47 files, 503 tests) passed.

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
