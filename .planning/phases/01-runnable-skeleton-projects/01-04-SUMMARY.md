---
phase: 01-runnable-skeleton-projects
plan: 04
subsystem: infra
tags: [uv, pytorch-cpu, ultralytics, hatchling, pytest, ruff, tdd]

# Dependency graph
requires:
  - phase: 01-01
    provides: "uv workspace root (pyproject.toml) + yolo-trainer-backend package under backend/"
provides:
  - "backend/src/yolo_trainer_common: parse_device, quality_assessment, ComputeDevice, detect_compute_device — unit tested, importable without torch"
  - "backend worker extra: torch==2.14.0, torchvision==0.29.0, ultralytics==8.4.159 resolved from an explicit pytorch-cpu uv index (everything else from PyPI)"
  - "root workspace pyproject.toml installs yolo-trainer-backend[worker] + rich into the same .venv the legacy CLI scripts run in"
  - "train_yolo.py / finetune_yolo.py import the shared helpers instead of defining local copies; auto_batch stays local to train_yolo.py"
affects: [06-worker-service, 04-training-jobs, 12-diagnostics]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 22444
  tasks: 2
  commits: 3
plan_head_before: 81a55db9f7255a97d16aff9a7a0bcb89b8a81917

# Tech tracking
tech-stack:
  added: ["torch==2.14.0+cpu", "torchvision==0.29.0+cpu", "ultralytics==8.4.159"]
  patterns:
    - "Lazy in-function torch import (yolo_trainer_common.device.detect_compute_device) so a shared module stays importable in the torch-free api image"
    - "Explicit, name-scoped uv index (pytorch-cpu) + tool.uv.sources pins only torch/torchvision to it; everything else resolves from PyPI"
    - "[project.optional-dependencies] worker extra on the member package, pulled in at the workspace root via yolo-trainer-backend[worker], so api/worker dependency scoping stays declarative"

key-files:
  created:
    - backend/src/yolo_trainer_common/__init__.py
    - backend/src/yolo_trainer_common/device.py
    - backend/src/yolo_trainer_common/quality.py
    - backend/tests/test_device.py
    - backend/tests/test_quality.py
  modified:
    - backend/pyproject.toml
    - pyproject.toml
    - uv.lock
    - train_yolo.py
    - finetune_yolo.py

key-decisions:
  - "Re-verified all three pins against PyPI JSON API and download.pytorch.org/whl/cpu on 2026-09-28: ultralytics 8.4.159 not yanked (latest on PyPI is 8.4.164); torch 2.14.0 not yanked; torchvision 0.29.0 cp312 CPU wheels confirmed for linux x86_64/aarch64, win_amd64, and macOS arm64. All three pins kept unchanged from Phase 0."
  - "tool.uv.index / tool.uv.sources for the pytorch-cpu index live in backend/pyproject.toml (the member that actually declares torch/torchvision as a dependency via the worker extra), not the workspace root — uv resolves sources relative to the pyproject.toml that declares the dependency."
  - "Root pyproject.toml dependency changed from yolo-trainer-backend to yolo-trainer-backend[worker], plus rich>=13 (used only by the legacy CLI scripts, not by the FastAPI app)."

requirements-completed: [FOUND-01, FOUND-02]

coverage:
  - id: D1
    description: "parse_device and quality_assessment exist once in backend/src/yolo_trainer_common with unit tests; ComputeDevice/detect_compute_device added with lazy torch import and guarded get_device_name"
    requirement: "FOUND-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_device.py (9 tests: parse_device x6, detect_compute_device x2, torch-import-guard x1)"
        status: pass
      - kind: unit
        ref: "backend/tests/test_quality.py (6 threshold-boundary tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "uv sync --locked yields Python 3.12 venv with torch 2.14.0 (CPU), torchvision 0.29.0, ultralytics 8.4.159 importable; both pinned exactly (no ranges)"
    requirement: "FOUND-01"
    verification:
      - kind: other
        ref: "uv run python -c \"...\" -> PINS OK 2.14.0+cpu 8.4.159"
        status: pass
    human_judgment: false
  - id: D3
    description: "torch/torchvision resolve only from the explicit pytorch-cpu index (uv.lock records download.pytorch.org/whl/cpu); api image dependency export stays torch-free"
    requirement: "FOUND-01"
    verification:
      - kind: other
        ref: "grep -c download.pytorch.org/whl/cpu uv.lock -> 18; uv export --frozen --no-dev --package yolo-trainer-backend --no-hashes contains no 'torch' line"
        status: pass
    human_judgment: false
  - id: D4
    description: "train_yolo.py and finetune_yolo.py import parse_device/quality_assessment from yolo_trainer_common by identity; only the import block changed; auto_batch stays local to train_yolo.py"
    requirement: "FOUND-02"
    verification:
      - kind: other
        ref: "identity-import check (train_yolo.parse_device is device.parse_device, etc.) -> IMPORTS OK; git diff <task2-base> -- train_yolo.py finetune_yolo.py shows only import-line changes"
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 4: Shared yolo_trainer_common Module + Pinned CPU ML Stack Summary

