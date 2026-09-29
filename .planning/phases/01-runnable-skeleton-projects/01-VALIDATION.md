---
phase: "1"
slug: "runnable-skeleton-projects"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: true) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-24"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend), Vitest (frontend), compose smoke script (stack) |
| **Config file** | none — Wave 0 installs (`backend/pyproject.toml` `[tool.pytest.ini_options]`, `frontend/vite.config.ts` `test` block) |
| **Quick run command** | `uv run pytest backend/tests -x` (backend) / `npm --prefix frontend run test -- --run` (frontend) |
| **Full suite command** | `uv run pytest backend/tests && npm --prefix frontend run test -- --run && bash scripts/compose_smoke_test.sh` |
| **Estimated runtime** | ~30 seconds (unit/API + Vitest); compose smoke test several minutes on first build |

---

## Sampling Rate

- **After every task commit:** Run the quick command for whichever side the task touched
- **After every plan wave:** Run the full suite command (including the compose smoke test once the stack exists)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds (excluding the compose smoke test)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01/04/10 | 01-01, 01-04, 01-10 | 1, 2, 5 | FOUND-01 | — | N/A | integration | `uv sync && uv run pytest backend/tests -x` | ✅ | ✅ green |
| 1-04 | 01-04 | 2 | FOUND-02 | — | N/A | unit | `uv run pytest backend/tests/test_device.py backend/tests/test_quality.py -x` | ✅ | ✅ green |
| 1-05 | 01-05 | 3 | FOUND-03 | — | N/A | scripted | `uv run python scripts/check_cli_run_git_clean.py` (`GIT CLEAN OK`) | ✅ | ✅ green |
| 1-01/02/06/10 | 01-01, 01-02, 01-06, 01-10 | 1–5 | DEPL-01 | — | Service bound to 127.0.0.1 by default | smoke | `bash scripts/compose_smoke_test.sh` (`SMOKE OK`) | ✅ | ✅ green |
| 1-01/02/10 | 01-01, 01-02, 01-10 | 1, 2, 5 | DEPL-03 | — | N/A | smoke + integration | `bash scripts/compose_smoke_test.sh` (restart + re-check) + `uv run pytest backend/tests/test_persistence.py backend/tests/test_migrations.py -x` | ✅ | ✅ green |
| 1-01/03/07 | 01-01, 01-03, 01-07 | 1–3 | PROJ-01 | — | Input validation; case-insensitive unique name → 409 | integration + component | `uv run pytest backend/tests/test_projects_api.py backend/tests/test_project_validation.py -x` + `npm --prefix frontend run test -- --run` | ✅ | ✅ green |
| 1-01/03/07/08/09 | 01-01, 01-03, 01-07, 01-08, 01-09 | 1–4 | PROJ-02 | — | N/A | integration + component | `uv run pytest backend/tests/test_projects_api.py -x` + `npm --prefix frontend run test -- --run` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/pyproject.toml` `[tool.pytest.ini_options]` — pytest config + test discovery path
- [x] `backend/tests/conftest.py` — async test DB fixture (temp-file SQLite, session override)
- [x] `frontend/vite.config.ts` `test` block + `frontend/src/test-setup.ts` — Vitest + Testing Library setup
- [x] `scripts/compose_smoke_test.sh` — bring up stack, create project via API, `down`/`up`, assert project persists
- [x] Framework installs: `uv sync` (pytest in dev group), `npm install` (vitest)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `git status` clean after a real CLI training run | FOUND-03 | Needs an actual `python train_yolo.py` run (minutes, dataset-dependent) | Run a short CLI training, then `git status --porcelain` must be empty |
| Web UI create/list/open/rename/delete flow in a browser, i18n en/ru, dark theme | PROJ-01, PROJ-02 | Playwright E2E deferred (D-27) | `docker compose up --build`, open http://127.0.0.1:8080, exercise the flows — passed in 01-UAT.md test 1 |
| DEPL-01 on Linux/macOS (incl. Apple Silicon arm64) hosts | DEPL-01 | Hosts not available on dev machine | Run `docker compose up --build` on those hosts — passed in 01-UAT.md test 2 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-29

---

## Validation Audit 2026-09-29

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Evidence: `uv run pytest backend/tests` → 79 passed; `npm --prefix frontend run test -- --run` → 50 passed (10 files); `compose_smoke_test.sh` → `SMOKE OK` and `check_cli_run_git_clean.py` → `GIT CLEAN OK` per 01-VERIFICATION.md. Manual-only items passed in 01-UAT.md.
