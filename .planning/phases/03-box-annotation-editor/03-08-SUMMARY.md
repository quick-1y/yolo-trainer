---
phase: 03-box-annotation-editor
plan: 08
subsystem: ui
tags: [fastapi, sqlalchemy, react, zustand, mantine, react-query, vitest, tdd]

requires:
  - phase: 03-box-annotation-editor
    provides: "03-01 annotations router, derive_status and Image flags; 03-07 grid_after/grid_before/grid_order, useEditorNavigation.goTo with NavControl nextUnannotated, shortcut table"
provides:
  - "GET /api/projects/{p}/images/next-unannotated (grid order, same sort and q, wraps, never returns the pivot) and GET .../images/status-counts, both declared above the image-id route"
  - "annotations.unannotated_clause: the SQL form of derive_status's 'unannotated'"
  - "store toggleBackground / toggleReviewed / docStatus under D-13..D-15"
  - "Top bar status badge, Background and Reviewed toggles, Next unannotated button with the 1440px icon collapse; R, G and N keys"
  - "useEditorNavigation goTo accepting a lookup (resolver) that runs after the save; useNextUnannotated shared by button and key"
  - "api/images.ts getNextUnannotated, getStatusCounts, useStatusCounts, imageKeys.summary (for the grid in 03-09 and 03-11)"
affects: [03-09 grid status badges, 03-11 grid summary counts, 03-12, Phase 4 export (unannotated is never a negative example)]

actuals:
  tokens: 19455
  tasks: 3
  commits: 6
plan_head_before: 58d3d852acbb9e6ee5ee3f2857c5b727c2aa65b8

tech-stack:
  added: []
  patterns:
    - "Literal routes declared above parametrized routes and covered by a route-order test"
    - "goTo(target) where target is a path or an async lookup that returns a path or null; one in-flight move covers save and lookup"
    - "Pressed-state toggles render as a text Button at >=1440px and a 32px ActionIcon below, tooltip on a wrapper so a disabled control still explains itself"

key-files:
  created:
    - backend/tests/test_annotations_status.py
    - frontend/src/features/editor/useNextUnannotated.ts
    - frontend/src/features/editor/EditorStatus.test.tsx
    - frontend/src/features/editor/EditorNextUnannotated.test.tsx
  modified:
    - backend/src/yolo_trainer_api/annotations.py
    - backend/src/yolo_trainer_api/routers/annotations.py
    - backend/src/yolo_trainer_api/schemas.py
    - frontend/src/api/images.ts
    - frontend/src/features/editor/store/annotationStore.ts
    - frontend/src/features/editor/EditorTopBar.tsx
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/features/editor/ObjectList.tsx
    - frontend/src/features/editor/ToolBar.tsx
    - frontend/src/features/editor/icons.tsx
    - frontend/src/features/editor/useEditorNavigation.ts
    - frontend/src/features/editor/lib/shortcuts.ts
    - frontend/src/test/editorApi.ts
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json

key-decisions:
  - "Unannotated and background stay distinct everywhere: derived status, status-counts, the badge, and next-unannotated (which returns an image with no boxes and no flag, never a flagged one)"
  - "The lookup behind 'Next unannotated' lives in a shared hook (useNextUnannotated) so the top bar button and the N key take one path through goTo"
  - "A resolver passed to goTo runs after the flush whatever its outcome; a failed save still opens the leave dialog with the resolved path"
  - "topBar.background is a group (label/hint/disabledHint), as the plan directed, because a JSON key cannot be both a string and a group"

patterns-established:
  - "Status shown as glyph plus word (○ ● ✓ ∅), never color alone"
  - "Store actions that the image's state forbids return the same state, so no history entry and no save"

requirements-completed: [ANNO-09, ANNO-10, ANNO-08]