**Extracted `parse_device`/`quality_assessment`/`detect_compute_device` into a unit-tested `yolo_trainer_common` package and pinned torch 2.14.0 (CPU)/torchvision 0.29.0/ultralytics 8.4.159 from an explicit `pytorch-cpu` uv index, with `train_yolo.py`/`finetune_yolo.py` now importing the shared helpers instead of duplicating them.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-28T07:10:00Z (approx)
- **Completed:** 2026-09-28T07:55:00Z (approx)
- **Tasks:** 2
- **Files modified:** 9 (5 created, 4 modified) + uv.lock

## Accomplishments

- `backend/src/yolo_trainer_common/` package: `parse_device` (identical legacy behavior — cpu/int/list[int]/ValueError), `quality_assessment` (exact legacy Russian thresholds), `ComputeDevice` frozen dataclass, `detect_compute_device()` with a lazy in-function `torch` import so the module stays importable in the torch-free api image, guarding `torch.cuda.get_device_name` behind `torch.cuda.is_available()` (fixes the `gpu_test.py` crash pattern for new code)
- 15 new unit tests (`backend/tests/test_device.py`, `test_quality.py`) covering all threshold boundaries, whitespace/case handling, the `ValueError` path, both CUDA branches via an injected fake `torch` module, and a subprocess proof that importing `yolo_trainer_common.device` never pulls in `torch`
- `backend/pyproject.toml`: new `[project.optional-dependencies] worker` extra pinning `torch==2.14.0`, `torchvision==0.29.0`, `ultralytics==8.4.159`, resolved only from an explicit `pytorch-cpu` uv index (`tool.uv.sources` + `tool.uv.index`) — everything else still resolves from PyPI
- Root `pyproject.toml` now depends on `yolo-trainer-backend[worker]` + `rich>=13`; `uv lock` + `uv sync --locked` produced a working Python 3.12 CPU-only ML environment
- `train_yolo.py` / `finetune_yolo.py`: only the import block changed — both files now import `parse_device`/`quality_assessment` from `yolo_trainer_common` instead of defining local copies; `auto_batch` (the known-bad hardcoded-VRAM heuristic) intentionally stays local to `train_yolo.py`, unmigrated, per plan and RESEARCH.md

## Task Commits

Each task was committed atomically (TDD: RED then GREEN for Task 1):

1. **Task 1: Shared yolo_trainer_common module (RED)** - `12594ad` (test)
2. **Task 1: Shared yolo_trainer_common module (GREEN)** - `116a7a0` (feat)
3. **Task 2: Pinned ML stack + legacy scripts switched to shared module** - `82f2c78` (feat)

**Plan metadata:** commit to follow this SUMMARY (docs(01-04): complete plan)

_Note: Task 1 was `tdd="true"` — a brand-new module, so RED was a `ModuleNotFoundError` collection error rather than a target-test assertion failure (see TDD Gate Compliance below). Task 2 was a plain `type="auto"` task._

## Files Created/Modified

- `backend/src/yolo_trainer_common/__init__.py` - re-exports `parse_device`, `quality_assessment`, `ComputeDevice`, `detect_compute_device`
- `backend/src/yolo_trainer_common/device.py` - `parse_device`, `ComputeDevice`, `detect_compute_device` (lazy torch import)
- `backend/src/yolo_trainer_common/quality.py` - `quality_assessment`
- `backend/tests/test_device.py` - 9 tests (parse_device x6, detect_compute_device x2, torch-import-guard subprocess check x1)
- `backend/tests/test_quality.py` - 6 threshold-boundary tests
- `backend/pyproject.toml` - `worker` optional-dependency extra + `pytorch-cpu` uv index/sources + `yolo_trainer_common` added to hatch wheel packages
- `pyproject.toml` - root dependency now `yolo-trainer-backend[worker]` + `rich>=13`
- `uv.lock` - refreshed lock recording the pinned CPU wheels
- `train_yolo.py` - import block only: added `from yolo_trainer_common.device import parse_device` / `from yolo_trainer_common.quality import quality_assessment`, removed local definitions
- `finetune_yolo.py` - same import-only change

## Decisions Made

