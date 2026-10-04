---
phase: 03-box-annotation-editor
plan: 05
subsystem: annotation-editor
tags: [zundo, undo-redo, mantine-hotkeys, physical-keys, react-konva, zustand, i18n, vitest]

requires:
  - phase: 03-box-annotation-editor
    provides: "Plan 01 per-image zundo store + registry (doc changes autosave), Plan 03 tool bar, editorUiStore, BoxShape and the canvas draft"
provides:
  - "deleteBox store action: one history entry, demotes a reviewed image"
  - "Undo and Redo buttons in the tool bar bound to the zundo temporal store"
  - "lib/shortcuts.ts: single shortcut table (SHORTCUTS), buildHotkeys, capLabel, primaryCaps"
  - "useEditorHotkeys (Mantine useHotkeys, physical keys) plus an editor modal gate (EditorModalGateContext, useEditorModalOpen)"
  - "AnnotationCanvas imperative handle (cancelDraft, isDrawing) used by Esc"
affects: [03-06, 03-07, 03-08, 03-13, phase-06-polygons]

plan_head_before: 02ba211111f9d6847f8797fb5089bdcb14119503

actuals:
  tokens: 13700
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "One shortcut table drives key handling now and the on-screen reference later; hotkeys are written for usePhysicalKeys (lowercase letters, never the KeyX form)"
    - "Every bound row is wrapped so a held key (event.repeat) is ignored unless the row allows repeat"
    - "Modal gate: a dialog calls useEditorModalOpen(opened); EditorPage counts them and passes enabled=false to the hotkeys while any is open"
    - "Undo and redo change doc only, so the registry subscription autosaves them with no extra save call"

key-files:
  created:
    - frontend/src/features/editor/lib/shortcuts.ts
    - frontend/src/features/editor/lib/shortcuts.test.ts
    - frontend/src/features/editor/useEditorHotkeys.ts
    - frontend/src/features/editor/EditorKeyboard.test.tsx
  modified:
    - frontend/src/features/editor/store/annotationStore.ts
    - frontend/src/features/editor/store/annotationStore.test.ts
    - frontend/src/features/editor/ToolBar.tsx
    - frontend/src/features/editor/icons.tsx
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/features/editor/canvas/AnnotationCanvas.tsx
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json

key-decisions:
  - "Auto-repeat is ignored for every current shortcut, including undo and redo (allowRepeat false everywhere), to match the truth 'each distinct key press acts once'"
  - "The modal gate is a small context in useEditorHotkeys.ts (acquire/release counter owned by EditorPage) rather than a bare counter, so later plans' dialogs can opt in with one hook call"
  - "Delete is bound to Delete and Backspace as two entries of one row; preventDefault stays on for both so Backspace never navigates back"
  - "The tooltip of a row shows its first alternative caps (redo shows Ctrl+Shift+Z), mapped through capLabel"

patterns-established:
  - "Later plans append rows to SHORTCUTS and handlers to the EditorPage useEditorHotkeys call; browser/OS-owned combinations are never added"
  - "Tests dispatch keydown on document.body (bubbles to documentElement, where Mantine listens) with code and key set separately to simulate the Russian layout"

requirements-completed: [ANNO-03, ANNO-07, ANNO-08]

coverage:
  - id: D1
    description: "Delete or Backspace deletes the selected box as one history entry and saves; the selection is cleared; Backspace is default-prevented; nothing happens with no selection or on a held key"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/EditorKeyboard.test.tsx#keyboard shortcuts (delete, backspace, held Delete, no selection)"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/store/annotationStore.test.ts#deleteBox (3 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Undo and Redo buttons below a divider, disabled on empty stacks; each click sends one PUT; undo that removes the selected box clears the selection"
    requirement: ANNO-07
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/EditorKeyboard.test.tsx#undo and redo buttons (4 tests)"
        status: pass
    human_judgment: true
    rationale: "Divider spacing, icon legibility and tooltip placement are visual (end-of-phase browser check)"
  - id: D3
    description: "History is at most 100 steps, steps back and forward through create, move and delete in order, a new action empties the redo stack, meta writes add nothing, and the history survives switching images in the tab"
    requirement: ANNO-07
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/store/annotationStore.test.ts#history (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Keyboard layer: V, B, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Delete, Backspace and Escape match physical keys (key 'м' with code KeyV selects), exact modifiers, ignored in INPUT/TEXTAREA/SELECT, off while disabled, editing rows off while read-only"
    requirement: ANNO-08
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/lib/shortcuts.test.ts (25 tests)"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/EditorKeyboard.test.tsx#switches tools with V and B, also on the Russian layout"
        status: pass
    human_judgment: true
    rationale: "jsdom proves matching by event.code, but a real Russian keyboard layout in Chrome, Firefox and Safari is an end-of-phase browser check"
  - id: D5
    description: "Esc cancels a draft in progress (draft hidden, release of the pointer creates nothing, no PUT) and, with no draft, deselects"
    requirement: ANNO-08
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/EditorKeyboard.test.tsx#cancels a draft on Escape, a later draft still works after an Escape cancel, deselects on Escape when no draft is active"
        status: pass
    human_judgment: true
    rationale: "Real pointer capture release (jsdom stubs hasPointerCapture to false) needs a browser check"
  - id: D6
    description: "Tool bar tooltips show Kbd caps read from the shortcut table (Mod renders Ctrl, or the Command symbol on macOS)"
    requirement: ANNO-08
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/EditorKeyboard.test.tsx#puts the key caps of the shortcuts in the tool bar tooltips"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/lib/shortcuts.test.ts#capLabel"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 05: Delete, undo/redo and the physical-key shortcut layer Summary