coverage:
  - id: D1
    description: "next-unannotated and status-counts endpoints: route order, after/wrap/none/only-current, q and sort, foreign pivot 404, counts, unannotated kept apart from background"
    requirement: ANNO-09
    verification:
      - kind: integration
        ref: "backend/tests/test_annotations_status.py (13 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Status badge, Reviewed and Background toggles with D-13..D-15 rules, background body in the object list, R and G keys"
    requirement: ANNO-10
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/store/annotationStore.test.ts"
        status: pass
      - kind: automated_ui
        ref: "frontend/src/features/editor/EditorStatus.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Next unannotated: save first, lookup with grid params, navigate, gray notice on none, red notice on failure, loading state and re-entry guard"
    requirement: ANNO-09
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/editor/EditorNextUnannotated.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Visual fit of the top bar below and above 1440px (no wrapping or clipping of long ru labels, filename shrinks first)"
    requirement: ANNO-09
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/editor/EditorStatus.test.tsx#top bar layout (label presence only; jsdom has no layout)"
        status: pass
    human_judgment: true
    rationale: "jsdom does not lay out text, so wrapping, clipping and the filename shrink order need a visual check in a real browser at about 1280px and 1440px."

duration: "~25 min active across two sessions (wall clock 12:02 to 14:50 +03:00 including a provider rate-limit pause)"
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 8: Image status, reviewed/background and next unannotated Summary

**Server endpoints for next-unannotated (grid order, wrapping) and status-counts, plus an editor top bar with a status badge, Background and Reviewed toggles under the D-13..D-15 rules, and a Next unannotated button/N key that saves first and then jumps**

## Performance

- **Duration:** ~25 min active, approximate (two sessions; the first executor was terminated by a provider rate limit and this plan was continued by a fresh agent)
- **Started:** 2026-10-04T12:02+03:00 (first commit)
- **Completed:** 2026-10-04T14:50+03:00 (last task commit)
- **Tasks:** 3
- **Files modified:** 23 (source, tests, i18n)

## Accomplishments

- Backend: `GET /images/next-unannotated` and `GET /images/status-counts`, declared above the parametrized detail route (route-order test), with `unannotated_clause` as the single SQL definition of "unannotated". The pivot is resolved through `get_image_or_404`, so a foreign `after` gives 404.
- Editor: the badge shows reviewed, background, annotated or unannotated with glyph and word. The store enforces D-13..D-15: background only with zero boxes, reviewed only with a box or background, any edit demotes reviewed in the same history entry. A background image shows a body with "Remove background mark" instead of rows.
- Next unannotated: button and N key share `useNextUnannotated`. It goes through `goTo(resolver)`, which flushes the save, then asks the server with the URL's sort and q and `after = current`. A null result gives a gray 4 s notice, a failure gives a red notice with the API message, and in both cases the user stays.
- Below 1440px Background, Reviewed and Next unannotated collapse to 32px icon buttons with aria-label and a Tooltip carrying the label and Kbd.

## Task Commits

1. **Task 1: Next-unannotated and status-counts endpoints** - `22b7b31` (test, RED), `74d91b9` (feat, GREEN)
2. **Task 2: Status badge, reviewed and background** - `a754b08` (test, RED), `3a3563c` (feat, GREEN)
3. **Task 3: Jump to the next unannotated image** - `189a021` (test, RED), `df42332` (feat, GREEN)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Files Created/Modified

- `backend/src/yolo_trainer_api/routers/annotations.py` - next-unannotated and status-counts routes above the image-id route
- `backend/src/yolo_trainer_api/annotations.py` - `unannotated_clause`
- `backend/src/yolo_trainer_api/schemas.py` - `NextUnannotated`, `StatusCounts`
- `frontend/src/features/editor/store/annotationStore.ts` - `toggleBackground`, `toggleReviewed`, `docStatus`
- `frontend/src/features/editor/EditorTopBar.tsx` - badge, toggles, Next unannotated control, 1440px collapse
- `frontend/src/features/editor/ObjectList.tsx` - background body and clear button
- `frontend/src/features/editor/useEditorNavigation.ts` - `goTo` accepts a path or a lookup
- `frontend/src/features/editor/useNextUnannotated.ts` - the lookup, notices and navigation, shared by button and key
- `frontend/src/api/images.ts` - `getNextUnannotated`, `getStatusCounts`, `useStatusCounts`, `imageKeys.summary`
- `frontend/src/features/editor/lib/shortcuts.ts` - rows `reviewed` (R), `background` (G), `nextUnannotated` (N)
- `frontend/src/test/editorApi.ts` - configurable next-unannotated route with a hold gate
- `frontend/src/i18n/locales/{en,ru}/{editor,images}.json` - status, toggle, background and notice strings

