---
gsd_state_version: "1.0"
current_phase: 03
current_phase_name: Box Annotation Editor
status: executing
stopped_at: Completed 03-04-PLAN.md
last_updated: "2026-10-04T08:08:07.870Z"
last_activity: 2026-10-04
last_activity_desc: Phase 03 execution started
state_head: 7213766ac067ce2496bdc0d49323d73a78948e9e
progress:
  total_phases: 12
  completed_phases: 2
  total_plans: 36
  completed_plans: 27
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-03)

**Core value:** The full loop works end-to-end in the browser: upload images → annotate → train with configurable settings → download a working `.pt`
**Current focus:** Phase 03 — Box Annotation Editor

## Current Position

Phase: 03 (Box Annotation Editor) — EXECUTING
Plan: 5 of 13
Status: Ready to execute
Last activity: 2026-10-04 — Phase 03 execution started

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**

- Total plans completed: 23
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 10 | - | - |
| 02 | 13 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 55min | 2 tasks | 61 files |
| Phase 01 P03 | 55min | 3 tasks | 14 files |
| Phase 01 P04 | 45min | 2 tasks | 9 files |
| Phase 01 P05 | 11min | 2 tasks | 6 files |
| Phase 01 P06 | ~26min | 2 tasks | 7 files |
| Phase 01 P07 | 11min | 2 tasks | 9 files |
| Phase 01 P08 | 35min | 3 tasks | 13 files |
| Phase 01 P09 | 23min | 3 tasks | 16 files |
| Phase 01 P10 | 40min | 2 tasks | 4 files |
| Phase 02 P01 | 19min | 2 tasks | 33 files |
| Phase 02 P02 | 5min | 2 tasks | 22 files |
| Phase 02 P03 | 4 min | 2 tasks | 3 files |
| Phase 02 P04 | 15 min | 2 tasks | 9 files |
| Phase 02 P05 | 6 min | 2 tasks | 10 files |
| Phase 02 P06 | 25 min | 2 tasks | 18 files |
| Phase 02 P07 | 9 min | 2 tasks | 15 files |
| Phase 02 P08 | 8 min | 3 tasks | 19 files |
| Phase 02 P09 | 11 min | 2 tasks | 8 files |
| Phase 02 P10 | 25 min | 2 tasks | 13 files |
| Phase 02 P11 | 16 min | 3 tasks | 17 files |
| Phase 02 P12 | 16 min | 2 tasks | 6 files |
| Phase 02 P13 | 9 min | 2 tasks | 4 files |
| Phase 03 P01 | 20 min | 2 tasks | 35 files |
| Phase 03 P02 | 13 min | 3 tasks | 13 files |
| Phase 03 P03 | 12 min | 2 tasks | 16 files |
| Phase 03 P04 | 6 min | 2 tasks | 12 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 0]: Pins are Python 3.12, PyTorch 2.14.0, and Ultralytics 8.4.159. Re-verify them at Phase 1 implementation time.
- [Phase 0]: Single-operator, no auth; SQLite (WAL) behind a Postgres-ready SQLAlchemy/Alembic layer.
- [Phase 0]: Jobs use subprocess + DB tracking + JSONL callbacks → SSE, with no Redis/Celery.
- [Roadmap]: Vertical MVP ordering. The core loop is complete at Phase 4; polygons (Phase 6) come before AI assist (Phase 8) so AI proposals are editable in segment projects.
- [Phase 01]: Task 2 tests were written against Task 1's already-correct tracer implementation; all 7 passed on first run, no implementation changes needed.
- [Phase 01]: Migration/restart tests live in test_migrations.py (2 tests); API-contract tests live in test_projects_api.py (5 tests), matching the plan's per-file acceptance-criteria grep counts.
- [Phase 01]: Task 1's 409 conflict detail was using the rejected attempt's own name, not the already-stored project's name; fixed to re-query by normalized_name. — Bug found while writing the DB-level uniqueness edge tests (Rule 1).
- [Phase 01]: Re-verified torch 2.14.0/torchvision 0.29.0/ultralytics 8.4.159 pins against PyPI + download.pytorch.org/whl/cpu on 2026-09-28: none yanked, cp312 CPU wheels confirmed; kept unchanged from Phase 0. — Plan 01-04 D-22 re-verification step
- [Phase 01]: pytorch-cpu uv index/sources declared in backend/pyproject.toml (the member declaring torch/torchvision), not the workspace root. — uv resolves sources relative to the pyproject.toml that declares the dependency; root only depends on yolo-trainer-backend[worker]
- [Phase 01]: check_cli_run_git_clean.py cleans up via rglob('hygiene-check') under runs/, not a fixed path — Ultralytics nests output as runs/<task>/<project>/<name>/ when project is already a relative runs/... path, matching the pre-existing runs/detect/runs/train/... nesting pattern
- [Phase 01]: WorkerSettings.heartbeat_interval_seconds uses a pydantic validation_alias (WORKER_HEARTBEAT_INTERVAL_SECONDS) plus populate_by_name=True so both the env var and direct keyword construction work.
- [Phase 01]: MSYS_NO_PATHCONV=1 must be scoped per-command in compose_smoke_test.sh, not exported globally - a global export broke the pre-existing curl -o /dev/null burst-write stage on Git Bash/Windows. Bug found and fixed while wiring the new worker torch/ultralytics-version and torch-free-api assertions (Rule 1).
- [Phase 4 follow-up]: Ultralytics usage analytics must be disabled in the worker (settings.update sync=False or equivalent) before it runs real training/inference jobs - not yet live in Phase 1 since the worker only imports torch/ultralytics and heartbeats.
- [Phase 01]: Phase 01: changeAppLanguage uses a dynamic import of ./index inside language.ts to avoid a static circular dependency with index.ts (which imports resolveInitialLanguage/getStoredLanguage from language.ts).
- [Phase 01]: Phase 01: T-07-02 threat mitigation (localStorage access resilience) required guarding BOTH the read (index.ts init) and write (changeAppLanguage) paths; only the write was guarded initially - fixed via getStoredLanguage().
- [Phase 01]: pageNotFound.* keys added to the project i18n namespace (not common) for the generic 404 page, and both not-found views reuse project:notFound.back — avoids touching Plan 07's common locale files. — Plan 08 interface note: put new strings in the new project namespace; do not touch Plan 07's common files.
- [Phase 01]: Plan 09: ProjectUpdate's model_validator(mode='before') refuses task_type and explicit null name before field validation, so both errors surface as the model-level message with no field prefix (matches errors.py's stripping and the D-09 wording).
- [Phase 01]: Plan 09: PATCH's 409 conflict handler captures the attempted new normalized_name in a local variable before commit() - a persistent ORM object's rollback reloads pre-transaction DB state, so re-reading project.normalized_name after rollback would look up the wrong (pre-rename) name.
- [Phase 01]: Plan 09: useDeleteProject treats a DELETE 404 as idempotent success (project already gone = desired end state), so the normal-delete and already-deleted-elsewhere cases share one success path (navigate + invalidate + notify).
- [Phase 01]: Plan 09: Fixed a pre-existing bug in ProjectLayout (Rule 1) - every section NavLink hardcoded the project root and active=true, which only worked by accident with a single section; now each section's own to/active is derived from its route.
- [Phase 01]: Plan 10 README.ru.md translates prose only, keeping every command/URL/path/env-var name verbatim so the two READMEs stay diffable section-by-section (11 sections each).
- [Phase 02]: Plan 02-01: EXIF orientation applied via an explicit Pillow transpose table (same mapping as ImageOps.exif_transpose) so it does not depend on im.info surviving convert/thumbnail; size_bytes comes from the staged byte count. — Robust D-17 semantics independent of Pillow metadata propagation
- [Phase 02]: Plan 02-01: Dockerfile.frontend runs npm ci --maxsockets=1 - parallel registry connections get ECONNRESET on Docker Desktop (Windows), reproduced on the pre-phase lockfile too. — Reliable image build on the dev machine; retries alone did not help
- [Phase 02]: Plan 02-02: class index is computed inside the INSERT (scalar subquery COALESCE(MAX(position), -1) + 1); default color is chosen before it, so concurrent creates may share a color (cosmetic). — Atomic index guarantees contiguous 0..N-1 under concurrency; 20-way test passes
- [Phase 02]: 02-03: no production changes needed; upload pipeline pinned by characterization tests, verified by mutation
- [Phase 02]: 02-04: upload body limit is per-route (regex location, MAX_UPLOAD_MB MiB) with 1m kept elsewhere; web image defaults MAX_UPLOAD_MB=50 — Keeps Phase 1 DoS protection on all other routes; nginx always starts
- [Phase 02]: 02-04: worker image build serializes uv downloads (UV_CONCURRENT_DOWNLOADS=1, UV_HTTP_TIMEOUT=300) due to Docker Desktop body-read errors — Same class as the npm --maxsockets=1 workaround
- [Phase 02]: 02-05: class delete shifts later positions down in the same transaction as the DELETE; recolor sends PATCH only from ColorPicker onChangeEnd — Indices stay exactly 0..N-1 (fixed-seed sequence test); no per-tick requests while dragging
- [Phase 02]: 02-06: UploadProvider reads limits from the react-query cache (getQueryData), not useAppConfig; cancelled = some batch never reported due to abort — An eager GET /config consumed mockResolvedValueOnce sequences of Phase 1 tests and added a needless request per project section
- [Phase 02]: 02-07: dropzone has no accept and useFsAccessApi=false; first-page error keyed on data===undefined because TanStack flips isError on a failed next page; handleEndReached refuses to fetch after a failed page — Folder drops must report non-images; a failed next page keeps loaded pages and must show the inline footer retry
- [Phase 02]: 02-08: orphan cleanup treats only canonical decimal dir names as projects, never follows symlinks/junctions, and skips all deletion when the projects table is empty (safety valve) — Wrong or restored app.db must not trigger mass deletion; junctions are links on Windows
- [Phase 02]: 02-09: name-sort cursor requires a string key; search is normalized server-side like filename_key and applied via autoescaped contains to both page and count queries; no keepPreviousData so a new query restarts the grid at the top
- [Phase 02]: 02-10: /file route takes media type from stored ext (CHECK-constrained), shares immutable cache constant with thumbnails; viewer is mounted only while open and ImagesPage advances index via a pending-advance flag after fetchNextPage — Originals never requested for the grid; cross-page navigation stays seamless without the modal owning paging state
- [Phase 02]: 02-11: images delete route relies on JSON CORS preflight (no require_xhr); ImagesToolbar stays mounted hidden while selecting; Shift range additive with anchor = last plain toggle — Keeps debounced search commit reachable and matches other JSON routes
- [Phase 02]: 02-12: seed_images.py makes images unique via drawn counter and is deterministic per (index, seed); re-run reports all duplicates; CLI exits 1 on rejected, 2 on connection/HTTP errors — Re-seeding proves the duplicate path; duplicates are a normal outcome
- [Phase 02]: 02-13: client chunks image delete into sequential 1000-id requests (backend max_length=1000 unchanged); partial failure prunes the succeeded prefix — WR-01: selections over 1000 returned 422; sequential keeps a well-defined deleted prefix for SQLite single writer
- [Phase 02]: 02-13: ImagesPage loads the next page when the loaded list is empty and a next page exists; never auto-retries after a failed load — CR-01: pruneDeletedImages keeps next_cursor and VirtuosoGrid endReached never fires with zero items
- [Phase 03]: Plan 03-01: annotation save is a whole-set replace guarded by a compare-and-swap annotation_version (409 on stale, idempotent retry); status and box_count are derived, never stored; box ids are client UUID v4 built from getRandomValues — Costly-to-reverse contract that Phases 6 and 8 build on; a class-delete cascade would desync a stored count; randomUUID is undefined on http LAN origins
- [Phase 03]: Plan 03-02: class delete bumps annotation_version and clears is_reviewed of every image that held a box of the class, in the same transaction and before the cascade; images without that class keep version and reviewed flag — A stale editor tab must get 409 instead of re-inserting boxes of the deleted class (Pitfall 5); untouched images must not lose work
- [Phase 03]: Plan 03-03: updateBox is a no-op (same state) for an unknown id or unchanged geometry; label chip text is 24 chars including the ellipsis; Konva 10 pointer events fire pointerclick/pointerenter so handlers are attached for both mouse and pointer families — A drag that ends where it started must not save or demote a reviewed image; plan text was off by one on truncation; click alone may never fire in a real browser
- [Phase 03]: 03-04: Images page sort/search live in the URL (useSearchParams, replace writes); q capped at 255 chars on read, send and write; tile click/Enter opens the editor with { sort, q }; ImageViewerModal removed — D-03: editor and grid share one ordering; URL makes both reloadable; P2 D-10 viewer replaced by the editor

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 12]: GPU-path acceptance (DEPL-02 and GPU memory freed after cancel) needs separate NVIDIA hardware, because the dev machine has none. It does not block Phases 1-11.
- [Phase 4]: How jobs cross from the API container to the worker is undecided. The API cannot `Popen` into another container; resolve this during planning.
- [Phase 6]: Prior research does not cover click-to-segment (SAM). It needs phase research on model choice and CPU latency.
- [Phase 02 follow-up]: CSRF hardening of `POST /images/delete` (02-REVIEW WR-03) is still open; the route relies on the JSON CORS preflight (accepted as T-02-13-05).

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-04T08:08:07.777Z
Stopped at: Completed 03-04-PLAN.md
Resume file: None
