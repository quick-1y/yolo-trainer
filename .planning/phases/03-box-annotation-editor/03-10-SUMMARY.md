---
phase: 03-box-annotation-editor
plan: 10
subsystem: ui
tags: [react, react-konva, konva, viewport, zoom, pan, shortcuts, i18n, vitest]

requires:
  - phase: 03-box-annotation-editor
    provides: "AnnotationCanvas (fit, stage-level drawing with pointer capture, Transformer, Crosshair), the shortcut table, EditorPage hotkeys and modal gate (plans 03-01, 03-03, 03-05, 03-06, 03-08)"
provides:
  - "Pure viewport math (fitViewport, zoomLimits, zoomAt, panBy) with unit tests"
  - "useStageViewport: per-image viewport state that refits on a new image and follows the container until the user zooms"
  - "Wheel / Ctrl+wheel zoom toward the cursor, +/-/Fit overlay, crisp pixels from 300%"
  - "Space-drag and middle-button pan, grab/grabbing cursors, F / 0 fit shortcut"
  - "i18n for canvas.zoomIn|zoomOut|fit|fitAria and shortcuts.group.view|fit|zoom|pan (en and ru)"
affects: [03-11, 03-12, 03-13, shortcut reference modal, end-of-phase UAT]

actuals:
  tokens: 10600
  tasks: 2
  commits: 4

plan_head_before: cbbce35d05c88f0fc01b725a5155521ccba6378f

tech-stack:
  added: []
  patterns:
    - "Viewport is derived state: the user's view is stored with the image key and size it was set on, so a new image or size drops it without an effect"
    - "Pan moves the stage imperatively on pointermove and commits once on pointerup (no React state per move); the commit always runs, even for a zero move, because react-konva diffs props, not node attributes"
    - "Space is read on window (not on the canvas) so a focused button cannot be clicked by it; text fields keep Space"

key-files:
  created:
    - frontend/src/features/editor/lib/viewport.ts
    - frontend/src/features/editor/lib/viewport.test.ts
    - frontend/src/features/editor/canvas/useStageViewport.ts
    - frontend/src/features/editor/canvas/useStageViewport.test.ts
    - frontend/src/features/editor/canvas/ZoomOverlay.tsx
  modified:
    - frontend/src/features/editor/canvas/AnnotationCanvas.tsx
    - frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx
    - frontend/src/features/editor/lib/shortcuts.ts
    - frontend/src/features/editor/lib/shortcuts.test.ts
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/features/editor/EditorKeyboard.test.tsx
    - frontend/src/test/canvas.ts
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json

key-decisions:
  - "Fit margin is 24 px a side in the pure module (the old canvas constant of 48 was the total); the canvas now imports the constants from lib/viewport"
  - "The user's view lives in a hook keyed by the decoded image element plus its size, so every image opens fit and a container resize is followed until the user zooms"
  - "A wheel notch is ignored while a pan is in progress, because a zoom would build on a position React has not seen yet"
  - "Boxes and the Transformer are made inert (not listening, not draggable) while Space is held or a pan runs, so a press on them pans instead of dragging the box"
  - "The release that ends a pan is not treated as a click on empty canvas, so a pan never clears the selection"

patterns-established:
  - "Keep geometry that is easy to drift (zoom anchor math) in a pure module with invariant tests"
  - "firePointer in src/test/canvas.ts now returns the dispatched event so tests can assert defaultPrevented"

requirements-completed: [ANNO-02, ANNO-08]

