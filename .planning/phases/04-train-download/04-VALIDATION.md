---
phase: "4"
slug: "train-download"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-04"
validated: "2026-10-10"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed by validate-phase on 2026-10-10 from the 11 PLAN and SUMMARY files after execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend, uv) + Vitest/jsdom (frontend) + bash compose smoke test |
| **Config file** | `backend/pyproject.toml` (pytest, `training` marker deselected by default), `frontend/vite.config.ts` |
| **Quick run command** | `uv run pytest backend/tests/<file>.py -x` / `npm --prefix frontend run test -- --run <Name>` |
| **Full suite command** | `bash scripts/run_full_suite.sh` (backend + `-m training` + ruff + frontend build/tests + compose smoke + CLI git-clean check) |
| **Estimated runtime** | quick: seconds per file; full suite: ~15–25 min (real CPU training + Docker build) |

---

## Sampling Rate

- **After every task commit:** the task's `<automated>` command (per-file pytest / Vitest filter)
- **After every plan wave:** `uv run pytest backend/tests` + `npm --prefix frontend run build` + `npx vitest run` (post-merge gate)
- **Before `/gsd-verify-work`:** `bash scripts/run_full_suite.sh` must end with `ALL CHECKS OK`
- **Max feedback latency:** per-task commands run in seconds; the full suite is a phase gate, not a per-commit check

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | TRAN-01, MODL-01, MODL-04, DATA-05 | T4-01 | Run snapshot taken in the INSERT transaction; no outbound access except weights | e2e tracer | `bash scripts/compose_smoke_test.sh`; `uv run pytest backend/tests -x` | ✅ | ✅ green |
| 4-01-02 | 01 | 1 | TRAN-01, TRAN-03, TRAN-04, MODL-03 | — | N/A | integration | `uv run pytest backend/tests/test_training_pipeline.py -x` | ✅ | ✅ green |
| 4-02-01 | 02 | 2 | TRAN-04 | — | N/A | component | `npm --prefix frontend run test -- --run TrainingPage locales` | ✅ | ✅ green |
| 4-02-02 | 02 | 2 | MODL-04, TRAN-04 | — | N/A | unit + component | `uv run pytest backend/tests/test_quality.py -x`; `npm … --run RunPage` | ✅ | ✅ green |
| 4-02-03 | 02 | 2 | TRAN-01 | — | Options validated server-side (422) | integration + component | `uv run pytest backend/tests/test_training_options.py backend/tests/test_training_pipeline.py -x`; `npm … --run NewRunPage` | ✅ | ✅ green |
| 4-03-01 | 03 | 2 | DATA-05 | — | N/A | API + component | `uv run pytest backend/tests/test_splits_api.py -x`; `npm … --run ImageTile StatusSummary` | ✅ | ✅ green |
| 4-03-02 | 03 | 2 | DATA-05 | — | N/A | component | `npm … --run ImagesSplit ImagesSelection` | ✅ | ✅ green |
| 4-03-03 | 03 | 2 | DATA-05 | — | N/A | component | `npm … --run EditorSplit EditorStatus EditorSaving EditorKeyboard` | ✅ | ✅ green |
| 4-04-01 | 04 | 2 | TRAN-03 | — | N/A | unit | `uv run pytest backend/tests/test_training_labels.py -x` | ✅ | ✅ green |
| 4-04-02 | 04 | 2 | TRAN-03 | — | Snapshot immutable after start | integration | `uv run pytest backend/tests/test_training_snapshot.py backend/tests/test_migrations.py -x` | ✅ | ✅ green |
| 4-05-01 | 05 | 2 | TRAN-04, MODL-03 | — | No run stuck in running after restart | integration | `uv run pytest backend/tests/test_worker.py backend/tests/test_worker_queue.py backend/tests/test_training_reconcile.py -x` | ✅ | ✅ green |
| 4-05-02 | 05 | 2 | TRAN-04, MODL-03 | — | No orphan child processes / partial model files | integration | `uv run pytest backend/tests/test_progress.py backend/tests/test_worker_supervisor.py backend/tests/test_training_pipeline.py -x` | ✅ | ✅ green |
| 4-05-03 | 05 | 2 | MODL-01, TRAN-04 | T4-05 | Ultralytics analytics off (`sync: False`) | real CPU training | `uv run pytest -m training backend/tests/test_train_job.py -x` | ✅ | ✅ green |
| 4-06-01 | 06 | 3 | DATA-05 | — | Apply = previewed split or 409 | unit + API | `uv run pytest backend/tests/test_splits_auto.py backend/tests/test_splits_api.py -x` | ✅ | ✅ green |
| 4-06-02 | 06 | 3 | DATA-05 | — | N/A | component | `npm … --run AutoSplitDialog ImagesPage locales` | ✅ | ✅ green |
| 4-07-01 | 07 | 3 | TRAN-04, MODL-04 | — | Queue removal guarded by `status='queued'`; download filename sanitized | API | `uv run pytest backend/tests/test_runs_remove.py backend/tests/test_models_download.py -x` | ✅ | ✅ green |
| 4-07-02 | 07 | 3 | TRAN-03, TRAN-04 | — | Failure log rendered as text only | component | `npm … --run RunPage TrainingPage locales` | ✅ | ✅ green |
| 4-08-01 | 08 | 4 | TRAN-01, MODL-01, DATA-05 | — | Model base by id only; any `path` → 422 | API + integration | `uv run pytest backend/tests/test_training_options.py backend/tests/test_runs_api.py backend/tests/test_training_pipeline.py -x` | ✅ | ✅ green |
| 4-08-02 | 08 | 4 | TRAN-01, DATA-05 | — | N/A | component | `npm … --run NewRunPage AutoSplitDialog locales` | ✅ | ✅ green |
| 4-09-01 | 09 | 3 | MODL-03 | — | Delete blocked while a run is active; orphan sweep never follows links | API + storage | `uv run pytest backend/tests/test_training_cleanup.py backend/tests/test_projects_api.py backend/tests/test_storage_cleanup.py -x` | ✅ | ✅ green |
| 4-09-02 | 09 | 3 | MODL-03 | — | N/A | component | `npm … --run DeleteProjectModal ProjectSettingsPage locales` | ✅ | ✅ green |
| 4-10-01 | 10 | 5 | TRAN-04 | — | N/A | API + component | `uv run pytest backend/tests/test_training_active.py -x`; `npm … --run ActiveRunIndicator` | ✅ | ✅ green |
| 4-10-02 | 10 | 5 | TRAN-04 | — | Navigation saves before leaving the editor | component | `npm … --run ActiveRunIndicator EditorLeave EditorNavigation EditorSplit` | ✅ | ✅ green |
| 4-11-01 | 11 | 6 | MODL-04 | T4-11-01 | `.pt` loaded only via plain `YOLO(path)`, trust warning documented | unit + real load | `uv run pytest backend/tests/test_verify_model_download.py -x`; `-m training` | ✅ | ✅ green |
| 4-11-02 | 11 | 6 | TRAN-01, TRAN-04 | — | N/A | full gate | `bash scripts/run_full_suite.sh` → `ALL CHECKS OK` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Every task has an automated command; no three consecutive tasks lack automated verification. Last full run: backend 645 passed (+3 `training`), frontend 731 passed, build OK, compose smoke OK (2026-10-10).

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

