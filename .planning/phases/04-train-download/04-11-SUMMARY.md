---
phase: 04-train-download
plan: 11
subsystem: infra
tags: [ultralytics, verify-script, readme, full-suite, pytest, docker-compose]

requires:
  - phase: 04-train-download
    provides: "04-04 model registration and download, 04-05 training marker tests, 04-10 active run indicator"
provides:
  - "scripts/verify_model_download.py: downstream-style check of a downloaded .pt (plain YOLO(path) + one prediction)"
  - "run_full_suite.sh gate: lint of the verify script and the real CPU training tests, ends with ALL CHECKS OK"
  - "README.md / README.ru.md sections Training a model / Обучение модели plus Your data, Tests and checks, Troubleshooting, Repository layout additions"
  - "One concrete end-of-phase browser and Docker checklist (13 items) for UAT"
affects: [04-verify-work, phase-05]

actuals:
  tokens: 7000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Ultralytics subprocess tests always get an existing YOLO_CONFIG_DIR (otherwise a stray ./Ultralytics appears)"
    - "Assert on the tail of Ultralytics subprocess stdout, not the whole stream (a one-time settings notice precedes it)"

key-files:
  created:
    - scripts/verify_model_download.py
    - backend/tests/test_verify_model_download.py
  modified:
    - scripts/run_full_suite.sh
    - README.md
    - README.ru.md
    - backend/tests/test_train_job.py

key-decisions:
  - "The 13-item human checklist is recorded here for UAT, not in the README, and is not a blocking checkpoint"
  - "Fixed the probe assertion in the 04-05 real-training test instead of weakening the gate"

requirements-completed: [MODL-04, TRAN-01, TRAN-04]

coverage:
  - id: D1
    description: "verify_model_download.py loads a .pt with plain YOLO(path) (sync off), prints task and names, predicts once, prints OK; missing/unloadable file exits 1, failed prediction exits 2"
    requirement: MODL-04
    verification:
      - kind: unit
        ref: "backend/tests/test_verify_model_download.py"
        status: pass
      - kind: integration
        ref: "uv run pytest -m training backend/tests (includes the real yolo26n.pt load and predict cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "bash scripts/run_full_suite.sh lints the new script, runs the training-marker tests and ends with ALL CHECKS OK"
    requirement: TRAN-04
    verification:
      - kind: integration
        ref: "bash scripts/run_full_suite.sh -> ALL CHECKS OK, exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "README (en and ru) documents splits, start form defaults, queue, restarts, download and YOLO(path), Ultralytics version, embedded paths, data layout, offline weights and SQLITE_JOURNAL_MODE"
    requirement: TRAN-01
    verification: []
    human_judgment: true
    rationale: "Documentation quality and accuracy against the running UI cannot be judged by automation; only presence of sections and commands is grep-checked"
  - id: D4
    description: "End-of-phase browser and Docker checklist (13 items incl. three UI backstops)"
    verification: []
    human_judgment: true
    rationale: "Browser-only behaviors, restarts of live containers, EXIF rendering and visual fit at 1024 px need a human in Chrome/Edge/Firefox"

duration: 55min
completed: 2026-10-10
status: complete
plan_head_before: a008a249cd3f05901678089df4fe37d693ef9624
plan_head_after: 2636d87e72a5c5dc8d82ccfbecaf0c996e10e1fe
---

# Phase 4 Plan 11: Verify script, training docs and the phase gate Summary

**A downstream-style `YOLO(path)` check script for downloaded models, bilingual README coverage of training and download, and a green `run_full_suite.sh` (real CPU training and the Docker smoke test included) ending in `ALL CHECKS OK`.**

## Performance

- **Duration:** about 55 min (Task 2 continuation, including three full-suite runs)
- **Completed:** 2026-10-10
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `scripts/verify_model_download.py`: mirrors the downstream project's `YOLO(path)` usage, sync off before import, exit codes 0 / 1 / 2, covered by unit and `training`-marker tests (Task 1, carried over from the previous executor).
- `run_full_suite.sh`: ruff check and format check for the verify script and `uv run pytest -m training backend/tests`; last line stays `ALL CHECKS OK`.
- README.md and README.ru.md: new section "Training a model" / «Обучение модели» (splits and auto-split, start form and defaults, one run at a time, restart behavior, first-use weight download and offline pre-placement, download as `<project>_<run>_best.pt`, loading with `YOLO(path)`, Ultralytics version note, embedded server paths, CPU slowness, analytics off), plus "Your data" (`data/runs/<run id>/`, `data/models/<model id>.pt`, `data/weights/`, deletion with the project), "Tests and checks", "Troubleshooting" (worker not responding, "Could not download ...", `SQLITE_JOURNAL_MODE` for api and worker, macOS `DELETE`) and the scripts line in "Repository layout". Sections, commands, paths and env names are identical in both languages.
- Full suite: 645 backend tests, 3 training tests, ruff, 731 frontend tests, frontend build, compose smoke test (`SMOKE OK`) and the legacy CLI git-clean check all pass.

## Task Commits

1. **Task 1 (RED): failing tests for the downstream-style .pt check** - `7b539aa` (test)
2. **Task 1 (GREEN): verify_model_download.py and full-suite steps** - `0d2b099` (feat)
3. **Task 2: README sections (en and ru)** - `25fc753` (docs)
4. **Task 2: probe assertion fix found by the gate** - `2636d87` (fix)

**Plan metadata:** the commit that adds this SUMMARY (docs: complete plan). STATE.md and ROADMAP.md are left to the orchestrator.

## Files Created/Modified

