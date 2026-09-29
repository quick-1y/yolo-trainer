---
phase: "2"
slug: "image-upload-classes"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-29"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 (backend, TestClient over temp-file SQLite + real Alembic); Vitest 5 + Testing Library (frontend) |
| **Config file** | `backend/pyproject.toml [tool.pytest.ini_options]`; `frontend/vite.config.ts` `test` block |
| **Quick run command** | `uv run pytest backend/tests -x -q` ; `npm --prefix frontend run test -- --run` |
| **Full suite command** | `bash scripts/run_full_suite.sh` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (`uv run pytest backend/tests/<file> -x -q` or the single Vitest file)
- **After every plan wave:** Run `uv run pytest backend/tests -q` + `uv run ruff check backend` + `npm --prefix frontend run test -- --run`
- **Before `/gsd-verify-work`:** `bash scripts/run_full_suite.sh` must be green, then the manual seeded-scroll and folder-drop checks
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | REQ-{XX} | T-{N}-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_image_processing.py`, `test_images_api.py`, `test_images_list_api.py`, `test_classes_api.py`, `test_storage_cleanup.py` — stubs for DATA-01, ANNO-01, PROJ-03
- [ ] Shared pytest helpers — image generators with EXIF orientation, truncated-file helper, bulk-insert helper for 5000 rows, thread-pool concurrency helper
- [ ] `scripts/seed_images.py` — seeding for the several-thousand-image smoothness check

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grid scrolls smoothly with several thousand images | ANNO-01 | Scroll smoothness is perceptual; jsdom cannot measure frame rate | `uv run python scripts/seed_images.py --count 5000`, open the project, scroll; DevTools shows a few hundred `<img>` nodes |
| Whole-folder drag & drop from the OS | DATA-01 | Real OS drag of a directory cannot be driven from jsdom | Drop a folder with subfolders and a non-image file; check the summary and rejected list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