coverage:
  - id: D1
    description: "Wheel (and Ctrl+wheel / pinch) zooms toward the cursor by 1.1 per notch; the image point under the cursor stays put; zoom stays within fit x 0.5 and 1600%"
    requirement: ANNO-02
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/lib/viewport.test.ts#zoomAt"
        status: pass
      - kind: integration
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#zoom"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every image opens fit (24 px margin, at most 400%); F, 0 and the overlay Fit button return to fit"
    requirement: ANNO-02
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/canvas/useStageViewport.test.ts"
        status: pass
      - kind: integration
        ref: "frontend/src/features/editor/EditorKeyboard.test.tsx#fit shortcuts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Space + left-drag or middle-button drag pans without drawing or saving; Space is prevented on buttons but not in text fields; middle-button autoscroll is blocked; crosshair hides while panning"
    requirement: ANNO-02
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#pan"
        status: pass
    human_judgment: false
  - id: D4
    description: "Zoom overlay pill (bottom-left, 32 px) with minus / percent / plus / Fit; percent relative to natural size"
    requirement: ANNO-02
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#zoom"
        status: pass
    human_judgment: true
    rationale: "Pill geometry (16 px inset, 32 px height, colors) and tabular figures are visual; jsdom asserts behavior and labels only"
  - id: D5
    description: "Boxes drawn, moved or resized while zoomed or panned are stored in correct normalized image coordinates"
    requirement: ANNO-02
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#stores a box drawn while zoomed in image coordinates"
        status: pass
      - kind: integration
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#keeps boxes drawn after a pan in image coordinates"
        status: pass
    human_judgment: true
    rationale: "Drawing is verified in jsdom; moving and resizing under zoom need real shape hit-testing and Transformer anchors, which jsdom cannot exercise"
  - id: D6
    description: "A very large image (for example 8000 x 6000) pans, zooms and draws without visible lag"
    requirement: ANNO-02
    verification: []
    human_judgment: true
    rationale: "Backstop from the plan: performance of the real canvas on a large image is a manual end-of-phase browser check (RESEARCH validation: large-image zoom performance)"

duration: 13min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 10: Zoom and Pan Summary

**Cursor-anchored wheel zoom (1.1 per notch, fit x 0.5 to 1600%) with a tested pure viewport module, a zoom/Fit overlay, Space-drag and middle-button pan, and F / 0 refit in the box editor**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-04T12:06:50Z
- **Completed:** 2026-10-04T12:20:08Z
- **Tasks:** 2
- **Files modified:** 14 (5 created, 9 modified; +1222 / -25 lines)

## Accomplishments

- `lib/viewport.ts` holds all zoom math as pure functions (`fitViewport`, `zoomLimits`, `zoomAt`, `panBy`) with constants `ZOOM_STEP = 1.1`, `MAX_SCALE = 16`, `MAX_FIT_SCALE = 4`, `FIT_MARGIN = 24`. Tests assert the anchor invariant (image point under the pointer unchanged within 1e-9), no drift at either limit, and finite results for zero, NaN or too-small containers and images.
- `useStageViewport` keeps the user's view tied to the image element and size it was set on: a new image always opens fit, a container resize is followed until the user zooms, and several wheel notches inside one render accumulate.
- `AnnotationCanvas` zooms on `wheel` toward `getPointerPosition()` (Ctrl+wheel and pinch use the same rule), draws the image layer without smoothing from 300%, exposes `fit()` on its handle, and renders the `ZoomOverlay` pill.
- Pan is hand-rolled (no `Stage draggable`): middle button or Space + left button, pointer capture, imperative stage move, a single commit on release, `grab` / `grabbing` cursors, crosshair hidden for the duration, `preventDefault` on the middle-button press, `mousedown` / `auxclick` guards against autoscroll.
- Space is read on `window`, prevented (keydown and keyup) except in INPUT / TEXTAREA / SELECT / contentEditable, released on blur, and off while a modal is open (`keyboardEnabled={openModals === 0}`).
- Shortcut table gained the `fit` row (`f`, `digit0`, group `view`, not editing, no repeat); `EditorPage` maps it to `canvasRef.current.fit()`.
- i18n (en and ru): `canvas.zoomIn|zoomOut|fit|fitAria`, `shortcuts.group.view`, `shortcuts.fit|zoom|pan` (the zoom and pan rows are rendered by the reference in Plan 03-13).

