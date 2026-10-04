---
phase: 03-box-annotation-editor
plan: 12
subsystem: ui
tags: [react, zustand, zundo, react-query, konva, vitest, i18n, autosave]

# Dependency graph
requires:
  - phase: 03-box-annotation-editor
    provides: "03-01 saver/registry/save indicator, 03-07 LeaveDialog + beforeunload + anyUnsaved, 03-09 syncAfterSave cache patch, 03-10 viewport + useLoadedImage"
provides:
  - "Saver retry with capped, jittered exponential backoff; 409/404/4xx classified and never retried"
  - "Ctrl+S (mod+s) shortcut row that flushes the saver and suppresses the browser save dialog"
  - "ConflictBanner (409) and a read-only editor mode across tools, canvas, keys, class panel, object list and top bar toggles"
  - "discardEditor, the re-entry version check in getEditor and a mutable per-entry handlers object (onRejected, onGone)"
  - "useLoadedImage(src, expected) with mismatch status and retry(); load-failure frame that keeps the top bar usable"
  - "MAX_BOXES = 2000 enforced in the store and refused with a gray notification in the page"
affects: [03-13, phase-04-training, phase-06-polygons, phase-08-ai-assist]

# Actuals (#2632)
actuals:
  tokens: 25500
  tasks: 3
  commits: 7
plan_head_before: 61a39ed32db700139007247b72732356513846e1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Failure classification by HTTP status inside the saver: stop (409), stop and report (404, other 4xx), retry on backoff (5xx, network)"
    - "Entry-level mutable handlers: an entry outlives the page, so the page registers and clears its callbacks"
    - "Inert stand-in entry: the editor frame renders without a document when annotations did not load"
    - "resetQueries (not invalidate) before a rebuild from the server, so the page never rebuilds from a stale cached copy"

key-files:
  created:
    - frontend/src/features/editor/ConflictBanner.tsx
    - frontend/src/features/editor/EditorSaving.test.tsx
    - frontend/src/features/editor/EditorLoadErrors.test.tsx
    - frontend/src/features/editor/store/storeRegistry.test.ts
  modified:
    - frontend/src/features/editor/store/annotationSaver.ts
    - frontend/src/features/editor/store/storeRegistry.ts
    - frontend/src/features/editor/store/annotationStore.ts
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/features/editor/EditorTopBar.tsx
    - frontend/src/features/editor/ToolBar.tsx
    - frontend/src/features/editor/ObjectList.tsx
    - frontend/src/features/editor/canvas/AnnotationCanvas.tsx
    - frontend/src/features/editor/canvas/useLoadedImage.ts
    - frontend/src/features/editor/lib/shortcuts.ts
    - frontend/src/test/editorApi.ts
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json

key-decisions:
  - "While a retry is waiting, new edits only update the pending doc; the next attempt (or a flush) carries them, so one image sends at most one request per backoff window"
  - "Every 4xx other than 404 and 409 is treated like 422: report through onRejected, keep the doc pending, no timed retry"
  - "Reload and the 422 resync use resetQueries on the annotation set, so the page shows the loader and then the server's set instead of flashing the stale cached copy"
  - "A 404 on save discards the entry (the image is gone, nothing can be saved) so the tab stops being guarded by beforeunload"
  - "The 2000-box limit is enforced twice: the page refuses with a notification, and createBox in the store ignores the call"

patterns-established:
  - "Read-only is one boolean in Workspace (conflict, mismatch, image error, failed request) fanned out to ToolBar, EditorTopBar, ObjectList, AnnotationCanvas, hotkeys and class choice, each with the reason as a tooltip"
  - "Stub PUT replies are scripted with putQueue and extra modes (unavailable, rejected, gone) in test/editorApi.ts"

requirements-completed: [ANNO-07, ANNO-08]

