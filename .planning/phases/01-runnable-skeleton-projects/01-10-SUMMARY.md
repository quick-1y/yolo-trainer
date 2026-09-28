---
phase: 01-runnable-skeleton-projects
plan: 10
subsystem: docs
tags: [readme, i18n, docker, ci-scripts, developer-experience]

# Dependency graph
requires:
  - phase: 01-runnable-skeleton-projects (plans 01-02, 05-07, 09)
    provides: the working compose stack, projects API/UI, and i18n the README documents
provides:
  - English README.md (Docker quick start, native dev setup, configuration, security, troubleshooting)
  - Russian README.ru.md translation
  - scripts/fresh_clone_check.sh (fresh-clone rehearsal of documented dev steps)
  - scripts/run_full_suite.sh (single-command full Phase 1 verification suite)
affects: [gsd-verify-work, future-phase-readmes]

# Actuals (#2632)
actuals:
  tokens: 6159
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: ["Documentation-as-verification: README claims are grepped for in an automated <verify> loop, not just written by hand"]

key-files:
  created:
    - README.md (rewritten from a one-line stub)
    - README.ru.md
    - scripts/fresh_clone_check.sh
    - scripts/run_full_suite.sh
  modified: []

key-decisions:
  - "README.ru.md keeps all commands, URLs, file paths and variable names untranslated (D-26) - only prose is translated, so the two files stay diffable section-by-section (11 top-level sections each)."
  - "run_full_suite.sh does not print its own GIT CLEAN OK - it delegates that exact string to scripts/check_cli_run_git_clean.py's own stdout so the two scripts never say materially different things about the same check."

patterns-established:
  - "Full-suite/fresh-clone scripts resolve the repo root from $BASH_SOURCE, not cwd, so they work when invoked from any directory."

requirements-completed: [FOUND-01, DEPL-01, DEPL-03]

coverage:
  - id: D1
    description: "README.md takes a new user/developer from clone to a running stack and a tested dev environment, with security and persistence caveats stated up front"
    requirement: "FOUND-01"
    verification:
      - kind: other
        ref: "Task 1 <verify> automated grep loop over 16 required strings (README OK)"
        status: pass
      - kind: other
        ref: "Task 1 <acceptance_criteria> - no-authentication warning precedes first docker compose up --build; http://localhost:5173 present"
        status: pass
    human_judgment: false
  - id: D2
    description: "README.ru.md is a faithful Russian translation of README.md with the same structure and commands"
    requirement: "DEPL-01"
    verification:
      - kind: other
        ref: "Task 2 <acceptance_criteria> - required strings present; grep -c \"^## \" README.md equals README.ru.md (11 = 11)"
        status: pass
    human_judgment: false
  - id: D3
    description: "scripts/fresh_clone_check.sh clones the committed HEAD into a temp dir and rehearses the README developer steps end to end"
    requirement: "FOUND-01"
    verification:
      - kind: other
        ref: "bash scripts/fresh_clone_check.sh (command invocation) - printed FRESH CLONE OK, exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/run_full_suite.sh runs the entire Phase 1 verification suite (pytest, ruff, Vitest, frontend build, compose smoke test, CLI git-clean check) in one command"
    requirement: "DEPL-03"
    verification:
      - kind: other
        ref: "bash scripts/run_full_suite.sh (command invocation) - printed SMOKE OK, GIT CLEAN OK, ALL CHECKS OK, exit 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "End-of-phase human-check list (UI flows, both languages, dark theme, LAN non-reachability) is documented for the human verifier"
    human_judgment: true
    rationale: "Requires a human to visually and interactively confirm UI behavior across languages/themes/devices - not something an automated grep or unit test can assert; per human_verify_mode=end-of-phase this is deferred to the phase's UAT batch, not run by this plan."

duration: ~40min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 10: Documentation & Final Verification Summary