## Task Commits

1. **Task 1: Zoom toward the cursor and back to fit**
   - RED: `f8db824` (test)
   - GREEN: `774ade9` (feat)
2. **Task 2: Pan with Space-drag or the middle button, and refit with F or 0**
   - RED: `283b800` (test)
   - GREEN: `1e85778` (feat)

**Plan metadata:** recorded in the `docs(03-10)` commit that adds this file.

## Files Created/Modified

- `frontend/src/features/editor/lib/viewport.ts` - pure fit, zoom limits, zoom-at-pointer and pan math
- `frontend/src/features/editor/lib/viewport.test.ts` - invariant and edge-case tests for the math
- `frontend/src/features/editor/canvas/useStageViewport.ts` - viewport state per image, refit rules
- `frontend/src/features/editor/canvas/useStageViewport.test.ts` - hook tests (refit on image or size change, follow resize until zoomed, accumulated zooms)
- `frontend/src/features/editor/canvas/ZoomOverlay.tsx` - zoom out / percent / zoom in / Fit pill
- `frontend/src/features/editor/canvas/AnnotationCanvas.tsx` - wheel, pan, Space handling, smoothing, overlay, `fit()`
- `frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx` - zoom and pan suites
- `frontend/src/features/editor/lib/shortcuts.ts`, `shortcuts.test.ts` - `fit` row and tests
- `frontend/src/features/editor/EditorPage.tsx` - `fit` handler and `keyboardEnabled`
- `frontend/src/features/editor/EditorKeyboard.test.tsx` - F / 0 refit tests (incl. Russian layout)
- `frontend/src/test/canvas.ts` - `firePointer` returns the event
- `frontend/src/i18n/locales/{en,ru}/editor.json` - new strings

## Decisions Made

See `key-decisions` above. The most consequential: the pure module owns the fit margin (24 px a side), and boxes plus the Transformer are inert while a pan can start so a press on them pans rather than drags.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Image with no size produced a fit scale of 4 instead of the fallback 1**
- **Found during:** Task 1 GREEN (viewport tests)
- **Issue:** `fitViewport` with a 0 x 0 image divided by zero to `Infinity`, which `Math.min` capped at `MAX_FIT_SCALE`, so the "bad size" guard never fired.
- **Fix:** The guard now also requires a positive finite image width and height.
- **Files modified:** `frontend/src/features/editor/lib/viewport.ts`
- **Verification:** `viewport.test.ts` "falls back to scale 1 for an image with no size"
- **Committed in:** `774ade9`

**2. [Rule 2 - Missing critical] Pan release must not clear the selection**
- **Found during:** Task 2 (test design)
- **Issue:** Konva fires a click on the stage when a pan starts and ends on empty canvas, and the existing handler deselects.
- **Fix:** The release that ends a pan is flagged and ignored by the stage click handler until the next pointerdown.
- **Files modified:** `frontend/src/features/editor/canvas/AnnotationCanvas.tsx`
- **Verification:** `AnnotationCanvas.test.tsx` "keeps the selection when a pan ends on empty canvas"
- **Committed in:** `1e85778`

**3. [Rule 2 - Missing critical] Boxes and Transformer inert during a pan**
- **Found during:** Task 2
- **Issue:** In the Select tool a Space + left press on a draggable box would start a box drag and a pan at once.
- **Fix:** `interactive={selectTool && !panBlocked}` on every `BoxShape` and `listening={!panBlocked}` on the Transformer while Space is held or a pan runs.
- **Files modified:** `frontend/src/features/editor/canvas/AnnotationCanvas.tsx`
- **Verification:** existing select/move/resize suites stay green; shape hit-testing under Space is a UAT item (jsdom cannot hit-test)
- **Committed in:** `1e85778`