## Decisions Made

- Unannotated is never reported as background: derived status, counts, badge and next-unannotated all keep the two apart, so Phase 4 export cannot turn an unlabeled image into an empty-label example.
- The next-unannotated lookup is a shared hook rather than TopBar-local code, because the N key is bound in EditorPage and both must take the same path through `goTo`. `EditorTopBar` receives `onNextUnannotated`.
- A resolver given to `goTo` runs after the flush regardless of the save outcome. If the save failed and the resolver yields a path, the leave dialog opens for that path as before; a null result just stays.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `useNextUnannotated.ts`, not listed in the plan's files**
- **Found during:** Task 3
- **Issue:** The plan puts the resolver in `EditorTopBar`, but the N key is registered in `EditorPage`; two copies of the lookup would drift.
- **Fix:** One hook used by `EditorPage`, passed to the top bar as `onNextUnannotated`.
- **Files modified:** `frontend/src/features/editor/useNextUnannotated.ts`, `EditorPage.tsx`, `EditorTopBar.tsx`
- **Verification:** `EditorNextUnannotated.test.tsx` covers both button and key
- **Committed in:** `df42332`

**2. [Rule 3 - Blocking] Existing shortcut-table test updated for the new rows**
- **Found during:** Task 2 (`tsc` flagged the exhaustive `Spies` type) and Task 3
- **Issue:** `lib/shortcuts.test.ts` lists every shortcut id and the editing rows.
- **Fix:** Added `reviewed`, `background` (Task 2) and `nextUnannotated` (Task 3) to the expected lists.
- **Files modified:** `frontend/src/features/editor/lib/shortcuts.test.ts`
- **Committed in:** `3a3563c`, `df42332`

**3. [Rule 3 - Blocking] `ToolTipLabel` exported from `ToolBar.tsx`**
- **Issue:** The top bar tooltips reuse the toolbar's label-plus-Kbd layout.
- **Fix:** Added `export`; no behavior change.
- **Committed in:** `3a3563c`

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All small and needed to wire shared behavior; no scope creep.

## Issues Encountered

- **Provider rate limit and continuation.** The first executor was terminated by a provider rate limit after Task 1 (both commits) and the Task 2 RED commit, leaving an uncommitted Task 2 draft in the working tree. A fresh agent reviewed that draft against the Task 2 criteria and found the top bar, store, icons, shortcut rows and en/ru strings correct. It added what was missing (EditorPage R/G handlers, the ObjectList background body, the shortcuts test update), made the Task 2 RED tests pass and committed Task 2 GREEN, then did Task 3 with its own RED and GREEN commits. Duration is approximate.
- **One-off Vitest failure under load.** In one full run, `src/features/classes/ClassRow.test.tsx > ClassRow recolor > restores the previous color and shows a red notification when the PATCH fails` timed out (4320 ms). It passed when run alone and in the next two full runs (41 files, 404 tests). This matches the known rare flake and is unrelated to this plan.

## Known Stubs

None. `useStatusCounts` has no UI consumer yet by design: the grid in Plans 03-09 and 03-11 reads it.

## Next Phase Readiness

- Plan 03-09 and 03-11 can read `useStatusCounts` and per-image status; `imageKeys.summary` is its own cache root, so list helpers never touch it.
- A visual check of the top bar at about 1280px and 1440px (long ru labels, filename shrink order) is left to human verification; jsdom cannot assert layout.

## Self-Check: PASSED

Created files exist (`useNextUnannotated.ts`, `EditorStatus.test.tsx`, `EditorNextUnannotated.test.tsx`, `test_annotations_status.py`); all six task commits are present in `git log`; `uv run pytest backend/tests` 389 passed, ruff check and format clean; `npx tsc --noEmit` clean, `npm run build` ok, `npx vitest run` 41 files / 404 tests passed; acceptance greps (`toggleBackground`, `toggleReviewed`, `(min-width: 1440px)`, `"background"` in both images.json, `getNextUnannotated`, `useStatusCounts`, `"imageSummary"` once, `"noOther"` in ru) all pass; route-order line numbers 58 and 98 are below 128.

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
