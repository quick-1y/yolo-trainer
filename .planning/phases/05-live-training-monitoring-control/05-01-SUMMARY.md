---
phase: 05-live-training-monitoring-control
plan: 01
subsystem: training
tags: [sse, fastapi, eventsource, recharts, react-query, nginx, uvicorn]

requires:
  - phase: 04-training-pipeline
    provides: "progress.jsonl written by train_job, ProgressTail, primary_metrics, TrainingRun rows, RunPage, compose smoke test"
provides:
  - "GET /api/projects/{project_id}/runs/{run_id}/stream (SSE: progress/status/end frames, byte-offset ids, Last-Event-ID resume)"
  - "yolo_trainer_common.progress: ProgressTail.read_new_lines, enrich_event, compact_replay, EVENT_TRAIN_START, EVENT_BATCH_PROGRESS, SCHEMA_VERSION=2"
  - "yolo_trainer_api.training.stream: StreamTarget, stream_target, parse_last_event_id, STATUS_COLUMNS, status_payload, read_run_status, progress_frames"
  - "frontend: useRunStream, foldProgress, RunCharts (mAP panel), runStreamUrl, FakeEventSource test helper, recharts 3.10.1"
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10]

actuals:
  tokens: 12500
  tasks: 2
  commits: 4

tech-stack:
  added: [recharts@3.10.1]
  patterns:
    - "SSE route is a plain async generator behind a non-yield dependency; no request-scoped DB session while the stream is open"
    - "Frame id = byte offset after the line in progress.jsonl; Last-Event-ID parsed strictly and clamped to the file size"
    - "Replay is a pure reducer (foldProgress) so reload and live updates share one code path"
    - "jsdom EventSource double (FakeEventSource) installed only when the global is missing"

key-files:
  created:
    - backend/src/yolo_trainer_api/training/stream.py
    - backend/tests/test_run_stream.py
    - frontend/src/features/training/progress/foldProgress.ts
    - frontend/src/features/training/progress/useRunStream.ts
    - frontend/src/features/training/progress/RunCharts.tsx
    - frontend/src/test/fakeEventSource.ts
  modified:
    - backend/src/yolo_trainer_common/progress.py
    - backend/src/yolo_trainer_api/routers/runs.py
    - backend/tests/test_progress.py
    - docker/Dockerfile.backend
    - scripts/compose_smoke_test.sh
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/api/training.ts
    - frontend/src/features/training/RunPage.tsx
    - frontend/src/features/training/RunPage.test.tsx
    - frontend/src/test-setup.ts
    - frontend/src/i18n/locales/en/training.json
    - frontend/src/i18n/locales/ru/training.json

key-decisions:
  - "recharts pinned to the exact version 3.10.1 in package.json and the lockfile root entry (project otherwise uses caret ranges) to honor T-05-SC"
  - "Stream sends status first on connect for a live run, but for an already terminal run it drains progress frames first, then status, then end"
  - "compact_replay is applied to every batch of lines read (replay and live), not only the first read"
  - "read_new_events now delegates to read_new_lines (same behavior for the supervisor)"

patterns-established:
  - "Stream tests drive the async generator with asyncio.run and a stub read_status; HTTP tests only on terminal runs"
  - "Existing RunPage tests need no change: a running run opens a FakeEventSource that never emits"

requirements-completed: [TRAN-05]

coverage:
  - id: D1
    description: "SSE endpoint replays progress.jsonl as progress frames with byte-offset ids and primary metrics, then follows live lines, sends status on change and ends on a terminal run or a deleted row"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "backend/tests/test_run_stream.py#test_replay_sends_status_then_every_line_with_its_end_offset_then_end"
        status: pass
      - kind: integration
        ref: "backend/tests/test_run_stream.py#test_http_stream_of_a_completed_run_replays_the_file_and_ends"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stream resumes at a byte offset from Last-Event-ID, ignores invalid values, compacts replayed batch_progress, never sends a partial line, answers 404 before any byte for a foreign or unknown run"
    requirement: TRAN-05
    verification:
      - kind: integration
        ref: "backend/tests/test_run_stream.py#test_http_headers_and_resume_by_last_event_id"
        status: pass
      - kind: unit
        ref: "backend/tests/test_run_stream.py#test_a_half_written_last_line_is_sent_only_once_it_is_complete"
        status: pass
      - kind: integration
        ref: "backend/tests/test_run_stream.py#test_http_stream_of_another_projects_run_or_an_unknown_run_is_404"
        status: pass
    human_judgment: false
  - id: D3
    description: "Run page opens one EventSource, grows a mAP chart from fit_epoch_end frames, ignores the final validation, closes on end and on unmount"
    requirement: TRAN-05
    verification:
      - kind: unit
        ref: "frontend/src/features/training/RunPage.test.tsx#RunPage live charts"
        status: pass
    human_judgment: true
    rationale: "jsdom proves the chart group and its text alternative render and update; how the Recharts curve looks and grows in a real browser is a visual judgment"
  - id: D4
    description: "SSE passes through nginx unbuffered and a finished run's stream ends by itself (compose smoke test)"
    requirement: TRAN-05
    verification:
      - kind: integration
        ref: "bash scripts/compose_smoke_test.sh"
        status: pass
    human_judgment: false
  - id: D5
    description: "uvicorn --timeout-graceful-shutdown 5 so an open stream cannot block docker compose stop"
    requirement: TRAN-05
    verification: []
    human_judgment: true
    rationale: "The flag is set and the image builds, but a container stop with a live stream open was not exercised in this plan"

