---
phase: "03"
slug: "box-annotation-editor"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-04"
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser -> nginx -> api (JSON PUT) | Annotation saves from the SPA | Untrusted ids, class ids, coordinates, flags |
| other web origin -> localhost api | Any page in the user's browser can attempt a cross-site write | Forged requests |
| npm registry -> frontend bundle | konva, react-konva, zustand, zundo, vitest-canvas-mock | Third-party code |
| stale browser tab -> api | Editor state older than a class delete or another tab's save | Stale annotation versions |
| user pointer / keyboard input -> client store | Drags, transforms and key presses become edits | Geometry, edit commands |
| URL query (sort, q) -> Images page / neighbors API | User-editable URL values reach queries and navigation | Short strings |
| api responses -> saver decisions | Status codes decide retry, stop or resync | HTTP status, error detail |
| browser image decoder -> stored geometry | Decoded orientation must match the DB's oriented size | Image dimensions |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T3-01-01 | Spoofing (CSRF) | PUT annotations | high | mitigate | `Depends(require_xhr)` in `routers/annotations.py:199`; JSON body forces preflight | closed |
| T3-01-02 | Tampering / EoP (cross-project write) | apply_save | high | mitigate | CAS `UPDATE ... WHERE id AND project_id AND annotation_version` (`annotations.py:7-8`); `UNKNOWN_CLASS_DETAIL` 422 | closed |
| T3-01-03 | Tampering (lost update) | apply_save | medium | mitigate | Compare-and-swap on `annotation_version` (`annotations.py:7-8`) | closed |
| T3-01-04 | DoS | AnnotationSave | medium | mitigate | `allow_inf_nan=False` bounded units, `max_length=MAX_BOXES` (2000), `extra="forbid"` (`schemas.py`); nginx 1m body limit asserted by smoke test | closed |
| T3-01-05 | Tampering (integrity) | apply_save transaction | medium | mitigate | `session.rollback()` on every failure path (`annotations.py:94,148,162`) | closed |
| T3-01-06 | Tampering (stored XSS) | filename / class name rendering | medium | mitigate | No `dangerouslySetInnerHTML` in `frontend/src`; nginx template unchanged since c60e470 (Phase 2) | closed |
| T3-01-07 | Information Disclosure | box ids | low | accept | Random UUIDs, never authorization | closed |
| T3-01-SC | Tampering (supply chain) | new npm packages | high | mitigate | Human gate in 03-01 Task 1; `frontend/package-lock.json` committed; `npm ci` in `docker/Dockerfile.frontend:7` | closed |
| T3-02-01 | Tampering (integrity) | delete_class cascade | medium | mitigate | `routers/classes.py:169` bumps `annotation_version` and sets `is_reviewed=False` | closed |
| T3-02-02 | Tampering (cross-project write) | apply_save | high | mitigate | Pinned in `backend/tests/test_annotations_api.py` (foreign ids -> 404/422) | closed |
| T3-02-03 | DoS | AnnotationSave | medium | mitigate | Pinned in `test_annotations_api.py` (NaN/Inf, range, 2001 boxes, unknown field) | closed |
| T3-02-04 | Spoofing (CSRF) | PUT annotations | high | mitigate | Pinned in `test_annotations_api.py` (403 without X-Requested-With) | closed |
| T3-02-05 | Repudiation | class delete | low | accept | Single-operator tool, dialog states object count | closed |
| T3-03-01 | Tampering (integrity) | BoxShape / normalizeTransform | low | mitigate | Client clamping (geometry tests) + server schema validation | closed |
| T3-03-02 | DoS (UI) | pointer handling | low | mitigate | Imperative Konva updates, one store write per gesture | closed |
| T3-03-03 | Tampering (stored XSS) | label chips | low | mitigate | Konva canvas text only | closed |
| T3-04-01 | Tampering | sort / q from URL | low | mitigate | `readGridParams` allow-list (`lib/urls`) | closed |
| T3-04-02 | Spoofing (open redirect) | tile navigation | low | mitigate | `editorPath` / `imagesPath` build internal paths from integer ids | closed |
| T3-05-01 | Tampering (unintended edit) | useEditorHotkeys | low | mitigate | `event.repeat && !def.allowRepeat` (`shortcuts.ts:245`); disabled while `openModals > 0` | closed |
| T3-05-02 | DoS (UI) | Backspace / browser shortcuts | low | mitigate | `preventDefault` on bound keys | closed |
| T3-06-01 | Tampering (stored XSS) | ClassPanel / ObjectList / labels | medium | mitigate | React text, Select labels, Konva text; no HTML injection APIs | closed |
| T3-06-02 | Spoofing (CSRF) | POST /classes from editor | low | accept | Reuses Phase 2 posture (T-02-13-05) | closed |
| T3-06-03 | Tampering (integrity) | setBoxClass | low | mitigate | Server 422 "Unknown class." | closed |
| T3-07-01 | Information Disclosure | neighbors route | medium | mitigate | `_scoped(...)` project scoping (`routers/images.py:92`) | closed |
| T3-07-02 | DoS | neighbors counts | low | accept | Indexed keyset counts, `q` capped | closed |
| T3-07-03 | Tampering (input) | sort / q params | low | mitigate | `sort: Literal["newest", "name"]` (`routers/annotations.py:61,140`) | closed |
| T3-07-04 | Repudiation / data loss | navigation | medium | mitigate | Flush before navigation, leave dialog, beforeunload guard (`EditorLeave.test.tsx`) | closed |
| T3-08-01 | Information Disclosure | next-unannotated pivot | medium | mitigate | Project-scoped pivot and candidates (`test_annotations_status.py`) | closed |
| T3-08-02 | Tampering (training labels) | background / reviewed flags | medium | mitigate | Server invariants + client rules | closed |
| T3-08-03 | DoS | status-counts aggregate | low | accept | One indexed aggregate | closed |
| T3-08-04 | Tampering (API surface) | route order | low | mitigate | Literal routes above parametrized route (`routers/annotations.py:58,98`) | closed |
| T3-09-01 | Tampering (stale display) | patchImageInListCache | low | mitigate | Server-confirmed fields only; lists marked stale | closed |
| T3-09-02 | Tampering (stored XSS) | tile aria-label / title | low | mitigate | React attributes and i18next interpolation | closed |
| T3-10-01 | DoS (UI) | very large images | low | accept | Single local user; 8000x6000 checked in UAT | closed |
| T3-10-02 | Tampering (integrity) | coordinates under zoom | low | mitigate | `getRelativePointerPosition()` + geometry helpers; zoom/pan integration tests | closed |
| T3-11-01 | Information Disclosure | status endpoints | low | mitigate | Project-scoped endpoints | closed |
| T3-11-02 | DoS | summary refetches | low | accept | One aggregate per invalidation | closed |
| T3-12-01 | Tampering (lost update) | conflict handling | medium | mitigate | 409 stops saver, editor read-only, Reload resyncs | closed |
| T3-12-02 | DoS (retry storm) | annotationSaver | low | mitigate | Capped backoff with jitter (`annotationSaver.test.ts`) | closed |
| T3-12-03 | Tampering (training labels) | orientation mismatch | medium | mitigate | Decoded-size check (`useLoadedImage.ts:79`) | closed |
| T3-12-04 | Repudiation / data loss | rejected saves | low | mitigate | 422 message shown, store resyncs | closed |
| T3-13-01 | Tampering (unintended edit) | shortcuts behind modals | low | mitigate | Reference modal counted in `openModals` (`EditorPage.tsx:535`) | closed |
| T3-13-02 | Information Disclosure | README | low | accept | Documentation only | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T3-01-07 | Box UUIDs are identifiers only; access is scoped by project and image | plan 03-01 | 2026-10-03 |
| AR-03-02 | T3-02-05 | Single-operator tool without audit log; dialog shows how many objects go | plan 03-02 | 2026-10-03 |
| AR-03-03 | T3-06-02 | Inline class creation reuses the Phase 2 JSON-preflight posture | plan 03-06 | 2026-10-03 |
| AR-03-04 | T3-07-02 | Indexed keyset counts (14 ms at 200k images), `q` capped at 255 | plan 03-07 | 2026-10-03 |
| AR-03-05 | T3-08-03 | One indexed aggregate (88 ms at 200k images) | plan 03-08 | 2026-10-03 |
| AR-03-06 | T3-10-01 | Single local user; large-image behavior checked in UAT | plan 03-10 | 2026-10-03 |
| AR-03-07 | T3-11-02 | One aggregate request per invalidation | plan 03-11 | 2026-10-03 |
| AR-03-08 | T3-13-02 | README contains no secrets | plan 03-13 | 2026-10-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-04 | 43 | 43 | 0 | /gsd-secure-phase (L1 grep-depth, plan-time register) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-04