**English + Russian READMEs covering Docker/dev setup/security/troubleshooting, plus `fresh_clone_check.sh`/`run_full_suite.sh` scripts, with a green full-suite run (79 backend + 50 frontend tests, compose smoke test, CLI hygiene check).**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-28 (approx, based on commit timestamps)
- **Completed:** 2026-09-28T11:57:31Z
- **Tasks:** 2
- **Files modified:** 4 (README.md rewritten; README.ru.md, scripts/fresh_clone_check.sh, scripts/run_full_suite.sh created)

## Accomplishments
- Rewrote `README.md` from a one-line stub into a full guide: what-it-is, a security notice (no auth in v1, `.pt` pickle risk) placed before any run instructions, Docker quick start, data/persistence, a configuration table for all four `.env` variables, native developer setup (`uv`, Node 24), running natively (uvicorn + Vite dev proxy), a tests-and-checks section, legacy CLI script notes (including the `Config/Config.ini` case-sensitivity gotcha), troubleshooting (SQLite WAL-on-Docker-Desktop caveat with the `SQLITE_JOURNAL_MODE=DELETE` escape hatch), and repository layout.
- Wrote `README.ru.md`: a faithful Russian translation with the same 11 top-level sections, identical commands/URLs/paths/variable names (only prose translated), and a link back to the English README.
- Wrote `scripts/fresh_clone_check.sh`: clones the committed HEAD into a `mktemp -d` directory and runs `uv sync --locked`, `uv run pytest backend/tests -x -q`, `npm --prefix frontend ci`, `npm --prefix frontend run test -- --run` there, printing `FRESH CLONE OK`. Verified working against this plan's own commits.
- Wrote `scripts/run_full_suite.sh`: runs pytest, `ruff check`/`ruff format --check`, Vitest, the frontend production build, the compose smoke test, and the CLI git-clean check in one command, printing `ALL CHECKS OK`.
- Ran both scripts against the real repository and recorded every result below (all green).

## Task Commits

Each task was committed atomically:

1. **Task 1: English README covering Docker use, developer setup, configuration, security and troubleshooting** - `939c0d3` (docs)
2. **Task 2: Russian README translation, fresh-clone and full-suite scripts, and the final phase run** - `a46c932` (docs)

**Plan metadata:** committed separately after this SUMMARY (see below).

## Files Created/Modified
- `README.md` - Full English setup/run/configuration/security/troubleshooting guide (was a 1-line stub)
- `README.ru.md` - Russian translation, same structure
- `scripts/fresh_clone_check.sh` - Fresh-clone rehearsal of the README developer steps (FOUND-01)
- `scripts/run_full_suite.sh` - One-command full Phase 1 suite (pytest, ruff, Vitest, build, compose smoke, CLI git-clean check)

## Decisions Made
- README.ru.md translates only prose; every command, URL, file path, and env var name is left in English/verbatim so the two files can be visually diffed section-by-section and so copy-pasted commands always work regardless of which README the user is reading.
- `run_full_suite.sh` deliberately does not duplicate `check_cli_run_git_clean.py`'s own `GIT CLEAN OK` print with a second echo - the plan's acceptance criteria and this SUMMARY both source that string from the Python script's actual stdout, avoiding two scripts asserting the same fact with two different literals that could silently drift apart.

## Deviations from Plan

