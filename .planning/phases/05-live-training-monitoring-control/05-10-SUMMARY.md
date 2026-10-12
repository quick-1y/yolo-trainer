---
phase: 05-live-training-monitoring-control
plan: 10
subsystem: testing
tags: [docker-compose, smoke-test, nginx, readme, i18n, cancel, resume]

requires:
  - phase: 05-live-training-monitoring-control
    provides: "05-01..05-09: SSE stream, cancel, resume, failure categories, history table, run delete, interim best.pt"
provides:
  - "scripts/compose_smoke_test.sh stage 'Cancel, no orphan, next run, resume' exercised through nginx in the real compose stack"
  - "README.md / README.ru.md subsections: Watching a run, Cancelling and resuming a run, When a run fails, Run history"
  - "Green full Phase 5 gate on the CPU path"
affects: [phase-05-verification, end-of-phase-UAT, phase-12-gpu]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: cb1b17bd8c5a3b6e727eb064885892283c701470
plan_head_after: cc9eb23ea914db5f9178a2d60b434940c6119f96

tech-stack:
  added: []
  patterns:
    - "Smoke-script helpers (smoke_run_status, smoke_run_int, start_smoke_run, wait_for_run_status) that set globals instead of returning through command substitution, so FAIL+exit 1 really aborts the script"
    - "Process scan via /proc with the venv Python and a split needle, so the scanner never matches its own command line"

key-files:
  created: []
  modified:
    - scripts/compose_smoke_test.sh
    - README.md
    - README.ru.md

key-decisions:
  - "The orphan scan builds its needle as b'yolo_trainer_worker.' + b'train_job' so the scanning python process (whose -c source holds the text) is never counted"
  - "The resumed run must get past max(resume_epoch, epoch) read from the cancelled run JSON, so a stale resume_epoch cannot make the check pass trivially"
  - "Added 403-without-XHR assertions for /cancel and /resume to the smoke stage (cheap CSRF-guard coverage through nginx)"

patterns-established:
  - "Smoke stages cancel every run they start (or wait for completion) before the down/up persistence stage (T-05-33)"

requirements-completed: [TRAN-05, TRAN-06, TRAN-07, TRAN-08, TRAN-11]

coverage:
  - id: D1
    description: "In the real compose stack a running run is cancelled through nginx (XHR header) to cancelled within 30 s, with no yolo_trainer_worker.train_job process left in the worker, and the next run is claimed and completes"
    requirement: TRAN-06
    verification:
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (stage 'Cancel, no orphan, next run, resume')"
        status: pass
    human_judgment: false
  - id: D2
    description: "The cancelled run is resumed in the real stack as the same run: queued, running again, epoch past the checkpoint, progress.jsonl with two train_start lines and resumed true; its stream ends with event: end"
    requirement: TRAN-07
    verification:
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (stage 'Cancel, no orphan, next run, resume')"
        status: pass
    human_judgment: false
  - id: D3
    description: "README.md and README.ru.md describe live progress, cancel (incl. native-Windows TerminateProcess note), resume (three disable codes), failure categories and run history, with identical section structure"
    requirement: TRAN-11
    verification:
      - kind: other
        ref: "grep acceptance checks: ## count 13/13, ### count 8/8, failure codes 4/4, TerminateProcess 1/1, no_checkpoint+not_resumable+finished in one ### 1/1"
        status: pass
    human_judgment: true
    rationale: "Wording quality, translation accuracy and fidelity to the shipped UI strings need a human read"
  - id: D4
    description: "Full automated gate: backend suite, ruff check and format, real CPU training tests, frontend build and tests, compose smoke test"
    verification:
      - kind: integration
        ref: "pytest backend/tests (883 passed), pytest -m training (5 passed), npm build, vitest (927 passed), compose_smoke_test.sh (SMOKE OK)"
        status: pass
    human_judgment: false
  - id: D5
    description: "End-of-phase UAT on the CPU machine: live charts/batch bar, final validation card, cancel dialog, resume marker, kill -9 failure, history sort/filter/delete/interim download, five visual backstop rows at 1024 and 1280 px in en and ru"
    verification: []
    human_judgment: true
    rationale: "Visual layout, real-browser behavior and human-observable timing cannot be asserted by jsdom or curl; harvested into the end-of-phase UAT (human_verify_mode end-of-phase)"

duration: 75min
completed: 2026-10-12
status: complete
---

# Phase 5 Plan 10: Real-stack cancel/resume proof, README (en/ru) and full gate Summary

**Cancel, no-orphan, next-run and resume are proven through nginx in the real compose stack, the README (en/ru) documents monitoring, cancel, resume, failures and history, and the whole Phase 5 gate is green on the CPU path.**

## Performance

- **Duration:** ~75 min (mostly the first image build of the smoke test and the 6 min backend suite)
- **Started:** 2026-10-12T06:25Z (approx.)
- **Completed:** 2026-10-12T07:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Smoke stage "Cancel, no orphan, next run, resume": 50-epoch run `smoke-cancel` reaches running with a checkpoint, `POST /cancel` without the XHR header is 403 and with it 200, the run is `cancelled` within 30 s, the `/proc` scan of the worker finds 0 `yolo_trainer_worker.train_job` processes, `smoke-next` (1 epoch) completes, `POST /resume` answers 200 `queued`, the resumed run passes the old checkpoint epoch (`epoch 3` in the verified run) with `resume_count` 1, is cancelled again, `progress.jsonl` has at least two `"event": "train_start"` lines and `"resumed": true`, and the cancelled run's stream ends with `event: end`.
- README.md / README.ru.md: four new `###` subsections under "## Training a model" (Watching a run, Cancelling and resuming a run, When a run fails, Run history), with the seven failure codes table, the three resume-disable codes named in one paragraph, the SIGTERM then SIGKILL after 10 s behavior and the native-Windows `TerminateProcess` limitation moved from Plan 05-05. The Russian file mirrors the structure and keeps commands, paths and codes verbatim; UI names are taken from the shipped en/ru locale files.
- Full gate green (results below).

