---
phase: 05-live-training-monitoring-control
plan: 02
subsystem: training
tags: [recharts, react, sse, eventsource, tanstack-query, i18n, vitest]
requires:
  - phase: 05-live-training-monitoring-control
    provides: "05-01 SSE stream, useRunStream, foldProgress tracer, RunCharts mAP panel, FakeEventSource"
provides:
  - "foldProgress: loss components discovered from events, per-split loss sums, resume boundaries, final metrics, planned epochs, bestEpoch()"
  - "RunCharts: three panels (Loss, mAP, Precision and recall) with legends, tooltip, best-epoch ring, resume lines, skeleton, waiting panel, stream notes"
  - "ChartTooltip: custom Recharts tooltip with the loss component grid"
  - "useRunStream: connection states connecting/open/reconnecting/unavailable/ended plus retry()"
  - "api/training: RUN_SAFETY_POLL_INTERVAL_MS, runPollInterval, useRun({ streamHealthy })"
affects: [05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10]

actuals:
  tokens: 21500
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Loss component keys are never hard-coded: tloss keys and val/ metric keys are discovered, display name strips the val/ prefix and _loss suffix"
    - "Tooltip reads values from the hovered row (payload[0].payload) so a series missing at an epoch still renders a dash row"
    - "jsdom sizes Recharts containers through a getBoundingClientRect spy (test/rechartsSize.ts), because ResponsiveContainer replaces initialDimension with the measured 0x0"

key-files:
  created:
    - frontend/src/features/training/progress/ChartTooltip.tsx
    - frontend/src/features/training/progress/foldProgress.test.ts
    - frontend/src/features/training/progress/RunCharts.test.tsx
    - frontend/src/test/rechartsSize.ts
  modified:
    - frontend/src/features/training/progress/foldProgress.ts
    - frontend/src/features/training/progress/RunCharts.tsx
    - frontend/src/features/training/progress/useRunStream.ts
    - frontend/src/api/training.ts
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "Epoch ticks are computed (five integer ticks from 1 to the planned total) instead of relying on Recharts tickCount, so the X axis always ends at the planned epoch count"
  - "RunPage mirrors the stream health into state (effect) before useRun, because the stream hook needs the run status and the poll interval needs the stream state"
  - "A CONNECTING error at any time reads as reconnecting (not only after data was shown), so a stream that never opens cannot leave skeletons up forever"
  - "A stream that is unavailable with zero rows still shows the yellow note (even for a finished run), so the user can retry"
  - "Resume boundaries are deduplicated by start_epoch (two resumes at the same checkpoint draw one line)"

patterns-established:
  - "Chart section state machine in RunCharts: rows -> panels; else connecting -> skeletons; else running -> waiting panel; else nothing; notes are independent of the body"

requirements-completed: [TRAN-05]

coverage:
  - id: D1
    description: "Run page shows Loss, mAP and Precision and recall charts live and rebuilt from the replay for finished runs, keys discovered from events, X axis spanning the planned epochs"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage history charts"
        status: pass
      - kind: unit
        ref: "frontend/src/features/training/progress/foldProgress.test.ts#foldProgress"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fold rules: last write wins per epoch, train_start truncates rows above start_epoch and records one boundary per resume, final validation never a row, Phase 4 history without v/batch/fitness renders the same charts"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/progress/foldProgress.test.ts#foldProgress"
        status: pass
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage history charts > renders the same charts for a Phase 4 history without v, batch events or fitness"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tooltip with exact three-decimal values, dash for missing series, loss component grid up to 10 rows, best-epoch line; text-only rendering of component names"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/progress/RunCharts.test.tsx#ChartTooltip"
        status: pass
    human_judgment: false
  - id: D4
    description: "Best epoch ring and caption, dotted resume lines in every chart with a Resumed legend item only after a resume, dots for one or two epochs only"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/progress/RunCharts.test.tsx#RunCharts best epoch and resumes"
        status: pass
    human_judgment: false
  - id: D5
    description: "Skeleton until the stream opens, waiting panel, no section for a finished run without epochs, Reconnecting line, yellow unavailable note with Try again that opens a new EventSource, data kept throughout"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage stream states"
        status: pass
      - kind: unit
        ref: "frontend/src/features/training/progress/RunCharts.test.tsx#RunCharts stream states"
        status: pass
    human_judgment: false
  - id: D6
    description: "Polling: 15 s safety poll for a running run with a healthy stream, 3 s while preparing, queued or when the stream is down, none for finished runs"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#runPollInterval"
        status: pass
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage stream states > polls a running run every 15 seconds while the stream is healthy and every 3 seconds when it is down"
        status: pass
    human_judgment: false
  - id: D7
    description: "At 1200px and wider three panels fit the 960 column, below 1200px they stack, in en and ru, with no clipped axis labels or legend; how the Recharts curves, dashes, ring and tooltip actually look in a browser"
    requirement: TRAN-05
    verification: []
    human_judgment: true
    rationale: "jsdom has no layout; the grid breakpoint, label clipping at 1024 and 1280 in en and ru, and the visual quality of the curves are the held-out visual check from the UI-SPEC backstop row"

