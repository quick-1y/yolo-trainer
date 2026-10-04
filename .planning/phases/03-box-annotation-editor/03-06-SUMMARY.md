---
phase: 03-box-annotation-editor
plan: 06
subsystem: annotation-editor
tags: [react, zustand, zundo, mantine, react-virtuoso, react-konva, i18n, vitest]

requires:
  - phase: 03-box-annotation-editor
    provides: "Plan 01 per-image zundo store, Plan 03 editorUiStore and BoxShape, Plan 05 shortcut table, useEditorHotkeys and deleteBox"
provides:
  - "ClassPanel: class list with active class, digit hints 1-9, per-image counts, inline add-class form, skeleton, error alert and empty state"
  - "ObjectList: virtualized 40px rows with ordinal, eye toggle, class Select, delete; selection, hover and hide synced with the canvas"
  - "annotationStore.setBoxClass: one history entry, demotes a reviewed image, no-op for same class or unknown id"
  - "useEditorUi.activeClassId / setActiveClass (survives image changes) and hiddenIds / toggleHidden (reset per image)"
  - "classDigit shortcut row (digit1-digit9, physical keys) and AddClassForm onCreated"
affects: [03-07, 03-08, 03-13, phase-06-polygons]

plan_head_before: 903131e3984c0e765d33241484a7e0bde2976dc0

actuals:
  tokens: 15000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "One chooseClass(index) path serves the digit keys and the panel rows: a selected box is reclassified (active class unchanged), otherwise the active class changes"
    - "Active class is derived, never stored resolved: activeClassId lookup with a fallback to the first class, so a deleted class or a one-class project needs no extra state"
    - "Controls inside a clickable row stop click propagation, including a portal dropdown whose clicks still bubble through the React tree"
    - "Rows are plain divs styled by a shared CSS module (data-active, data-hovered attributes), not inline styles, so :hover works"

key-files:
  created:
    - frontend/src/features/editor/ClassPanel.tsx
    - frontend/src/features/editor/ClassPanel.module.css
    - frontend/src/features/editor/ClassPanel.test.tsx
    - frontend/src/features/editor/ObjectList.tsx
    - frontend/src/features/editor/ObjectList.test.tsx
  modified:
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/features/editor/icons.tsx
    - frontend/src/features/editor/store/editorUiStore.ts
    - frontend/src/features/editor/store/annotationStore.ts
    - frontend/src/features/editor/store/annotationStore.test.ts
    - frontend/src/features/editor/lib/shortcuts.ts
    - frontend/src/features/editor/lib/shortcuts.test.ts
    - frontend/src/features/editor/canvas/AnnotationCanvas.tsx
    - frontend/src/features/classes/AddClassForm.tsx
    - frontend/src/test/editorApi.ts
    - frontend/src/test-setup.ts
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json

key-decisions:
  - "A classes load failure is shown inside the class panel (small red Alert, Try again) instead of the editor's full-screen error, so the rest of the editor stays usable and drawing is simply disabled"
  - "Clicking an object row switches to the Select tool and selects the box: a selection can only exist in the Select tool, otherwise the Transformer would never attach"
  - "The active class lives in the UI store as an id and is resolved against the class list at render time (fallback: first class); resetForImage keeps it for the draw-many workflow"
  - "Hidden boxes are filtered out before they reach AnnotationCanvas, so they are neither drawn nor hit-testable, and the filter lives in EditorPage rather than in the canvas"

patterns-established:
  - "Later plans append rows to SHORTCUTS and handlers to the EditorPage useEditorHotkeys call; digit handlers read the index from event.code"
  - "Tests that open a Mantine Select rely on the global scrollIntoView stub in test-setup.ts"

requirements-completed: [ANNO-03, ANNO-06, ANNO-08]

