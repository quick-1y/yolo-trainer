---
phase: quick-261004-squ
plan: 01
subsystem: repository-hygiene
tags: [cleanup, gitignore, readme, docs]
status: complete
requires: []
provides:
  - "/.gsd/ root-anchored ignore rule"
  - "Complete Repository layout section in README.md and README.ru.md"
affects: [.gitignore, README.md, README.ru.md]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: [.gitignore, README.md, README.ru.md]
decisions:
  - "No moves: every candidate move would require code or doc path rewrites with no structural gain"
  - "spikes/.venv312/ (1.2 GB) and .planning/ui-reviews/ left in place and reported for the owner"
metrics:
  duration: "~12 min"
  completed: 2026-10-04
actuals:
  tokens: 6000
  tasks: 3
  commits: 2
plan_head_before: 6ab713e3396c4f4612871dbc7b57d4574f40cb5f
commits: 2
---

# Phase quick-261004-squ Plan 01: Repository cleanup and organization Summary

Ignored the GSD runtime directory `.gsd/`, completed the "Repository layout" section in both READMEs to match the real tracked tree, removed 13 stale gitignored tool caches through a four-gate allowlist, and confirmed all CI checks plus the legacy CLI git-clean check pass.

## Commits

| Task | Commit | Message | Files |
| ---- | ------ | ------- | ----- |
| 1 (tracer) | ba3f013 | chore(quick-261004-squ): ignore GSD runtime directory .gsd/ | .gitignore |
| 2 | 9459faa | docs(quick-261004-squ): complete README repository layout | README.md, README.ru.md |
| 3 | (none) | cache removal changes no tracked file | - |

## Cleanup Report

### Removed

All 13 paths are the plan's exact allowlist. Every path passed all four gates (a: exists as directory, b: basename is `__pycache__`/`.pytest_cache`/`.ruff_cache`, c: `git ls-files -- <path>` empty, d: `git check-ignore -q` succeeds). Justification for each: regenerable tool cache, gitignored and untracked. Removed with `rm -rf -- <path>` only (no `git clean`, no `find -delete`, no globs). After the loop, none of the 13 paths existed (checked before any check ran).

| Path | Gates a/b/c/d | Size | Files |
| ---- | ------------- | ---- | ----- |
| `__pycache__` (repo root) | ok/ok/ok/ok | 21 KiB | 3 |
| `scripts/__pycache__` | ok/ok/ok/ok | 12 KiB | 1 |
| `.pytest_cache` | ok/ok/ok/ok | 5 KiB | 5 |
| `.ruff_cache` | ok/ok/ok/ok | 17 KiB | 10 |
| `backend/.pytest_cache` | ok/ok/ok/ok | 43 KiB | 5 |
| `backend/.ruff_cache` | ok/ok/ok/ok | 21 KiB | 11 |
| `backend/src/yolo_trainer_api/__pycache__` | ok/ok/ok/ok | 113 KiB | 13 |
| `backend/src/yolo_trainer_api/migrations/__pycache__` | ok/ok/ok/ok | 4 KiB | 1 |
| `backend/src/yolo_trainer_api/migrations/versions/__pycache__` | ok/ok/ok/ok | 24 KiB | 4 |
| `backend/src/yolo_trainer_api/routers/__pycache__` | ok/ok/ok/ok | 65 KiB | 6 |
| `backend/src/yolo_trainer_common/__pycache__` | ok/ok/ok/ok | 13 KiB | 3 |
| `backend/src/yolo_trainer_worker/__pycache__` | ok/ok/ok/ok | 17 KiB | 2 |
| `backend/tests/__pycache__` | ok/ok/ok/ok | 849 KiB | 24 |

Total about 1.2 MiB. Per the planning-time audit, the root `__pycache__` held stale legacy-script bytecode, including `gpu_test.cpython-312-pytest-9.1.1.pyc` (3 files; I recorded file counts at removal time, not file names, so the specific name rests on the planning-time observation). The CI/CLI checks run afterwards regenerated these caches (they show as `!!` ignored); that is expected and they are not tracked.

### Ignore rules