duration: 25min
completed: 2026-10-11
status: complete
plan_head_before: 9ed4c1f3909355ffa78de6c3c010af7818cf7917
plan_head_after: 79f42d19dba670ffc67d275fa1da60ec39b10c94
commits: 3
---

# Phase 5 Plan 02: Loss, mAP and precision/recall charts Summary

**Three compact Recharts panels (summed loss with a component-breakdown tooltip, mAP with a best-epoch ring, precision/recall) rebuilt from the replayed progress history for every run, with resume lines, honest loading/reconnecting/unavailable states and a 15 s safety poll while the stream is healthy.**

## Performance

- **Duration:** about 25 min
- **Started:** 2026-10-11 (approximate, after 05-01 was merged)
- **Completed:** 2026-10-11T17:05:00Z
- **Tasks:** 2 (the tracer plus one TDD task)
- **Files modified:** 12 (4 created, 8 modified)

## Accomplishments

- A finished run's charts are rebuilt through the same replay-then-end stream path as a live run: `foldProgress` discovers loss components (YOLO26 `l1`, no `dfl`; segment extras) from `tloss` and `val/` keys, sums them per split, keeps the part values for the tooltip, truncates rows above `start_epoch` on `train_start`, never turns the final validation into a row and tolerates Phase 4 files without `v`, batch events or fitness.
- `RunCharts` renders Loss (violet solid, pink dashed), mAP (lime solid, grape dashed) and Precision/recall (indigo solid, pink dashed) from theme tokens only, with an X axis spanning the planned epochs (five integer ticks), dots only for one or two epochs, no animation, a hidden text alternative per panel.
- `ChartTooltip` shows `Epoch N`, one row per series (three decimals, a dash when missing), a Train/Validation grid with one row per loss component and `Best epoch` on the best epoch; the mAP panel carries a hollow ring at the best epoch (fitness, ties later, fallback mAP50-95) and the caption `Best epoch: N (mAP50-95 V)`; every resume draws a dotted line in each chart and a `Resumed` legend item.
- Stream health is visible and cheap: skeletons until `open`, a waiting panel for a running run with no epoch, no section for a finished run without epochs, a `Reconnecting…` line, a yellow `role=status` note with `Try again` (new EventSource, full replay) when the stream is closed for good; the run query polls every 15 s while running with a healthy stream and every 3 s otherwise.

## Task Commits

1. **Task 1: tracer, a finished run shows all three charts rebuilt from its history** - `6c54b36` (feat)
2. **Task 2 RED: failing tests for tooltip, best epoch, resumes and stream states** - `6ccdb17` (test)
3. **Task 2 GREEN: tooltip, best epoch, resume lines and stream state handling** - `79f42d1` (feat)

**Plan metadata:** committed after this file (docs: complete plan). No REFACTOR commit: nothing worth changing after GREEN.

## Tracer gate

Interactive run, `human_verify_mode` default `end-of-phase`, the tracer `<verify>` carries only `<automated>`: the Vitest run (`foldProgress RunPage locales`) and `npm run build` passed on the committed slice (re-run again at the end of the plan, whole suite), so execution continued to the expansion task (`Tracer verified end-to-end - expanding`).

## TDD Gate Compliance (Task 2, `tdd="true"`)

- **RED** (`6ccdb17`): 21 target tests failed on their planned assertions (tooltip texts missing, no skeleton/waiting/notes, no best caption, no reference lines, poll interval 3 s instead of 15 s, `runPollInterval` returning `false`). `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` for the single-file rerun `npx vitest --run --reporter=tap-flat -t runPollInterval src/features/training/RunPage.test.tsx` (target `runPollInterval > is 15 s ...`, `expected false to be 15000`). The first full-file TAP capture was rejected as `invalid_record` (`Non-TAP data in report`) because failing Testing Library messages dump multi-line DOM into the report, so the planned rerun with only the pure target followed the reference's reporter-rerun rule. Semantic assessment: the target executed and failed on the intended assertion against a signature stub, no import/collection/fixture fault. The pass-already tests (dot count, ticks, `Resumed` absence) pin the contract and are not RED evidence.
- **GREEN** (`79f42d1`): the whole frontend suite passes (61 files, 776 tests), `npm run build` ok.
- **REFACTOR:** none.

## Files Created/Modified

