---
phase: 04-train-download
plan: 02
subsystem: ui
tags: [react, mantine, react-query, polling, fastapi, i18n, vitest]

requires:
  - phase: 04-train-download
    provides: "Plan 04-01 run/model API, worker heartbeat, RunSummary/RunRead schemas, official-model catalog"
provides:
  - "Training section in the project sidebar with routes training, training/new and training/:runId"
  - "Run list page, run status page and start form, all polling every 3 s while a run is active"
  - "GET /api/projects/{id}/training/options and the GPU check on run creation"
  - "quality_level key and computed RunSummary.quality"
  - "api/training.ts hooks and types, test/trainingApi.ts stub helper"
affects: [04-03, 04-04, 04-05, 04-06, 04-07, 04-08, 04-09, 04-10, 04-11, phase-05]

actuals:
  tokens: 27000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Polling through react-query refetchInterval that returns false once no run is preparing/queued/running (and on a 404)"
    - "Whole-row link via a stretched ::after overlay on the name link, with the download anchor raised above it (no nested anchors)"
    - "Strict fetch stub (stubTrainingApi) that throws Unexpected request, with lazy runs/run/options so a poll can see new data"
    - "Language-neutral verdict key from the API (quality_level), translated in the UI"

key-files:
  created:
    - backend/src/yolo_trainer_api/training/options.py
    - backend/tests/test_training_options.py
    - frontend/src/api/training.ts
    - frontend/src/features/training/TrainingPage.tsx
    - frontend/src/features/training/TrainingPage.module.css
    - frontend/src/features/training/RunStatusBadge.tsx
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/RunMetrics.tsx
    - frontend/src/features/training/NewRunPage.tsx
    - frontend/src/features/training/TrainingPage.test.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/features/training/NewRunPage.test.tsx
    - frontend/src/test/trainingApi.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json
  modified:
    - backend/src/yolo_trainer_api/routers/runs.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_common/quality.py
    - backend/tests/test_quality.py
    - frontend/src/app/routes.tsx
    - frontend/src/features/project/ProjectLayout.tsx
    - frontend/src/features/project/ProjectOverviewPage.test.tsx
    - frontend/src/i18n/locales/en/project.json
    - frontend/src/i18n/locales/ru/project.json

key-decisions:
  - "Back and cancel links, and the post-create navigation, use the absolute path /projects/:id/training[/:runId]; route-relative '..' from the training/:runId route resolves to the project root"
  - "The run page progress bar is Progress.Root + Progress.Section(withAria=false) with its own role=progressbar, aria-valuenow=epoch and aria-valuemax=epochs, because the Mantine shorthand fixes aria-valuemax at 100"
  - "model.usage is an i18n string with a <code> tag rendered through Trans, so the YOLO(\"file\") snippet can be a Code element in both languages"
  - "useTrainingOptions uses staleTime 0 and gcTime 0 so every visit reads a fresh worker heartbeat and run name"
  - "Failed, interrupted and cancelled runs get only the header badge and the live-region announcement here; their cards belong to Plan 04-07"

patterns-established:
  - "Training pages read the project from the ProjectLayout outlet context and build absolute links from project.id"
  - "Numeric form inputs use clampBehavior none so an out-of-range value stays visible and is reported by validation instead of being silently clamped"

requirements-completed: [TRAN-01, TRAN-04, MODL-01, MODL-04]

coverage:
  - id: D1
    description: "Training section: sidebar entry, run list newest first with status badge, base model, age, mAP50 and a download anchor on completed runs; empty, loading and error states; 3 s polling only while a run is active"
    requirement: TRAN-04
    verification:
      - kind: unit
        ref: "frontend/src/features/training/TrainingPage.test.tsx (12 tests)"
        status: pass
    human_judgment: true
    rationale: "Row geometry, hover and focus ring, truncation of 100-character names and the en/ru badge fit in 128 px are the UI-SPEC visual backstop; jsdom does not render CSS"
  - id: D2
    description: "Run page: preparing, queued and running cards with epoch capped at epochs, ticking elapsed time, progress bar and latest mAP50; completed card with four metric tiles, mAP50 verdict, model file line, usage hint and a plain download anchor; polite status live region; Run not found view"
    requirement: MODL-04
    verification:
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx (19 tests)"
        status: pass
      - kind: unit
        ref: "backend/tests/test_quality.py#TestQualityLevel, TestRunSummaryQuality"
        status: pass
    human_judgment: true
    rationale: "Tile layout, spacing and the visual hierarchy of the status card are specified in the UI-SPEC but not asserted by any test"
  - id: D3
    description: "Start form pre-filled with the standard defaults, validated on blur and submit, device choice from the worker heartbeat, submit lock, 409 under the name, alert for other errors, redirect to the new run's page"
    requirement: TRAN-01
    verification:
      - kind: unit
        ref: "frontend/src/features/training/NewRunPage.test.tsx (19 tests)"
        status: pass
    human_judgment: true
    rationale: "Select dropdown positioning and the visual order of label, input, hint and error cannot be checked in jsdom (the popover stays display: none)"
  - id: D4
    description: "GET /api/projects/{id}/training/options returns the official models, defaults, next run name and the GPU list from a fresh heartbeat; POST runs refuses device 0 with 422 No GPU is available. without a fresh CUDA heartbeat"
    requirement: MODL-01
    verification:
      - kind: unit
        ref: "backend/tests/test_training_options.py (11 tests)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-10-10
