---
phase: 01-runnable-skeleton-projects
plan: 05
subsystem: infra
tags: [git-hygiene, gitignore, ultralytics, roadmap-docs]

# Dependency graph
requires:
  - phase: 01-01
    provides: "uv workspace root (pyproject.toml) + yolo-trainer-backend package under backend/"
  - phase: 01-04
    provides: "pinned CPU ML stack (torch/torchvision/ultralytics) the check script's real training run depends on"
provides:
  - "scripts/check_cli_run_git_clean.py: automated FOUND-03 proof, drives train_yolo.train() through a real 1-epoch CPU run and asserts git status is unchanged"
  - "Untracked (index-only) trained_models/best.pt, yolo26n.pt, yolov8n.pt, runs/** -- working tree files kept intact, D-25"
  - ".gitignore rules for example_ready_dataset/{train,valid,test}/ (D-23) and .planning/research/.cache/"
  - "docs/roadmap.md Sec 1.7/5.7/7.2 corrected (Phase 0 follow-up #4)"
affects: [06-worker-service, later-phases-using-example_ready_dataset-as-fixture]

# Actuals (#2632) -- pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 3400
  tasks: 2
  commits: 2
plan_head_before: c37a6a7acb8264317f977d8be87310043b8e9ee2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Automated git-hygiene proof: a script that drives the real production code path (train_yolo.train()) rather than a synthetic stand-in, comparing `git status --porcelain --untracked-files=all` before/after"
    - "Search-then-clean (rglob) instead of assuming a fixed Ultralytics output path, because `project=` combined with an already-relative `runs/...` value gets nested under `runs/<task>/<project>/<name>/`, not directly under `<project>/<name>/`"