coverage:
  - id: D1
    description: "Transient save failures (5xx, network) keep changes queued and retry with backoff 1, 2, 4, 8 then 15 s with jitter; a successful retry returns the indicator to Saved with no toast"
    requirement: ANNO-07
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/store/annotationSaver.test.ts#retries a 5xx or a network error at 1, 2, 4, 8 and then every 15 seconds"
        status: pass
      - kind: integration
        ref: "frontend/src/features/editor/EditorSaving.test.tsx#shows Not saved with the full hint, no notification, and returns to Saved after the retry"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ctrl+S flushes the pending change immediately and prevents the browser save dialog; there is no Save button"
    requirement: ANNO-08
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/EditorSaving.test.tsx#sends the pending change before the debounce elapses and prevents the browser's save dialog"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/lib/shortcuts.test.ts#save row"
        status: pass
    human_judgment: false
  - id: D3
    description: "A 409 shows the red role=alert banner with Reload, stops retrying and makes the editor read-only; Reload refetches the annotations and drops the image's history"
    requirement: ANNO-07
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/EditorSaving.test.tsx#a conflict (409, D-12)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A 422 shows the API message and resyncs classes and annotations; a 404 on save shows the not-found view"
    requirement: ANNO-07
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/EditorSaving.test.tsx#a rejected save (422)"
        status: pass
      - kind: integration
        ref: "frontend/src/features/editor/EditorSaving.test.tsx#a save for a deleted image (404)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Returning to an image reuses its history only when the server version still matches; a clean entry with a moved version is discarded"
    requirement: ANNO-07
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/store/storeRegistry.test.ts#getEditor re-entry check (Pitfall 14, D-10)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A decoded size that differs from the stored size shows the orientation-mismatch banner and makes the editor read-only (Pitfall 4); a failed image or request shows Try again and keeps navigation working"
    requirement: ANNO-07
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/EditorLoadErrors.test.tsx#an image the browser decodes at another size (Pitfall 4)"
        status: pass
      - kind: integration
        ref: "frontend/src/features/editor/EditorLoadErrors.test.tsx#an image or annotations request that fails"
        status: pass
    human_judgment: false
  - id: D7
    description: "A 2001st box is refused with the gray notification and no PUT"
    requirement: ANNO-07
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/EditorLoadErrors.test.tsx#refuses a 2001st box with a gray notification and sends no PUT"
        status: pass
    human_judgment: false
  - id: D8
    description: "Visual quality of the conflict banner (40 px, red, Reload button), the orientation banner placement and the retry indicator in a real browser at both locales"
    verification: []
    human_judgment: true
    rationale: "Layout, contrast and the fit of the three indicator states in the 120 px slot are visual; jsdom has no layout. WebP with EXIF orientation 3 is undetectable by the size check and is listed for the end-of-phase check (T3-12-03)."

# Metrics
duration: 22min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 12: Save failures, conflicts and load errors Summary

**Saver retries with capped jittered backoff, Ctrl+S, a 409 conflict banner with a read-only editor and Reload, 422/404 resync, stale-history drop on re-entry, an orientation-mismatch guard and the 2000-box limit**

## Performance

- **Duration:** 22 min
- **Started:** 2026-10-04T12:39:08Z
- **Completed:** 2026-10-04T13:02:00Z
- **Tasks:** 3 (each RED then GREEN)
- **Files modified:** 19 (4 created)

## Accomplishments

- A failed save is never silent and never lost: 5xx and network errors retry on 1, 2, 4, 8 then every 15 s (20% jitter) with the indicator saying "Not saved" and no toast; Ctrl+S skips the wait.
- A 409 stops sending, shows the red banner with Reload and turns the whole editor read-only (Box, Undo/Redo, editing keys, class panel, object list, Background/Reviewed toggles, box dragging and the Transformer); navigation still works and still asks first through the leave dialog.
- A 422 shows the server's message and rebuilds the image from refetched classes and annotations; a 404 on save discards the entry and shows the not-found view.
- `getEditor` drops a clean retained entry whose server version moved (Pitfall 14) and keeps any dirty, failed or conflicting one; `discardEditor` is the explicit drop.
- Broken images are visible: a decoded-versus-stored size mismatch (Pitfall 4), an image load error and failed image or annotation requests each show a red Alert; the top bar navigation survives all of them and Try again works.
- `MAX_BOXES = 2000` is enforced in the store and explained with a gray notification.