See frontmatter `key-decisions`: pins re-verified and kept unchanged; uv index/sources placed in `backend/pyproject.toml` (the declaring member) rather than the workspace root; root dependency updated to the `[worker]` extra plus `rich`.

## Deviations from Plan

None - plan executed exactly as written. The plan's own fallback instruction ("if uv reports sources/indexes must live in the member that declares the dependency, move both into backend/pyproject.toml instead") was followed proactively, since that is uv's documented resolution behavior for workspace members — the root `pyproject.toml` only depends on `yolo-trainer-backend[worker]`, not on `torch`/`torchvision` directly, so declaring the source override there would not apply to the actual dependency requirement.

## TDD Gate Compliance

Task 1 was marked `tdd="true"`. This project's `workflow.tdd_mode` is not present/enabled in `.planning/config.json`, so the strict RED/GREEN gate sequence (`gsd_run check tdd-red-evidence`) was not enforced as a hard gate (same situation as Plan 01-01's Task 2). The RED-GREEN cycle was still followed:

- **RED:** `backend/tests/test_device.py` and `test_quality.py` were written first, importing a module (`yolo_trainer_common`) that did not yet exist. Running the suite produced a **collection error** (`ModuleNotFoundError: No module named 'yolo_trainer_common'`) rather than a target-test assertion failure — the expected shape of RED when the module under test is brand new (there is no code path to reach an assertion). Commit `12594ad` (`test(01-04): ...`).
- **GREEN:** Implemented `device.py`, `quality.py`, `__init__.py`, added `src/yolo_trainer_common` to `backend/pyproject.toml`'s hatch wheel packages, ran `uv sync` to pick up the new package. All 15 new tests passed; full backend suite went from 33 to 48 passed. Commit `116a7a0` (`feat(01-04): ...`).
- **REFACTOR:** Not needed beyond `ruff format` auto-wrapping one line in `test_device.py` (folded into the GREEN commit, no separate commit).
- **Commits:** `test(01-04)` -> `feat(01-04)`, matching the required RED->GREEN commit-scope pattern.

## Issues Encountered

None. The known pre-existing case-mismatch bug (`train_yolo.py` reads `"Config/Config.ini"` while the file on disk is `config/config.ini`) was left untouched per D-24 ("only imports change") and RESEARCH.md's explicit flag — it remains a Linux/macOS-only breakage for the owner to decide on, tracked as a STATE.md blocker from Plan 01-01/RESEARCH, unaffected by this plan.

## User Setup Required

None - no external service configuration required.

## Toolchain / Pin Versions (for reproducibility)

- uv 0.12.19 (Windows x86_64), Python 3.12.10 (uv-managed venv)
- torch 2.14.0+cpu, torchvision 0.29.0+cpu, ultralytics 8.4.159 (re-verified against PyPI + download.pytorch.org/whl/cpu on 2026-09-28; none yanked)
- `uv.lock` records `download.pytorch.org/whl/cpu` 18 times (torch + torchvision entries); `uv export --frozen --no-dev --package yolo-trainer-backend --no-hashes` contains no `torch` line, confirming the api image stays light

## Next Phase Readiness

- `yolo_trainer_common` is now the shared module Plan 06 (worker Docker image) and Phase 4 (training worker) will import for device selection and quality reporting.
- A fresh `uv sync --locked` at the repo root reaches the full pinned stack (Python 3.12, PyTorch 2.14.0 CPU, Ultralytics 8.4.159), satisfying Phase 1 success criteria 1-2's "fresh clone reaches the pinned stack" requirement for the developer path.
- `python train_yolo.py` / `python finetune_yolo.py` still import cleanly from the repo root with no `sys.path` hacks (proven by the identity-import check); actually running a full training job was out of scope for this plan's `<verify>` block and was not attempted (the checked-in `config/config.ini` points at dataset paths that do not exist on this machine).
- No new blockers introduced. Pre-existing STATE.md blockers (DEPL-01 on Linux/macOS, tracked-binary history rewrite, GPU-path acceptance, `Config/Config.ini` case mismatch) remain open and unaffected by this plan.

## Self-Check: PASSED

All key files (`backend/src/yolo_trainer_common/{__init__,device,quality}.py`, `backend/tests/{test_device,test_quality}.py`) confirmed present on disk. All three task commits (`12594ad`, `116a7a0`, `82f2c78`) confirmed in `git log --oneline --all`. Re-ran the plan's full `<verification>` block clean: `uv sync --locked` + pin assertion -> `PINS OK 2.14.0+cpu 8.4.159`; identity-import check -> `IMPORTS OK`; `uv run pytest backend/tests -x -q` -> `48 passed`. `git diff <task2-base> -- train_yolo.py finetune_yolo.py` confirmed import-only changes.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
