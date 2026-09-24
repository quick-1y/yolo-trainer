---
phase: "1"
slug: "runnable-skeleton-projects"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 1-XX-XX | TBD | TBD | FOUND-01 | — | N/A | integration | `uv sync && uv run pytest backend/tests -x` | ❌ W0 | ⬜ pending |
| 1-XX-XX | TBD | TBD | FOUND-02 | — | N/A | unit | `uv run pytest backend/tests/test_device.py backend/tests/test_quality.py -x` | ❌ W0 | ⬜ pending |
| 1-XX-XX | TBD | TBD | FOUND-03 | — | N/A | scripted | `git status --porcelain` (empty after CLI run) | ❌ W0 | ⬜ pending |
| 1-XX-XX | TBD | TBD | DEPL-01 | — | Service bound to 127.0.0.1 by default | smoke | `bash scripts/compose_smoke_test.sh` | ❌ W0 | ⬜ pending |
| 1-XX-XX | TBD | TBD | DEPL-03 | — | N/A | smoke | `bash scripts/compose_smoke_test.sh` (restart + re-check) | ❌ W0 | ⬜ pending |
| 1-XX-XX | TBD | TBD | PROJ-01 | — | Input validation; case-insensitive unique name → 409 | integration | `uv run pytest backend/tests/test_projects_api.py -k create -x` | ❌ W0 | ⬜ pending |
| 1-XX-XX | TBD | TBD | PROJ-02 | — | N/A | integration + component | `uv run pytest backend/tests/test_projects_api.py -x` + `npm --prefix frontend run test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs and plan/wave columns are filled in once plans exist.*

---

## Wave 0 Requirements

- [ ] `backend/pyproject.toml` `[tool.pytest.ini_options]` — pytest config + test discovery path
- [ ] `backend/tests/conftest.py` — async test DB fixture (temp-file SQLite, session override)
- [ ] `frontend/vite.config.ts` `test` block + `frontend/src/test-setup.ts` — Vitest + Testing Library setup
- [ ] `scripts/compose_smoke_test.sh` — bring up stack, create project via API, `down`/`up`, assert project persists
- [ ] Framework installs: `uv sync` (pytest in dev group), `npm install` (vitest)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `git status` clean after a real CLI training run | FOUND-03 | Needs an actual `python train_yolo.py` run (minutes, dataset-dependent) | Run a short CLI training, then `git status --porcelain` must be empty |
| Web UI create/list/open/rename/delete flow in a browser, i18n en/ru, dark theme | PROJ-01, PROJ-02 | Playwright E2E deferred (D-27) | `docker compose up --build`, open http://127.0.0.1:8080, exercise the flows |
| DEPL-01 on Linux/macOS (incl. Apple Silicon arm64) hosts | DEPL-01 | Hosts not available on dev machine | Run `docker compose up --build` on those hosts when available |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