coverage:
  - id: D1
    description: "A class row click or digit key 1-9 makes that class active (no popup); the next drawn box is saved with it; digits above the class count do nothing; the tenth class has no digit hint but can be clicked"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/ClassPanel.test.tsx#active class (4 tests) and class list#shows no digit hint for the tenth class"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/lib/shortcuts.test.ts#maps a digit key to classDigit with the physical code"
        status: pass
    human_judgment: false
  - id: D2
    description: "With a box selected, a row click, a digit key or the row Select changes that box's class in one saved history entry, keeps the active class, clears is_reviewed in the same save, and undo restores the class"
    requirement: ANNO-06
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/ClassPanel.test.tsx#changing the class of the selected box (4 tests)"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/store/annotationStore.test.ts#setBoxClass (4 tests)"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/ObjectList.test.tsx#changing the class from a row (2 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "After choosing a class in a row dropdown, focus leaves the input so V and the other shortcuts work at once (Pitfall 9); the box is not selected by using its dropdown"
    requirement: ANNO-08
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/ObjectList.test.tsx#saves the new class once and hands the keyboard back to the editor shortcuts"
        status: pass
    human_judgment: true
    rationale: "jsdom proves activeElement is not an input; real focus behaviour of the Mantine dropdown in Chrome, Firefox and Safari is an end-of-phase browser check"
  - id: D4
    description: "A project with no classes shows the 'No classes yet' empty state with the add-class form open and drawing disabled; the first class created becomes active and enables drawing; loading shows three skeleton rows; a failure shows an alert with the API message and Try again"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/ClassPanel.test.tsx#a project without classes (3 tests) and loading and failure (2 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Per-image class counts, 'Classes: N' and the selected-box hint line"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/ClassPanel.test.tsx#counts the objects of each class on this image, shows the hint while a box is selected"
        status: pass
    human_judgment: false
  - id: D6
    description: "Object list: 'Objects: N' at zero, one and many, rows in annotation order, empty state with the draw hint, three skeleton rows without a store, virtualization (under 100 of 2000 rows mounted)"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/ObjectList.test.tsx#object list content (5 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Row click selects (and keeps) the box and attaches the Transformer; the eye toggle hides a box from the canvas and dims the row; hidden state resets for another image; the x button deletes with one save and Ctrl+Z restores"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/ObjectList.test.tsx#selecting from the list, hiding an object (3 tests), deleting from a row"
        status: pass
    human_judgment: false
  - id: D8
    description: "Hovering a row highlights the canvas box (3px stroke) and hovering a canvas box highlights its row"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/ObjectList.test.tsx#hover sync (2 tests)"
        status: pass
    human_judgment: true
    rationale: "Tests assert the strokeWidth and the data-hovered attribute; the #2E2E2E background, the 2px accent ring and the 30% fill are CSS-module and canvas visuals (vitest runs with css: false)"
  - id: D9
    description: "A 100-character class name truncates with an ellipsis and keeps its full name in title, in the class panel and inside the object row Select without widening the row, in en and ru"
    verification: []
    human_judgment: true
    rationale: "Held-out visual check (verification: backstop in the plan): jsdom has no layout, so truncation and row width need a browser"

duration: 12min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 06: Class panel and object list Summary

**Right panel of the editor: a class list that sets the active class or reclassifies the selected box (click, digit 1-9, or per-row dropdown, one undoable saved entry), inline creation of the first class, and a Virtuoso object list with eye toggle, class Select and delete synced with the canvas.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-04T08:23:33Z
- **Completed:** 2026-10-04T08:35:29Z
- **Tasks:** 2 (both TDD: test commit, then feature commit)
- **Files modified:** 18 (5 created, 13 modified)

## Accomplishments

- `setBoxClass(id, classId)` is one `set`: the class changes and `isReviewed` clears in the same history entry; the same class or an unknown id returns the same `doc`, so no entry and no save. Undo and redo restore the class through the existing registry autosave.
- `ClassPanel` (right column, top): header with `Classes: N`, a reserved 16px hint line while a box is selected, a `ScrollArea.Autosize` list of 40px rows (digit `Kbd` for the first nine, swatch, truncated name with `title`, per-image count with the `countOnImageAria` label, `aria-pressed` on the active class), an "Add class" toggle that opens `AddClassForm`, and the skeleton, error and empty states. With zero classes the form is open inside the empty state and the toggle is hidden.
- One `chooseClass(index)` in `EditorPage` serves the rows and the new `classDigit` shortcut row (`digit1`..`digit9`, index read from `event.code`): a selected box is reclassified and the active class stays; otherwise the active class changes. `activeClass` resolves `activeClassId` against the list with a fallback to the first class, so a deleted active class or a single-class project needs no special case. `activeClassId` survives `resetForImage`.
- `ObjectList`: `Virtuoso` with `fixedItemHeight={40}` over `doc.boxes` (`useShallow`); each row has the ordinal, an eye `ActionIcon` (`aria-pressed`, hide/show labels), swatch, a `Select` (blur plus canvas refocus after a change) and a red delete button. Hidden ids are removed before the canvas is given its boxes, so hidden boxes are neither drawn nor hit-testable; the row dims to 50%. Row and canvas share `hoveredId`, and a row click selects without toggling off.
- `AddClassForm` gained an optional `onCreated`; the panel uses it to make the first class of a project active.

