# Walking Skeleton — YOLO Trainer Platform

**Phase:** 1
**Generated:** 2026-09-24

## Capability Proven End-to-End

A user runs `docker compose up --build` on a CPU-only machine, opens http://127.0.0.1:8080, creates a `detect` or `segment` project from the "+ New project" card, sees it in the project grid, and still sees it after `docker compose down` / `docker compose up` (browser SPA -> nginx `web` -> FastAPI `api` -> Alembic-migrated SQLite in the bind-mounted `./data`).

Tracer task: `01-01-PLAN.md` Task 1. Automated end-to-end proof: `bash scripts/compose_smoke_test.sh`.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend framework | FastAPI (app factory `yolo_trainer_api.main:create_app`, all routes under `/api`) | Async, Pydantic validation, native SSE later (Phase 5); locked by phase-0 §6 / RESEARCH |
| Data layer | SQLAlchemy 2 async + aiosqlite, SQLite file `DATA_DIR/app.db`, WAL + `synchronous=NORMAL` + `busy_timeout=30000`, `SQLITE_JOURNAL_MODE=DELETE` escape hatch | Single-server scale; Postgres-ready: no SQLite-only SQL (case-insensitive uniqueness via a `normalized_name` column + unique index, D-08) |
| Migrations | Alembic, scripts inside the package (`yolo_trainer_api/migrations`), `render_as_batch=True`, `upgrade head` in the FastAPI lifespan on every api start | D-20; works regardless of cwd/install mode; one api replica so no migration race |
| API conventions | Integer IDs; errors are `{"detail": "<plain English>"}` for 404/409/422; timestamps UTC ISO-8601 ending in `Z`; list sorted `updated_at DESC, id DESC` | D-05, D-12; frontend shows API text as-is |
| Auth / exposure | No auth in v1. Web port published on `${BIND_ADDR:-127.0.0.1}:${PORT:-8080}`; `api`/`worker` publish no host ports; FastAPI host allow-list `ALLOWED_HOSTS` (default `localhost,127.0.0.1`) | D-14; owner reversed 0.0.0.0 after the no-auth implication; allow-list blunts DNS-rebinding against the local API |
| Deployment target | Docker Compose, images built locally: `web` (nginx serving the Vite build + `/api` reverse proxy, `proxy_buffering off`), `api` (python:3.12-slim, no torch), `worker` (python:3.12-slim + torch 2.14.0 CPU + ultralytics 8.4.159, heartbeat file) | D-15, D-16, D-17; SSE-ready proxy from day one |
| GPU path | Future `docker-compose.gpu.yml` override replaces the worker's `build.target` / `image` and adds a device reservation (Phase 12) | D-18; Phase 1 ships only the CPU compose file |
| Persistence | Host bind mount `${DATA_DIR:-./data}` -> `/data` in api and worker; `data/` gitignored | D-13 (overrides roadmap §5.7 named volumes); Docker Desktop WAL caveat documented + smoke-tested |
| Python toolchain | uv workspace: root `pyproject.toml` (non-package, dev group + CLI deps) with member `backend/` (package `yolo-trainer-backend`, hatchling, src layout); `.python-version` = 3.12; committed `uv.lock`; torch/torchvision from an explicit `pytorch-cpu` uv index | D-21, D-22; root CLI scripts import the shared module from the same `.venv` with no `sys.path` hacks |
| Python packages | `yolo_trainer_api` (FastAPI app), `yolo_trainer_common` (shared `parse_device`/`quality_assessment`/`detect_compute_device`), `yolo_trainer_worker` (worker entrypoint) | D-21, FOUND-02 |
| Frontend | React 19 + Vite + TypeScript, Mantine (dark only, `forceColorScheme="dark"`), TanStack Query for server state (no Zustand until the Phase 3 editor), React Router | D-03, D-04; RESEARCH A3 |
| i18n | react-i18next; namespace JSON files `frontend/src/i18n/locales/{en,ru}/{namespace}.json` auto-loaded with `import.meta.glob`; initial language = stored manual choice (`localStorage['yolo-trainer.language']`) else `ru` if the browser language starts with `ru`, else `en` | D-01, D-02; per-feature namespaces keep later plans from colliding on one resource file |
| Testing | pytest (`backend/tests`, TestClient + tmp `DATA_DIR`), Vitest + Testing Library (jsdom), `scripts/compose_smoke_test.sh`, `scripts/check_cli_run_git_clean.py` | D-27; Playwright deferred |
| Directory layout | `backend/` (pyproject, `src/`, `tests/`, `alembic.ini`), `frontend/` (Vite app, `src/app`, `src/api`, `src/features/*`, `src/i18n`, `src/lib`), `docker/` (Dockerfiles, `nginx.conf`), `scripts/`, root `docker-compose.yml`; legacy `train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`, `config/config.ini` stay in the repo root | D-21 |

## Stack Touched in Phase 1

- [ ] Project scaffold (framework, build, lint, test runner) — uv workspace + ruff + pytest; Vite + tsc + Vitest (Plans 01, 03)
- [ ] Routing — `/projects`, `/projects/:projectId`, `/projects/:projectId/settings` (Plans 01, 08, 09)
- [ ] Database — real write (`POST /api/projects`) and real read (`GET /api/projects`) on Alembic-migrated SQLite (Plan 01)
- [ ] UI — create-project modal wired to the API through TanStack Query (Plan 01)
- [ ] Deployment — `docker compose up --build` on the CPU-only dev machine, verified by `scripts/compose_smoke_test.sh` (Plans 01, 02, 06)

## Out of Scope (Deferred to Later Slices)

- Images, thumbnails, classes (Phase 2); annotation editor (Phase 3); jobs, training, model download (Phase 4+)
- How jobs cross from `api` to `worker` (Phase 4 decision; the Phase 1 worker only proves the heavy image and writes a heartbeat)
- GPU image and `docker-compose.gpu.yml`, diagnostics page replacing `gpu_test.py` (Phase 12)
- User-configured dataset/model host mounts (DEPL-04, Phase 9)
- Auth / multi-user, prebuilt GHCR images, light theme, project search/filter, soft delete, Playwright E2E (deferred by CONTEXT.md)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: upload images into a project, virtualized grid, project classes
- Phase 3: bounding-box annotation editor with autosave and undo/redo
- Phase 4: split, train in the worker, download a working `.pt`
- Phase 5: live training charts via SSE through the already-unbuffered nginx proxy, cancel/resume, run history
- Phase 6: polygons and click-to-segment for `segment` projects
- Phase 7: model library (`.pt` upload with trust warning)
- Phase 8: AI-assisted annotation
- Phase 9: dataset import/export and host mounts
- Phase 10: tags, filters, statistics
- Phase 11: advanced hyperparameters and run comparison
- Phase 12: GPU override image and hardware diagnostics