Added `/.gsd/` (root-anchored) to `.gitignore` under the comment `# GSD runtime state -- never commit (see project instructions)`. Reason: project instructions forbid committing `.gsd/` and it was showing as untracked (`?? .gsd/`). Proof: `git status --porcelain --ignored` contains `!! .gsd/`, `?? .gsd/` is gone, `.gsd/` still exists untouched, and `git ls-files -ci --exclude-standard` is empty. `.planning/ui-reviews/` was deliberately NOT ignored (see below).

### Moved

None. Reasons: the legacy scripts (`train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`) run from the repo root and read `config/config.ini` / `Config/Config.ini` by relative path; `spikes/` paths are cited in `docs/`, `.gitignore` and `.dockerignore`; every app directory is already in place. Any move would need code or doc path rewrites with no structural gain.

### Documentation

The fenced block of "## Repository layout" (README.md) and "## Структура репозитория" (README.ru.md) now lists 14 entries in the same order: `backend/ frontend/ docker/ scripts/ config/ docs/ spikes/ example_ready_dataset/ .github/ .planning/ docker-compose.yml`, `pyproject.toml, uv.lock, .python-version`, `.env.example`, and the legacy script line. `scripts/` description now mentions the seed script and the CLI git-clean check. In README.ru.md paths are verbatim and prose is Russian. Everything above the layout heading is byte-identical (CR-insensitive diff) to 6ab713e, both READMEs keep 12 `## ` headings, and CRLF working-tree endings were preserved (196 CRLF lines each, file ends with CRLF).

### Left in place (ambiguous or required)

| Item | Reason / evidence |
| ---- | ----------------- |
| `train_yolo.py`, `finetune_yolo.py`, `config/config.ini` | Legacy CLI workflow: README "Legacy CLI scripts" section and layout line (`README.md:195`), ROADMAP Phase 1/4/11 notes, `scripts/check_cli_run_git_clean.py:77,79` imports and calls `train_yolo.train()`. |
| `gpu_test.py` | Replacement scheduled in ROADMAP Phase 12 (`.planning/ROADMAP.md:397`: "The diagnostics page replaces `gpu_test.py`"); documented in README (`README.md:164`). |
| `spikes/*.py`, `spikes/output/` | Phase 0 evidence cited by `docs/phase-0-decisions.md` and `docs/roadmap.md` (`git grep -l phase-0-decisions -- docs README.md` hits README.md and docs/roadmap.md). |
| `spikes/.venv312/` (1.2 GB) | Untracked, ignored Phase 0 virtualenv, referenced nowhere, probably redundant with `.venv/`. Left because it is untracked owner state; the owner may delete it by hand to reclaim 1.2 GB. |
| `example_ready_dataset/` | D-23 provenance files (`data.yaml`, two README files) tracked; images/labels ignored; used as fixture by the CLI check and by Phase 9 SC1. |
| `docs/` | Both files cited by ROADMAP. |
| `.planning/ui-reviews/` | Untracked, not ignored: GSD ui-review output (own `.gitignore` for screenshots plus one empty run directory `03-20261004-194229/`). `.planning/` is out of scope, so the owner decides whether to track or ignore it. |
| `backend/src/yolo_trainer_api/routers/__init__.py` | Empty but a required package marker. |
| Local weights (`yolov8n.pt`, `yolo26n.pt`, `trained_models/best.pt`), `data/`, `runs/`, `.venv/`, `.idea/`, `.claude/`, `.gsd/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/tsconfig.tsbuildinfo` | Untracked owner state / build output; never deleted. All verified present after the run. |

### Observations (not changed)

- `.claude/CLAUDE.md` codebase sections still describe the pre-app layout (`.claude/` is out of scope; regenerate via `/gsd-map-codebase` or edit by hand).
- `train_yolo.py` reads `Config/Config.ini` (case-sensitive filesystem issue, already documented in README; a code fix is out of scope).
- A bare `uv run pytest` from the repo root would collect `gpu_test.py` (pytest default `*_test.py` pattern, evidenced by the stale pytest bytecode); the documented `uv run pytest backend/tests` is unaffected.
- `.dockerignore` does not list `.gsd`, `.pytest_cache`, `.ruff_cache` or `frontend/*.tsbuildinfo` (build-context size only, no correctness impact, left unchanged).
- The CLI git-clean check performs a real 1-epoch training run which writes into the ignored `runs/` directory (`runs/detect/runs/hygiene-check/run/`); this is inside the protected, ignored `runs/` and was not removed.

