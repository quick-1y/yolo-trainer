---
phase: 03-box-annotation-editor
plan: 03
subsystem: annotation-editor
tags: [react-konva, konva, transformer, zustand, zundo, mantine, i18n, vitest]

requires:
  - phase: 03-box-annotation-editor
    provides: "Plan 01 editor route, per-image zundo store + saver registry, geometry helpers, canvas test helpers"
provides:
  - "vertical tool bar (Select V, Box B) with disabled/tooltip rules"
  - "editorUiStore: untracked tool, selectedId, hoveredId"
  - "interactive BoxShape: select, hover, drag (clamped to the image), class-name label chip"
  - "Konva Transformer on the selected box (8 square anchors, no rotation, no flip), committed on transformend"
  - "imperative full-viewport crosshair guides in the Box tool"
  - "geometry clampMove / normalizeTransform and store updateBox (one history entry per gesture)"
affects: [03-04, 03-05, 03-06, 03-07, phase-06-polygons]

plan_head_before: 7cea0d004c26e70d33e66e58f6dc4a5925697611

actuals:
  tokens: 11900
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Tool mode switches Rect listening/draggable; boxes are inert in the Box tool so a press starts a draft"
    - "Drag clamped in layer (image) coordinates in dragmove, committed once on dragend; resize committed once on transformend with the scale baked back to 1"
    - "Crosshair and label chip follow the pointer/drag imperatively (refs + batchDraw), never through React state"
    - "react-konva does not carry React context into the stage, so theme values (font family) are read outside and passed as props"
    - "Konva 10 fires pointerclick/pointerenter for pointer events and click/mouseenter for mouse events; handlers are attached for both families (idempotent)"

key-files:
  created:
    - frontend/src/features/editor/ToolBar.tsx
    - frontend/src/features/editor/icons.tsx
    - frontend/src/features/editor/store/editorUiStore.ts
    - frontend/src/features/editor/canvas/Crosshair.tsx
    - frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx
    - frontend/src/features/editor/lib/ids.test.ts
  modified:
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/features/editor/canvas/AnnotationCanvas.tsx
    - frontend/src/features/editor/canvas/BoxShape.tsx
    - frontend/src/features/editor/lib/geometry.ts
    - frontend/src/features/editor/lib/geometry.test.ts
    - frontend/src/features/editor/store/annotationStore.ts
    - frontend/src/features/editor/store/annotationStore.test.ts
    - frontend/src/test/editorApi.ts
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json

key-decisions:
  - "Chip text is at most 24 characters INCLUDING the ellipsis (23 name characters + the ellipsis): the plan's action text and behavior line disagreed by one character, the behavior line and the must_have both say 24"
  - "updateBox returns the same state (no history entry, no save, reviewed flag kept) for an unknown id or an unchanged geometry"
  - "Switching to the Box tool drops the selection; a selectedId whose box no longer exists is treated as no selection"
  - "The label chip is a Konva Label (a Group) with Tag + Text; line height 2/3 with padding 4/scale makes it exactly 16 screen px high"

patterns-established:
  - "Pure geometry helpers use the repo's PxRect {x, y, w, h}; NormBox is {x, y, w, h} too"
  - "BoxShape owns drag handlers and calls onChange once on release; the canvas owns the Transformer commit (onTransformEnd prop)"

requirements-completed: [ANNO-03]

coverage:
  - id: D1
    description: "Tool bar: role=toolbar vertical, Select and Box toggles with aria-pressed, Box active on open, Box disabled with no classes (tooltip 'Add a class to start drawing.') and while the image loads"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#tool bar (3 tests)"
        status: pass
    human_judgment: true
    rationale: "Button size, filled-accent look and tooltip placement are visual (end-of-phase browser check)"
  - id: D2
    description: "Select tool: click selects a box and attaches a Transformer (8 square 10px anchors, 1px borders, no rotation or flip); click on empty canvas deselects; boxes listen and drag only in the Select tool"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#selection (4 tests)"
        status: pass
    human_judgment: true
    rationale: "jsdom cannot hit-test shapes; real mouse selection and anchor feel need a browser (end-of-phase check)"
  - id: D3
    description: "Move: dragmove clamps the box inside the image in image coordinates, nothing is written during the drag, dragend commits one history entry and one PUT; undo restores it; reviewed is cleared in the same entry; an unmoved drag saves nothing"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#moving a box (5 tests)"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/lib/geometry.test.ts#clampMove (3 tests)"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/store/annotationStore.test.ts#updateBox (7 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Resize: transformend commits the scaled size, resets the node scale to 1, normalizes (positive, inside the image, at least 1 image px) and saves once; a gesture through the opposite edge never gives a negative or empty size"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#resizing a box (3 tests)"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/lib/geometry.test.ts#normalizeTransform (4 tests)"
        status: pass
    human_judgment: true
    rationale: "Transformer anchor behavior at real zoom is only simulated by firing transformend; a real drag of an anchor is an end-of-phase browser check"
  - id: D5
    description: "Crosshair guides: two 1px lines spanning the whole viewport, follow the pointer in the Box tool, hide on mouseleave, stay hidden in the Select tool"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#crosshair guides (3 tests)"
        status: pass
    human_judgment: true
    rationale: "Halo readability on light and dark images is visual"
  - id: D6
    description: "Label chips: class name truncated to 24 characters with an ellipsis, 16 screen px high and 12 px text at the fit scale, above the box (inside it at the top edge), black text on light colors and white on dark"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx#box label chips (5 tests)"
        status: pass
    human_judgment: true
    rationale: "Chip legibility and font rendering are visual"
  - id: D7
    description: "newId builds a v4 UUID without crypto.randomUUID and gives 1000 distinct values"
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/lib/ids.test.ts"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 03: Select, move and resize boxes Summary

