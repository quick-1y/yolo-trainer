---
phase: 03-box-annotation-editor
plan: 13
subsystem: ui
tags: [react, mantine, vitest, i18n, keyboard-shortcuts, readme]

# Dependency graph
requires:
  - phase: 03-box-annotation-editor
    provides: "03-05 SHORTCUTS table, capLabel and EditorModalGateContext; 03-07 LeaveDialog modal pattern; 03-12 Ctrl+S row and read-only mode"
provides:
  - "ShortcutsModal: on-screen shortcut reference generated from SHORTCUTS and POINTER_GESTURES (six groups, 17 rows)"
  - "help shortcut row (physical shift+slash) and display-only POINTER_GESTURES rows zoom and pan"
  - "Top bar '?' button (32 px, subtle) and a modal that holds the editor modal gate while open"
  - "Table guard tests: no dead 'Key' prefix hotkeys, no browser-owned combinations, every label key in en and ru"
  - "README sections 'Annotating images' and 'Разметка изображений'"
  - "Stable full-suite Vitest: asyncUtilTimeout 8000 and a layout-independent color swatch query in ClassRow tests"
affects: [phase-04-training, phase-06-polygons, phase-08-ai-assist]

# Actuals (#2632)
actuals:
  tokens: 40000
  tasks: 2
  commits: 5
plan_head_before: 384bd2327f0392b5a835e26b45dee6c5eb6012ee

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One source for key handling and the on-screen reference: SHORTCUTS rows drive both useEditorHotkeys and ShortcutsModal"
    - "Dialogs opt into the editor modal gate with useEditorModalOpen(opened) so every binding is off while they are open"
    - "Query popover content with hidden: true in jsdom tests (floating-ui flags zero-size references as clipped)"

key-files:
  created:
    - frontend/src/features/editor/ShortcutsModal.tsx
    - frontend/src/features/editor/ShortcutsModal.test.tsx
  modified:
    - frontend/src/features/editor/lib/shortcuts.ts
    - frontend/src/features/editor/lib/shortcuts.test.ts
    - frontend/src/features/editor/EditorTopBar.tsx
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json
    - frontend/src/test-setup.ts
    - frontend/src/features/classes/ClassRow.test.tsx
    - README.md
    - README.ru.md

key-decisions:
  - "Pointer gestures (zoom, pan) are a separate exported POINTER_GESTURES list with caption keys, so they appear in the reference but can never become hotkeys"
  - "Label keys in the table are relative to the editor namespace (shortcuts.zoom), like every existing row, not the editor:-prefixed form the plan text used"
  - "Added editor:shortcuts.close so the modal's close button has an accessible name (Mantine's X has none)"
  - "Color swatches in ClassRow tests are queried with hidden: true: the real flake cause was floating-ui's hide middleware under jsdom, not a timeout"

patterns-established:
  - "Reference rows are <li> items with data-testid shortcut-label and <kbd> caps, so tests read them without depending on layout"

requirements-completed: [ANNO-08]

