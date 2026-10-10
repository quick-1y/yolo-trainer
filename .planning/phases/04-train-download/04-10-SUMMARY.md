---
phase: 04-train-download
plan: 10
subsystem: training-ui
tags: [fastapi, react, react-query, mantine, react-router, i18n, polling]

requires:
  - phase: 04-train-download
    provides: "TrainingRun/Project models, routers/runs.py, api/training.ts (trainingKeys, RUN_POLL_INTERVAL_MS), run page, stubTrainingApi, EditorTopBar with SplitMenu and WIDE_QUERY, useEditorNavigation goTo flush"
provides:
  - "GET /api/training/active (schema ActiveRun): the single running run with project and run names, or null"
  - "useActiveRun / activeRunPath / trainingKeys.active in api/training.ts"
  - "ActiveRunIndicator (variants header and editor) in the app header and the editor top bar"
  - "Training sidebar link Loader while a run of that project is training"
  - "renderWithProviders option pollActiveRun, stubTrainingApi / stubEditorApi option activeRun"
affects: [04-11, verify-work, phase-04-uat]

actuals:
  tokens: 45000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "One shared React Query poller (3 s) for an app-wide status, with staleTime half the interval so a second observer mounting right after the first reuses its answer"
    - "Test harness opts a global poller out by default through queryClient.setQueryDefaults(key, { enabled: false }), so strict fetch stubs of existing route tests keep working"
    - "Editor links: plain primary click preventDefault + goTo (save flush), modified clicks fall through to the browser"

key-files:
  created:
    - backend/tests/test_training_active.py
    - frontend/src/features/training/ActiveRunIndicator.tsx
    - frontend/src/features/training/ActiveRunIndicator.test.tsx
  modified:
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/routers/runs.py
    - frontend/src/api/training.ts
    - frontend/src/app/AppLayout.tsx
    - frontend/src/features/editor/EditorTopBar.tsx
    - frontend/src/features/editor/useEditorNavigation.ts
    - frontend/src/features/project/ProjectLayout.tsx
    - frontend/src/test/render.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/test/editorApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json
    - frontend/src/i18n/locales/en/project.json
    - frontend/src/i18n/locales/ru/project.json

key-decisions:
  - "useActiveRun sets staleTime to half the poll interval (1.5 s): the header and the project sidebar both observe the query, and without it the sidebar mounting after the project loads triggered a second request at once (the spec says one request per page)"
  - "ActiveRun.started_at is nullable and serialized with the UTC Z serializer like the other run schemas"
  - "The editor form is a plain <a href> with its own onClick (not a router Link), so a plain click can be routed through the editor's goTo save flush while the browser keeps handling Ctrl/Cmd/Shift/Alt/middle clicks"
  - "WIDE_QUERY (1440 px) is repeated inside ActiveRunIndicator instead of imported from EditorTopBar, which would be a circular import"

patterns-established:
  - "App-wide status polling is opt-in in tests (pollActiveRun) and a stub option (activeRun) answers it"

requirements-completed: [TRAN-04]

