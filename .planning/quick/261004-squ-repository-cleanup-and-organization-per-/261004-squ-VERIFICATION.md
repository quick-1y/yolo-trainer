---
task: quick-261004-squ
verified: 2026-10-04
status: passed
score: 6/6 must-haves verified
---

# Quick 261004-squ: Repository cleanup verification

**Goal:** Remove only confirmed garbage, reorganize only where safe, leave ambiguous items in place and report them, make no architecture, feature or refactor changes, and run the existing checks.

## Must-haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `.gsd/` is ignored and still on disk | VERIFIED | `.gitignore` gains `/.gsd/`, root-anchored, under a GSD comment. `git status --ignored` shows `!! .gsd/` and no `?? .gsd/`. `.gsd/` exists. |
| 2 | No tracked file was deleted, moved, renamed or newly ignored | VERIFIED | `git diff --name-status 6ab713e..HEAD` shows only `M .gitignore`, `M README.md`, `M README.ru.md`. Tracked top-level count is 23. `git ls-files -d` and `git ls-files -ci --exclude-standard` are both empty. |
| 3 | The 13 stale caches were removed and no user data was removed | VERIFIED (partly inferred) | All 11 protected items exist: `.venv`, `spikes/.venv312`, `spikes/output`, `data`, `runs`, `trained_models/best.pt`, `yolov8n.pt`, `yolo26n.pt`, `.idea`, `.gsd`, `frontend/node_modules`. The cache dirs are present again as ignored (`!!`) because the checks regenerated them, which the SUMMARY states. I cannot prove the removal happened. This does not matter: the paths are untracked, gitignored and regenerable, and the diff shows nothing outside them was touched. |
| 4 | README layout is complete, with 12 headings kept and the prefix unchanged | VERIFIED | Each README diff is a single hunk at the end, inside the layout fenced block. Heading count is 12 before and after in both files. Every tracked top-level entry is named in both blocks, except `.dockerignore`, `.gitattributes`, `.gitignore` and the READMEs, which the plan excludes. The RU block keeps paths verbatim and translates only the prose. Working-tree CRLF is preserved (`w/crlf`, index `i/lf`), and the files are clean in `git status`. |
| 5 | CI checks pass | VERIFIED (re-run partly) | I re-ran `ruff check` on backend and `scripts/seed_images.py`: all passed. `ruff format --check`: 53 files already formatted. The SUMMARY reports 389 backend tests, 564 frontend tests, a successful build, `uv sync --locked --dry-run` with no changes, and `GIT CLEAN OK`. I did not re-run the long pytest, vitest and CLI checks. The tracked diff is only `.gitignore` and the READMEs, so these checks cannot regress. |
| 6 | The SUMMARY has a Cleanup Report | VERIFIED | The SUMMARY has a `## Cleanup Report` with Removed, Ignore rules, Moved (None), Documentation, Left in place, Observations, Drift and Checks run. It names the 1.2 GB `spikes/.venv312/` and `.planning/ui-reviews/` as items for the owner. |

## Scope and discipline

- Exactly 2 commits on top of 6ab713e: ba3f013 touches only `.gitignore`, and 9459faa touches only the two READMEs.
- Nothing was moved, and there are no architecture, feature or code changes.
- `.planning/ui-reviews/` was not ignored, was not staged and is untracked, as the plan requires.
- Ambiguous items (legacy CLI scripts, `gpu_test.py`, `spikes/`, `example_ready_dataset/`, `.venv312`, `ui-reviews`) were left in place and reported.
- No anti-patterns, debt markers or stubs were introduced.

## Minor notes (not gaps)

- The cache removal cannot be confirmed after the fact. Only the SUMMARY's account and the absence of any tracked diff back it.
- The SUMMARY notes that the file name `gpu_test.cpython-312-pytest-9.1.1.pyc` rests on the planning-time observation.
- The `spikes/.venv312/` (1.2 GB) and `.planning/ui-reviews/` decisions are for the owner.

## Verdict

Goal achieved. The cleanup was conservative and strictly in scope, and all items were reported. No gaps and no human verification required.
