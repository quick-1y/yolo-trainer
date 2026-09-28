---
phase: 01-runnable-skeleton-projects
plan: 01
subsystem: infra
tags: [fastapi, sqlalchemy, alembic, sqlite, react, vite, mantine, i18next, docker-compose, uv, pytest]

# Dependency graph
requires: []
provides:
  - "uv workspace root (pyproject.toml) + yolo-trainer-backend package under backend/"
  - "yolo_trainer_api FastAPI app: create_app factory, lifespan-driven Alembic migrations, GET/POST /api/projects, GET /api/health"
  - "Project ORM model with normalize_project_name() and a case-insensitive unique index (uq_projects_normalized_name)"
  - "React/Vite/Mantine SPA (dark theme only) with i18n (en/ru), project grid, create modal"
  - "docker-compose.yml (web+api), Dockerfile.backend, Dockerfile.frontend, nginx.conf with CSP + unbuffered /api proxy"
  - "scripts/compose_smoke_test.sh: end-to-end create -> down/up -> still-listed acceptance check"
  - "backend/tests/ pytest harness (conftest fixtures, 7 passing tests) pinning API + migration behavior"
affects: [02-runnable-skeleton-projects, 03, 07, 08, 09]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 38518
  tasks: 2
  commits: 2
plan_head_before: af311273e06f917ceaca2871f05ce9270c8f978c

# Tech tracking
tech-stack:
  added: [uv 0.12.19, fastapi 0.141.1, sqlalchemy 2.0.x, alembic 1.20.0, aiosqlite 0.22.1, pydantic-settings, pytest, httpx, ruff, react 19.3, vite 8.3, "@mantine/core 9.6.3", "@tanstack/react-query 5.104", i18next 26.4, react-router-dom 7.18, nginx:alpine, node:24-alpine, python:3.12-slim]
  patterns:
    - "uv workspace (root non-package pyproject.toml + backend/pyproject.toml member) for the Python side"
    - "FastAPI lifespan runs `run_migrations` (programmatic Alembic Config, no cwd/ini dependency) before serving traffic"
    - "Case-insensitive uniqueness via a normalized_name column + unique index, never check-then-insert (IntegrityError -> 409)"
    - "i18next resources loaded via import.meta.glob(eager) — no per-component string literals"
    - "nginx as the single published port; api has no ports: entry; proxy_buffering off for future SSE"
    - "TDD-lite pinning: tests written against an already-implemented tracer slice, using a real per-test SQLite file + real Alembic migration (no DB mocking)"

key-files:
  created:
    - backend/src/yolo_trainer_api/{settings,db,models,schemas,errors,migrate,main}.py
    - backend/src/yolo_trainer_api/routers/projects.py
    - backend/src/yolo_trainer_api/migrations/{env.py,script.py.mako,versions/0001_create_projects.py}
    - backend/tests/{__init__.py,conftest.py,test_projects_api.py,test_migrations.py}
    - frontend/src/features/projects/{ProjectsPage,ProjectCard,NewProjectCard,CreateProjectModal}.tsx
    - frontend/src/api/{client.ts,projects.ts}
    - frontend/src/i18n/{index.ts,language.ts,locales/en,locales/ru}
    - docker/{Dockerfile.backend,Dockerfile.frontend,nginx.conf}
    - docker-compose.yml
    - scripts/compose_smoke_test.sh
  modified:
    - .gitignore
    - .gitattributes
    - .dockerignore
    - .env.example

key-decisions:
  - "Task 2's tests were written against Task 1's already-correct tracer implementation and all 7 passed on the first run — no implementation changes were needed (see TDD Gate Compliance below)."
  - "Migration + restart tests live in test_migrations.py (2 tests); API-contract tests live in test_projects_api.py (5 tests), matching the plan's per-file acceptance-criteria grep counts."

requirements-completed: [FOUND-01, DEPL-01, DEPL-03, PROJ-01, PROJ-02]