coverage:
  - id: D1
    description: "GET /api/training/active returns the running run with project name, run name, epoch and epochs, or null when nothing is running (queued and completed runs are ignored)"
    requirement: TRAN-04
    verification:
      - kind: integration
        ref: "backend/tests/test_training_active.py"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every page under the app header shows 'Training: <project> / <run>, epoch N/M' (or 'starting') as a pill linking to the run page; polls every 3 s through one query; renders nothing without a running run or after a failed poll"
    requirement: TRAN-04
    verification:
      - kind: unit
        ref: "frontend/src/features/training/ActiveRunIndicator.test.tsx#ActiveRunIndicator in the app header"
        status: pass
    human_judgment: true
    rationale: "Pill look (32 px dark-6, 420 px truncation, spacing next to the language switcher) is not asserted by tests"
  - id: D3
    description: "The Training sidebar link shows a 16 px Loader (aria-label 'Training in progress') only while a run of that project is running"
    requirement: TRAN-04
    verification:
      - kind: unit
        ref: "frontend/src/features/training/ActiveRunIndicator.test.tsx#Training link in the project sidebar"
        status: pass
    human_judgment: false
  - id: D4
    description: "The full-screen editor shows a fixed 72 px (wide) or 32 px (narrow) indicator right after the spacer; a plain click saves through goTo first (leave dialog on failure), modified clicks go to the browser"
    requirement: TRAN-04
    verification:
      - kind: unit
        ref: "frontend/src/features/training/ActiveRunIndicator.test.tsx#ActiveRunIndicator in the editor top bar"
        status: pass
    human_judgment: false
  - id: D5
    description: "At 1024 px in ru every fixed top bar item fits and only the filename shrinks (down to 120 px); checked at 1024 and 1440 px in en and ru"
    requirement: TRAN-04
    verification: []
    human_judgment: true
    rationale: "Backstop row of the plan: pixel fit of the whole editor top bar cannot be asserted in jsdom, needs a held-out visual check"

duration: 40min
completed: 2026-10-10
status: complete
plan_head_before: 642e682006f98468f347736e3e46bc0c692dc24a
plan_head_after: 0f28b96b212a7b177d974b456850868591baaea0
---

# Phase 4 Plan 10: Active run indicator Summary

**GET /api/training/active plus a single 3 s React Query poller drives a header pill, a compact editor top bar control (save flush on click) and a sidebar Training loader, so a running training is visible and one click away on every page.**

## Performance

- **Duration:** about 40 min
- **Started:** 2026-10-10T19:43Z
- **Completed:** 2026-10-10T20:25Z
- **Tasks:** 2 (both TDD: RED test commit, GREEN feature commit)
- **Files modified:** 17 (3 created, 14 modified)

## Accomplishments

- Backend `GET /api/training/active`: the run in status `running` joined to its project name, `null` otherwise; four integration tests.
- Frontend `useActiveRun` (one shared query, 3 s refetch, no `enabled`) and `ActiveRunIndicator`: header pill (32 px, dark-6, up to 420 px with ellipsis and the full text in `title`), editor compact form (72 px with loader and `12/100` from 1440 px, 32 px icon below, tooltip and aria-label with the full text).
- Editor click behavior: a plain left click calls `navigation.goTo(path, "training")` (save flush, leave dialog on failure); Ctrl/Cmd/Shift/Alt/middle clicks are left to the browser. Tests cover both a successful flush and a failing one.
- Sidebar Training `NavLink` gets a 16 px Loader (`Training in progress` / `Идёт обучение`) while a run of that project is training.
- `renderWithProviders` switches the poller off by default (`setQueryDefaults(trainingKeys.active(), { enabled: false })`), so all existing route tests with strict or one-shot stubs stay green without per-file changes (731 frontend tests pass).

## Task Commits

1. **Task 1: Know which run is training right now, from any page**
   - RED `f4cf70f` (test): endpoint tests, header and sidebar tests; stub option `activeRun`
   - GREEN `0109cd9` (feat): endpoint, schema, `useActiveRun`, header indicator, sidebar loader, i18n, harness opt-in
2. **Task 2: See the running training from the full-screen editor and jump to it without losing work**
   - RED `4d29481` (test): editor-form tests; `stubEditorApi` option `activeRun`
   - GREEN `0f28b96` (feat): editor variant, `NavControl` value `"training"`, `EditorTopBar` placement

**Plan metadata:** docs commit with this SUMMARY follows (STATE.md and ROADMAP.md are left to the orchestrator).

## Files Created/Modified

