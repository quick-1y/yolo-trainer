---
phase: quick-261004-rnk
verified: 2026-10-04T00:00:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Quick 261004-rnk: GitHub Actions CI Verification Report

**Goal:** Add `.github/workflows/ci.yml` (push and pull_request on dev and main) with a backend job (uv, pytest, ruff check, ruff format --check) and a frontend job (Node from frontend/package.json, npm ci, test --run, build), with uv and npm caching, plus a CI badge in README.md and README.ru.md.
**Commits:** fdcb76a, 430efec
**Status:** passed
**Mode:** initial verification (static checks plus cheap local commands; Docker replays were not repeated).

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One workflow `CI`, triggers push and pull_request on [dev, main], two jobs on ubuntu-latest | VERIFIED | `ci.yml` lines 3-9, 23, 56. A YAML parse confirmed the triggers are exactly {push, pull_request} with branches {dev, main}. |
| 2 | Backend job: uv 0.12.19, cache enabled, `uv sync --locked`, pytest, ruff check, ruff format --check | VERIFIED | Lines 32-52. setup-uv has `version: "0.12.19"` and `enable-cache: true`. The commands are `uv sync --locked`, `uv run pytest backend/tests`, `uv run ruff check backend` and `uv run ruff format --check backend`. The lint and format steps use `if: !cancelled() && steps.sync.conclusion == 'success'`, so a failing test does not hide lint results. |
| 3 | Frontend job: Node from frontend/package.json, npm cache, `npm ci`, `npm run test -- --run`, `npm run build` in frontend/ | VERIFIED | Lines 54-84. It has `defaults.run.working-directory: frontend`, `node-version-file: frontend/package.json`, `cache: npm` and `cache-dependency-path: frontend/package-lock.json`. `frontend/package.json` now has `engines.node = ^24.15.0`; `package-lock.json` is changed only by the matching 3-line root `engines` block. `package.json` scripts: `test` is `vitest` and `build` is `tsc --noEmit && vite build`. |
| 4 | Both jobs' command sequences were replayed on Linux and passed | VERIFIED (per SUMMARY; not re-run) | The SUMMARY records backend 389 passed, ruff clean, 52 files formatted, and frontend 51 files / 564 tests passed with a successful build, from `git archive HEAD` in containers. I did not repeat these Docker replays, as instructed. Locally, `uv sync --locked --dry-run` reports "Would make no changes", so uv.lock is consistent with the CI sync. |
| 5 | CI badge in both READMEs, structure unchanged | VERIFIED | Line 3 of README.md and README.ru.md is the identical badge line pointing at `quick-1y/yolo-trainer/actions/workflows/ci.yml`. Line 4 is blank, and the language-switch link moved to line 5. Each file still has 12 `##` headings. The URL matches `git remote -v` (`origin https://github.com/quick-1y/yolo-trainer.git`). |
| 6 | Read-only token; every action pinned to a 40-character SHA | VERIFIED | `permissions: {contents: read}`. All 4 `uses:` entries match `@[0-9a-f]{40}`. I re-resolved the tags with `git ls-remote`: checkout v7.0.1 = 3d3c42e5..., setup-node v7.0.0 = 82076278..., setup-uv v10.2.0 = c18668ad.... All match the pinned SHAs. `pull_request_target` and `github.event.` occur 0 times. Both checkouts use `persist-credentials: false`. |

**Score:** 6/6 truths verified. 0 are behavior-unverified.

## Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `.github/workflows/ci.yml` | VERIFIED | Exists, 84 lines, substantive, and contains `uv run pytest backend/tests`. Its YAML structure passes the plan's assertions. |
| `frontend/package.json` | VERIFIED | `engines.node` is `^24.15.0`. |
| `frontend/package-lock.json` | VERIFIED | The commit diff is only the root `engines` block. |
| `README.md`, `README.ru.md` | VERIFIED | Badge line present exactly once in each. |

## Key Links

| From | To | Via | Status |
|------|----|-----|--------|
| ci.yml | frontend/package.json | `node-version-file: frontend/package.json` (reads engines.node) | WIRED |
| ci.yml | uv.lock | `uv sync --locked` | WIRED (uv.lock exists, dry-run clean) |
| README badges | ci.yml | badge.svg and link URL to `actions/workflows/ci.yml` | WIRED |

## Anti-Patterns

None found. There are no TODO, FIXME or XXX markers in the new files, and no event-payload interpolation in `run:` steps.

## Requirements

QUICK-261004-rnk is satisfied. Every item of the task goal is covered: triggers, backend job, frontend job, uv and npm caching, and both badges.

## Notes (advisory, non-blocking)

- The GitHub-side run is unobserved. Nothing was pushed and `gh` is not authenticated, so the first real run happens on the next `git push origin dev`. This is expected for the task and is not a gap.
- The SUMMARY flags a possible flake on a slow shared runner: `ObjectList.test.tsx > mounts only the visible rows for 2000 boxes` (15 s timeout). It was heavy only when the replays ran concurrently, and it passed when run alone. Watch it on the first CI runs.
- The first backend run downloads torch (CPU wheel from the lock). The 30-minute timeout and the uv cache should absorb it.
- The README badge has no `?branch=` parameter. It shows the default branch (`main`) once a `main` run exists, and the latest run before that.

## Human Verification Required

None.

---

_Verified: 2026-10-04_
_Verifier: Claude (gsd-verifier)_