- `frontend/src/features/training/progress/foldProgress.ts` - fold with loss discovery, sums, parts, boundaries, final metrics, planned epochs, `bestEpoch`
- `frontend/src/features/training/progress/RunCharts.tsx` - section state machine, three panels, legend, reference dot/lines, notes, `epochTicks`
- `frontend/src/features/training/progress/ChartTooltip.tsx` - custom tooltip content
- `frontend/src/features/training/progress/useRunStream.ts` - reconnecting/unavailable states and `retry`
- `frontend/src/api/training.ts` - `RUN_SAFETY_POLL_INTERVAL_MS`, `runPollInterval`, `useRun` option `streamHealthy`
- `frontend/src/features/training/RunPage.tsx` - stream health mirrored into polling, chart section for every non-preparing/non-queued run
- `frontend/src/features/training/progress/foldProgress.test.ts`, `RunCharts.test.tsx`, `RunPage.test.tsx` - unit and page tests
- `frontend/src/test/rechartsSize.ts` - jsdom sizing helper for Recharts containers
- `frontend/src/i18n/locales/{en,ru}/training.json` - `charts.loss|pr|legend|tooltip|waiting|stream|map.best`

## Decisions Made

- Epoch ticks computed explicitly (`epochTicks`) so the axis always ends at the planned total and stays at five integer ticks even at 1000 epochs.
- `streamHealthy` is mirrored into state by an effect in RunPage: the stream hook needs the run status and the poll interval needs the stream state, and state breaks the cycle (one extra render, no extra request).
- A CONNECTING error is `reconnecting` whenever it happens, so a stream that never manages to open shows a note and the 3 s poll instead of skeletons forever.
- The unavailable note is shown even when there are no rows (finished run, stream cannot be read) so the user can retry; the plan only specified this for runs with data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom collapses Recharts containers to 0x0**
- **Found during:** Task 1 (first page test asserting the X axis)
- **Issue:** `ResponsiveContainer` replaces `initialDimension` with the measured `getBoundingClientRect` (0x0 in jsdom) after its first effect, so no plot, ticks or reference marks rendered in tests; the Plan 05-01 test only looked at the hidden text.
- **Fix:** new test helper `frontend/src/test/rechartsSize.ts` (a `getBoundingClientRect` spy for `.recharts-responsive-container`, restored after each test) used by `RunPage.test.tsx` and `RunCharts.test.tsx`.
- **Files modified:** frontend/src/test/rechartsSize.ts (new, not in the plan's `files_modified`), RunPage.test.tsx, RunCharts.test.tsx
- **Verification:** tick, dot, reference-dot and reference-line assertions run against rendered SVG.
- **Committed in:** 6c54b36

**2. [Rule 3 - Blocking] RED commit carries two signature stubs**
- **Found during:** Task 2 (RED)
- **Issue:** with the tests alone, the test modules fail at import (`ChartTooltip`, `runPollInterval`), which is not a valid RED.
- **Fix:** the RED commit also holds `ChartTooltip` (returns `null`) and `runPollInterval` (returns `false`) stubs; both are replaced in GREEN.
- **Committed in:** 6ccdb17

**Total deviations:** 2 auto-fixed (both Rule 3, no behavior or scope change).
**Impact on plan:** one extra test helper file; otherwise the plan ran as written.

## Issues Encountered

- A full-file TAP capture of the RED run was rejected by the classifier (multi-line DOM dumps in failure messages); the rerun of the pure `runPollInterval` target gave `RED_EVIDENCE_OK`.
- Several chained shell commands were refused by the worktree command guard and were split into plain calls.

## Known Stubs

None. The two RED signature stubs were replaced in the GREEN commit (`grep` for "Signature stub" over the touched sources returns nothing).

## Threat Flags

None. No new network surface: only the existing stream endpoint is consumed; T-05-06 is mitigated (component names are React text, covered by the hostile-name tooltip test) and T-05-07 accepted as planned (3 s polling only while the stream is down).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 05-03..05-10 can read `ProgressState.finalMetrics`, `resumeBoundaries`, `epochs` and the `connection` state; `RunCharts` already keeps its charts for resumed queued runs once the page enables the stream for them (05-06 decides when).
- The grid breakpoint, label clipping at 1024/1280 in en and ru and the look of the curves are still a held-out visual check (D7).
- `train_job` still emits no `train_start`, `batch_progress` or `fitness` (05-03); the charts handle both the old and the new shape.

## Self-Check: PASSED

- Created files exist (ChartTooltip.tsx, foldProgress.test.ts, RunCharts.test.tsx, rechartsSize.ts).
- Commits 6c54b36, 6ccdb17, 79f42d1 are ancestors of HEAD.
- Plan-level verification re-run: `npm run build` ok, frontend suite 61 files / 776 tests passed.