These are browser, Docker-restart and visual checks that automation cannot judge. They are batched for `/gsd-verify-work` (source: 04-11-SUMMARY "Human Checklist for UAT").

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end loop in a real browser (create, upload, classes, annotate, background) | TRAN-01 | Real browser UX | Checklist item 1 |
| Bulk and editor split assignment; save indicator unaffected | DATA-05 | Visual / interaction | Item 2 |
| Auto-split preview, apply, and 409 from a second tab | DATA-05 | Multi-tab race | Item 3 |
| Start disabled with reasons before splits; unannotated warning | TRAN-01 | Visual | Item 4 |
| Progress survives closing the tab; header and editor indicators; save before jumping | TRAN-04 | Live training + browser | Item 5 |
| Queue position and removal from the queue | TRAN-04 | Two live projects | Item 6 |
| `docker compose restart api` / `worker` mid-run → running / interrupted | TRAN-04 | Live containers | Item 7 |
| Downloaded `.pt` loads in the downstream project's own environment | MODL-04 | External environment | Item 8 |
| Fine-tune from a model trained here; classes-differ note | MODL-01 | Live training | Item 9 |
| Offline weights download failure message and log toggle | TRAN-04 | Network cut | Item 10 |
| Project delete lists counts; blocked with a queued run | MODL-03 | Visual | Item 11 |
| Long names truncate, long log lines wrap, editor top bar fits at 1024/1440 px (en, ru) | TRAN-04 | Visual layout | Item 12 |
| EXIF orientation 6 image keeps oriented size inside the worker | TRAN-03 | Container + image inspection | Item 13 |
| README (en/ru) training docs accurate against the running UI | TRAN-01 | Documentation judgment | Read both READMEs |

Not covered on this machine: GPU path and macOS / native Linux hosts (assumptions A1, A9, A11). They are tracked as a Phase 12 concern.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none missing)
- [x] No watch-mode flags (`vitest run`, `--run`)
- [x] Feedback latency acceptable (per-task commands in seconds; full suite is the phase gate)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-10 (automated coverage); manual-only items pending `/gsd-verify-work`