**Delete, Undo and Redo (tool bar and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) that autosave through the existing zundo registry, plus a single physical-key shortcut table driving V, B, Delete/Backspace and Esc with a repeat guard, input and modal gating, and an Esc draft cancel on the canvas.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-04T08:11:29Z
- **Completed:** 2026-10-04T08:19Z (approx.)
- **Tasks:** 2 (both TDD: test commit, then feature commit)
- **Files modified:** 12 (4 created, 8 modified)

## Accomplishments

- `deleteBox(id)` is one `set` (one history entry, `isReviewed` cleared in the same entry); an unknown id returns the same `doc` reference, so no entry and no save.
- The tool bar gained a 24 px `Divider`, Undo and Redo (`ActionIcon` 40x40, subtle), disabled from `pastStates` / `futureStates` of the image's temporal store. Undo and redo only change `doc`, so the registry subscription saves each step; no separate save call was added. `EditorPage` drops the stored `selectedId` when its box disappears (undo, redo, delete).
- `lib/shortcuts.ts` is the single table (`select`, `box`, `delete`, `undo`, `redo`, `deselect`) with `buildHotkeys` producing Mantine items with `usePhysicalKeys: true` and `preventDefault: true`, skipping rows without a handler, skipping `editing` rows when read-only, returning `[]` when disabled, and ignoring `event.repeat` for rows that do not allow it. Redo is two entries (`mod+shift+z`, `mod+y`) because Mantine matches modifiers exactly.
- `useEditorHotkeys` wraps `useHotkeys` (INPUT, TEXTAREA, SELECT ignored by default). `EditorPage` binds V, B (only when a class exists and the image has loaded), Delete/Backspace, undo, redo and Escape, and turns everything off while an editor modal is open through the modal gate.
- `AnnotationCanvas` exposes `cancelDraft()` and `isDrawing()` through a React 19 `ref` prop; Esc hides the draft, releases pointer capture and forgets the start point, so the pending `pointerup` creates nothing. Esc with no draft deselects.
- Every tool bar tooltip reads its `Kbd` caps from the table through `primaryCaps` and `capLabel` ("Mod" renders as Ctrl, or the Command symbol when `navigator.platform` starts with Mac).

## Task Commits

1. **Task 1: undo and redo from the tool bar, delete a box**
   - RED `42fe975` (test): 8 of the new tests failed on assertions (`deleteBox is not a function`, no Undo button); negative-path tests that already held (for example the 100-step cap) passed
   - GREEN `fa16b8c` (feat)
2. **Task 2: tools, delete, undo/redo and Esc from the keyboard on any layout**
   - RED `df3942e` (test): 24 tests failed on assertions against empty `shortcuts.ts` / `useEditorHotkeys.ts` skeletons committed as test support (the same approach as `editorUiStore` in Plan 03)
   - GREEN `eff8c63` (feat)

**Plan metadata:** recorded in the docs commit that follows this file.

## Files Created/Modified

- `frontend/src/features/editor/lib/shortcuts.ts` - shortcut table, `buildHotkeys`, `capLabel`, `primaryCaps`, types.
- `frontend/src/features/editor/useEditorHotkeys.ts` - `useEditorHotkeys`, `EditorModalGateContext`, `useEditorModalOpen`.
- `frontend/src/features/editor/store/annotationStore.ts` - `deleteBox`.
- `frontend/src/features/editor/ToolBar.tsx`, `icons.tsx` - divider, Undo/Redo (`UndoIcon`, `RedoIcon`), caps from the table; `ToolBar` now takes the `store` prop.
- `frontend/src/features/editor/EditorPage.tsx` - hotkey handlers, modal gate provider, selection cleanup effect, canvas ref.
- `frontend/src/features/editor/canvas/AnnotationCanvas.tsx` - `AnnotationCanvasHandle`, `cancelDraft`, `isDrawing`, pointer id tracking.
- `frontend/src/i18n/locales/{en,ru}/editor.json` - `tools.undo`, `tools.redo`, `shortcuts.group.tools|editing`, `shortcuts.select|box|delete|undo|redo|deselect` (UI-SPEC strings).
- Tests: `lib/shortcuts.test.ts` (25), `EditorKeyboard.test.tsx` (15), `annotationStore.test.ts` (19, +11).