## Task Commits

Each task was committed atomically (RED then GREEN):

1. **Task 1: retry with backoff, indicator, Ctrl+S**
   - `86618e5` test (RED: 15 assertions failing on the planned behavior)
   - `a763b49` feat
2. **Task 2: conflicts, rejected saves, stale history**
   - `b21e874` test (RED: banner, 422, 404, registry)
   - `07c61d4` feat
   - `fa0027a` test (virtualized rows made reachable in the page-level conflict tests; staged late, committed separately)
3. **Task 3: load errors, mismatch, 2000-box limit**
   - `110fe79` test (RED)
   - `237b8fe` feat

**Plan metadata:** docs commit follows this SUMMARY (SUMMARY, STATE, ROADMAP, REQUIREMENTS).

## Files Created/Modified

- `frontend/src/features/editor/store/annotationSaver.ts` - BACKOFF_MS, status classification, onRejected/onGone, injectable random and timers, flush skips the wait
- `frontend/src/features/editor/store/storeRegistry.ts` - discardEditor, re-entry staleness check, mutable `handlers`
- `frontend/src/features/editor/store/annotationStore.ts` - `MAX_BOXES`, createBox ignores the call at the limit
- `frontend/src/features/editor/EditorPage.tsx` - read-only fan-out, handler registration, Reload/resync, inert entry, failure and mismatch alerts, 2000-box notification
- `frontend/src/features/editor/ConflictBanner.tsx` - 409 banner with Reload
- `frontend/src/features/editor/canvas/useLoadedImage.ts` - mismatch status and `retry()`
- `frontend/src/features/editor/ToolBar.tsx`, `EditorTopBar.tsx`, `ObjectList.tsx`, `canvas/AnnotationCanvas.tsx` - `readOnly` (and `documentLoaded`, `failed`) props
- `frontend/src/features/editor/lib/shortcuts.ts` - `save` row (general group)
- `frontend/src/test/editorApi.ts` - putQueue, unavailable/rejected/gone PUT modes, annotation and image error switches, request counters
- Tests: `annotationSaver.test.ts`, `storeRegistry.test.ts`, `shortcuts.test.ts`, `EditorSaving.test.tsx`, `EditorLoadErrors.test.tsx`
- `frontend/src/i18n/locales/{en,ru}/editor.json` - `conflict.*`, `canvas.mismatch.*`, `canvas.limit`, `loadError.body`, `shortcuts.group.general`, `shortcuts.save` (and `canvas.loadFailed` folded into `loadError.body`)

## Decisions Made

- Edits made while a retry waits do not start a new request: they update the pending doc and ride the next attempt, which keeps the T3-12-02 bound (about one attempt per backoff window) true even for a user who keeps drawing during an outage.
- Any 4xx other than 404 and 409 is handled like 422 (report, keep pending, no timed retry); the plan only named 422.
- Reload and the 422 resync use `resetQueries` on the annotation set instead of `invalidateQueries`: the cached copy is the last saved set and would be rebuilt as an editable stale view for a moment. The version check would converge anyway, but a stale editable frame is worse than one loader frame.
- On a 404 the entry is discarded (not just the detail invalidated): otherwise the beforeunload guard would stay on for an image that cannot be saved.
- A failed image or annotation request renders the real editor frame with an inert, unregistered stand-in store (no status badge, no save state, object list as skeleton) rather than the old full-screen error, so prev/next and Back keep working.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Store-level guard for the 2000-box limit**
- **Found during:** Task 3
- **Issue:** The plan placed the limit only in the page's `onCreate`; any other caller of `createBox` (later bulk sources such as AI proposals) could still build a doc the server answers with 422.
- **Fix:** `createBox` returns the same state at `MAX_BOXES`; the page keeps the notification.
- **Files modified:** `frontend/src/features/editor/store/annotationStore.ts`
- **Verification:** `EditorLoadErrors.test.tsx` limit test (no PUT, still 2000 objects)
- **Committed in:** `237b8fe`