duration: 25min
completed: 2026-10-11
status: complete
plan_head_before: 2dd7695494bbc2fa6db3e4991882a86cbd776f80
plan_head_after: 070a13fef52e1345a5de5c945c2c4aa893269671
commits: 4
---

# Phase 5 Plan 01: Live progress stream and mAP chart (tracer) Summary

**Progress.jsonl tailed as Server-Sent Events by the torch-free api (byte-offset ids, Last-Event-ID resume, replay compaction, nginx pass-through) feeding a Recharts mAP chart that grows live on the run page and is rebuilt from the replay on reload.**

## Performance

- **Duration:** about 25 min
- **Started:** 2026-10-11T13:38:00Z (approximate)
- **Completed:** 2026-10-11T14:05:00Z
- **Tasks:** 2 (the tracer plus one TDD task)
- **Files modified:** 19

## Accomplishments

- Tracer path works end to end: `train_job` writes `progress.jsonl`, the api tails it at `GET /api/projects/{id}/runs/{id}/stream`, the browser folds `fit_epoch_end` frames and a mAP50 / mAP50-95 chart grows without a refresh; the final-validation event never becomes a point.
- The stream holds no database session while open (non-yield `stream_target` dependency plus one short session per status read) and answers 404 before any stream byte for a run of another project, an unknown run or an unknown project.
- Resumable and cheap: `Last-Event-ID` is a strict digits-only byte offset clamped to the file size (anything else replays from 0), replays send only the last `batch_progress`, a half-written last line waits for its newline.
- Verified through nginx by the compose smoke test (`SMOKE OK`): a finished run's stream is `text/event-stream` with `event: progress` and `event: end`; the api image stays torch-free.

## Task Commits

1. **Task 1: tracer, watch a run's mAP curve grow live, reload restores it** - `2e126ce` (feat)
2. **Task 2 RED: failing tests for offsets and compaction** - `b49f77c` (test)
3. **Task 2 GREEN: resumable stream with Last-Event-ID and replay compaction** - `d6e5bf1` (feat)
4. **Task 2: smoke-test SSE stage and uvicorn graceful shutdown** - `070a13f` (chore)

**Plan metadata:** committed after this file (docs: complete plan). No REFACTOR commit: nothing worth changing after GREEN.

## Tracer gate

Interactive run, `human_verify_mode` default `end-of-phase`, the tracer `<verify>` carries only `<automated>` commands: all three (stream tests, Vitest `RunPage locales`, `npm run build`) were re-run on the committed slice and passed, so execution continued to the expansion task (`Tracer verified end-to-end - expanding`).

## TDD Gate Compliance (Task 2, `tdd="true"`)

- **RED** (`b49f77c`): 5 target tests failed on their planned assertions, no collection or import errors: two `parse_last_event_id` table rows (`"120"` and `"500"` returned 0), `compact_replay` kept all five batch events, the generator replay sent all five `batch_progress` frames, and the HTTP resume test saw the full stream instead of frames after `Last-Event-ID`. Semantic assessment: the target tests executed and failed for the intended reason (missing behavior behind signature stubs `return 0` / `return items`). The other new tests (offset replay, half-written line, deleted row, status change, 404s) already passed because the Task 1 generator implemented those paths; they pin the contract and are not RED evidence.
- **GREEN** (`d6e5bf1`): 34 tests in `test_run_stream.py` and `test_progress.py` pass.
- **REFACTOR:** none.

## Files Created/Modified

- `backend/src/yolo_trainer_api/training/stream.py` - stream target dependency, offset parser, status reads, `progress_frames` generator
- `backend/src/yolo_trainer_api/routers/runs.py` - `stream_run` route (`EventSourceResponse`, `Last-Event-ID` header)
- `backend/src/yolo_trainer_common/progress.py` - `read_new_lines`, `enrich_event`, `compact_replay`, v2 event constants
- `backend/tests/test_run_stream.py`, `backend/tests/test_progress.py` - generator, HTTP and pure-helper tests
- `docker/Dockerfile.backend`, `scripts/compose_smoke_test.sh` - graceful-shutdown flag, SSE stage through nginx
- `frontend/src/features/training/progress/{foldProgress.ts,useRunStream.ts,RunCharts.tsx}` - fold reducer, stream hook, mAP panel
- `frontend/src/features/training/RunPage.tsx`, `RunPage.test.tsx` - hook wired before the early returns, chart rendered under the status card, three new tests
- `frontend/src/test/fakeEventSource.ts`, `frontend/src/test-setup.ts` - jsdom EventSource double and its guarded install
- `frontend/src/api/training.ts`, en/ru `training.json`, `package.json`, `package-lock.json` - `runStreamUrl`, `charts.*` strings, recharts 3.10.1