## Decisions Made

- Every row, including undo and redo, has `allowRepeat: false`. The plan's truth says each distinct key press acts once; a user who wants several undo steps presses the key repeatedly.
- The plan asked for an `openModals` counter in `EditorPage`. It is implemented as a counter owned by `EditorPage` and reached through `EditorModalGateContext` and `useEditorModalOpen(open)`, so a later dialog does not need a prop chain.
- The tooltip shows only the first alternative of a row (Ctrl+Shift+Z for redo, Delete for delete); the full list belongs to the Plan 03-13 reference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ShortcutDef` fields made readonly to allow `as const satisfies`**
- **Found during:** Task 2 (tsc after GREEN)
- **Issue:** `hotkeys: string[]` and `caps: string[][]` reject the readonly tuples that `as const` produces, so `SHORTCUTS` could not both keep literal ids (for `ShortcutId`) and satisfy `ShortcutDef`.
- **Fix:** `hotkeys: readonly string[]`, `caps: readonly (readonly string[])[]`; `ShortcutId` is derived from the table, so a handler map with a misspelled id fails to compile.
- **Files modified:** `frontend/src/features/editor/lib/shortcuts.ts`
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** `eff8c63`

### Additions beyond the listed files and shapes

- The modal gate API (`EditorModalGateContext`, `EditorModalGate`, `useEditorModalOpen`) lives in `useEditorHotkeys.ts` (a listed file) and is covered by two tests in `shortcuts.test.ts`.
- `primaryCaps` in `lib/shortcuts.ts` (tooltip helper) and the `EditorKeyboard.test.tsx` cases for tooltips, held keys and the Escape-then-redraw path.
- `AnnotationCanvas.test.tsx` is unchanged: the canvas handle is exercised through `EditorKeyboard.test.tsx`, which is part of the plan's verify filter.
- The task-1 tool bar used hardcoded caps; Task 2 swapped them for the table, as the plan describes.

---

**Total deviations:** 1 auto-fixed (1 blocking type fix), plus the small additions above.
**Impact on plan:** No scope creep; every addition serves a listed truth.

## Issues Encountered

- The plan is not `type: tdd`, so the `check tdd-red-evidence` record was not produced; RED was confirmed by reading the failing assertions in the Vitest output of each RED commit (no import or syntax failures).
- No intermittent Vitest failure: two full runs (35 files, 292 tests) were green after Task 2.
- jsdom stubs `hasPointerCapture` to false, so the pointer-capture release inside `cancelDraft` is not exercised by a unit test; it goes on the end-of-phase browser checklist.

## Known Stubs

None. The right-hand `#242424` column stays the intentional empty placeholder for Plan 03-06 and carries no mock data. `readOnly` is passed as `false` until the conflict state (a later plan) sets it.

## Threat Flags

None. T3-05-01 (inputs and selects ignored, shortcuts off while a modal is open via the gate, auto-repeat ignored for every row, every edit undoable) and T3-05-02 (`preventDefault` on bound keys so Backspace never navigates back, no browser- or OS-owned combination bound) are implemented as planned. No new network surface.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-06 (class panel and digit keys) appends rows to `SHORTCUTS` and handlers to the `useEditorHotkeys` call in `EditorPage`, and adds class changes as one `set` each so undo covers them.
- Later dialogs call `useEditorModalOpen(opened)`; the conflict state passes `readOnly: true`.
- End-of-phase browser checks to add: a real Russian layout (V, B, Ctrl+Z, Delete), Backspace not navigating back in Chrome and Firefox, Esc while a real pointer drag is in flight (capture released, no stuck draft), Command key on macOS, tooltip caps appearance.

## Self-Check: PASSED

All four created files exist on disk; commits `42fe975`, `fa16b8c`, `df3942e`, `eff8c63` are in `git log`; `plan_head_before..HEAD` counts 4 commits. Acceptance criteria re-run: `deleteBox` in the store 2, `futureStates` and `pastStates` in `ToolBar.tsx` 1 each, `"undo"` in en and ru 1 each, `usePhysicalKeys: true` 2, `event.repeat` 1, `"mod+shift+z"` 1, `"mod+y"` 1, `code: "KeyV"` in `shortcuts.test.ts` 7, `useEditorHotkeys` in `EditorPage.tsx` 2; targeted Vitest run (shortcuts, EditorKeyboard, AnnotationCanvas, locales: 70 tests) green, `npx tsc --noEmit` clean, `npm run build` succeeds, full `npx vitest run` green twice (35 files, 292 tests).

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