**A Select/Box tool bar, Konva Transformer selection, drag-clamped moves and anchor resizes that each commit one history entry and one autosave on release, crosshair guides in the Box tool, and class-name label chips on every box.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-04T07:45:35Z
- **Completed:** 2026-10-04T07:58Z (approx.)
- **Tasks:** 2 (both TDD: test commit, then feature commit)
- **Files modified:** 16 (6 created, 10 modified)

## Accomplishments

- The left column now holds a 48 px `role="toolbar"` with Select (V) and Box (B) as 40x40 `ActionIcon`s (`aria-pressed`, filled accent when active, Tooltip with label and `Kbd`). Box is disabled without classes (tooltip "Add a class to start drawing.") and while the original loads.
- Boxes listen and drag only in the Select tool; in the Box tool they are inert so a press starts a draft. Selecting a box attaches one Transformer (8 square 10 px white anchors with a 1 px `#141414` stroke, 1 px white border, no rotation, no flip); clicking empty canvas deselects.
- A drag is clamped to the image in image coordinates during `dragmove` and committed on `dragend`; a Transformer gesture is committed on `transformend` (scale baked back to 1, normalized to a positive box inside the image of at least 1 px). Each is one `updateBox` set: one undo step, one save, `is_reviewed` cleared in the same entry. Nothing is written to the store while a gesture runs.
- Box tool crosshair: two 1 px guides with a dark halo spanning the whole viewport, updated through an imperative handle and `batchDraw`, hidden on leaving the canvas and in the Select tool.
- Every box has a class-name chip (24 characters max with an ellipsis, 16 screen px high at any zoom, text black or white by WCAG luminance) that follows a live drag or resize.

## Task Commits

1. **Task 1: tool bar, selection, labels, crosshair**
   - RED `89894a7` (test): 15 tests failed on assertions (no toolbar, no label nodes, no crosshair); `editorUiStore` added as the test support module
   - GREEN `f71a7b3` (feat)
2. **Task 2: move and resize, one history entry per gesture**
   - RED `810869c` (test): 20 tests failed (`clampMove`, `normalizeTransform`, `updateBox` missing; canvas gestures never saved)
   - GREEN `4e80ad5` (feat)

**Plan metadata:** recorded in the docs commit that follows this file.

## Files Created/Modified

- `frontend/src/features/editor/ToolBar.tsx`, `icons.tsx` - tool bar and the two inline SVG icons (24x24 viewBox rendered 20x20, stroke `currentColor`).
- `frontend/src/features/editor/store/editorUiStore.ts` - `useEditorUi` (`tool`, `selectedId`, `hoveredId`, `setTool`, `select`, `hover`, `resetForImage`) and `resetEditorUi`.
- `frontend/src/features/editor/canvas/BoxShape.tsx` - selectable, draggable, hover-aware box with label chip, `labelTextColor`, `truncateLabel`.
- `frontend/src/features/editor/canvas/Crosshair.tsx` - imperative `show(point)` / `hide()` guides layer.
- `frontend/src/features/editor/canvas/AnnotationCanvas.tsx` - tool-aware stage, Transformer wiring, `transformend` commit, crosshair wiring.
- `frontend/src/features/editor/EditorPage.tsx` - renders the tool bar, derives `canDraw`, `labels` and a valid `selectedId`, resets UI state per image, wires `updateBox`.
- `frontend/src/features/editor/lib/geometry.ts` - `MIN_BOX_IMAGE_PX`, `clampMove`, `normalizeTransform`.
- `frontend/src/features/editor/store/annotationStore.ts` - `updateBox`.
- Tests: `AnnotationCanvas.test.tsx` (23), `geometry.test.ts`, `ids.test.ts`, `annotationStore.test.ts`; `test/editorApi.ts` gained an `isReviewed` option.
- `frontend/src/i18n/locales/{en,ru}/editor.json` - `tools.select`, `tools.box`, `tools.boxDisabled` (UI-SPEC strings) and `tools.aria`.

## Decisions Made