- `scripts/verify_model_download.py` - CLI check of a downloaded `.pt`
- `backend/tests/test_verify_model_download.py` - unit and `training` tests for it
- `scripts/run_full_suite.sh` - verify-script lint, training-marker tests
- `README.md`, `README.ru.md` - training, download, data layout, checks, troubleshooting
- `backend/tests/test_train_job.py` - real-training probe made robust (see deviations)

## Decisions Made

- The human checklist below is for UAT and is deliberately not part of the README.
- The failing assertion was repaired in the test, not worked around in the gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Real-training probe asserted on the whole Ultralytics stdout**
- **Found during:** Task 2 (first `run_full_suite.sh` run, `-m training` step)
- **Issue:** `test_a_real_two_epoch_cpu_run_registers_a_model_a_plain_script_can_load` (Plan 04-05) ran its probe with a non-existent `YOLO_CONFIG_DIR`, so Ultralytics printed a WARNING and created `./Ultralytics`. Once the directory existed it still printed "Creating new Ultralytics Settings ..." on first use, so `stdout.split() == ["detect", "['box']", "PREDICT_OK"]` failed.
- **Fix:** create the probe config directory first; compare `stdout.split()[-3:]` (the probe's own three lines).
- **Files modified:** `backend/tests/test_train_job.py`
- **Verification:** `uv run pytest -m training backend/tests` -> 3 passed; ruff check and format clean; final full suite green.
- **Committed in:** `2636d87`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for the phase gate to pass; no scope creep.

## Issues Encountered

- The first full run ended at `check_cli_run_git_clean.py` ("dataset images not found"): `example_ready_dataset/{train,valid,test}` are git-ignored and exist only in the main checkout, not in the worktree. I copied them into the worktree (they stay ignored and uncommitted) and re-ran the whole suite: `ALL CHECKS OK`, exit 0. This is a worktree environment matter, not a code defect.
- The training tests need the git-ignored repo-root `yolo26n.pt`; it was copied into the worktree and not committed. `YOLO_CONFIG_DIR` pointed at an existing scratch directory for all runs; no stray `Ultralytics/` folder remains.

## User Setup Required

None - no external service configuration required.

## Human Checklist for UAT (end-of-phase batch, not a blocking checkpoint)

After `docker compose up --build` on the CPU dev machine, in Chrome or Edge and in Firefox:

1. Create a detect project, upload about 20 images, add two classes, annotate at least 10 images with boxes and mark one as background (SC1 setup).
2. On the grid select several images and use "Set split"; in the editor change one image's split from the top bar and confirm the save indicator and status badge do not change; check the tile pills and the "Split — ..." line.
3. Open "Split dataset", change the ratios, read the preview, apply; in a second tab assign one unassigned image by hand first and confirm the first tab's Apply answers with the "changed" message (D-03).
4. Open New training before any split exists: Start is disabled with the reasons and the "Split dataset" link; after splitting it enables; check the unannotated warning (SC1, D-04, D-05).
5. Start yolo26n, 3 epochs, image size 320, CPU; close the browser tab, reopen the run page: epoch progress continues; the header indicator shows on the Projects page and inside the editor; draw a box and click the editor indicator: the box saves before the run page opens (SC3, D-14).
6. Start a run in a second project while the first trains: it shows "In queue: 1"; remove it from the queue (D-11).
7. `docker compose restart api` mid-run: the run stays running; `docker compose restart worker` mid-run: the run becomes interrupted and a queued run starts afterwards (SC3, D-13).
8. After completion download the `.pt` from the run page and the list, then in the downstream project's own Python environment run `YOLO("<file>").predict("<image>")` and `uv run python scripts/verify_model_download.py <file> --image <image>` (SC4, A5).
9. Start a run in another detect project with the trained model as the base and check the classes-differ note (D-08).
10. With the worker's network cut (`docker network disconnect` or no internet) and no `data/weights/yolo11s.pt`, start a run on yolo11s: it fails with the download message and the log toggle works (D-15).
11. Delete a project with runs and models: the dialog lists the counts; with a queued run it is blocked (D-21).
12. Backstops: a 100-character run name in the run list (en and ru) truncates with a title; a run whose log has a 5,000-character line wraps inside the log block; at a 1024 px wide window in Russian the editor top bar fits with the indicator and split menu (only the filename shrinks); also check 1440 px in en and ru (plan 04-10 fit check).
13. A3: upload a JPEG with EXIF orientation 6, include it in a run, and confirm `docker compose exec worker /app/.venv/bin/python -c "import cv2; print(cv2.imread('/data/projects/<p>/images/<id>.jpg').shape)"` reports the same width/height as the image's tile/editor (oriented), not swapped.

## Known Stubs

None - the files created or modified here contain no placeholder data paths.

## Threat Flags

None - the verify script adds no network endpoint; the pickle-load risk (T4-11-01) is accepted and the README repeats the `.pt` trust warning; telemetry is switched off (T4-11-02); embedded server paths are documented (T4-11-03).

## Next Phase Readiness

- Automated gate for Phase 4 is green; remaining sign-off is the human checklist above before `/gsd-verify-work`.
- Not run on a GPU or on macOS / native Linux hosts (assumptions A1, A9, A11 remain unverified there).

## Self-Check: PASSED

- FOUND: scripts/verify_model_download.py, backend/tests/test_verify_model_download.py, README.md (`## Training a model`), README.ru.md (`## Обучение модели`)
- FOUND commits: 7b539aa, 0d2b099, 25fc753, 2636d87 (all ancestors of HEAD)
- `bash scripts/run_full_suite.sh` -> last line `ALL CHECKS OK`, exit 0

---
*Phase: 04-train-download*
*Completed: 2026-10-10*