coverage:
  - id: D1
    description: "'?' (physical Shift+Slash) and the top bar '?' button open the 'Keyboard shortcuts' reference; Esc or the close button closes it"
    requirement: ANNO-08
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/ShortcutsModal.test.tsx#opening the shortcut reference"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reference shows the six groups and exactly the 17 table rows with Latin caps, Ctrl on Windows/Linux and the Command symbol on macOS, Russian labels in ru, generated from SHORTCUTS"
    requirement: ANNO-08
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/ShortcutsModal.test.tsx#shortcut reference content"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/lib/shortcuts.test.ts#shortcut table guards"
        status: pass
    human_judgment: false
  - id: D3
    description: "While the reference is open, navigation and editing shortcuts do nothing; after Esc they work again"
    requirement: ANNO-08
    verification:
      - kind: integration
        ref: "frontend/src/features/editor/ShortcutsModal.test.tsx#while the reference is open"
        status: pass
    human_judgment: false
  - id: D4
    description: "Modal body scrolls inside a ScrollArea under 720 px viewport height; Russian labels wrap within the 40 px row without pushing the caps out; the top bar still fits at 1024 px in Russian with the added '?' button"
    requirement: ANNO-08
    verification: []
    human_judgment: true
    rationale: "jsdom has no layout: the presence of the ScrollArea is asserted, but its scrolling, the row wrapping and the top bar fit need a real browser (end-of-phase check items 11)"
  - id: D5
    description: "README (en and ru) documents opening the editor, autosave, shortcuts and that only background-marked images count as 'no objects'"
    verification:
      - kind: other
        ref: "grep -c '## Annotating images' README.md; grep -c '## Разметка изображений' README.ru.md"
        status: pass
    human_judgment: true
    rationale: "Wording and accuracy of the prose is an editorial judgment"
  - id: D6
    description: "Phase gate: scripts/run_full_suite.sh ends with ALL CHECKS OK (backend 389 passed, ruff, frontend 564 passed, build, compose smoke test, CLI git-clean check)"
    verification:
      - kind: other
        ref: "bash scripts/run_full_suite.sh"
        status: pass
    human_judgment: false
  - id: D7
    description: "Browser-only behavior of the whole phase (real pointer capture, Transformer handles, Russian layout, large image, two tabs, api stop/start, LAN origin)"
    verification: []
    human_judgment: true
    rationale: "Listed in the end-of-phase browser checklist below; jsdom cannot hit-test shapes or run real layouts"

# Metrics
duration: 28 min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 13: Keyboard shortcut reference and phase gate Summary

**A '?' key and top bar button open an on-screen shortcut reference generated from the same SHORTCUTS table the editor obeys (17 rows, six groups, ru/en, Ctrl or Command caps), with both READMEs updated and `run_full_suite.sh` green.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-10-04T13:05:00Z
- **Completed:** 2026-10-04T13:34:00Z
- **Tasks:** 2 (plus one orchestrator-directed flake fix, two commits)
- **Files modified:** 12

## Accomplishments

- `ShortcutsModal` renders the reference from `SHORTCUTS` and the new `POINTER_GESTURES`, so it cannot drift from the handlers; it holds the editor modal gate, so every editing and navigation key is off while it is open (T3-13-01 mitigated and tested).
- `help` row (`shift+slash`) added to the table; the visible top bar `?` button covers layouts where `?` is not on that physical key (Russian: Shift+7).
- Table guard tests: no `Key`-prefix hotkey, no Ctrl+W / Ctrl+T / F5 / Alt+← binding, every row has a hotkey and caps, every label and caption key exists in both locales.
- README.md and README.ru.md document the editor, autosave and Ctrl+S, the shortcut reference, status semantics (only explicit background counts as "no objects") and the orientation-mismatch limitation.
- Phase gate: `bash scripts/run_full_suite.sh` printed `ALL CHECKS OK` (389 backend tests, ruff clean, 564 frontend tests in 51 files, build, compose smoke test including the box round trip, CLI git-clean).

## Task Commits

0. **Orchestrator directive: stabilize async waits** - `f779880` (fix) and `827478a` (fix), see Deviations
1. **Task 1: Open a complete keyboard-shortcut reference from the editor** (TDD)
   - RED `d357bb6` (test), GREEN `ad3c140` (feat); no refactor commit needed
2. **Task 2: Document the editor and pass the phase gate** - `6224f72` (docs)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## TDD Gate Compliance

RED commit `d357bb6` precedes GREEN `ad3c140`. At RED, 15 tests failed for the intended reasons (no `?` button, no dialog, missing `help` row, `POINTER_GESTURES` undefined). The machine check `gsd_run check tdd-red-evidence` was not run: it parses node-test TAP output and expects a `type: tdd` plan, while this is a task-level `tdd="true"` task under Vitest. RED was verified by reading the failure messages.

## Files Created/Modified