**2. [Rule 2 - Missing Critical] Annotation-failure frame and read-only wiring beyond the listed props**
- **Found during:** Task 3
- **Issue:** The behavior "prev/next navigation keeps working" under a failed annotation request was impossible with the existing full-screen error, and read-only needed to reach the top bar toggles and object list to be real.
- **Fix:** Inert stand-in entry, `documentLoaded`/`failed`/`readOnly` props on EditorTopBar, ObjectList and AnnotationCanvas.
- **Files modified:** `EditorPage.tsx`, `EditorTopBar.tsx`, `ObjectList.tsx`, `AnnotationCanvas.tsx`
- **Verification:** `EditorLoadErrors.test.tsx` (annotations failed, navigation, Try again) and `EditorSaving.test.tsx` conflict tests (mutation-checked: forcing `readOnly = false` fails them)
- **Committed in:** `07c61d4`, `237b8fe`

**3. [Rule 1 - Process slip] A test fix was left unstaged in the Task 2 GREEN commit**
- **Found during:** Task 2 commit review
- **Issue:** `EditorSaving.test.tsx` fixes (Virtuoso mock, row-scoped queries) were not staged with `07c61d4`.
- **Fix:** Committed immediately as `fa0027a`. No code impact.

---

**Total deviations:** 3 (2 missing critical, 1 process slip)
**Impact on plan:** No scope creep; both additions were needed to make the plan's own behaviors true.

## Issues Encountered

- One-off failure in the full run: `ClassRow.test.tsx` "labels the swatch button and sends one PATCH {color} for a palette preset, updating the swatch immediately" (4.6 s, under load). Passes alone and on the full rerun (50 files, 547 tests green). Not reproduced; not investigated further.
- The Task 1 editor test uses `vi.useFakeTimers({ shouldAdvanceTime: true })` and jumps over the backoff wait; the saver unit tests use fully fake timers. No real waits for backoff.
- Ctrl+S inside a text field still reaches the browser's save dialog: Mantine's `useHotkeys` ignores INPUT/TEXTAREA/SELECT by default and the shared `buildHotkeys` does not override it. Out of scope for this plan; noted for the shortcut reference work.
- Queued edits at the moment of a forced tab close are protected only by the beforeunload prompt (the plan's flagged ANNO-07 assumption is unchanged; no local draft).

## User Setup Required

None - no external service configuration required.

## Threat Flags

None - no new network surface; the changes only classify existing API responses.

## Known Stubs

None.

## Next Phase Readiness

- Plan 03-13 (the last plan of the phase) can rely on `getEditor` re-entry semantics, `discardEditor`, `readOnly` fan-out and the scripted stub modes.
- End-of-phase manual check should cover: the three save indicator states at both locales in the 120 px slot, the conflict banner in a real two-tab conflict, and a WebP with EXIF orientation 3 (undetectable by the size check, T3-12-03).

## Self-Check: PASSED

- Created files exist: `ConflictBanner.tsx`, `EditorSaving.test.tsx`, `EditorLoadErrors.test.tsx`, `storeRegistry.test.ts` (verified on disk).
- Commits exist: `86618e5`, `a763b49`, `b21e874`, `07c61d4`, `fa0027a`, `110fe79`, `237b8fe` (verified with `git log`).
- Plan verification: `npm --prefix frontend run build` exits 0; `npx vitest run` 50 files, 547 tests passed (after one flaky rerun noted above); all task acceptance greps return the required counts.

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