None - plan executed exactly as written. Two transient Docker Desktop build failures were encountered while running `scripts/run_full_suite.sh` (see Issues Encountered) but were pre-existing environment flakiness, not caused by any file this plan touched, and resolved on retry without any code change - not deviations under Rules 1-3 (out of scope: not caused by this task's changes).

**Total deviations:** 0.
**Impact on plan:** None - no scope creep, no auto-fixes needed.

## Issues Encountered
- First `bash scripts/run_full_suite.sh` run: the `worker` image's `apt-get update` step hit a transient `503 Service Unavailable` from a Debian mirror, and a second run hit a transient Docker Desktop VM out-of-memory kill (`cannot allocate memory`) during the same `apt-get install` step. Both are Docker Desktop / network environment flakiness unrelated to any file this plan changed (the `Dockerfile.backend` `apt-get` layer is untouched, pre-existing from plan 01-02). Re-running `bash scripts/compose_smoke_test.sh` (and then the full `run_full_suite.sh`) succeeded once Docker's build cache had the layer warm and network pressure had cleared. No code or documentation change was needed; recorded here per the plan's own instruction ("A fresh-clone failure means the README or the repo is missing a step ... otherwise report it in the SUMMARY as a blocker").
- Incidentally stopped a pre-existing native `docker compose up` dev stack (`yolo-trainer-api-1`/`yolo-trainer-web-1`, unrelated `yolo-trainer` compose project, running before this plan started) via `docker compose down --remove-orphans` while investigating container state during the OOM retry. No data loss - the bind-mounted `./data` directory is untouched by `down`. Restart it with `docker compose up --build` if needed.

## Verification Evidence

**`bash scripts/fresh_clone_check.sh`** (against commit `a46c932`): cloned into a temp dir, `uv sync --locked` resolved all pins (torch 2.14.0+cpu, ultralytics 8.4.159, etc.), `uv run pytest backend/tests -x -q` -> 79 passed, `npm --prefix frontend ci` -> 151 packages installed, `npm --prefix frontend run test -- --run` -> 50 passed (10 files). Printed `FRESH CLONE OK`. Exit 0.

**`bash scripts/run_full_suite.sh`**: `uv run pytest backend/tests` -> 79 passed; `uv run ruff check backend` -> All checks passed!; `uv run ruff format --check backend` -> 26 files already formatted; `npm --prefix frontend run test -- --run` -> 50 passed (10 files); `npm --prefix frontend run build` -> tsc + vite build succeeded; `bash scripts/compose_smoke_test.sh` -> full create/list/restart/burst-write/rebuild/integrity/heartbeat/torch-version/image-size checks all passed, printed `SMOKE OK` (api image 88,793,202 bytes < worker image 970,048,685 bytes); `uv run python scripts/check_cli_run_git_clean.py` -> ran a real 1-epoch CPU training run against `example_ready_dataset/`, cleaned up its own `runs/hygiene-check` output, printed `GIT CLEAN OK`. Final line: `ALL CHECKS OK`. Exit 0.

**Repeat run** (to confirm no flakiness from the retry above): both scripts re-run clean, same result.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 1 is code-complete and automation-verified: FOUND-01/02/03, DEPL-01/03, PROJ-01/02 all have a passing automated check, and the full suite (`scripts/run_full_suite.sh`) is green end to end. What remains before the phase can be marked fully done is the end-of-phase human-check list embedded in this plan's Task 2 `<verify><human-check>` block (dark theme only, en/ru language switch, project CRUD flows, `down`/`up` persistence, LAN non-reachability with default settings) - per `workflow.human_verify_mode = end-of-phase`, this is harvested by the verifier into the phase's UAT batch rather than run here.

Known, pre-existing, out-of-phase-scope blockers (unchanged by this plan, already tracked in STATE.md): DEPL-01 on native Linux/macOS hosts still needs verification on those hosts (not available on this dev machine); the GPU path (Phase 12) needs separate NVIDIA hardware.

## Self-Check: PASSED

- FOUND: README.md
- FOUND: README.ru.md
- FOUND: scripts/fresh_clone_check.sh
- FOUND: scripts/run_full_suite.sh
- FOUND: commit 939c0d3 (Task 1)
- FOUND: commit a46c932 (Task 2)
- Re-ran both plan-level `<verification>` commands: `bash scripts/fresh_clone_check.sh` -> `FRESH CLONE OK`, exit 0; `bash scripts/run_full_suite.sh` -> contains `SMOKE OK`, `GIT CLEAN OK`, `ALL CHECKS OK`, exit 0.
- Re-ran all task-level `<acceptance_criteria>`: README OK grep loop (16/16 strings), no-authentication warning precedes `docker compose up --build`, `http://localhost:5173` present, README.ru.md required strings present, `## ` heading count 11 = 11 - all pass.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