- `frontend/src/features/editor/ShortcutsModal.tsx` - the reference modal (two-column grid, `ScrollArea.Autosize`, `Kbd` caps, "/" separators, text captions for gestures)
- `frontend/src/features/editor/ShortcutsModal.test.tsx` - 9 tests through the editor route (open by button and key, close, 17 rows and caps, ru, macOS, shortcut gating)
- `frontend/src/features/editor/lib/shortcuts.ts` - `help` row, `POINTER_GESTURES`, `PointerGestureDef`
- `frontend/src/features/editor/lib/shortcuts.test.ts` - help row, gestures and table guard tests; `allHandlers` gains `help`
- `frontend/src/features/editor/EditorTopBar.tsx` - `?` ActionIcon after the next arrow, `onOpenShortcuts` prop
- `frontend/src/features/editor/EditorPage.tsx` - `shortcutsOpen` state, `help` handler, modal mounted inside the gate provider
- `frontend/src/i18n/locales/{en,ru}/editor.json` - `topBar.shortcutsAria`, `shortcuts.title|close|help|keys.*`
- `frontend/src/test-setup.ts` - `asyncUtilTimeout` 8000
- `frontend/src/features/classes/ClassRow.test.tsx` - swatches queried with `hidden: true`
- `README.md`, `README.ru.md` - "Annotating images" / "Разметка изображений"

## Decisions Made

- `POINTER_GESTURES` is a separate list so display-only rows can never leak into `buildHotkeys`.
- Table label keys stay relative to the `editor` namespace (`shortcuts.zoom`), matching every existing row; the plan's `editor:` prefix would not resolve through `useTranslation("editor")`.
- Added `shortcuts.close` for the modal's close button name (Mantine's close button is unlabelled), which also let the close-button test query it by name.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Full-suite Vitest flake (orchestrator step 5.8 "fix now"), two commits**
- **Found during:** before Task 1 (orchestrator directive); root cause found while verifying it
- **Issue:** the directive attributed the 1/547 `ClassRow.test.tsx` failure to Testing Library's default 1000 ms `asyncUtilTimeout`. `test-setup.ts` already set 4000 ms (the failure at ~4.6 s matched that), so the premise was off. After raising it to 8000 ms (`f779880`) a full-suite run still failed (`restores the previous color...`, failing at 8.36 s with a swatch "not found"). The dump showed the color-picker dropdown present but `display: none`: floating-ui's `hide` middleware flags the Popover target as clipped under jsdom (all rects are zero) once the position is computed, and Mantine then hides the dropdown. A plain `findByRole` only succeeded if it ran before that, so any extra delay between the click and the query lost the race. A 300 ms delay after the click reproduced the failure deterministically.
- **Fix:** `configure({ asyncUtilTimeout: 8000 })` (below `testTimeout` 15000; kept as the directive asked) and in `ClassRow.test.tsx` the swatches are queried with `hidden: true` through one `swatchOption` helper with an explanatory comment. No assertion was weakened; the 300 ms-delay reproduction passes after the fix.
- **Files modified:** `frontend/src/test-setup.ts`, `frontend/src/features/classes/ClassRow.test.tsx`
- **Verification:** full `npx vitest run` results below
- **Committed in:** `f779880`, `827478a`

**2. [Rule 2 - Missing critical] Accessible name for the modal close button**
- **Found during:** Task 1 (GREEN)
- **Issue:** Mantine's modal close button has no accessible name, so it could not be tested or announced.
- **Fix:** `closeButtonProps` aria-label from the new `editor:shortcuts.close` string (en and ru).
- **Files modified:** `ShortcutsModal.tsx`, both `editor.json`
- **Committed in:** `ad3c140`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** The flake fix is test infrastructure only. The close-button label is a one-string addition. No scope creep.

### Full-suite Vitest runs after the flake fix

| Run | State | Result |
|-----|-------|--------|
| 1-3 (first batch, after `f779880` only) | before `827478a` | pass, pass, FAIL (the swatch race above) |
| 4-6 | after `827478a`, 547 tests | 547/547 x3 |
| 7 | inside `run_full_suite.sh`, 564 tests | 564/564 |
| 8-10 | final tree, 564 tests | 564/564 x3 |

