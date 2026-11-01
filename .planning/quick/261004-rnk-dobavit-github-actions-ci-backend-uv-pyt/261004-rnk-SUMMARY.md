---
phase: quick-261004-rnk
plan: 01
subsystem: ci
tags: [github-actions, ci, uv, npm, ruff, pytest, vitest]
requires: []
provides:
  - ".github/workflows/ci.yml: CI workflow (backend + frontend jobs)"
  - "frontend/package.json engines.node = ^24.15.0 (single Node version source for CI)"
  - "CI status badge in README.md and README.ru.md"
affects: [frontend/package.json, frontend/package-lock.json, README.md, README.ru.md]
tech-stack:
  added: [actions/checkout 7.0.1, actions/setup-node 7.0.0, astral-sh/setup-uv 10.2.0]
  patterns: [SHA-pinned actions, read-only GITHUB_TOKEN, lockfile-enforced installs]
key-files:
  created: [.github/workflows/ci.yml]
  modified: [frontend/package.json, frontend/package-lock.json, README.md, README.ru.md]
decisions:
  - "Node version comes from engines.node (^24.15.0) in frontend/package.json via setup-node node-version-file"
  - "uv pinned to 0.12.19 (same as docker/Dockerfile.backend); uv sync --locked fails CI on a stale uv.lock"
  - "Every action pinned to a full 40-char commit SHA; permissions limited to contents: read; plain pull_request event only"
metrics:
  tasks: 3
  commits: 2
  completed: 2026-10-04
status: complete
commits: 2
plan_head_before: ca3fd4f8f23e4170ad6b2ee0c3488f47733c8a55
actuals:
  tokens: 6000
  tasks: 3
  commits: 2
---

# Phase quick-261004-rnk Plan 01: GitHub Actions CI Summary

GitHub Actions CI on push/PR to `dev` and `main`: a uv-based backend job (pytest, ruff lint, ruff format check) and an npm-based frontend job (vitest, build) with Node taken from `frontend/package.json`, plus a CI status badge in both READMEs.

## What was built

- **Task 1 (tracer), commit `fdcb76a`:** `.github/workflows/ci.yml` with jobs `backend` and `frontend` (both ubuntu-latest). Backend: setup-uv 10.2.0 (uv 0.12.19, `enable-cache: true`), `uv sync --locked`, `uv run pytest backend/tests`, `uv run ruff check backend`, `uv run ruff format --check backend` (the two ruff steps run even if tests fail). Frontend: setup-node 7.0.0 with `node-version-file: frontend/package.json`, `cache: npm`, then `npm ci`, `npm run test -- --run`, `npm run build` in `frontend/`. Added `engines.node: ^24.15.0` to `frontend/package.json`; the lockfile diff is exactly the 3-line root `engines` block. Action SHAs were re-resolved with `git ls-remote` and match the plan (checkout v7.0.1 `3d3c42e5...`, setup-node v7.0.0 `82076278...`, setup-uv v10.2.0 `c18668ad...`). actionlint 1.7.12 reports zero findings; the structural checks, `pull_request_target`/`github.event.` absence checks and `uv sync --locked --dry-run` all pass.
- **Task 2, commit `430efec`:** identical badge line inserted as line 3 of `README.md` and `README.ru.md` (CRLF line endings preserved), both still 12 `##` headings, language-switch links now on line 5.
- **Task 3 (replay, no tracked-file changes):** both job command sequences replayed on Linux from `git archive HEAD` (LF, `CI=true`).

## Linux replay results (HEAD 430efec)

- **Backend** (python:3.12-slim + uv 0.12.19, plus `libgl1 libglib2.0-0`): `uv sync --locked` ok; **389 passed, 0 skipped**, 1 warning (StarletteDeprecationWarning for httpx, pre-existing); `ruff check`: All checks passed; `ruff format --check`: 52 files already formatted.
- **Frontend** (node:24-alpine, Node 24.21.0): `npm ci` ok; **51 files / 564 tests passed**; `npm run build` succeeded (chunk-size and ineffective-dynamic-import warnings only, same as host).

## Deviations from Plan

**1. Replay environment adjustment (not a workflow or code change)**
- **Found during:** Task 3, first backend replay.
- **Issue:** On bare python:3.12-slim, 24 cases of `test_reported_size_matches_the_opencv_decoder_for_every_orientation` FAILED with `ImportError: libxcb.so.1` rather than skipping as the plan expected (`pytest.importorskip` only skips on missing modules, and this is an `ImportError` from the cv2 shared library). This is a property of the slim image, not of the repo: `docker/Dockerfile.backend` installs `libgl1 libglib2.0-0` for the same reason, and GitHub's ubuntu-latest runner ships these libs.
- **Fix:** Re-ran the replay with `apt-get install libgl1 libglib2.0-0` (the Dockerfile's own runtime libs). 389 passed, 0 skipped. No test was skipped, deselected or weakened; the workflow is unchanged.
- **Commit:** none (no tracked files changed).

**2. Frontend test timeout under load (flaky, transient)**
- **Found during:** Task 3, first frontend replay, which ran concurrently with the backend replay (torch install and pytest saturating the Docker VM).
- **Issue:** `ObjectList.test.tsx > mounts only the visible rows for 2000 boxes` timed out at the 15000 ms test timeout (563/564 passed).
- **Fix:** none required. Re-ran the replay alone: 564/564 passed. Note for the first GitHub runs: that test is a heavy 2000-box render with a 15 s timeout, so it could flake on a slow shared runner. It passed on Windows host, and on Linux when not CPU-starved. Watch it on the first runs; it was not changed here (out of scope).

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. All threat-register mitigations (T-rnk-01..05, SC) are implemented and asserted by the Task 1 verify.

## Notes for the user

- Nothing was pushed. The first real GitHub run is unobserved until the next `git push origin dev` (gh is not authenticated here).
- `main` has no CI run yet, so the badge (no `?branch=` param) shows the most recent run on any branch until `main` gets one.
- The `yolo-trainer-ci-uv-cache` Docker volume was removed after the replays.

## Self-Check: PASSED

- `.github/workflows/ci.yml` exists; commits `fdcb76a` and `430efec` exist on `dev`; `git rev-list --count ca3fd4f..HEAD` = 2; working tree has only the pre-existing untracked `.gsd/` and `.planning/ui-reviews/`.