key-files:
  created:
    - scripts/check_cli_run_git_clean.py
  modified:
    - .gitignore
    - docs/roadmap.md
    - trained_models/best.pt (git index only -- untracked, file kept on disk)
    - yolo26n.pt (git index only -- untracked, file kept on disk)
    - yolov8n.pt (git index only -- untracked, file kept on disk)
    - runs/** (git index only -- untracked, files kept on disk)

key-decisions:
  - "SHA-256 recorded for trained_models/best.pt, yolo26n.pt, yolov8n.pt before git rm --cached and re-verified identical after -- 22f1d1ec...4e06, 9b09cc8b...defef, f59b3d83...c83b36 respectively (D-25 safety requirement)."
  - "check_cli_run_git_clean.py builds its [Train] config in-memory (never reads config/config.ini), avoiding the pre-existing Config/Config.ini case-mismatch bug entirely rather than needing to touch it."
  - "Cleanup after the hygiene run uses `runs/**/hygiene-check` rglob rather than a fixed `runs/hygiene-check` path, because Ultralytics nested the actual output at `runs/detect/runs/hygiene-check/run/` (task-then-relative-project nesting), matching the same double-nesting pattern already visible in the pre-existing (now untracked) `runs/detect/runs/train/plate_exp2/` directory."

requirements-completed: [FOUND-03]

coverage:
  - id: D1
    description: "A real CLI training run (train_yolo.train(), not a synthetic stand-in) leaves `git status` unchanged, proven automatically by scripts/check_cli_run_git_clean.py"
    requirement: "FOUND-03"
    verification:
      - kind: other
        ref: "uv run python scripts/check_cli_run_git_clean.py -> exit 0, prints GIT CLEAN OK (run twice, including a rerun after fixing the cleanup path, both clean)"
        status: pass
    human_judgment: false
  - id: D2
    description: "trained_models/best.pt, yolo26n.pt, yolov8n.pt and all of runs/ are untracked from git (index only) while remaining byte-identical on disk"
    requirement: "FOUND-03"
    verification:
      - kind: other
        ref: "git ls-files -- '*.pt' 'runs/' 'trained_models/' -> empty (UNTRACKED OK); sha256sum before/after git rm --cached identical for all three weight files"
        status: pass
    human_judgment: false
  - id: D3
    description: "example_ready_dataset/{train,valid,test}/ images+labels are gitignored (D-23); data.yaml and the two READMEs stay tracked; data/, .smoke-data/, .env, .planning/research/.cache/ are ignored"
    verification:
      - kind: other
        ref: "git ls-files example_ready_dataset -> exactly data.yaml, README.dataset.txt, README.roboflow.txt; git check-ignore -q on each required path -> all ignored"
        status: pass
    human_judgment: false
  - id: D4
    description: "docs/roadmap.md Sec 1.7/7.2 corrected to describe example_ready_dataset as predominantly detect-format (278/280, 71/73, 36/40 box rows; 2/2/4 stray polygon rows); Sec 5.7 notes the D-13 bind-mount override"
    verification:
      - kind: other
        ref: "sed -n Sec1.7 | grep predominantly/2-2-4; sed -n Sec7.2 | grep -ci 'annotated with full polygons today' -> 0; sed -n Sec5.7 | grep D-13 -> all pass"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 5: Git Hygiene, Binary Untracking & Roadmap Correction Summary

**Untracked `trained_models/best.pt`/`yolo26n.pt`/`yolov8n.pt`/`runs/` (index only, files kept, SHA-256 verified unchanged), added `.gitignore` rules for the example dataset splits, and proved via a real 1-epoch CPU `train_yolo.train()` run that `git status` now stays clean — plus corrected `docs/roadmap.md`'s wrong "segmentation dataset" characterization.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-28T07:19:39Z (approx, right after 01-04 completion)
- **Completed:** 2026-09-28T07:30:40Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 2 text-modified, 3+runs/** index-only untracked)

## Accomplishments

- `scripts/check_cli_run_git_clean.py` — a new automated FOUND-03 proof: builds an in-memory `[Train]` config (`dataset_path=example_ready_dataset`, `epochs=1`, `imgsz=64`, `device=cpu`), imports and calls the real `train_yolo.train()` (the actual production code path, not a stand-in), and asserts `git status --porcelain --untracked-files=all` is byte-identical before and after. Exits 3 (not a silent pass) if the dataset images are missing.
- `trained_models/best.pt`, `yolo26n.pt`, `yolov8n.pt`, and all 43 files under `runs/` untracked from git via index-only `git rm --cached` (D-25) — SHA-256 recorded before the operation and re-verified identical after; no `--force`, no history rewrite, no reset/rebase/push.
- `.gitignore`: added `example_ready_dataset/{train,valid,test}/` (D-23 — images/labels no longer tracked, `data.yaml` + both READMEs stay tracked) and `.planning/research/.cache/`; all pre-existing rules (`*.pt`, `runs/`, `trained_models/`, `data/`, `.smoke-data/`, `.env`, caches) kept unchanged.
- `docs/roadmap.md` §1.7/§7.2 corrected: `example_ready_dataset/` is now described as predominantly detection-format (278/280 train, 71/73 valid, 36/40 test objects are plain box rows; 2/2/4 stray polygon rows per split), a `detect`-task example — not the segmentation-format dataset the pre-Phase-0 text claimed. §5.7 now notes Phase 1's D-13 override (bind-mounted `./data` instead of named volumes).

## Task Commits

Each task was committed atomically:

1. **Task 1: Ignore rules, index-only untracking, automated git-clean check** - `27d7a1b` (feat)
2. **Task 2: Correct example-dataset characterization in docs/roadmap.md** - `baad822` (docs)

**Plan metadata:** commit to follow this SUMMARY (docs(01-05): complete plan)

## Files Created/Modified

- `scripts/check_cli_run_git_clean.py` - drives a real CLI training run and asserts git status is unchanged (FOUND-03 automated proof)
- `.gitignore` - D-23 rules for example dataset splits + `.planning/research/.cache/`
- `docs/roadmap.md` - §1.7/§7.2 dataset-format correction, §5.7 D-13 note
- `trained_models/best.pt`, `yolo26n.pt`, `yolov8n.pt`, `runs/**` - untracked from git index only, unchanged on disk (SHA-256 verified)

## Decisions Made

See frontmatter `key-decisions`: SHA-256 hashes recorded/verified for the three weight files; the check script builds its config in-memory rather than reading `config/config.ini` (sidesteps the pre-existing `Config/Config.ini` case bug entirely); cleanup uses an `rglob` search for `hygiene-check` rather than a fixed path, because Ultralytics nests output as `runs/<task>/<project>/<name>/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed hygiene-run cleanup path assumption**
- **Found during:** Task 1 (writing and first-running `check_cli_run_git_clean.py`)
- **Issue:** The plan's action step described removing `runs/hygiene-check` after the run. The first run showed Ultralytics actually wrote output to `runs/detect/runs/hygiene-check/run/` (task subfolder + the already-relative `project=runs/hygiene-check` value nested underneath it) — the same double-nesting pattern already visible in the pre-existing `runs/detect/runs/train/plate_exp2/` directory this plan just untracked. A fixed-path `rmtree("runs/hygiene-check")` would silently no-op and leave orphaned run artifacts on disk (harmless for the git-clean assertion itself, since `runs/` is fully gitignored either way, but untidy).
- **Fix:** Changed cleanup to `for p in (runs/).rglob("hygiene-check"): shutil.rmtree(p)`, which finds and removes the run directory regardless of Ultralytics' actual nesting.
- **Files modified:** scripts/check_cli_run_git_clean.py
- **Verification:** Ran the script twice; second run confirmed no leftover `hygiene-check` directory anywhere under `runs/` via `find runs -iname hygiene-check` (empty output).
- **Committed in:** 27d7a1b (Task 1 commit — fix applied before the commit, only the corrected version was committed)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Self-contained implementation fix, discovered and corrected within Task 1 before commit. No scope creep, no change to acceptance criteria or verification commands, which all pass as specified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- A fresh clone of this repo no longer carries the owner's real model weights or any `runs/` output in git history going forward from this commit; `trained_models/best.pt`, `yolo26n.pt`, `yolov8n.pt` remain present and correct on this machine's working tree (SHA-256 verified unchanged).
- `docs/roadmap.md` no longer misleads future planners about `example_ready_dataset/`'s format or about where Phase 1 stores app data (D-13 bind mount vs. the document's original named-volume recommendation).
- Phase 1 success criterion 3 (CLI run leaves `git status` clean) is now automatically enforceable via `uv run python scripts/check_cli_run_git_clean.py` — usable as a regression check in CI or before future commits.
- A later phase that needs a small committed dataset fixture (per D-23) still needs to create one; `example_ready_dataset/train|valid|test/` are now ignored and provide no committed fixture images on their own.
- No new blockers introduced. Pre-existing STATE.md blockers (DEPL-01 Linux/macOS verification, GPU-path acceptance, `Config/Config.ini` case mismatch) remain open and unaffected by this plan.

## Self-Check: PASSED

`scripts/check_cli_run_git_clean.py` confirmed present on disk (`[ -f ]`). Both task commits (`27d7a1b`, `baad822`) confirmed in `git log --oneline --all` (via `.git/logs/HEAD`). Re-ran the plan's full `<verification>` block clean: `uv run python scripts/check_cli_run_git_clean.py` -> `GIT CLEAN OK` (exit 0); `git ls-files -- '*.pt' 'runs/' 'trained_models/'` -> empty; SHA-256 of all three weight files unchanged from the pre-untracking values recorded above; `docs/roadmap.md` §1.7/§5.7/§7.2 acceptance greps all pass. Backend test suite re-run clean: `uv run pytest backend/tests -q` -> `48 passed` (unchanged from the Plan 01-04 baseline — this plan touched no backend code).

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