## Issues Encountered

- The WebP-with-EXIF-orientation-3 case remains undetectable by the size check (known from 03-12); it is on the browser checklist.
- Adding a 32 px button to the top bar was not measured at 1024 px in Russian (jsdom has no layout); it is checklist item 11.

## Known Stubs

None.

## Threat Flags

None. T3-13-01 (shortcuts behind modals) is mitigated and covered by the `while the reference is open` test; T3-13-02 accepted (documentation only).

## User Setup Required

None - no external service configuration required.

## End-of-Phase Browser Checklist (for `/gsd-verify-work`, human_verify_mode end-of-phase)

Run after `docker compose up --build`, in Chrome or Edge and one other browser (Firefox; Safari if available):

1. Open an image from the grid, draw several boxes of one class in a row, switch class with 1-9, select, move and resize with the real Transformer handles at 100% and 400% zoom (anchors keep their screen size), delete one, undo/redo through create/move/resize/class change/delete, reload and confirm everything is still there (SC2, SC3).
2. Start a drag and release the mouse outside the browser window: the box is still created and clipped.
3. Windows on the Russian layout: V, B, 1-9, Delete, Ctrl+Z, Ctrl+Shift+Z, A/D, N, R, G, F, Ctrl+S and `?` (SC4; `?` is Shift+7 there, so also click the top bar `?` button).
4. Pan with Space+drag and with the middle button: no autoscroll cursor on Windows (A2).
5. Upload a JPEG and a WebP with EXIF orientation 6: JPEG boxes land on the right pixels, the WebP shows the orientation-mismatch banner (orientation-3 WebP is undetectable; note what you see).
6. Open an 8000x6000 image: pan, zoom and draw stay responsive.
7. A 100-character class name truncates with an ellipsis in the class panel and in the object-row Select, en and ru.
8. Same image in two tabs: edit in A, then in B; tab B shows the conflict banner and Reload shows A's work.
9. `docker compose stop api` while editing: indicator "Not saved" and retries; `docker compose start api`: back to "Saved"; with api stopped, closing the tab asks first.
10. Grid after editing: tile badges, box counts, "Annotated: N of M", "Annotate next" match; delete a class with boxes and read "Objects that will be deleted with it: N."
11. 1024 px wide window in Russian: the top bar fits without wrapping or clipping (new `?` button added by this plan).
12. From another machine on the LAN (`http://192.168.x.x` with the P2 opt-in) draw a box: it saves.
13. Shortcut reference specifics: open it with `?` and the button; under 720 px window height the body scrolls; Russian labels wrap inside the 40 px rows without pushing the caps out; while it is open D and Delete do nothing; Esc closes it.

Other visual items carried from plans 03-01..03-12 (human_judgment in their summaries): fit-to-window margin and matte color; halo and label chip legibility on light and dark images; tool bar divider and tooltip placement; the 2px accent ring, #2E2E2E selected row and 30% fill; stepping through images feels instant; top bar wrapping at 1280 and 1440 px; thumbnail chip and box-count pill placement on bright images; title row and summary line at narrow widths; conflict banner, orientation banner and retry indicator in both locales.

## Next Phase Readiness

- Phase 3 is complete on the automated side: all 13 plans have summaries, the full suite is green, ANNO-08 is closed. Remaining work for the phase is the browser checklist above and `/gsd-verify-work`.
- Forward note for Phase 4 export: only images marked as background are "no objects"; unannotated images must not be exported as empty-label negatives (documented in both READMEs).

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: frontend/src/features/editor/ShortcutsModal.tsx, ShortcutsModal.test.tsx
- FOUND commits: f779880, 827478a, d357bb6, ad3c140, 6224f72
- Acceptance greps: SHORTCUTS and POINTER_GESTURES in ShortcutsModal.tsx (3 each), `"shift+slash"` x1, `shortcutsAria` in ru x1, `## Annotating images` x1, `## Разметка изображений` x1, `background` in README.md x1
- `bash scripts/run_full_suite.sh` ended with `ALL CHECKS OK`