status: complete
commits: 6
plan_head_before: 7133fedfa83ea578cfd3085009a8c922b6719bac
plan_head_after: a33ba7550deb8de6cd77febbb112e65d6f467dd0
---

# Phase 4 Plan 02: Training UI Summary

**A Training section with a polling run list, a run page that shows live epoch progress and a plain `.pt` download anchor, and a pre-filled start form backed by a new options endpoint and a heartbeat-based GPU check.**

## Performance

- **Duration:** about 35 min
- **Started:** 2026-10-10T09:25Z (approximate; the start time was not recorded at launch)
- **Completed:** 2026-10-10T09:59Z
- **Tasks:** 3 (each RED then GREEN)
- **Files modified:** 24 (15 created, 9 modified)

## Accomplishments

- A user opens Training in a project, sees the runs newest first with live status and a one-click download for finished models, and the list stops polling when nothing is active.
- A run page follows one run: preparing text, queue position, "Epoch X of Y" (never above Y), elapsed time ticking every second, latest mAP50, then four metric tiles, the mAP50 verdict, the model file line, the `YOLO("<file>")` hint and a `Download .pt` anchor with the `download` attribute.
- The start form opens with `run-<n>`, `yolo26n` (`yolo26n-seg` for segment projects), 100 epochs, image size 640, batch Auto and Device Automatic, validates on blur and submit, and lands on the new run's page on a 201.
- The server refuses `device: "0"` unless a fresh worker heartbeat reports CUDA, so a GPU choice cannot be forged from the client.
- Full suites are green: 444 backend tests, 615 frontend tests, ruff check and format, `tsc` and `vite build`.

## Task Commits

1. **Task 1: See the project's runs in a Training section** - RED `38f3b54` (test), GREEN `a5eb1ed` (feat)
2. **Task 2: Watch one run and download its model from the run page** - RED `2a9ed84` (test), GREEN `1f7d353` (feat)
3. **Task 3: Start a run from the browser with the standard settings form** - RED `de530f7` (test), GREEN `a33ba75` (feat)

**Plan metadata:** the `docs(04-02)` commit that adds this SUMMARY follows.

## TDD Gate Compliance

Every task has a `test(04-02)` commit followed by a `feat(04-02)` commit. The `gsd_run check tdd-red-evidence` classifier was not run (`workflow.tdd_mode` is not enabled for this plan); the RED evidence was inspected by hand:

- **Task 1 RED:** 12 of 12 tests failed on assertions (the Training route did not exist, so the pages rendered "Page not found" and the planned elements were missing). The test file imports only `AppRoutes` and the stub helper, so no import or syntax error could mask the result.
- **Task 2 RED:** 3 backend tests failed (an `ImportError` raised inside the test for `quality_level`, and a `KeyError: 'quality'` on the serialized summary); 19 of 19 frontend tests failed on assertions for the same missing-route reason.
- **Task 3 RED:** 8 of 11 backend tests failed on assertions (404 from the missing options route, then a 201 where 422 was expected). The 3 that passed (unknown project 404, GPU run starting, CPU run) describe behavior that was already true. The frontend tests were committed without a separate run: the route did not exist, so every test would have failed at the form lookup.

## Files Created/Modified

See the frontmatter `key-files` lists. Highlights:

- `frontend/src/api/training.ts` - types, `trainingKeys`, polling `useRuns`/`useRun`, `useTrainingOptions`, `useCreateRun`, `modelDownloadUrl`
- `frontend/src/features/training/TrainingPage.tsx` and `TrainingPage.module.css` - run list with the stretched-link row
- `frontend/src/features/training/RunPage.tsx` and `RunMetrics.tsx` - status cards, ticking elapsed time, live region, metric tiles
- `frontend/src/features/training/NewRunPage.tsx` - start form
- `backend/src/yolo_trainer_api/training/options.py` - `build_options`, `devices_from_heartbeat`, `ensure_device_available`
- `frontend/src/test/trainingApi.ts` - `stubTrainingApi`, `makeRun`, `makeOptions`, `makeProject`

## Decisions Made

See `key-decisions` in the frontmatter. All follow the plan except where listed under Deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan defect] Back links and post-create navigation use absolute paths**
- **Found during:** Task 2 (header back button and not-found button)
- **Issue:** The plan says `Button component={Link} to=".."` and `navigate("../${id}")`. React Router resolves `..` relative to the route hierarchy by default, so from the `training/:runId` route it goes to `/projects/:id`, not to the training list, and from `training/new` the navigation would land on `/projects/:id/12`.
- **Fix:** Build `/projects/${project.id}/training` from the outlet context and navigate to `${listPath}/${created.id}`. The tests assert the resulting hrefs.
- **Files modified:** frontend/src/features/training/RunPage.tsx, NewRunPage.tsx
- **Committed in:** 1f7d353, a33ba75

