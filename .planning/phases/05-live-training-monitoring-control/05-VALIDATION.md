---
phase: "5"
slug: "live-training-monitoring-control"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-11"
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 (backend, `-m 'not training'` by default) + Vitest 5 / Testing Library / jsdom (frontend) |
| **Config file** | `backend/pyproject.toml` `[tool.pytest.ini_options]`, `frontend/vite.config.ts` `test` block |
| **Quick run command** | `uv run pytest backend/tests/<file> -x` / `npm --prefix frontend run test -- --run <path>` |
| **Full suite command** | `uv run pytest backend/tests -x && uv run ruff check backend && uv run ruff format --check backend && npm --prefix frontend run test -- --run && npm --prefix frontend run build` |
| **Estimated runtime** | ~180 seconds (excluding `bash scripts/compose_smoke_test.sh` and `-m training`) |

---

## Sampling Rate

- **After every task commit:** Run the touched test file(s) with `-x`, plus `uv run ruff check backend` / the touched Vitest file
- **After every plan wave:** Run `uv run pytest backend/tests -x` and `npm --prefix frontend run test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green, plus `bash scripts/compose_smoke_test.sh`
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TRAN-05 | — | Stream scoped by project_id; Last-Event-ID strict int | unit + integration | `uv run pytest backend/tests/test_run_stream.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRAN-05 | — | N/A | unit (Vitest) | `npm --prefix frontend run test -- --run src/features/training` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | TRAN-06 | — | Cancel route requires XHR header; guarded by status | integration | `uv run pytest backend/tests/test_worker_supervisor.py -x` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | TRAN-07 | — | Resume only service-written last.pt in run folder | integration + `training` | `uv run pytest backend/tests/test_runs_api.py backend/tests/test_worker_queue.py -x` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | TRAN-08 | — | Delete guarded by status; id-derived paths only | integration + component | `uv run pytest backend/tests/test_runs_remove.py -x` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | TRAN-11 | — | Allow-listed category codes; error text rendered as text | unit + integration | `uv run pytest backend/tests/test_failures.py backend/tests/test_worker_supervisor.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are assigned by the planner; see `05-RESEARCH.md` § Validation Architecture for the full requirement → test map.*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_run_stream.py` — SSE generator and HTTP layer (TRAN-05)
- [ ] `backend/tests/test_failures.py` — classifier fixtures (TRAN-11)
- [ ] `frontend/src/features/training/progress/*.test.ts(x)` — fold, ETA, stream hook (TRAN-05)
- [ ] `frontend/src/test/fakeEventSource.ts` — shared EventSource stub
- [ ] Fake trainer modes (`slow` with batch events, `resume`) for supervisor tests
- [ ] `training`-marked real kill-and-resume test (TRAN-07)
- [ ] `npm --prefix frontend install recharts@3.10.1`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live charts update during a real CPU run and survive a page reload | TRAN-05 | Real browser + real training timing | Start a CPU run, watch charts and batch bar, reload mid-run, confirm history restored and "Final validation…" shown at the end |
| Cancel then resume a real run | TRAN-06, TRAN-07 | End-to-end in the compose stack | Cancel mid-epoch, confirm `cancelled` within seconds and next run starts; resume, confirm it continues from the checkpoint epoch |
| GPU memory freed after cancel | TRAN-06 | Needs NVIDIA hardware | Deferred to Phase 12 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