### Drift

Planning-time facts were re-verified live in Task 1 and matched: 23 tracked top-level entries, only `?? .gsd/` outside `.planning/`, `.planning/` showed `?? .planning/quick/261004-squ-.../` and `?? .planning/ui-reviews/`, `git ls-files -ci --exclude-standard` empty, `git ls-files -d` empty, all 13 caches existed, untracked and ignored.

One minor deviation of observation, not of scope: the plan says the READMEs use CRLF in the working tree. That is true (`git ls-files --eol` reports `w/crlf`), but Git Bash `grep`/`awk` hide the CR so naive checks (`grep -c $'\r'`) report 0. The edit was done in bytes via a Python script (kept in the session scratchpad, not in the repo) to preserve CRLF. `.gitignore` is LF in the index; git warned "LF will be replaced by CRLF the next time Git touches it" (core.autocrlf=true), which is harmless and consistent with the previous behavior.

### Checks run

All from `C:/Users/admin/PycharmProjects/yolo-trainer`, after the cache removal.

| Command | Result |
| ------- | ------ |
| Task 1 TRACER verify (23 top-level, `.gsd` exists, `/.gsd/` rule, `!! .gsd/`, no `?? .gsd/`, ignore-conflict empty, `.gitignore` clean) | `TRACER OK` |
| Task 2 LAYOUT verify (all 18 entries named in both layout blocks, 12 headings, prefix unchanged vs 6ab713e, READMEs clean after commit) | passed (`LAYOUT-CONTENT OK`; porcelain clean after commit 9459faa) |
| `uv sync --locked --dry-run` | "Resolved 71 packages", "Checked 68 packages", "Would make no changes" |
| `uv run pytest backend/tests -q` | 389 passed, 1 warning (StarletteDeprecationWarning from httpx), 64.38 s |
| `uv run ruff check backend` | All checks passed |
| `uv run ruff format --check backend` | 52 files already formatted |
| `uv run ruff check scripts/seed_images.py` | All checks passed |
| `uv run ruff format --check scripts/seed_images.py` | 1 file already formatted |
| `npm --prefix frontend run test -- --run` | 51 test files, 564 tests passed, 58.22 s |
| `npm --prefix frontend run build` | built in 1.06 s; expected chunk-size warning (index 762.93 kB, EditorPage 412.55 kB) and an INEFFECTIVE_DYNAMIC_IMPORT notice for `src/i18n/index.ts` (pre-existing, not touched) |
| `uv run python scripts/check_cli_run_git_clean.py` | exit 0, prints `GIT CLEAN OK` (real 1-epoch CPU run, 12.99 s training, 19.7 s total) |
| `scripts/compose_smoke_test.sh` | SKIPPED by plan: nothing that enters a Docker build changed (`docker/`, `docker-compose.yml`, `.dockerignore`, `backend/src`, `frontend/` untouched; `.gitignore` and READMEs are not copied by either Dockerfile). |

Final integrity proof: `git ls-files -d` empty; `git ls-files -ci --exclude-standard` empty; tracked top-level count 23; `git status --porcelain --untracked-files=normal -- . ':!.planning'` empty; protected items all present (`.venv`, `spikes/.venv312`, `spikes/output`, `data`, `runs`, `trained_models/best.pt`, `yolov8n.pt`, `yolo26n.pt`, `.idea`, `.gsd`, `frontend/node_modules`). `git rev-list --count 6ab713e..HEAD` = 2.

The task 3 verify one-liner was executed as its separate component commands (not as the single `&&` chain) with equivalent results; the final `grep '## Cleanup Report'` condition is satisfied by this file.

## Deviations from Plan

None - plan executed exactly as written (see Drift for a CRLF tooling note).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- `.gitignore` contains `/.gsd/`: FOUND
- Commits ba3f013 and 9459faa: FOUND on `dev`
- Protected local items: all present