**4. [Rule 2 - Missing critical] Extra guards around Space and the middle button**
- **Found during:** Task 2
- **Issue:** Research flagged Space on focused buttons (Pitfall 9) and middle-click autoscroll (A2) as risks; `keydown` alone does not stop a button click on every browser, and `pointerdown` `preventDefault` may not stop autoscroll.
- **Fix:** `keyup` for Space is also prevented (outside text fields), Space state is released on window blur, and the container prevents the default of middle-button `mousedown` and `auxclick`.
- **Files modified:** `frontend/src/features/editor/canvas/AnnotationCanvas.tsx`
- **Committed in:** `1e85778`

---

**Total deviations:** 4 auto-fixed (1 bug, 3 missing critical)
**Impact on plan:** All four are correctness requirements of the stated behavior; no scope creep.

### Plan-listed files not touched

`frontend/src/features/editor/canvas/Crosshair.tsx` was listed in `files_modified` but needed no change: its existing `hide()` already does what the pan needs, and `show()` reads the live stage transform. The plan also asked for an optional `useStageViewport.test.ts`-style coverage only implicitly; that test file was added for the hook's refit rules.

## Issues Encountered

- A full-suite run hit one failure in `ImagesUrlState.test.tsx` ("writes the debounced search into the URL next to the sort", a timing-sensitive debounce test, unrelated to the editor). It passes alone (9/9) and the full suite passed on rerun (45 files, 479 tests). Not reproduced, so not investigated further.
- The Windows working copy mixes LF and CRLF files; edits were made through an EOL-aware patch helper and the Edit tool so no file's line endings were rewritten.
- The `modal keyboardEnabled` path (Space left to a dialog) is implemented and wired, but no test opens a modal and presses Space; the existing leave dialog cannot be opened without a failed save. Covered indirectly by the shared modal gate.
- If Space is pressed while a box drag is already running, Konva ends that drag (the box stops being draggable) and the move is saved as a normal short gesture. Rare, harmless, and left as is.

## Known Stubs

None.

## Threat Flags

None. The plan's register is honored: T3-10-02 (coordinates under zoom) is mitigated because all geometry still goes through `getRelativePointerPosition()` and the tested normalization helpers, and two integration tests assert stored boxes after a zoom and after a pan. T3-10-01 (very large images) is accepted per the plan and left to the end-of-phase large-image check.

## Verification

- `npm --prefix frontend run test -- --run viewport AnnotationCanvas locales` - 4 files, 67 tests passed (Task 1)
- `npm --prefix frontend run test -- --run AnnotationCanvas shortcuts EditorKeyboard locales` - 4 files, 104 tests passed (Task 2)
- `npm --prefix frontend run build` (tsc + vite) - exit 0
- `npm --prefix frontend run test -- --run` - 45 files, 479 tests passed (second run; see Issues Encountered for the first-run flake)
- Acceptance greps: `export function zoomAt` 1, `MAX_SCALE = 16` 1, `imageSmoothingEnabled` present, `"fitAria"` in ru 1, `button === 1` 2, `"Space"` 2, `"digit0"` 1, `"pan"` in en and ru 1 each.
- TDD note: the plan is `type: execute` (not `type: tdd`), so no `check tdd-red-evidence` record was produced. RED was confirmed from the failing assertions in each RED commit's Vitest output (wheel did not zoom, no `grab` cursor, no `fit` row), plus unresolved-import failures for the new pure module and hook.

## Next Phase Readiness

- Plan 03-13 can render the View group in the shortcut reference from `SHORTCUTS` (`fit`) and the `shortcuts.zoom` / `shortcuts.pan` strings.
- End-of-phase UAT items: large-image (8000 x 6000) zoom performance, Space + drag starting on a selected box in the Select tool, middle-button autoscroll on Windows, moving and resizing a box while zoomed.

## Self-Check: PASSED

- Created files exist: viewport.ts, viewport.test.ts, useStageViewport.ts, useStageViewport.test.ts, ZoomOverlay.tsx, this SUMMARY.
- Commits found: f8db824, 774ade9, 283b800, 1e85778.

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