- `backend/src/yolo_trainer_api/schemas.py` - `ActiveRun` schema with UTC "Z" serializer
- `backend/src/yolo_trainer_api/routers/runs.py` - `GET /training/active`
- `backend/tests/test_training_active.py` - endpoint tests (none, queued/completed only, running, running before the first epoch)
- `frontend/src/api/training.ts` - `ActiveRun`, `trainingKeys.active`, `useActiveRun`, `activeRunPath`
- `frontend/src/features/training/ActiveRunIndicator.tsx` - header and editor forms
- `frontend/src/features/training/ActiveRunIndicator.test.tsx` - header, sidebar and editor tests
- `frontend/src/app/AppLayout.tsx` - header `Group gap={16}`: indicator then language switcher
- `frontend/src/features/editor/EditorTopBar.tsx`, `useEditorNavigation.ts` - indicator after the spacer; `"training"` control
- `frontend/src/features/project/ProjectLayout.tsx` - sidebar Training loader
- `frontend/src/test/render.tsx`, `trainingApi.ts`, `editorApi.ts` - `pollActiveRun`, `activeRun` options
- `frontend/src/i18n/locales/{en,ru}/{training,project}.json` - `indicator.full|starting|short`, `nav.trainingRunning`

## Decisions Made

See `key-decisions` above. The notable one is `staleTime: 1.5 s` on the active-run query to keep a single request per page while two components observe it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate request when the sidebar mounted after the header**
- **Found during:** Task 1 (3 s poll test)
- **Issue:** The header observer fetched first; the sidebar observer mounting after the project loaded saw stale data and refetched at once, so there were two requests on first render instead of one shared one
- **Fix:** `staleTime: RUN_POLL_INTERVAL_MS / 2` on `useActiveRun`
- **Files modified:** `frontend/src/api/training.ts`
- **Verification:** `ActiveRunIndicator.test.tsx` "asks again every 3 seconds through one shared query" (1 request, then 2 after 3 s)
- **Committed in:** `0109cd9`

**2. [Test expectation] Backend test assumed `epochs` is null before the first epoch**
- **Found during:** Task 1 GREEN run
- **Issue:** `epochs` is set when the run is created (from its settings); only `epoch` is null until the first epoch. The frontend already keys "starting" on `epoch === null`, so no product change
- **Fix:** the test now expects the run's configured `epochs`
- **Files modified:** `backend/tests/test_training_active.py`
- **Committed in:** `0109cd9`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 test expectation)
**Impact on plan:** No scope creep.

## TDD Gate Compliance

Both tasks followed RED then GREEN (`test(04-10)` `f4cf70f` and `4d29481` precede `feat(04-10)` `0109cd9` and `0f28b96`). RED evidence: the backend test failed with 404 on the missing route; the frontend tests failed because the link was not rendered (Task 1: 8 of 9 failed, the ninth is the default-off regression guard that is green by design; Task 2: 11 of 20 failed). For Task 2 the implementation was drafted before the tests, so its files were set aside (copied out, reverted to HEAD) to prove RED, committed as tests, then restored. No REFACTOR commit was needed.

## Issues Encountered

- `ruff format` reformatted one long test signature; no other issues.
- `gsd_run`, the per-plan commit ledger file and the `.git` file write were not available in the worktree sandbox, so `commits:` was measured directly as `git rev-list --count 642e682..HEAD` (4 production commits) with the spawn base `642e682`.

## Known Stubs

None.

## Threat Flags

None. Names are rendered as React text (T4-10-01); plain editor clicks go through `goTo` with a failing-flush test (T4-10-03); the endpoint exposes only names and epoch (T4-10-04, accepted).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The indicator is wired everywhere the plan listed. One backstop item remains for a human: at 1024 px in ru (and 1440 px in en and ru) confirm the editor top bar fits every fixed item and only the filename shrinks to its 120 px minimum.

## Self-Check: PASSED

- `backend/tests/test_training_active.py`, `frontend/src/features/training/ActiveRunIndicator.tsx`, `frontend/src/features/training/ActiveRunIndicator.test.tsx` exist.
- Commits `f4cf70f`, `0109cd9`, `4d29481`, `0f28b96` are ancestors of HEAD.
- `uv run pytest backend/tests` 643 passed; `ruff check` and `ruff format --check` clean; `npm run build` ok; `npm run test -- --run` 731 passed.

---
*Phase: 04-train-download*
*Completed: 2026-10-10*