## Task Commits

1. **Task 1: pick the active class, reclassify the selected box, create the first class**
   - RED `2412595` (test): 18 ClassPanel tests failed on assertions (no `class-panel`, `setActiveClass is not a function`), 4 `setBoxClass` store tests failed (`setBoxClass is not a function`), 2 shortcut-table tests failed on the missing row
   - GREEN `0859b08` (feat)
2. **Task 2: list, hide, change the class of and delete the objects of an image**
   - RED `291c50b` (test): 14 ObjectList tests failed on assertions against an empty `ObjectList.tsx` skeleton committed as test support (the same approach as Plans 03 and 05)
   - GREEN `c0f9fe8` (feat)

**Plan metadata:** recorded in the docs commit that follows this file.

## Files Created/Modified

- `frontend/src/features/editor/ClassPanel.tsx`, `ClassPanel.module.css` - class list, hint, inline create; the stylesheet also styles the object rows.
- `frontend/src/features/editor/ObjectList.tsx` - virtualized rows, eye toggle, class Select, delete.
- `frontend/src/features/editor/EditorPage.tsx` - active class resolution, `chooseClass`, `classDigit` handler, class counts, hidden-box filter, right column with both panels, classes failure moved into the panel.
- `frontend/src/features/editor/store/annotationStore.ts` - `setBoxClass`.
- `frontend/src/features/editor/store/editorUiStore.ts` - `activeClassId`, `setActiveClass`, `hiddenIds`, `toggleHidden`; `resetForImage` clears hidden ids only.
- `frontend/src/features/editor/lib/shortcuts.ts` - `classDigit` row.
- `frontend/src/features/editor/icons.tsx` - `EyeIcon`, `EyeOffIcon`.
- `frontend/src/features/editor/canvas/AnnotationCanvas.tsx` - `focus()` on the imperative handle.
- `frontend/src/features/classes/AddClassForm.tsx` - `onCreated`.
- `frontend/src/test/editorApi.ts` - `POST /classes`, `classesMode` (ok, pending, error), `setClassesMode`, `posts`.
- `frontend/src/test-setup.ts` - `scrollIntoView` stub.
- `frontend/src/i18n/locales/{en,ru}/editor.json` - `classPanel.*`, `objects.*`, `shortcuts.group.classes`, `shortcuts.classDigit` (UI-SPEC strings).
- Tests: `ClassPanel.test.tsx` (18), `ObjectList.test.tsx` (14), `annotationStore.test.ts` (+4), `shortcuts.test.ts` (+5).

## Decisions Made

- Classes failure lives in the class panel, not in the editor's full-screen error alert (required by the plan's truth "small red Alert ... drawing stays disabled"); `LoadedEditor` no longer treats `classes.error` as fatal.
- A row click calls `setTool("select")` then `select(id)`. `setTool("box")` clears the selection by design, so a row-selected box in the Box tool would be an inconsistent state and the Transformer (Select tool only) would not attach.
- Clicks on the eye, the class Select (including its portal options) and the delete button stop propagation, so using a control does not also select the box or flip the tool.
- Hover and selection highlights are CSS-module `data-*` attributes (`:hover` cannot be done inline); one module serves both panels.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom has no `Element.prototype.scrollIntoView`**
- **Found during:** Task 2 (first full run after GREEN)
- **Issue:** Opening Mantine's `Select` in a test threw `items[index]?.scrollIntoView is not a function` as an unhandled error, which fails the Vitest run even though every test passed.
- **Fix:** A global no-op stub in `frontend/src/test-setup.ts`, next to the existing `matchMedia`, `ResizeObserver` and `document.fonts` stubs.
- **Files modified:** `frontend/src/test-setup.ts`
- **Verification:** `npx vitest run` green with no "Unhandled Errors" block (37 files, 332 tests, twice)
- **Committed in:** `c0f9fe8`

**2. [Rule 2 - Missing critical] A classes load failure no longer replaces the whole editor**
- **Found during:** Task 1 (reading `LoadedEditor`)
- **Issue:** `classes.error` was part of the full-screen failure, so the plan's required panel-level alert with "Try again" and a still-usable editor could never be shown.
- **Fix:** `failure` now covers project, image and annotations only; `Workspace` receives `classesError` and `onRetryClasses` and the panel renders the alert.
- **Files modified:** `frontend/src/features/editor/EditorPage.tsx`
- **Verification:** `ClassPanel.test.tsx#shows a small alert with the API message and refetches on Try again`
- **Committed in:** `0859b08`