## Decisions Made

- recharts is pinned exactly (`3.10.1`) rather than with the caret npm writes by default, matching the threat model; the lockfile pins it either way.
- For a terminal run the stream order is progress frames, `status`, `end`; for a live run `status` is sent on connect first. Both follow the plan's behavior spec.
- `compact_replay` runs on every read batch, so replay and live reads share one rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Verify commands adapted to the worktree environment**
- **Found during:** Task 1 (first test run)
- **Issue:** the worktree has no `.venv` and no `node_modules`; `uv run` would sync the workspace including the torch worker extra, and the shared editable install points at the main checkout's `backend/src`, so a plain `pytest` would test the wrong code.
- **Fix:** ran `python -m pytest ... -o pythonpath=src` and `python -m ruff` with the main `.venv` interpreter so the worktree sources win (verified: the first run failed on a syntax error that lived only in the worktree file); ran `npm ci` inside the worktree frontend.
- **Files modified:** none (environment only)
- **Verification:** `672 passed, 3 deselected` backend, `734 passed` frontend (59 files), ruff check and format clean, `npm run build` ok.

**2. [Rule 3 - Blocking] recharts install**
- **Found during:** Task 1
- **Issue:** `npm install recharts@3.10.1 --save-exact` stopped with an ERESOLVE report; the same package at the same version installed with plain `npm install recharts@3.10.1`.
- **Fix:** no substitute package or version was used; afterwards `package.json` and the lockfile root entry were changed from `^3.10.1` to the exact `3.10.1`. `react-is` was already in the lockfile (`node_modules/react-is` 17.0.2).
- **Files modified:** frontend/package.json, frontend/package-lock.json
- **Committed in:** 2e126ce

**3. [Rule 3 - Blocking] RED commit carries two signature stubs**
- **Found during:** Task 2 (RED)
- **Issue:** with the tests alone, both test modules failed at import, which is not a valid RED.
- **Fix:** the RED commit also holds `parse_last_event_id` (`return 0`) and `compact_replay` (`return items`) stubs plus the v2 event constants, so the failures are assertion-level.
- **Committed in:** b49f77c

**4. [Rule 3 - Blocking] Smoke test needs the git-ignored base weights**
- **Found during:** Task 2 verification
- **Issue:** the worktree lacks `yolo26n.pt` (ignored by git), which the smoke test copies into the data dir to avoid a download.
- **Fix:** copied it from the main checkout's repo root into the worktree root (stays ignored, not committed).

**Total deviations:** 4 auto-fixed (all Rule 3, none changed behavior or scope).
**Impact on plan:** no scope creep; `read_new_events` now delegates to `read_new_lines` (identical behavior, supervisor tests untouched and green).

## Issues Encountered

- Several long heredoc and chained shell commands were refused by the worktree command guard; the affected edits were redone with the Edit tool or split into plain commands.
- Not exercised: a real `docker compose stop` with a stream held open. The `--timeout-graceful-shutdown 5` flag is in the image (smoke test built and ran it) but the shutdown-under-load behavior is unverified; recorded as D5 with `human_judgment: true`.

## Known Stubs

None. The two RED signature stubs were replaced in the GREEN commit (`grep` for "Signature stub" over the touched sources returns nothing).

## Threat Flags

None. The only new network surface is the stream endpoint, covered by T-05-01, T-05-02 and T-05-04 of the plan's threat model (404 before bytes, strict offset parsing, no held session, graceful shutdown timeout).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 05-02..05-10 can extend `status_payload`/`STATUS_COLUMNS`, the `ProgressFrame` type and `RunCharts` without renaming anything; `FakeEventSource` already supports `fail()` for the stream-unavailable states of 05-02.
- `train_job` does not yet emit `train_start` or `batch_progress`; the constants and the compaction rule are ready for 05-03.
- RunPage does not yet fall back to polling when the stream breaks, show a reconnecting hint, or render the loss and precision/recall charts (05-02).

## Self-Check: PASSED

- Created files exist (stream.py, test_run_stream.py, foldProgress.ts, useRunStream.ts, RunCharts.tsx, fakeEventSource.ts).
- Commits 2e126ce, b49f77c, d6e5bf1, 070a13f are ancestors of HEAD.
- Plan-level verification re-run: backend 672 passed, ruff clean, frontend 734 passed, build ok, `SMOKE OK`.
