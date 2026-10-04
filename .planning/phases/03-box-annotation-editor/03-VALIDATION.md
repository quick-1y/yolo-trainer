---
phase: "3"
slug: "box-annotation-editor"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-03"
validated: "2026-10-04"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x (backend) + vitest (frontend) |
| **Config file** | `backend/pyproject.toml` (`[tool.pytest.ini_options]`), `frontend/vite.config.ts` |
| **Quick run command** | `uv run pytest backend/tests/<file> -x` / `npm --prefix frontend run test -- --run <filter>` |
| **Full suite command** | `bash scripts/run_full_suite.sh` |
| **Estimated runtime** | ~65 s backend, ~60 s frontend |

---

## Sampling Rate

- **After every task commit:** Run the task's filtered pytest / vitest command
- **After every plan wave:** Run `uv run pytest backend/tests -x` and `npm --prefix frontend run build && npm --prefix frontend run test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~65 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | ANNO-02/03/07 | T3-01-SC | New npm packages approved before install | manual | — (supply-chain gate) | n/a | ✅ green (approved) |
| 3-01-02 | 01 | 1 | ANNO-02/03/07 | — | N/A | e2e + unit | `bash scripts/compose_smoke_test.sh`; `npm --prefix frontend run test -- --run EditorPage` | ✅ | ✅ green |
| 3-02-01 | 02 | 2 | ANNO-03/07/10 | — | Invalid / foreign-project payloads rejected | integration | `uv run pytest backend/tests/test_annotations_api.py backend/tests/test_annotations_concurrency.py -x` | ✅ | ✅ green |
| 3-02-02 | 02 | 2 | ANNO-10 | — | N/A | integration | `uv run pytest backend/tests/test_classes_api.py backend/tests/test_migrations.py -x` | ✅ | ✅ green |
| 3-02-03 | 02 | 2 | ANNO-10 | — | N/A | unit | `npm --prefix frontend run test -- --run DeleteClassModal ClassRow ClassesPage locales` | ✅ | ✅ green |
| 3-03-01 | 03 | 2 | ANNO-03 | — | N/A | unit | `npm --prefix frontend run test -- --run AnnotationCanvas EditorPage locales` | ✅ | ✅ green |
| 3-03-02 | 03 | 2 | ANNO-03 | — | N/A | unit | `npm --prefix frontend run test -- --run geometry ids annotationStore AnnotationCanvas` | ✅ | ✅ green |
| 3-04-01 | 04 | 2 | ANNO-02 | — | N/A | unit | `npm --prefix frontend run test -- --run ImagesUrlState ImagesSearch ImagesPage` | ✅ | ✅ green |
| 3-04-02 | 04 | 2 | ANNO-02 | — | N/A | unit | `npm --prefix frontend run test -- --run ImagesSelection ImagesUrlState ImagesPage DeleteImagesModal locales` | ✅ | ✅ green |
| 3-05-01 | 05 | 3 | ANNO-03/07 | — | N/A | unit | `npm --prefix frontend run test -- --run annotationStore EditorKeyboard locales` | ✅ | ✅ green |
| 3-05-02 | 05 | 3 | ANNO-08 | — | N/A | unit | `npm --prefix frontend run test -- --run shortcuts EditorKeyboard AnnotationCanvas locales` | ✅ | ✅ green |
| 3-06-01 | 06 | 4 | ANNO-03/06 | — | N/A | unit | `npm --prefix frontend run test -- --run ClassPanel annotationStore ClassesPage locales` | ✅ | ✅ green |
| 3-06-02 | 06 | 4 | ANNO-06/08 | — | N/A | unit | `npm --prefix frontend run test -- --run ObjectList ClassPanel EditorKeyboard locales` | ✅ | ✅ green |
| 3-07-01 | 07 | 5 | ANNO-02 | — | N/A | integration | `uv run pytest backend/tests/test_annotations_navigation.py backend/tests/test_images_list_api.py -x` | ✅ | ✅ green |
| 3-07-02 | 07 | 5 | ANNO-02/08 | — | N/A | unit | `npm --prefix frontend run test -- --run EditorNavigation shortcuts locales` | ✅ | ✅ green |
| 3-07-03 | 07 | 5 | ANNO-02 | — | N/A | unit | `npm --prefix frontend run test -- --run EditorLeave EditorNavigation locales` | ✅ | ✅ green |
| 3-08-01 | 08 | 6 | ANNO-09/10 | — | N/A | integration | `uv run pytest backend/tests/test_annotations_status.py -x` | ✅ | ✅ green |
| 3-08-02 | 08 | 6 | ANNO-09/10 | — | N/A | unit | `npm --prefix frontend run test -- --run EditorStatus annotationStore ObjectList locales` | ✅ | ✅ green |
| 3-08-03 | 08 | 6 | ANNO-09/08 | — | N/A | unit | `npm --prefix frontend run test -- --run EditorNextUnannotated EditorNavigation locales` | ✅ | ✅ green |
| 3-09-01 | 09 | 7 | ANNO-09 | — | N/A | unit | `npm --prefix frontend run test -- --run ImageTile ImageGrid ImagesPage ...` | ✅ | ✅ green |
| 3-09-02 | 09 | 7 | ANNO-09 | — | N/A | unit | `npm --prefix frontend run test -- --run images.test annotations.test EditorPage` | ✅ | ✅ green |
| 3-10-01 | 10 | 7 | ANNO-02 | — | N/A | unit | `npm --prefix frontend run test -- --run viewport AnnotationCanvas locales` | ✅ | ✅ green |
| 3-10-02 | 10 | 7 | ANNO-02/08 | — | N/A | unit | `npm --prefix frontend run test -- --run AnnotationCanvas shortcuts EditorKeyboard locales` | ✅ | ✅ green |
| 3-11-01 | 11 | 8 | ANNO-09 | — | N/A | unit | `npm --prefix frontend run test -- --run StatusSummary ImagesPage ... UploadDropzone locales` | ✅ | ✅ green |
| 3-11-02 | 11 | 8 | ANNO-09 | — | N/A | unit | `npm --prefix frontend run test -- --run AnnotateNext StatusSummary ImagesPage UploadFlow locales` | ✅ | ✅ green |
| 3-12-01 | 12 | 8 | ANNO-07/08 | — | N/A | unit | `npm --prefix frontend run test -- --run annotationSaver EditorSaving locales` | ✅ | ✅ green |
| 3-12-02 | 12 | 8 | ANNO-07 | — | Conflicting/rejected saves never overwrite server state | unit | `npm --prefix frontend run test -- --run EditorSaving storeRegistry annotationSaver locales` | ✅ | ✅ green |
| 3-12-03 | 12 | 8 | ANNO-07 | — | N/A | unit | `npm --prefix frontend run test -- --run EditorLoadErrors EditorSaving EditorPage locales` | ✅ | ✅ green |
| 3-13-01 | 13 | 9 | ANNO-08 | — | N/A | unit | `npm --prefix frontend run test -- --run ShortcutsModal shortcuts EditorKeyboard locales` | ✅ | ✅ green |
| 3-13-02 | 13 | 9 | ANNO-08 | — | N/A | e2e | `bash scripts/run_full_suite.sh` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supply-chain approval of new npm packages | ANNO-02/03/07 | Human decision gate (T3-01-SC) | Plan 03-01 Task 1 |
| Browser checklist (Transformer at 100%/400%, mouse release outside window, Russian layout, EXIF, 8000x6000, two-tab conflict, api stop/start, LAN origin, help modal) | ANNO-02/03/07/08 | Real browser, real input devices and compose stack | `03-13-SUMMARY.md` items 1-13; passed in `03-UAT.md` test 3 |
| Visual conformance to `03-UI-SPEC.md` | ANNO-02/03/09 | Human judgment on visuals | `03-UAT.md` test 4 (passed) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 70s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-04

---

## Validation Audit 2026-10-04

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Full run: backend 389 passed, frontend 564 passed (51 files).