### Additions beyond the listed files and shapes

- `ClassPanel.module.css` (row, swatch, hover, active ring styles) is not in the plan's file list; inline styles cannot express `:hover`.
- `AnnotationCanvasHandle.focus()` in `AnnotationCanvas.tsx` (3 lines) so the object list can hand focus back to the canvas container without querying the DOM; the plan lists `BoxShape.tsx` for hover, but `BoxShape` already received `hovered` from the UI store through the canvas props, so it is unchanged.
- The `shortcuts.ts` doc comment that quoted the literal `"digit1"` was reworded, so the acceptance grep for `"digit1"` counts exactly the table entry (1).
- `ObjectList` takes `store: EditorStore | null`: `null` renders the three skeleton rows. `LoadedEditor` still shows its full-screen loader until the annotation set exists, so in the running app that branch is not reached; it is covered by a component test (see Known Stubs).

---

**Total deviations:** 2 auto-fixed (1 blocking test-environment gap, 1 missing critical behaviour), plus the additions above.
**Impact on plan:** No scope creep; every addition serves a listed truth.

## Issues Encountered

- RED for Task 1 and Task 2 was confirmed from the failing assertions in the Vitest output of each RED commit (missing panel, `setBoxClass is not a function`, no rows), not from import or syntax errors. The plan is not `type: tdd`, so no `check tdd-red-evidence` record was produced.
- No intermittent failure: three full runs (37 files, 332 tests) were green after GREEN of Task 2, plus a clean `npx tsc --noEmit` and `npm run build`.
- The vite build prints the existing chunk-size and dynamic-import warnings; they predate this plan.
- Task 2's `<verify>` lists two `<automated>` commands; both were run (targeted `ObjectList ClassPanel EditorKeyboard locales`, then `build` plus the full suite) and pass. The literal acceptance count `grep -c '"digit1"'` returned 2 until the comment was reworded; it is 1 now.

## Known Stubs

None that block the plan's goal. One unreached branch is recorded for the verifier: `ObjectList` with `store === null` (three skeleton rows) is exercised only by a component test, because `LoadedEditor` renders its full-screen loader until the annotation set exists. Rendering the editor chrome before the set loads would be a restructuring of `LoadedEditor` that no plan asks for.

## Threat Flags

None. T3-06-01 is mitigated: class names render as React text, as `Select` option labels and as Konva canvas text only, with no HTML injection API. T3-06-03 relies on the server rejecting a foreign or deleted class with 422 (Plans 01-02). T3-06-02 is accepted as planned: inline creation reuses `useCreateClass`, no new route.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-07 and later can read `activeClassId`, `hiddenIds` and `hoveredId` from `useEditorUi`, and append rows to `SHORTCUTS` with handlers in the `EditorPage` `useEditorHotkeys` call; the shortcut-reference plan (03-13) can render the `classes` group and `classDigit` row from the table.
- The object list is where the background-image block (`objects.background.*`) will replace the list in a later plan.
- End-of-phase browser checks to add: a 100-character class name in the panel and in the row Select in en and ru (truncation, `title`, row width), the hover `#2E2E2E` and the accent inset ring, a real focus check after choosing a class in the row dropdown, digit keys on a Russian layout, and a long class list scrolling inside its own area (max 40%, at least 120px).

## Self-Check: PASSED

Created files exist on disk: `ClassPanel.tsx`, `ClassPanel.module.css`, `ClassPanel.test.tsx`, `ObjectList.tsx`, `ObjectList.test.tsx`. Commits `2412595`, `0859b08`, `291c50b`, `c0f9fe8` are in `git log`; `plan_head_before..HEAD` counts 4 commits. Acceptance criteria re-run: Task 1 greps `setBoxClass` in the store 2, `"digit1"` 1, `"digit9"` 1, `onCreated` in `AddClassForm.tsx` 3, `AddClassForm` in `ClassPanel.tsx` 3, `aria-pressed` in `ClassPanel.tsx` 1, `"hintChange"` in ru 1; Task 2 greps `fixedItemHeight` 1, `useShallow` 2, `blur()` 1, `hiddenIds` in the UI store 5, `"deleteAria"` in en 1 and in ru 1. `npx vitest run ClassPanel annotationStore ClassesPage locales` and `ObjectList ClassPanel EditorKeyboard locales` green, `npx tsc --noEmit` clean, `npm run build` succeeds, full `npx vitest run` green three times (37 files, 332 tests).

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
