---
phase: 04-train-download
plan: 06
subsystem: dataset-splits
tags: [fastapi, pydantic, sqlite, react, mantine, tanstack-query, i18n]

requires:
  - phase: 04-train-download
    provides: "images.split column, manual split route, status counts with splits (04-01, 04-03); trainingKeys.options (04-02)"
provides:
  - "Pure deterministic auto_split / split_counts (yolo_trainer_api.splits)"
  - "POST /api/projects/{id}/splits/auto/preview and POST /api/projects/{id}/splits/auto with a 409 drift guard"
  - "AutoSplitDialog (shared by the Images page and the New training form of 04-08) and the Split dataset opener"
affects: [04-08 New training form, 04-10, 04-11]

actuals:
  tokens: 17000
  tasks: 2
  commits: 4
plan_head_before: c3f46925865ba87f03d9fa6c14046ef3e191c41d
plan_head_after: 237d2be666db31c867dd4804323df8291ee3f7fc

tech-stack:
  added: []
  patterns:
    - "Preview/apply with a reproducible seed and an expected count instead of a server-side token"
    - "Guarded bulk UPDATE (split IS NULL), chunked at 500 ids, rowcount must equal the ids read, else rollback and 409"
    - "Dialog body mounted only while open, so state resets on every opening"

key-files:
  created:
    - backend/src/yolo_trainer_api/splits.py
    - backend/tests/test_splits_auto.py
    - frontend/src/features/images/AutoSplitDialog.tsx
    - frontend/src/features/images/AutoSplitDialog.test.tsx
  modified:
    - backend/src/yolo_trainer_api/routers/splits.py
    - backend/src/yolo_trainer_api/schemas.py
    - frontend/src/api/splits.ts
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json

key-decisions:
  - "Split dataset opener uses data-disabled + aria-disabled instead of the disabled attribute, so its tooltip still shows on hover and keyboard focus"
  - "Because ratio counts depend only on the number of unassigned images, apply compares expected_unassigned to the current count; a same-size but different set is accepted and still yields the previewed counts"
  - "Preview panel renders only for valid ratios (min height kept) and Apply requires the live ratios to equal the settled, previewed ones"

patterns-established:
  - "Mutation takes the preview's seed and unassigned_total, so the applied split is exactly the one shown"

requirements-completed: [DATA-05]

coverage:
  - id: D1
    description: "Seeded, order-independent ratio allocation of unassigned images with Valid/Test minimums and Train never empty"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "backend/tests/test_splits_auto.py#test_the_split_sizes_follow_the_rounding_rules"
        status: pass
    human_judgment: false
  - id: D2
    description: "Preview writes nothing; apply writes exactly the previewed counts to unassigned images only, or answers 409 and writes nothing"
    requirement: DATA-05
    verification:
      - kind: integration
        ref: "backend/tests/test_splits_auto.py#test_apply_writes_exactly_the_previewed_counts_to_the_unassigned_images_only"
        status: pass
      - kind: integration
        ref: "backend/tests/test_splits_auto.py#test_a_row_taken_between_the_read_and_the_write_rolls_the_whole_apply_back"
        status: pass
    human_judgment: false
  - id: D3
    description: "Split dataset dialog: ratio inputs, live total, debounced counts preview, confirmed apply, 409 handling, en and ru"
    requirement: DATA-05
    verification:
      - kind: automated_ui
        ref: "frontend/src/features/images/AutoSplitDialog.test.tsx"
        status: pass
    human_judgment: true
    rationale: "Layout, spacing and the feel of the debounced preview in a real browser are not asserted by jsdom tests"

duration: 60min
completed: 2026-10-10
status: complete
---

# Phase 4 Plan 06: Auto-split Summary

**Seeded ratio auto-split of unassigned images with a preview and a drift-guarded apply (409 unless the previewed set still holds), plus the Split dataset dialog on the Images page**

## Performance

- **Duration:** about 60 min
- **Tasks:** 2 (both TDD)
- **Files modified:** 10

## Accomplishments

- Pure `auto_split` / `split_counts`: ids sorted then shuffled with a seeded generator, Test and Valid rounded half up, Valid at least 1 when n >= 2, Test at least 1 when its ratio is above 0 and n >= 4, Train always keeps one (Test shrinks first, then Valid). Same ids, ratios and seed always give the same mapping, whatever the input order.
- Preview route returns `{seed, unassigned_total, counts}` and writes nothing (server picks the seed when absent; seed 0 is respected). Apply route recomputes with the previewed seed, checks `expected_unassigned`, writes with `split IS NULL`-guarded UPDATEs in 500-id chunks, and rolls back with 409 if the written rows differ from the ids read. Only the `split` column is written; `annotation_version` and review flags are untouched.
- `AutoSplitDialog`: 80/10/10 integer inputs, live total with the two validation messages, preview after a 300 ms debounce (two skeleton lines while loading), Apply disabled unless the live ratios equal the previewed ones, red alert for 409 and other errors (409 also refetches the preview), green notification on success; grid, status counts, image details and training options are invalidated.
- "Split dataset" sits between "Annotate next" and the upload buttons when the project has images; it is disabled with the tooltip when no image is unassigned.

## Task Commits

1. **Task 1 (RED)** - `188c524` (test): failing tests for preview/apply and the pure allocation
2. **Task 1 (GREEN)** - `5ed098a` (feat): splits.py, schemas, routes
3. **Task 2 (RED)** - `447d8b1` (test): failing dialog tests
4. **Task 2 (GREEN)** - `237d2be` (feat): dialog, API hooks, opener, i18n (also fixes the test helper that matched list requests by URL suffix and missed the query string)

No REFACTOR commit was needed.

## Deviations from Plan

None - plan executed exactly as written. Two small choices inside the plan's freedom: the opener uses `data-disabled`/`aria-disabled` rather than `disabled` (tooltip must show), and a test helper was corrected in the GREEN commit (it counted list requests by URL suffix, which never matched because the list URL carries a query string).

## Issues Encountered

- `npx prettier` was invoked once by mistake and fetched a package from the registry; it was only used for a version check and nothing from it touched the repo. No formatter is configured in the frontend, so formatting was kept by hand.
- Tests run in the worktree used the main checkout's `.venv` (with `PYTHONPATH` pointing at the worktree sources) and a `frontend/node_modules` junction (gitignored).

## Verification

- `pytest backend/tests` : 559 passed (incl. 44 new in test_splits_auto.py); `ruff check` and `ruff format --check` clean.
- Frontend: `tsc --noEmit` clean, `vite build` succeeds, full Vitest run 58 files / 665 tests passed (17 new in AutoSplitDialog.test.tsx).
- Acceptance greps: `random.Random` 1, `def auto_split` 1, `splits/auto/preview` 1, `expected_unassigned` >= 1, `Review the split again.` 1, `useDebouncedValue` >= 1, `AutoSplitDialog` in ImagesPage >= 1, ru `openDisabled` 1.

## Known Stubs

None.

## Threat Flags

None - the new routes are the ones in the plan's threat model (T4-06-01..04): drift guard + `split IS NULL`, project-scoped selects/updates, 500-id chunks, `require_xhr` with 403 tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`AutoSplitDialog({ projectId, opened, onClose, onApplied? })` and `useAutoSplitPreview` / `useApplyAutoSplit` are ready for the New training form (04-08). STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched (orchestrator-owned in this wave).

## Self-Check: PASSED

All created files exist and commits `188c524`, `5ed098a`, `447d8b1`, `237d2be` are ancestors of HEAD.

---
*Phase: 04-train-download*
*Completed: 2026-10-10*