coverage:
  - id: D1
    description: "docker compose up --build serves the SPA at 127.0.0.1:8080 and /api/health returns {\"status\":\"ok\"}"
    requirement: "DEPL-01"
    verification:
      - kind: other
        ref: "scripts/compose_smoke_test.sh (SMOKE OK, run under Task 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Creating a project through the UI/API and it surviving docker compose down/up"
    requirement: "DEPL-03"
    verification:
      - kind: other
        ref: "scripts/compose_smoke_test.sh (down/up re-check, run under Task 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /api/projects rejects a case-insensitive duplicate name with 409 and a plain-English detail string; list stays length 1"
    requirement: "PROJ-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_duplicate_name_is_case_insensitive"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/projects returns projects ordered updated_at DESC, id DESC; create/list round trip returns the full Project shape with Z-suffixed timestamps"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_list_sorted_by_updated_at_desc"
        status: pass
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_create_and_list_round_trip"
        status: pass
    human_judgment: false
  - id: D5
    description: "Invalid task_type is rejected with 422 and a string detail"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py#test_invalid_task_type_rejected"
        status: pass
    human_judgment: false
  - id: D6
    description: "With no .env and a non-existent DATA_DIR, the api creates the dir and a migrated app.db (projects table + alembic_version at head 0001) on startup"
    requirement: "FOUND-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_startup_creates_data_dir_and_migrates"
        status: pass
    human_judgment: false
  - id: D7
    description: "Data created in one app instance is still listed after a second app instance starts against the same DATA_DIR"
    requirement: "FOUND-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_migrations.py#test_data_persists_across_app_restart"
        status: pass
    human_judgment: false
  - id: D8
    description: "In the browser, clicking the dashed '+ New project' card, submitting name + task type, shows a new card with name/badge/relative time without a page reload; dark Mantine theme; i18n en/ru"
    requirement: "PROJ-01"
    verification: []
    human_judgment: true
    rationale: "Visual/UX behavior in a real browser — deferred to the phase's end-of-phase human-check batch (Plan 10) per the plan's <human-check> verify block."

# Metrics
duration: 55min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 1: Walking Skeleton — Projects Create/List Summary

**Тонкий сквозной путь SPA → nginx → FastAPI → Alembic-мигрированный SQLite с созданием/списком проектов, подтверждённый compose-smoke-тестом и семью pytest-тестами.**

## Performance

- **Duration:** 55 min (Task 1 tracer + tracer feedback gate + Task 2 pytest harness)
- **Started:** 2026-09-28T05:54:25Z
- **Completed:** 2026-09-28T06:49:00Z (approx, continuation)
- **Tasks:** 2
- **Files modified:** 57 (Task 1) + 4 new (Task 2 tests)

## Accomplishments

- uv workspace + `yolo_trainer_api` FastAPI package: `Settings`, `create_app`, Alembic migration `0001` (projects table + `ck_projects_task_type` + `uq_projects_normalized_name`), `GET/POST /api/projects`, `GET /api/health`, plain-English `{"detail": "..."}` error bodies on every path (422/409)
- React/Vite/Mantine dark-only SPA with i18next (`en`/`ru`), project grid, dashed "+ New project" card, create modal wired to `useCreateProject`
- `docker-compose.yml` running `web` (nginx, published on `127.0.0.1:8080` by default) + `api` (no published port), CSP `default-src 'self'`, unbuffered `/api` reverse proxy
- `scripts/compose_smoke_test.sh`: build, create a project via the real HTTP API, assert it survives `down`/`up`, assert `web` binds to `127.0.0.1` — printed `SMOKE OK`
- **Task 2:** `backend/tests/` pytest harness (`conftest.py` + `test_projects_api.py` + `test_migrations.py`) — 7 tests pinning health, create/list round trip, case-insensitive 409 duplicate, `updated_at DESC, id DESC` ordering, 422 on invalid `task_type`, fresh-`DATA_DIR` migration to head `0001`, and data persistence across an app restart, all running against a real per-test SQLite file and a real Alembic migration (no DB mocking)

## Task Commits

1. **Task 1: End-to-end "create a project and see it listed" through the compose stack (tracer)** - `d613462` (feat) — completed by the prior executor, tracer feedback gate `checkpoint:human-verify` approved by the user ("approved")
2. **Task 2: pytest harness proving create/list, case-insensitive 409, ordering, and migrations on a fresh DATA_DIR** - `42b3a6a` (test)

**Plan metadata:** commit to follow this SUMMARY (docs(01-01): complete plan)

_Note: Task 2 was `tdd="true"` but produced a single `test(01-01)` commit — see TDD Gate Compliance below._

## Files Created/Modified