**2. [Rule 3 - Blocking] An existing test pinned Training as an unbuilt section**
- **Found during:** Task 3 (full frontend run)
- **Issue:** `ProjectOverviewPage.test.tsx` asserted that no sidebar link matched `/training|models/i`; adding the Training link made it fail.
- **Fix:** The test now expects the Training link and only keeps the "no Models link" check.
- **Files modified:** frontend/src/features/project/ProjectOverviewPage.test.tsx (outside the plan's `files_modified`)
- **Verification:** `npm --prefix frontend run test -- --run` -> 615 passed
- **Committed in:** a33ba75

**3. [Rule 3 - Blocking] Row hover, focus ring and the stretched link need a stylesheet**
- **Found during:** Task 1
- **Issue:** The `::after` overlay, `:hover` and `:focus-visible` states cannot be expressed with Mantine style props.
- **Fix:** Added `TrainingPage.module.css` (same approach as `ImageTile.module.css`). It is not in the plan's `files_modified`.
- **Committed in:** a5eb1ed

**4. [Rule 1 - Bug] Mantine `Progress` shorthand cannot report epochs as the maximum**
- **Found during:** Task 2
- **Issue:** The shorthand puts `role="progressbar"` on the section with a fixed `aria-valuemax=100` and the percentage as `aria-valuenow`, which contradicts the plan's `aria-valuenow`/`aria-valuemax` of epoch/epochs for runs that are not 100 epochs long.
- **Fix:** `Progress.Root` carries the ARIA attributes (epoch, epochs, `aria-live="off"`) and the section is rendered with `withAria={false}`.
- **Committed in:** 1f7d353

**5. [Rule 3 - Blocking] Usage hint needs a node inside a translated sentence**
- **Found during:** Task 2
- **Issue:** `t()` cannot interpolate a React `Code` element into `Load it in Python with {{code}}.`
- **Fix:** The strings carry `<code>{{code}}</code>` and the page renders them with `Trans`. The visible text is the UI-SPEC copy in both languages.
- **Committed in:** 1f7d353

---

**Total deviations:** 5 auto-fixed (2 Rule 1, 3 Rule 3)
**Impact on plan:** All needed for correct behavior or to keep the suite green. No scope creep; no architecture change.

## Authentication Gates

None.

## Issues Encountered

- The worktree has no `.venv` or `frontend/node_modules` (both untracked). `uv sync --offline` and `npm ci --prefer-offline` rebuilt them from the lockfiles with no network and no tracked file changes.
- In jsdom the open Mantine `Select` popover stays `display: none` (no layout, so no computed position). The form tests query and click the options as hidden elements, scoped by the listbox's accessible name.
- The NewRunPage options-failure test initially rendered the app once before stubbing `fetch`; it was removed in the same task.

## Known Stubs

None. Intentionally deferred to later plans (not stubs): dataset summary, blockers and warnings, trained-model bases and the stale-worker line in the form (Plan 04-08); failed, interrupted and cancelled status cards, the settings card and remove-from-queue (Plans 04-05 and 04-07); the global active-run indicator.

## Threat Flags

None. The only new server surface is `GET /api/projects/{id}/training/options`, which sits in the plan's trust boundaries (T4-02-02 to T4-02-05). Mitigations in place: React text rendering only (no `dangerouslySetInnerHTML` anywhere under `features/training`), the client sends `{kind: "official", name}` only while the server keeps its allow-list, client bounds mirror the server's `RunCreate` bounds, and `apiRequest` plus `require_xhr` still guard the POST.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Contracts named in the plan's interfaces block exist unchanged (`TrainingOptions`, `RunSummary.quality`, `quality_level`, the `api/training.ts` symbols, `stubTrainingApi`, `makeRun`, `makeOptions`), so Plans 04-03 onward can build on them.
- The three UI deliverables are marked `human_judgment: true` because their visual contract (spacing, hover and focus states, popover layout) was never rendered in a real browser.
- GPU selection is verified only through heartbeat fixtures; the GPU path still needs hardware (no NVIDIA GPU on the dev machine).

---
*Phase: 04-train-download*
*Completed: 2026-10-10*

## Self-Check: PASSED

- All 15 created files exist on disk (14 checked by `ls`, `TrainingPage.module.css` seen in the diff list).
- All six task commits (`38f3b54`, `a5eb1ed`, `2a9ed84`, `1f7d353`, `de530f7`, `a33ba75`) appear in `git log` on this branch; `git rev-list --count` from `plan_head_before` is 6.
- Acceptance greps of all three tasks pass; `npm --prefix frontend run build`, the full Vitest run (615), the full pytest run (444) and ruff check and format are clean.