- Label truncation counts the ellipsis inside the 24 characters (see key-decisions).
- `updateBox` is a no-op (same state) for an unchanged geometry as well as for an unknown id, so a drag that ends where it started neither saves nor demotes a reviewed image.
- The Transformer commit handler lives in `AnnotationCanvas` (`onTransformEnd` prop passed to each `BoxShape`), attached to the Rect node: a Transformer-level listener would not receive node-level `transformend` events.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan interface names `PxRect {x, y, width, height}`, the repo has `{x, y, w, h}`**
- **Found during:** Task 2 (reading `lib/geometry.ts`)
- **Issue:** The plan's behavior examples for `clampMove` / `normalizeTransform` use `width` / `height`, but Plan 01 shipped `PxRect` and `NormBox` with `w` / `h`, and the plan itself says not to rename Plan 01 names.
- **Fix:** New helpers take and return the existing `PxRect` (`w`, `h`); the plan's numeric examples are tested with `w`/`h` and give the same values.
- **Files modified:** `frontend/src/features/editor/lib/geometry.ts`, `geometry.test.ts`
- **Verification:** `geometry.test.ts` (17 tests) green
- **Committed in:** `810869c`, `4e80ad5`

**2. [Rule 3 - Blocking] Konva 10 fires different events for pointer and mouse input**
- **Found during:** Task 1 (reading `node_modules/konva/lib/Stage.js`)
- **Issue:** For pointer-type DOM events Konva fires `pointerclick`, `pointerenter`, `pointerleave`; `click` / `mouseenter` / `mouseleave` only come from mouse-type events. A handler on `click` alone may never run in a real browser.
- **Fix:** Box selection, stage deselect and hover are attached to both families (and `tap`); every handler is idempotent. The crosshair hide uses native `mouseleave` and `pointerleave` listeners on the stage content.
- **Files modified:** `BoxShape.tsx`, `AnnotationCanvas.tsx`
- **Verification:** unit tests fire `click`, as the plan prescribes; the real-browser path is on the end-of-phase checklist
- **Committed in:** `f71a7b3`

**3. [Rule 2 - Missing critical] Stale selection and tool switch**
- **Found during:** Task 1
- **Issue:** A selected box removed by undo would leave a dangling `selectedId`; the Transformer must not stay attached after switching to the Box tool, where boxes are inert.
- **Fix:** `setTool("box")` clears the selection and `EditorPage` ignores a `selectedId` whose box no longer exists.
- **Files modified:** `editorUiStore.ts`, `EditorPage.tsx`
- **Verification:** `AnnotationCanvas.test.tsx#drops the selection when switching to the Box tool`
- **Committed in:** `89894a7`, `f71a7b3`

### Additions beyond the listed files

- `tools.aria` i18n key (`Tools` / `Инструменты`) for the toolbar's accessible name.
- `isReviewed` option in `test/editorApi.ts` so the reviewed-demotion path is tested through the real page.
- `lib/ids.test.ts` is a characterization test: `newId` was already correct from Plan 01, so it passed on the first run.

---

**Total deviations:** 3 auto-fixed (1 bug/naming, 1 blocking, 1 missing critical), plus the small additions above.
**Impact on plan:** No scope creep; all adjustments serve the plan's own truths.

## Issues Encountered

- A shell command that carried a long Python heredoc failed to parse and applied nothing (`git status` confirmed a clean tree); the edits were then made with the Edit tool.
- The UI-SPEC says a freshly drawn box becomes selected; the plan does not list it, so it is not implemented here.
- No intermittent Vitest failure was seen: three full runs (219, 246, 246 tests) were green. The unnamed flake from Plan 03-02 did not reappear.

## Known Stubs

None. The right-hand `#242424` column stays an intentional empty placeholder for Plan 03-06 and carries no mock data.

## Threat Flags

None. No new network surface; T3-03-01 (client clamps every move/resize, server validates the same rules), T3-03-02 (store written once per gesture, drag/crosshair imperative) and T3-03-03 (class names drawn as Konva text, never HTML) are implemented as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 03-04 onward can use `useEditorUi` (tool, selection, hover), `updateBox`, `clampMove` and `normalizeTransform`; the keyboard shortcuts V and B are shown in tooltips but not bound yet.
- Real-browser checks remain for the end-of-phase checklist: Transformer anchors under zoom, shape hit-testing, pointer vs mouse event delivery in Chrome, Firefox and Safari, and the chip and guide appearance.

## Self-Check: PASSED

All six created files exist on disk; commits `89894a7`, `f71a7b3`, `810869c`, `4e80ad5` are in `git log`; `plan_head_before..HEAD` counts 4 commits. Acceptance criteria re-run: `role="toolbar"` 1, `aria-pressed` 1, `flipEnabled={false}` 1, `rotateEnabled={false}` 1, `strokeScaleEnabled={false}` in BoxShape 1, `resetForImage` in EditorPage 1, `"boxDisabled"` in en and ru 1 each, `clampMove` and `normalizeTransform` exports 1 each, `updateBox` in the store 2, `onTransformEnd` in AnnotationCanvas 1, `pastStates` in the store test 11; targeted Vitest run (61 tests) green, `npx tsc --noEmit` clean, `npm run build` succeeds, full `npx vitest run` green three times (33 files, 246 tests).

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
