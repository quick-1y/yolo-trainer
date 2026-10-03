---
gsd_state_version: "1.0"
current_phase: 02
current_phase_name: Image Upload & Classes
status: executing
stopped_at: Completed 02-03-PLAN.md
last_updated: "2026-10-03T08:18:30.701Z"
last_activity: 2026-10-03
last_activity_desc: Phase 02 execution started
state_head: 5ba7785d1766d2c8863dde84de15c3c31e0f3783
progress:
  total_phases: 12
  completed_phases: 1
  total_plans: 22
  completed_plans: 13
  percent: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-29)

**Core value:** The full loop works end-to-end in the browser: upload images → annotate → train with configurable settings → download a working `.pt`
**Current focus:** Phase 02 — Image Upload & Classes

## Current Position

Phase: 02 (Image Upload & Classes) — EXECUTING
Plan: 4 of 12
Status: Ready to execute
Last activity: 2026-10-03 — Phase 02 execution started

Progress: [█░░░░░░░░░] 8%

## Performance Metrics

**Velocity:**

- Total plans completed: 10
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 10 | - | - |

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 12]: GPU-path acceptance (DEPL-02 and GPU memory freed after cancel) needs separate NVIDIA hardware, because the dev machine has none. It does not block Phases 1-11.
- [Phase 4]: How jobs cross from the API container to the worker is undecided. The API cannot `Popen` into another container; resolve this during planning.
- [Phase 6]: Prior research does not cover click-to-segment (SAM). It needs phase research on model choice and CPU latency.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-03T08:18:30.624Z
Stopped at: Completed 02-03-PLAN.md
Resume file: None