See frontmatter `key-files`. Task 2 specifically added:
- `backend/tests/__init__.py` - marks the test directory as a package (enables `from .conftest import make_client`)
- `backend/tests/conftest.py` - `settings`/`client` fixtures (per-test `tmp_path` DATA_DIR) + `make_client(settings)` helper for opening a second app instance against the same DATA_DIR
- `backend/tests/test_projects_api.py` - 5 tests: health, create/list round trip, case-insensitive duplicate 409, ordering, invalid task_type 422
- `backend/tests/test_migrations.py` - 2 tests: fresh-DATA_DIR migration to head, persistence across an app restart

## Decisions Made

- Split the 7 required tests across two files exactly as the plan's acceptance-criteria greps expect: API-contract behavior in `test_projects_api.py` (>=5), migration/persistence behavior in `test_migrations.py` (>=2).
- `make_client()` is a plain helper (not a fixture) so `test_data_persists_across_app_restart` can open and close two independent `TestClient` context managers against the same `DATA_DIR`, exercising FastAPI's lifespan (and therefore Alembic) twice.

## Deviations from Plan

None - plan executed exactly as written for Task 2. No Task 1 defects were exposed by the new tests.

## TDD Gate Compliance

Task 2 was marked `tdd="true"`, but this project's `workflow.tdd_mode` is not enabled in `.planning/config.json`, so the strict RED/GREEN gate sequence (`gsd_run check tdd-red-evidence`) was not enforced as a hard gate. Even so, the RED-GREEN-REFACTOR cycle was followed in spirit:

- **RED (attempted):** Tests were written first, against Task 1's already-implemented tracer code (by plan design — Task 1 explicitly builds the full production-quality path; Task 2's job is to "write the tests first (RED), then fix any Task 1 defect they expose (GREEN)"). Running the freshly-written suite produced **7 passed, 0 failed** on the very first run — an "unexpected GREEN in RED phase" per the tdd.md fail-fast rule.
- **Investigation (per Fail-Fast Rule 1):** This is the expected outcome here, not a violation: Task 1's tracer was already verified end-to-end (compose smoke test `SMOKE OK`, `ruff` clean, frontend build green) and approved at the tracer feedback checkpoint before Task 2 started. Task 2's role in this plan is regression-pinning of already-correct behavior, not net-new feature development. No implementation defect was found, so no `feat(01-01)` commit was needed.
- **GREEN:** All 7 tests pass (`uv run pytest backend/tests -x -q` -> `7 passed`).
- **REFACTOR:** Not needed — no implementation changes were made.
- **Commits:** Only `test(01-01): pin project API/migration behavior with pytest harness` (`42b3a6a`). No `feat(01-01)` commit exists for this task because no code under test needed changing. This is flagged here per the "Missing RED/GREEN gate commit" fail-fast rule to keep the git-log gate check auditable, even though `workflow.tdd_mode` is off for this project.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Toolchain Versions (for reproducibility)

- uv 0.12.19 (Windows x86_64)
- node v24.19.0, npm 11.17.0
- Key backend (uv.lock): fastapi 0.141.1, sqlalchemy (2.0.x per pyproject constraint), alembic 1.20.0, aiosqlite 0.22.1, httpx 0.28.1, pydantic (2.13+)
- Key frontend (package.json): react 19.3.0, @mantine/core 9.6.3, @tanstack/react-query 5.104.0, i18next 26.4.2, react-router-dom 7.18.4, vite 8.3.1, typescript 5.7.0

## Next Phase Readiness

- Phase 1's walking skeleton is complete for Plan 01: create/list projects works end-to-end through the real compose stack and is pinned by a passing pytest suite.
- Remaining Phase 1 plans (02-10, per ROADMAP/STATE.md "Plan 1 of 10") build on this proven stack — `GET/PATCH/DELETE /api/projects/{project_id}` (Plans 08, 09), Vitest frontend harness, and the worker service (Plan 06) are not yet built.
- No blockers introduced by this plan. Pre-existing STATE.md blockers (DEPL-01 on Linux/macOS, tracked-binary history rewrite, GPU-path acceptance) remain open and are unaffected by this plan.

## Self-Check: PASSED

All key files (`backend/tests/{__init__,conftest,test_projects_api,test_migrations}.py`, `backend/src/yolo_trainer_api/main.py`, `docker-compose.yml`, `scripts/compose_smoke_test.sh`) confirmed present on disk. Both task commits (`d613462`, `42b3a6a`) confirmed in `git log --oneline --all`. `uv run pytest backend/tests -x -q` re-run clean: 7 passed. `uv run ruff check backend` and `uv run ruff format --check backend` both clean.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