## Task Commits

1. **Task 1: End-to-end cancel / no orphan / next run / resume in the real stack** - `cc9eb23` (test)
2. **Task 2: Document monitoring, cancel, resume, failures and history (en/ru) and pass the full gate** - `358170e` (docs)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Gate results

| Check | Result |
|-------|--------|
| `pytest backend/tests` | 883 passed, 5 deselected (the `training` marker), 367 s |
| `ruff check backend` / `ruff format --check backend` | All checks passed / 101 files already formatted |
| `pytest -m training backend/tests` (real CPU runs incl. cancel-then-resume) | 5 passed, 883 deselected, 61 s, nothing skipped |
| `npm run build` (frontend, tsc + vite) | built, no `error TS` |
| `npm run test -- --run` (vitest) | 64 files, 927 tests passed, 108 s |
| `bash scripts/compose_smoke_test.sh` | `SMOKE OK`, exit 0, no `FAIL:` line (real Docker 29.7.2 on Windows; CPU stack, first full image build included) |

Notes on how the gate was run (worktree has no `.venv`/`node_modules`): backend with the main checkout interpreter and `-o pythonpath=src` (the PYTHONPATH env var form is refused by the worktree sandbox), `npm ci --maxsockets=1` in the worktree `frontend/`, `yolo26n.pt` copied (git-ignored) from the main checkout. The smoke test was run once with the full stage; afterwards only a comment line in the script changed (the word "pgrep" was removed so the acceptance grep for 0 occurrences holds) and `bash -n` passes; the script was not re-run a second time.

## Files Created/Modified

- `scripts/compose_smoke_test.sh` - new stage "Cancel, no orphan, next run, resume" with four helpers, inserted after the Phase 4/05-01 training and SSE stage and before the down/up persistence stage
- `README.md` - four new subsections under "## Training a model"; the "Restarts" bullet links to resume
- `README.ru.md` - same structure in Russian

## Decisions Made

- Orphan scan needle is split in two bytes literals so the scanner never matches its own `-c` source.
- Resumed-run progress is measured against `max(resume_epoch, epoch)` of the cancelled run JSON.
- Extra 403-without-header assertions for `/cancel` and `/resume` through nginx.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The acceptance grep for `pgrep` (must be 0) matched my own explanatory comment**
- **Found during:** Task 1 acceptance check
- **Issue:** the comment explaining why `/proc` is scanned contained the word the criterion forbids
- **Fix:** reworded the comment ("No process-listing tool is in the slim worker image")
- **Files modified:** scripts/compose_smoke_test.sh
- **Committed in:** cc9eb23 (part of the task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, cosmetic)
**Impact on plan:** none. The one addition beyond the plan text is the pair of 403-without-XHR assertions, a few lines.

## Issues Encountered

- The worktree sandbox refuses `PYTHONPATH=... python` and `sleep` in foreground; pytest's `-o pythonpath=src` and until-loops were used instead.
- The plan-commit ledger file (`gsd-plan-head-before-05-10`) could not be written (sandbox refuses the compound git-dir command); `plan_head_before` is the base the worktree was created from (`cb1b17b`) and `commits: 2` was measured with `git rev-list --count cb1b17b..HEAD` before this SUMMARY commit.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. No stub patterns in the files changed by this plan.

## Threat Flags

None. The plan adds no endpoints or trust boundaries (T-05-33 mitigated: the smoke stage cancels or completes every run it starts before the persistence stage, deadlines on every wait).

## Human checks harvested into the end-of-phase UAT (from the plan's `<human-check>`)

1. Live run: loss / mAP / precision-recall charts grow without refresh; batch bar moves; "Time left" appears; reload mid-run restores history and continues live.
2. Short run finish: "Final validation…" (never "Epoch Y+1 of Y"), then the "Final results (best.pt)" card with the verdict.
3. Cancel: dialog names the epoch, page shows "Cancelling…", cancelled within seconds, next queued run starts.
4. Resume: queued, continues from the checkpoint epoch, "Resumed" marker, "Times resumed" = 1. If `data/` holds a Phase 4 run with `out/train/weights/last.pt`, its page offers "Resume training" (never "No checkpoint saved yet") and names the epoch (D-10, user decision 2026-10-11).
5. `docker compose exec worker kill -9 <pid of train_job>`: run fails with "Training process was killed", its hint, the original message and the log.
6. Run list: sort by mAP50-95 and duration, status filter, reload keeps the choice; delete a finished run with a model (dialog warns about the model); download an interim best.pt of a cancelled run.
7. Visual backstops at 1024 and 1280 px, en and ru: ChartPanel grid (3 columns at >= 1200 px, stacked below), RunningStatusCard headline on one line with a 3-digit epoch count, ru final-validation title/hint wrap, FailureAlert with a 10,000-character message and a 5,000-character log line, RunList with a 100-character name and ru headers with the sort glyph.

GPU memory release after a cancel stays in Phase 12 (needs NVIDIA hardware).

## Next Phase Readiness

All five Phase 5 success criteria hold on the CPU path in the shipped containers (automated parts green); the remaining visual and real-browser checks are listed above for the end-of-phase UAT. Phase 5 is ready for verification.

## Self-Check: PASSED

- `scripts/compose_smoke_test.sh`, `README.md`, `README.ru.md`: FOUND
- Commits `cc9eb23` and `358170e`: FOUND on the branch

---
*Phase: 05-live-training-monitoring-control*
*Completed: 2026-10-12*
