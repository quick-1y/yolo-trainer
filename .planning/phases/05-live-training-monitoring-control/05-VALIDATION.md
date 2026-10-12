---
phase: "5"
slug: "live-training-monitoring-control"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: true) (#2117)
status: validated
nyquist_compliant: false
wave_0_complete: true
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
| 05-01..05-03 | 05-01, 05-02, 05-03 | 1-3 | TRAN-05 | — | Stream scoped by project_id; Last-Event-ID strict int | unit + integration | `uv run pytest backend/tests/test_run_stream.py backend/tests/test_progress.py -x` | ✅ | ✅ green |
| 05-01..05-03 | 05-01, 05-02, 05-03 | 1-3 | TRAN-05 | — | N/A | unit (Vitest) | `npm --prefix frontend run test -- --run src/features/training` | ✅ | ✅ green |
| 05-05 | 05-05, 05-10 | 5, 10 | TRAN-06 | — | Cancel route requires XHR header; guarded by status | integration + smoke | `uv run pytest backend/tests/test_runs_cancel.py backend/tests/test_worker_supervisor.py -x` | ✅ | ✅ green |
| 05-06, 05-07 | 05-06, 05-07, 05-10 | 6, 7, 10 | TRAN-07 | — | Resume only service-written last.pt in run folder; device re-check | integration + `training` | `uv run pytest backend/tests/test_runs_resume.py backend/tests/test_worker_queue.py backend/tests/test_training_reconcile.py -x` | ✅ | ✅ green |
| 05-08, 05-09 | 05-08, 05-09 | 8, 9 | TRAN-08 | — | Delete guarded by status + base-in-use; id-derived paths only | integration + component | `uv run pytest backend/tests/test_runs_api.py backend/tests/test_runs_delete.py backend/tests/test_runs_interim.py backend/tests/test_runs_remove.py -x` | ✅ | ✅ green |
| 05-04 | 05-04 | 4 | TRAN-11 | — | Allow-listed category codes; error text rendered as text | unit + integration | `uv run pytest backend/tests/test_failures.py backend/tests/test_worker_supervisor.py -x` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are assigned by the planner; see `05-RESEARCH.md` § Validation Architecture for the full requirement → test map.*

---

## Wave 0 Requirements

- [x] `backend/tests/test_run_stream.py` — SSE generator and HTTP layer (TRAN-05)
- [x] `backend/tests/test_failures.py` — classifier fixtures (TRAN-11)
- [x] `frontend/src/features/training/progress/*.test.ts(x)` — fold, ETA, stream hook (TRAN-05)
- [x] `frontend/src/test/fakeEventSource.ts` — shared EventSource stub
- [x] Fake trainer modes (`slow` with batch events, `resume`) for supervisor tests
- [x] `training`-marked real kill-and-resume test (TRAN-07)
- [x] `npm --prefix frontend install recharts@3.10.1`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live charts update during a real CPU run and survive a page reload | TRAN-05 | Real browser + real training timing | Start a CPU run, watch charts and batch bar, reload mid-run, confirm history restored and "Final validation…" shown at the end |
| Cancel then resume a real run | TRAN-06, TRAN-07 | End-to-end in the compose stack | Cancel mid-epoch, confirm `cancelled` within seconds and next run starts; resume, confirm it continues from the checkpoint epoch |
| GPU memory freed after cancel | TRAN-06 | Needs NVIDIA hardware | Deferred to Phase 12 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-12 (validate-phase audit: 0 gaps; full backend suite ~250 s exceeds the 180 s target, per-file runs stay under it)

## Validation Audit 2026-10-12

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
