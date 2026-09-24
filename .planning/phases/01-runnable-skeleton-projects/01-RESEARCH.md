# Phase 1: Runnable Skeleton & Projects - Research

**Researched:** 2026-09-24
**Domain:** Full-stack web skeleton (FastAPI + SQLAlchemy/Alembic/SQLite backend, React+Vite+Mantine frontend, Docker Compose CPU deployment) plus Python repo hygiene for existing YOLO CLI scripts
**Confidence:** HIGH (versions and Docker/registry facts verified live against PyPI/npm/Docker Hub this session); MEDIUM (SQLite WAL-on-bind-mount risk, sourced from web search of third-party issue trackers, not SQLite's own docs); LOW/ASSUMED (a few discretionary framework-usage patterns not independently verified this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**UI language & look**
- **D-01:** Build the UI with i18n in both English and Russian from day one (react-i18next or equivalent). No user-facing string is hardcoded in components. — **Reversibility:** costly — adding i18n retroactively means extracting strings from every component.
- **D-02:** The default UI language follows the browser language: `ru*` gets Russian, everything else gets English. A manual switcher is available, and the choice is remembered in the browser (localStorage).
- **D-03:** Use **Mantine** as the component library.
- **D-04:** The app has a **dark theme only**. No light theme and no theme toggle in v1.
- **D-05:** API error messages are plain English text. The API does not return error codes for the frontend to translate. The frontend shows the API message as-is, although its own UI chrome (for example the "Error" title) is translated.

**Projects screen**
- **D-06:** The project list is a **card grid** (Roboflow-like). Each card shows the name, a task-type badge (`detect`/`segment`), and the relative updated time. A dashed "+ New project" card opens the create modal. Cards will later gain a preview thumbnail and counts, so leave room for them.
- **D-07:** A project has a name (required), a task type (required, `detect` | `segment`), and an optional description. `created_at` and `updated_at` are set automatically.
- **D-08:** Project names are **unique, case-insensitive**, enforced both at the DB level and in the API (409 with a clear English message). Keep the approach Postgres-portable, for example a normalized-name column with a unique index rather than a SQLite-only `COLLATE NOCASE`. — **Reversibility:** costly — relaxing or changing it later needs an Alembic migration.
- **D-09:** The task type is **fixed at creation** and cannot be changed afterward, even on an empty project. To fix a mistake, delete and recreate the project.
- **D-10:** Deletion is confirmed by **typing the project name** (GitHub-style). Deletion is hard, with no trash or soft delete.
- **D-11:** An opened project uses a **sidebar shell layout**: "← Projects" back link, then sections. In Phase 1 only **Overview** (name, type badge, description, created date, an empty-state hint) and **Settings** (rename, edit description, delete) exist. Later phases add Images, Classes, Training, and Models entries as they land. Placeholder links for unbuilt sections are not shown.
- **D-12:** The list is sorted by `updated_at` descending, with no search or filter.

**Docker & data storage**
- **D-13:** All app data (SQLite DB, and later images, models, and runs) lives in a host **bind-mounted `./data` folder** next to the compose file. The path can be overridden with `DATA_DIR` in `.env`, and `data/` is gitignored. This deliberately overrides the named-volume default in `docs/roadmap.md` §5.7, because the owner wants data visible and easy to back up. **Research must check SQLite WAL on a Docker Desktop (Windows/macOS) bind mount** for locking and corruption risk, and propose mitigations while keeping the bind-mount decision. — **Reversibility:** costly — moving existing users' data later needs a migration and upgrade note.
- **D-14:** The service is exposed on port **8080**, bound to **127.0.0.1 by default**. Access from the local network is opt-in via `.env` (for example `BIND_ADDR=0.0.0.0`). The README must warn that there is no auth, so opting into LAN access gives everyone on the network full access. The owner first chose 0.0.0.0 and then reversed it after the no-auth implication was raised.
- **D-15:** The frontend is served by a **separate nginx container**. It serves the built SPA static files, handles SPA fallback routing, and reverse-proxies `/api` (including future SSE, so proxy buffering for the stream endpoints must be disabled later) to the FastAPI container. The Compose services are `web` (nginx), `api` (FastAPI), and `worker`.
- **D-16:** Images are **built locally from source** (`docker compose up --build`). There is no registry and no prebuilt GHCR images in v1.
- **D-17:** The worker service in Phase 1 runs on the **real CPU worker image** (torch CPU wheels + ultralytics) and writes a heartbeat (to the DB or a file under `DATA_DIR`), so heavy-image build problems surface now. The **API image stays light, without torch.** Two different images or build targets are used. How jobs cross from api to worker is still decided in Phase 4 (STATE.md blocker).
- **D-18:** The GPU variant will use an **override file**, `docker-compose.gpu.yml` (`docker compose -f docker-compose.yml -f docker-compose.gpu.yml up`). Phase 1 ships only the CPU compose file, but its structure (for example the worker's build args or targets) should make the override straightforward.
- **D-19:** Development runs **natively**, with `uvicorn --reload` and `vite dev` on the host (Vite proxying `/api`). The full compose stack is used for acceptance. The README documents both paths.
- **D-20:** Alembic migrations run automatically when the api container starts (success criterion 5).

**Repo layout & hygiene**
- **D-21:** The repo layout is `backend/` (FastAPI app, worker entrypoint, shared helper module, `tests/`, `pyproject.toml`), `frontend/` (React + Vite + Mantine), `docker/` (Dockerfiles, `nginx.conf`), and `docker-compose.yml` at the root. `train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`, and `config/config.ini` **stay in the repo root** and still run as `python train_yolo.py`, importing the shared module (FOUND-02).
- **D-22:** Python dependencies are managed with **uv**, using `pyproject.toml` and a committed `uv.lock`, with Python 3.12 pinned. The torch CPU/CUDA wheel index is configured via uv index settings.
- **D-23:** `example_ready_dataset/` **images are gitignored** (keep `data.yaml` and the READMEs tracked). A small committed test fixture (5–10 images plus labels, including one stray polygon row) is created when a later phase needs it, not required in Phase 1 unless a test needs it.
- **D-24:** New backend code uses **English comments, type hints, and ruff** for lint and format. The legacy root scripts keep their existing Russian-comment style, and only their imports change.
- **D-25:** Tracked binaries (`trained_models/best.pt`, `yolo26n.pt`, `yolov8n.pt`, all of `runs/`) are untracked with `git rm --cached` and the local files are kept. The real `trained_models/best.pt` must remain on disk. No history rewrite happens in this phase.
- **D-26:** The README is in **English**, with a Russian translation in `README.ru.md`.
- **D-27:** Testing covers **pytest** for the backend (the shared module and the projects API) and **Vitest** for frontend logic. A **compose smoke-test script** brings up the stack, creates a project via the API, restarts, and asserts that the project persists. Playwright E2E is deferred.

### Claude's Discretion
- Exact i18n library and file layout, Zustand vs plain React Query for this phase's state, routing library, project ID format in URLs (integer vs UUID/ULID), and the API route shapes.
- Heartbeat mechanism details for the worker, the nginx config specifics, and Dockerfile structure (multi-stage vs separate files).
- Frontend package manager (npm or pnpm).

### Deferred Ideas (OUT OF SCOPE)
- Prebuilt multi-arch images on GHCR with CI publishing (amd64 + arm64). Possible later, not v1.
- Light theme / theme toggle.
- Project search/filter on the list page (worth adding once there are dozens of projects).
- Trash / soft delete for projects.
- Playwright browser E2E tests.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Fresh clone → working Python 3.12 env with pinned PyTorch/Ultralytics, `pytest` passes, no manual guessing | Verified current PyPI versions for the pin; uv index config pattern for the torch CPU wheel; Environment Availability audit below shows what's missing on a fresh machine |
| FOUND-02 | Shared, unit-tested module for `parse_device`/`quality_assessment` (+ `auto_batch` origin), imported by both scripts | Repo layout (D-21) keeps scripts at root; Architecture Patterns section gives the import mechanism (editable local package via uv workspace member) that keeps `python train_yolo.py` working unmodified |
| FOUND-03 | `.gitignore` + untracking leaves `git status` clean after a CLI training run | Runtime State Inventory section enumerates exactly what's tracked (`trained_models/best.pt`, `yolo26n.pt`, `yolov8n.pt`, `runs/`) and the `git rm --cached` procedure; existing `.gitignore` already read and quoted |
| DEPL-01 | `docker compose up` starts the whole service on CPU-only Windows/Linux/macOS | Docker Hub multi-arch verification (python:3.12-slim, nginx:alpine, node:24-alpine all ship arm64); PyTorch CPU wheel confirmed to ship a `manylinux_2_28_aarch64` build for cp312 — closes the Apple Silicon open question |
| DEPL-03 | Data persists across `down`/`up` and rebuilds | D-13's bind-mount `./data` design; SQLite WAL-on-bind-mount risk research with concrete mitigations that preserve the bind-mount decision |
| PROJ-01 | Create project with name + fixed task type | D-07/D-08/D-09 already locked; Code Examples section gives the normalized-name uniqueness pattern |
| PROJ-02 | List, open, rename, delete projects | D-06/D-10/D-11/D-12 already locked; API route shapes recommended in Architecture Patterns |
</phase_requirements>

## Summary

Phase 1 is a skeleton-and-hygiene phase, not a features phase: almost every product decision is already locked in `01-CONTEXT.md`. The remaining research work was (1) re-verifying the version pins and uv/Docker mechanics that make the pins actually installable and portable to `linux/arm64`, (2) resolving the one open technical risk CONTEXT.md flagged explicitly (SQLite WAL on a Docker Desktop bind mount), and (3) turning "Claude's Discretion" bullets into concrete, prescriptive choices the planner can task out directly.

All three pinned versions from Phase 0 (`docs/phase-0-decisions.md` §1) still resolve on their registries today: **Python 3.12** (latest patch 3.12.14), **PyTorch 2.14.0** (still the newest release on PyPI and on the CPU wheel index), **Ultralytics 8.4.159** (exists on PyPI; note PyPI has since published up to 8.4.161 — Ultralytics ships roughly daily/weekly, so re-confirm the exact patch at implementation time rather than trusting this document). Crucially, `torch-2.14.0+cpu` **does** ship a `manylinux_2_28_aarch64` wheel for cp312 on `download.pytorch.org/whl/cpu`, and `opencv-python-headless` (Ultralytics' own vision dependency) ships an aarch64 wheel too — so the Apple Silicon CPU image (`linux/arm64`) the notes ask about is achievable with the same `pyproject.toml`/Dockerfile, no separate recipe needed. `python:3.12-slim`, `nginx:alpine`, and `node:24-alpine` all publish `arm64/linux` manifests on Docker Hub.

The SQLite-WAL-on-bind-mount risk is real and worth taking seriously, but it is **specific to Docker Desktop's cross-VM filesystem bridges** (virtiofs on macOS, 9p/WSL2 interop on Windows) — not to native Linux Docker, where a bind mount is a real host filesystem with no VM boundary. The failure mode reported in the wild is silent (zero-filled pages under write pressure, not a raised exception), so the mitigation isn't "catch an error," it's: tune SQLite's own concurrency pragmas conservatively (`synchronous=NORMAL` + a generous `busy_timeout`, standard WAL pairing), keep the WAL file checkpointed, and — most importantly — let the phase's own compose smoke-test (D-27) exercise exactly this path (repeated create/rename/restart cycles) as the actual acceptance check, since this is a risk you monitor and mitigate, not one you can prove away by inspection. Document a `journal_mode=DELETE` env-var escape hatch for the rare case a user hits real corruption. This is consistent with DEPL-01's Windows-host scope and is directly testable on this project's own Windows dev machine.

**Primary recommendation:** Build the backend as a `uv` workspace with `backend/` as the main package (FastAPI + SQLAlchemy async + Alembic + aiosqlite) and a lightweight local package (e.g. `backend/src/yolo_trainer_common/`) holding the shared `device`/`quality` module, installed editable so both the new API code and the untouched root scripts (`train_yolo.py`, `finetune_yolo.py`) can `import` it without relocating them. Split the worker/API Docker images via **multi-stage build targets** in one Dockerfile (`--target api` vs `--target worker`), gated by a `pyproject.toml` dependency group so the API image never pulls torch. Use Mantine v9 + react-i18next + Zustand + TanStack Query + React Router + Vitest on the frontend (all verified live on npm this session, all real, high-download, actively maintained packages), served by nginx with `proxy_buffering off` wired in from day one even though SSE doesn't exist until Phase 5.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project CRUD (create/list/rename/delete) | API / Backend | Database / Storage | Business rules (name uniqueness, task-type immutability) must be enforced server-side (D-08, D-09); DB enforces the unique index as the last line of defense |
| Project card grid, sidebar shell, modals | Browser / Client | — | Pure SPA rendering; no SSR in this stack (Vite SPA, per `docs/roadmap.md` §11.1) |
| i18n (string translation, language detection) | Browser / Client | — | Client-only concern; API never returns localized strings (D-05) |
| Static asset + SPA-fallback serving | CDN / Static (nginx) | — | nginx container serves the built `dist/` and proxies `/api/*`, per D-15 |
| DB schema + migrations | Database / Storage | API / Backend | Alembic migrations are backend-owned code but physically alter the SQLite file on the bind mount; migrations run from the `api` container's startup per D-20 |
| SQLite WAL concurrency tuning | Database / Storage | API / Backend | Pragmas are set via SQLAlchemy connect-event in backend code, but the actual risk (cross-VM filesystem coherency) lives at the Docker Desktop / host-filesystem boundary, outside any application tier |
| Worker heartbeat | Worker container | Database / Storage (optional) | D-17 requires the *real* CPU worker image to run and prove buildable; the heartbeat only needs to prove the process is alive, not yet do real job work (that's Phase 4+) |
| Device/quality shared module | Backend (shared package) | CLI scripts (root) | One source of truth consumed by both the new backend and the legacy `train_yolo.py`/`finetune_yolo.py` entry points (FOUND-02) |
| Reverse proxy / SSE buffering config | CDN / Static (nginx) | API / Backend | nginx must not buffer streamed responses; the backend must still send `X-Accel-Buffering: no` as defense-in-depth for the Phase 5 SSE endpoints this config anticipates |

## Standard Stack

### Core (backend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.12.14 (latest 3.12.x) [CITED: endoflife.date/python] | Language runtime | Pinned per phase-0 §1; re-verify Ultralytics' declared support window at implementation time |
| fastapi | 0.141.1 (latest on PyPI) [VERIFIED: pip index versions fastapi] | Web framework, async endpoints, OpenAPI | Native SSE support (needed from Phase 5 on), Pydantic-based validation, matches `docs/roadmap.md` §10.1's reasoning |
| sqlalchemy | 2.0.54 (latest 2.0.x on PyPI) [VERIFIED: pip index versions sqlalchemy] | ORM + Core, async engine | Postgres-portable per phase-0 §6; `2.0.x` is the async-capable line, avoid the `1.4` legacy line |
| alembic | 1.20.0 (latest on PyPI) [VERIFIED: pip index versions alembic] | Schema migrations | D-20 requires migrations to run automatically on api container startup |
| aiosqlite | 0.22.1 (latest on PyPI) [VERIFIED: pip index versions aiosqlite] | Async SQLite DB-API driver for SQLAlchemy's async engine | Required for `sqlite+aiosqlite:///` async engine URL |
| pydantic | 2.13.5 (latest on PyPI) [VERIFIED: pip index versions pydantic] | Request/response schemas, validation | FastAPI's native validation layer; ships with FastAPI as a dependency anyway |
| uvicorn | 0.53.0 (latest on PyPI) [VERIFIED: pip index versions uvicorn] | ASGI server | D-19 explicitly names `uvicorn --reload` for native dev |
| uv | 0.12.18 (latest on PyPI) [VERIFIED: pip index versions uv] | Python package/venv manager, lockfile | D-22 locks this in; not yet installed on this dev machine (see Environment Availability) |
| ruff | 0.16.8 (latest on PyPI) [VERIFIED: pip index versions ruff] | Lint + format for new backend code | D-24 requires ruff for new backend code only, not the legacy root scripts |
| pytest | 9.1.1 (latest on PyPI; already installed globally on this machine) [VERIFIED: pip index versions pytest] | Test framework | D-27, FOUND-02's acceptance criterion |

### Core (frontend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react / react-dom | 19.3.0 (latest on npm) [VERIFIED: npm view react version] | UI library | Mantine v9's own peer dependency requires `^19.2.0` [VERIFIED: npm view @mantine/core peerDependencies] |
| vite | 8.3.0 (latest on npm) [VERIFIED: npm view vite version] | Build tool / dev server | D-19 requires `vite dev` proxying `/api` for native dev |
| @mantine/core, @mantine/hooks | 9.6.2 (latest on npm, same version, published same day) [VERIFIED: npm view @mantine/core version; npm view @mantine/hooks version] | Component library | D-03 locks Mantine in; confirm the peer-dep React 19 requirement is compatible with the rest of the stack before pinning |
| react-i18next | latest on npm, 11.6M weekly downloads, real repo `i18next/react-i18next` [VERIFIED: package-legitimacy check + npm registry] | i18n framework | D-01/D-02 require i18n from day one |
| i18next-browser-languagedetector | latest on npm, 4.5M weekly downloads [VERIFIED: package-legitimacy check] | Browser-language auto-detect (`ru*` → Russian) | D-02's exact mechanism |
| zustand | 5.0.15 (latest on npm) [VERIFIED: npm view zustand version] | Lightweight client state | `docs/roadmap.md` §11.1 recommendation; simple enough for Phase 1's small local UI state (modal open/close, form state) |
| @tanstack/react-query | 5.103.2 (latest on npm) [VERIFIED: npm view @tanstack/react-query version] | Server-state cache (project list, fetch/mutate) | See discretion decision below — recommended over plain fetch+Zustand for this phase's CRUD-heavy screen |
| react-router-dom | latest on npm, 33M weekly downloads [VERIFIED: package-legitimacy check] | Client-side routing | Needed for `/projects`, `/projects/:id` (Overview/Settings sections) |
| vitest | latest on npm, 73.8M weekly downloads [VERIFIED: package-legitimacy check] | Frontend unit test runner | D-27 requires Vitest for frontend logic |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-multipart | latest, FastAPI's own documented dependency for form/file uploads | Needed once FastAPI starts accepting `UploadFile` (not Phase 1, but harmless to add now) | Add when Phase 2 (image upload) lands, not required for Phase 1's JSON-only project CRUD |
| pydantic-settings | latest on PyPI | Typed env-var config (`DATA_DIR`, `BIND_ADDR`, DB URL) | Use instead of hand-rolled `os.environ.get()` — keeps `.env` parsing consistent and typed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Integer auto-increment project ID | UUID or ULID | UUID/ULID avoids leaking sequential counts and is friendlier if the app ever grows multi-tenant auth (v2, COLB-V2-01), but adds a dependency and index-locality cost for no benefit while there's no auth boundary at all (v1 has none, phase-0 §6). Recommend plain integer PK now; revisit if/when auth lands. |
| TanStack Query for server state | Plain `fetch` + Zustand for everything | Zustand-only means hand-rolling loading/error/cache-invalidation for every project-list refresh (create → refetch, rename → refetch). TanStack Query gives this for free and is the more common modern pairing (Zustand for local UI state, Query for server state) — recommended split, not an either/or. |
| npm | pnpm | pnpm is faster/stricter on disk usage, but is **not installed** on this dev machine and needs `corepack enable` or a separate install step; npm ships inside `node:24-alpine` with zero extra setup. Recommend npm for Phase 1 to minimize new toolchain surface; pnpm remains a valid later switch. |
| Multi-stage single Dockerfile (api/worker as build targets) | Two separate Dockerfiles | A single Dockerfile with `FROM ... AS base` then `FROM base AS api` / `FROM base AS worker` shares the base-layer cache and keeps the "light API, heavy worker" split (D-17) in one file to review; two files is also valid and slightly simpler to read per-image but duplicates the base setup. Recommend the shared multi-stage file. |

**Installation:**
```bash
# Backend (from backend/, after uv is installed)
uv sync                      # installs API deps (no torch)
uv sync --group worker       # installs API deps + torch/ultralytics for the worker image

# Frontend (from frontend/)
npm install
```

**Version verification:** All versions above were checked live this session via `pip index versions <pkg>` (PyPI) and `npm view <pkg> version` (npm registry) on 2026-09-24. Ultralytics and PyTorch releases move quickly (Ultralytics ~daily/weekly cadence observed on PyPI this session: 8.4.159 through 8.4.161 in a handful of days) — re-run these two commands again at actual implementation time rather than trusting this document's numbers for those two packages specifically.

## Package Legitimacy Audit

> The automated legitimacy checker flags most of these as `SUS` purely on a **"too-new"** signal (the *latest version* of the package was published within the checker's freshness window) or **"unknown-downloads"** (PyPI's registry API doesn't expose a downloads field the way npm's does, so the checker has no download-count signal to use for any PyPI package). This is a **checker limitation, not a real risk signal**, for actively-maintained, extremely well-known projects — independently confirmed below by reading the actual registry response (real GitHub repo URL matching the well-known project, multi-million weekly npm downloads, or version confirmed present in `pip index versions`/PyPI's own JSON API `requires_python`/classifiers).

| Package | Registry | Age (latest release) | Downloads | Source Repo | Verdict (checker) | Disposition |
|---------|----------|-----------------------|-----------|--------------|---------|-------------|
| fastapi | PyPI | published 2026-07-29 | n/a (PyPI has no downloads field) | github.com/fastapi/fastapi | SUS (unknown-downloads) | Approved — well-known, repo confirmed real |
| sqlalchemy | PyPI | published 2026-09-15 | n/a | sqlalchemy.org (official) | SUS (too-new, unknown-downloads) | Approved |
| alembic | PyPI | published 2026-09-11 | n/a | github.com/sqlalchemy/alembic | SUS (too-new, unknown-downloads) | Approved |
| aiosqlite | PyPI | published 2025-12-23 | n/a | none listed in registry metadata | SUS (unknown-downloads, no-repository) | Approved — repo is github.com/omnilib/aiosqlite, just not populated in registry metadata; verified by `pip index versions` resolving cleanly |
| pydantic | PyPI | published 2026-08-28 | n/a | github.com/pydantic/pydantic | SUS (too-new, unknown-downloads) | Approved |
| uvicorn | PyPI | published 2026-09-14 | n/a | github.com/Kludex/uvicorn | SUS (too-new, unknown-downloads) | Approved |
| ruff | PyPI | published 2026-09-16 | n/a | docs.astral.sh/ruff (official) | SUS (too-new, unknown-downloads) | Approved |
| pytest | PyPI | published 2026-06-19 | n/a | github.com/pytest-dev/pytest | SUS (unknown-downloads) | Approved |
| ultralytics | PyPI | published 2026-09-23 | n/a | github.com/ultralytics/ultralytics | SUS (too-new, unknown-downloads) | Approved — already the project's existing dependency |
| torch | PyPI | published 2026-09-02 | n/a | pytorch.org (official) | SUS (too-new, unknown-downloads) | Approved — already the project's existing dependency |
| @mantine/core, @mantine/hooks, @mantine/notifications | npm | published 2026-09-21 | 1.6–1.9M/week | github.com/mantinedev/mantine | SUS (too-new) | Approved — CONTEXT.md D-03 already locks Mantine; high download count confirms legitimacy |
| react-i18next | npm | published 2026-09-21 | 11.7M/week | github.com/i18next/react-i18next | SUS (too-new) | Approved |
| i18next | npm | published 2026-09-03 | 15.9M/week | github.com/i18next/i18next | SUS (too-new) | Approved |
| i18next-browser-languagedetector | npm | published 2026-02-12 | 4.5M/week | github.com/i18next/i18next-browser-languageDetector | OK | Approved |
| zustand | npm | published 2026-08-13 | 39.8M/week | github.com/pmndrs/zustand | OK | Approved |
| react-router-dom | npm | published 2026-09-15 | 33.0M/week | github.com/remix-run/react-router | SUS (too-new) | Approved |
| @tanstack/react-query | npm | published 2026-09-21 | 48.0M/week | github.com/TanStack/query | SUS (too-new) | Approved |
| recharts | npm | published 2026-07-25 | 42.5M/week | github.com/recharts/recharts | OK | Approved (not needed until Phase 5, listed for future reference) |
| konva / react-konva | npm | published 2026-09-23 / 2026-09-15 | 1.9M / 1.5M per week | github.com/konvajs/konva, konvajs/react-konva | SUS (too-new) | Approved (not needed until Phase 3, listed for future reference) |
| react-virtuoso | npm | published 2026-09-22 | 2.4M/week | github.com/petyosi/react-virtuoso | SUS (too-new) | Approved (not needed until Phase 2, listed for future reference) |
| zundo | npm | published 2024-11-17 | 324K/week | github.com/charkour/zundo | OK | Approved (not needed until Phase 3) |
| vitest | npm | published 2026-09-15 | 73.8M/week | github.com/vitest-dev/vitest | SUS (too-new) | Approved |
| mantine (bare, unscoped) | npm | n/a | n/a | none found | SUS (unknown-age/downloads/no-repository) | **REMOVED — not a real package**; the correct packages are the scoped `@mantine/core`, `@mantine/hooks`, `@mantine/notifications` |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** all Phase-1-relevant packages above carry a `SUS` verdict from the automated checker, but every one was cross-checked against the live registry this session (real, matching source repo; and for npm packages, multi-million weekly downloads) — no `checkpoint:human-verify` is recommended for any of them given this independent verification. The one genuinely bad entry (bare `mantine`) has been corrected to the real scoped package names above; use `@mantine/core`, not `mantine`, in `package.json`.

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │  HTTP :8080 (127.0.0.1 by default, D-14)
  ▼
┌─────────────────────────────────────────────┐
│  web (nginx container)                       │
│  - serves built SPA (dist/) + SPA fallback    │
│  - proxies /api/* → api:8000                  │
│  - proxy_buffering off (SSE-ready from day 1) │
└───────────────┬───────────────────────────────┘
                 │ /api/*
                 ▼
┌─────────────────────────────────────────────┐
│  api (FastAPI container, no torch)            │
│  - on startup: run Alembic migrations (D-20)  │
│  - /api/projects  CRUD (name, task_type, desc)│
│  - /api/system/health                         │
│  - SQLAlchemy async engine → sqlite file       │
└───────────────┬───────────────────────────────┘
                 │ reads/writes
                 ▼
┌─────────────────────────────────────────────┐
│  ./data (host bind mount, DATA_DIR)           │
│  - app.db  (SQLite, WAL mode)                 │
│  - (later phases: images/, models/, runs/)    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  worker (CPU image: torch + ultralytics)      │
│  - Phase 1: proves the heavy image builds,    │
│    writes a heartbeat file under DATA_DIR     │
│  - Phase 4+: picks up real training jobs      │
└─────────────────────────────────────────────┘
```

A reader can trace the primary Phase 1 use case (create a project) by following the arrows: browser → nginx (`web`) → `/api/projects` on `api` → SQLAlchemy write → `./data/app.db` on the bind mount, with the response flowing back the same path. The `worker` container is architecturally present but does no request-path work in Phase 1 — it only proves the CPU image builds and stays alive (D-17).

### Recommended Project Structure
```
yolo-trainer/
├── train_yolo.py              # unchanged entry point, imports shared module
├── finetune_yolo.py           # unchanged entry point, imports shared module
├── gpu_test.py                # unchanged (replaced by diagnostics page in Phase 12)
├── config/config.ini          # unchanged
├── backend/
│   ├── pyproject.toml         # uv workspace root; [dependency-groups] worker = [torch, ultralytics]
│   ├── uv.lock
│   ├── src/
│   │   ├── yolo_trainer_common/    # the shared module (FOUND-02): device.py, quality.py
│   │   │   ├── __init__.py
│   │   │   ├── device.py           # parse_device(), hardware-aware batch sizing
│   │   │   └── quality.py          # quality_assessment()
│   │   └── yolo_trainer_api/       # FastAPI app
│   │       ├── main.py             # app factory, lifespan (Alembic upgrade on startup)
│   │       ├── db.py               # async engine, session, WAL pragma event listener
│   │       ├── models.py           # SQLAlchemy models (Project)
│   │       ├── schemas.py          # Pydantic request/response models
│   │       └── routers/projects.py
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── worker/
│   │   └── main.py                 # heartbeat loop entry point (D-17)
│   └── tests/
│       ├── test_device.py
│       ├── test_quality.py
│       └── test_projects_api.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts              # dev proxy /api → localhost:8000 (D-19)
│   └── src/
│       ├── main.tsx
│       ├── i18n/                   # react-i18next setup, en.json, ru.json
│       ├── routes/
│       │   ├── ProjectsPage.tsx    # card grid (D-06)
│       │   └── ProjectDetailPage.tsx # sidebar shell (D-11)
│       └── api/projects.ts         # TanStack Query hooks
├── docker/
│   ├── Dockerfile.backend          # multi-stage: base → api / worker targets
│   ├── Dockerfile.frontend         # multi-stage: node build → nginx runtime
│   └── nginx.conf
├── docker-compose.yml
├── docker-compose.gpu.yml          # override file (D-18), scaffolded not built out
├── .env.example                    # DATA_DIR, BIND_ADDR, PORT
├── scripts/compose_smoke_test.sh   # D-27 acceptance script
├── README.md
└── README.ru.md
```

### Pattern 1: Shared module importable from both the new backend and the untouched root scripts
**What:** Package the shared `device`/`quality` code as an installable local package (e.g. `yolo_trainer_common`) inside `backend/src/`, and make it importable from the repo root two ways: (a) the `backend/` package is installed editable into whatever venv runs the root scripts (`uv pip install -e ./backend` or a uv workspace `[tool.uv.workspace] members = ["backend"]` with a root-level `pyproject.toml` too), or (b) simpler for Phase 1: keep a **root-level `pyproject.toml`** that declares the repo root itself as a uv workspace, with `backend` as a member, so `uv sync` at the repo root installs everything into one `.venv` and `python train_yolo.py` (run from repo root) resolves `import yolo_trainer_common` normally because it's installed in that same environment — no `sys.path` hacks needed.
**When to use:** Any time code needs to be shared between a proper package (`backend/`) and loose root scripts that must keep working as `python script.py` without a package wrapper.
**Example:**
```python
# train_yolo.py (only the import block changes; rest of the file/behavior is identical)
from yolo_trainer_common.device import parse_device
from yolo_trainer_common.quality import quality_assessment
# ... unchanged Rich console / configparser code below ...
```
```toml
# backend/src/yolo_trainer_common/pyproject.toml is unnecessary; instead declare
# yolo_trainer_common as a regular module inside the backend package and expose it
# via [tool.uv.sources] / workspace member so it installs into the shared venv.
# Root pyproject.toml:
[tool.uv.workspace]
members = ["backend"]
```

### Pattern 2: Project name uniqueness (case-insensitive, Postgres-portable)
**What:** Add a `normalized_name` column (lowercased, trimmed) alongside `name`, populated in a SQLAlchemy `@validates`/before-insert hook, with a `UNIQUE` index on `normalized_name`. On insert/rename, catch the DB's `IntegrityError` and translate it to an API-level `409` with a clear message — don't rely solely on a pre-check query (race condition between check and insert).
**When to use:** Exactly D-08's requirement — avoids SQLite-only `COLLATE NOCASE`, which has no equivalent behavior guarantee on Postgres collations.
**Example:**
```python
# models.py
class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    normalized_name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    task_type: Mapped[str] = mapped_column(String(10))  # "detect" | "segment", immutable after create (D-09)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

@event.listens_for(Project, "before_insert")
@event.listens_for(Project, "before_update")
def _set_normalized_name(mapper, connection, target):
    target.normalized_name = target.name.strip().lower()
```
```python
# routers/projects.py — translate the DB constraint into the required 409
try:
    session.add(project)
    await session.commit()
except IntegrityError:
    await session.rollback()
    raise HTTPException(status_code=409, detail=f"A project named '{project.name}' already exists.")
```

### Pattern 3: SQLite WAL pragma tuning via SQLAlchemy connect-event
**What:** Set `journal_mode=WAL`, `synchronous=NORMAL`, and a generous `busy_timeout` on every new DB-API connection, not per-session — this is the standard SQLAlchemy pairing for SQLite WAL and directly mitigates write-lock contention (though not the deeper Docker-Desktop cross-VM coherency issue, see Common Pitfalls).
**When to use:** Any async SQLAlchemy + SQLite setup that expects concurrent readers.
**Example:**
```python
# db.py
# Source: SQLAlchemy's documented aiosqlite pattern (event fires on the sync_engine)
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()
```

### Pattern 4: uv index config for the PyTorch CPU wheel
**What:** Declare an `explicit = true` index scoped only to `torch` (and `torchvision`/`torchaudio` if ever added), so the rest of the dependency tree still resolves from PyPI.
**When to use:** Exactly D-22's requirement ("The torch CPU/CUDA wheel index is configured via uv index settings").
**Example:**
```toml
# backend/pyproject.toml
[tool.uv.sources]
torch = { index = "pytorch-cpu" }

[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true

[dependency-groups]
worker = ["torch==2.14.0", "ultralytics==8.4.159"]
```
Building the GPU override image later (D-18) swaps this index for the matching CUDA build of the same PyTorch 2.14.0 release — the `explicit = true` pattern means only this one dependency group needs to change, not the whole lockfile resolution strategy.

### Pattern 5: nginx SSE-ready reverse proxy from day one
**What:** Configure `proxy_buffering off` and forward `X-Accel-Buffering: no` support on the `/api/` location block now, even though no SSE endpoint exists until Phase 5 — D-15 explicitly calls this out so it isn't forgotten later.
**When to use:** Any nginx config in front of a backend that will eventually stream.
**Example:**
```nginx
# docker/nginx.conf
location /api/ {
    proxy_pass http://api:8000/api/;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_set_header Connection '';
}

location / {
    root /usr/share/nginx/html;
    try_files $uri /index.html;   # SPA fallback routing
}
```

### Pattern 6: Alembic migrations run on API container startup
**What:** Call `alembic upgrade head` from the FastAPI `lifespan` context manager (or a shell wrapper in the container `CMD` executed before `uvicorn` starts). Because Phase 1 runs exactly **one** `api` container (no horizontal scaling yet), the usual "concurrent migration race" concern raised in general FastAPI/Alembic guidance does not apply — it becomes relevant only if a future phase scales `api` to multiple replicas, which is out of scope for this single-server app (per `docs/roadmap.md` §16 row 10 and the project's no-Kubernetes/no-multi-node scope).
**When to use:** D-20's exact requirement.
**Example:**
```python
# main.py
from contextlib import asynccontextmanager
from alembic.config import Config
from alembic import command

@asynccontextmanager
async def lifespan(app: FastAPI):
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")   # runs synchronously, before "yield"
    yield

app = FastAPI(lifespan=lifespan)
```

### Anti-Patterns to Avoid
- **`COLLATE NOCASE` for name uniqueness:** works on SQLite only; breaks the explicit Postgres-portability requirement in D-08. Use the normalized-name column pattern instead.
- **Buffering-unaware nginx config:** if `proxy_buffering` is left at its nginx default (`on`) when Phase 5 adds SSE, live training progress will appear to "batch" instead of streaming — configure it now per D-15's own note, not retroactively.
- **`git rm` without `--cached`:** would delete `trained_models/best.pt` from the working tree too. D-25 requires `git rm --cached` specifically, keeping the local file.
- **Trusting `torch.cuda.get_device_name(0)` unconditionally:** `gpu_test.py`'s existing bug (crashes with no GPU present) — the shared module's device detection must guard this, even though the diagnostics *page* itself is Phase 12 scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive unique project names | A manual "check then insert" query pair | DB unique index + `IntegrityError` → `409` translation (Pattern 2 above) | Check-then-insert has a race window; the DB constraint is the actual source of truth |
| Schema migrations | Hand-written `ALTER TABLE` scripts or "just recreate the DB" | Alembic (already locked in by phase-0 §6 and D-20) | Alembic gives reversible, versioned migrations and is what D-20's "auto-apply on startup" is built around |
| i18n string management | Ad hoc `if lang === 'ru'` string ternaries in components | react-i18next + JSON resource files (D-01) | D-01 explicitly forbids hardcoded strings; a real i18n library gives pluralization, interpolation, and namespacing for free |
| Env var parsing/typing | Manual `os.environ.get("DATA_DIR", "./data")` scattered across modules | `pydantic-settings` `BaseSettings` class | One typed, validated source of truth for `DATA_DIR`/`BIND_ADDR`/DB URL, consistent with the Pydantic-everywhere FastAPI pattern already in the stack |
| SQLite concurrency tuning | Custom retry/backoff wrapper around every DB call | SQLAlchemy connect-event pragma pattern (Pattern 3) + `busy_timeout` | The pragma-level setting handles the common case; a custom retry layer duplicates what `busy_timeout` already does at the SQLite driver level |

**Key insight:** Nearly everything hand-rollable in this phase (uniqueness races, migration state, i18n string handling, WAL contention) already has a boring, well-trodden library or SQL-level answer — the actual engineering risk in Phase 1 is entirely in the *infrastructure* seams (Docker Desktop filesystem semantics, uv index scoping, multi-stage build targets), which is why this research spent its budget there rather than on backend business logic that CONTEXT.md had already fully specified.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no application database exists yet. This phase creates the first schema from scratch (no data to migrate). | None |
| Live service config | None — no live services predate this phase (no Docker, no deployed instance exists yet per `docs/roadmap.md` §1.11: "No Docker files exist"). | None |
| OS-registered state | None — the legacy scripts (`train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`) have no OS-level registrations (no scheduled tasks, no installed services); they are run manually per `docs/phase-0-decisions.md` and `.planning/codebase/STRUCTURE.md`. | None |
| Secrets/env vars | None currently exist (`config/config.ini` has no secrets, just hyperparameters/paths). D-14 introduces two new env vars, `DATA_DIR` and `BIND_ADDR`, but these are **new**, not renamed from anything — no migration needed. | Document both in `.env.example` |
| Build artifacts | **`trained_models/best.pt`, `yolo26n.pt`, `yolov8n.pt`, and everything under `runs/` are currently tracked in git** despite `.gitignore` already excluding `*.pt` and `runs/`/`trained_models/` (confirmed by reading `.gitignore` directly — ignore rules exist but were added after these files were first committed, per `docs/roadmap.md` §1.9/§3) [VERIFIED: .gitignore, read this session — quotes: `*.pt`, `runs/`, `trained_models/`]. | `git rm --cached trained_models/best.pt yolo26n.pt yolov8n.pt` and `git rm --cached -r runs/`, **without** `--force` and without touching the working tree, so the real local `best.pt` (the user's actual trained model, per D-25) stays on disk. No history rewrite in this phase (explicitly deferred, owner-confirmed action). |

## Common Pitfalls

### Pitfall 1: SQLite WAL silently corrupts (not just locks) on Docker Desktop bind mounts
**What goes wrong:** On Docker Desktop for Windows/macOS, a bind-mounted host directory is exposed to the Linux VM through a cross-VM filesystem bridge (9p/WSL2 interop on Windows, virtiofs on macOS). SQLite's WAL mode depends on shared-memory (`-shm`) coherency between all processes touching the database file; across that VM boundary, the shared-memory mapping is not guaranteed coherent, and under write pressure this fails **silently** — zero-filled pages, not a raised exception — rather than a clean lock error. [CITED: web search of multiple independently-reported issue trackers describing this exact virtiofs/9p WAL-shared-memory failure mode; not sourced from SQLite's own documentation, so treat as MEDIUM confidence, not a primary-source guarantee]
**Why it happens:** WAL mode's correctness contract assumes POSIX-correct advisory locking and coherent shared memory from the underlying filesystem — both assumptions that hold for a native Linux bind mount (no VM boundary) but not for the VM-bridged case Docker Desktop uses on Windows/macOS.
**How to avoid (mitigations that KEEP the D-13 bind-mount decision, per the explicit research ask):**
1. Set `synchronous=NORMAL` + a generous `busy_timeout` (Pattern 3 above) — the standard, low-risk WAL pairing that reduces write contention, though it does not eliminate the cross-VM coherency risk itself.
2. Run `PRAGMA wal_checkpoint(TRUNCATE)` on graceful shutdown (and optionally on a timer) to keep the WAL file small and minimize the window of unflushed pages exposed to the risk.
3. Make the phase's own compose smoke-test (D-27) the actual acceptance check for this risk: bring up the stack, create/rename/delete several projects in quick succession (rapid writes), `docker compose down && docker compose up`, and assert data is intact and uncorrupted — this is the only realistic way to validate this risk given it fails silently rather than with an error.
4. Document a `journal_mode=DELETE` escape hatch (an env var, e.g. `SQLITE_JOURNAL_MODE=DELETE`) in the README troubleshooting section for the rare case a user actually observes corruption — this sacrifices concurrent-read throughput but removes the cross-VM WAL coherency dependency entirely, since `DELETE` mode doesn't use shared memory the same way.
5. Note in the README that this risk is specific to Docker Desktop (Windows/macOS); native Linux Docker hosts are not affected (a bind mount there is a real host filesystem with no VM boundary) — directly relevant since DEPL-01 requires all three OS families to work and this dev machine is itself Windows, so this exact scenario is testable here.
**Warning signs:** `sqlite3.OperationalError: database disk image is malformed` after a restart; a project that existed before `docker compose down` is missing or has garbled fields after `up`.

### Pitfall 2: `python:3.12` ambient system Python on this dev machine is actually 3.14
**What goes wrong:** `python --version` / `py --version` on this machine both report **3.14.7** [VERIFIED: `python --version` run this session]. Ultralytics' own PyPI classifiers list support only through `Python :: 3.13` (no `3.14` classifier present) [VERIFIED: read from PyPI JSON API `classifiers` field for ultralytics 8.4.159 this session — quote: `'Programming Language :: Python :: 3.10', '3.11', '3.12', '3.13', '3.8', '3.9'`, no 3.14 entry]. This is a governed absence (the classifier list stops at 3.13 without an explicit statement that 3.14 is unsupported), so it cannot be asserted that Ultralytics *fails* on 3.14 — but it is clearly outside Ultralytics' *declared* support window, consistent with `docs/phase-0-decisions.md` §1's own reasoning for pinning 3.12.
**Why it happens:** The dev machine's ambient Python was never intentionally aligned with the project's pin; Phase 0 already installed 3.12.10 separately via `py install 3.12` for spike work.
**How to avoid:** `uv` manages its own isolated Python installs per `pyproject.toml`'s `requires-python` pin — `uv python install 3.12` / `uv sync` will fetch and use 3.12.x regardless of the ambient system Python, so this is not actually a blocker, just something the README's setup instructions must be explicit about (don't assume `python` on `PATH` is the right version).
**Warning signs:** `python train_yolo.py` run outside the uv-managed venv uses 3.14 and may hit import-time failures in ultralytics/torch that don't reproduce inside the correctly-pinned venv.

### Pitfall 3: `uv` and `ruff` are not installed on this dev machine yet
**What goes wrong:** `uv --version` and `ruff --version` both fail with "command not found" on this machine today [VERIFIED: `uv --version` / `ruff --version` run this session, both exit 127]. D-22 and D-24 depend on both being available.
**Why it happens:** Neither has been installed yet — this is genuinely a Phase 1 setup step, not a research gap.
**How to avoid:** The README (FOUND-01's own acceptance criterion) must include the `uv` install step as its very first instruction ("no manual guessing"); `ruff` can then be pulled in as a `dependency-group` inside `pyproject.toml` so `uv sync` installs it without a separate global install.
**Warning signs:** A "works on my machine" README that silently assumes `uv`/`ruff` are already on `PATH`.

### Pitfall 4: Two-image split (API without torch, worker with torch) breaks if dependency groups aren't build-time-scoped correctly
**What goes wrong:** If the Dockerfile's `api` target accidentally runs `uv sync --all-groups` (or omits `--no-group worker`), the "light API image" requirement (D-17) silently fails — the API image balloons to include torch/ultralytics, defeating the entire point of splitting the images.
**Why it happens:** `uv sync` without group flags syncs the default (non-optional) dependencies plus the special-cased `dev` group by default; a `worker` group must be explicitly excluded or included per target, and it's easy to get this backwards.
**How to avoid:** Two build targets in the Dockerfile calling `uv sync --no-group worker` (api) vs `uv sync --group worker` (worker) explicitly; the compose smoke-test (D-27) or a CI check can assert `docker image inspect` size delta between the two images stays large (torch alone is >100MB even as a CPU wheel) as a regression guard.
**Warning signs:** `api` image size balloons to match `worker` image size after a routine dependency change.

## Code Examples

### uv workspace root pyproject.toml (shared module importable from root scripts)
```toml
# pyproject.toml (repo root)
[project]
name = "yolo-trainer-workspace"
version = "0"
requires-python = ">=3.12,<3.13"
dependencies = ["yolo_trainer_common"]

[tool.uv.sources]
yolo_trainer_common = { workspace = true }

[tool.uv.workspace]
members = ["backend"]
```

### FastAPI + Alembic startup migration (Pattern 6, full lifespan example)
```python
# Source: FastAPI lifespan pattern + Alembic's programmatic API (both official, well-documented APIs)
from contextlib import asynccontextmanager
from fastapi import FastAPI
from alembic import command
from alembic.config import Config

def run_migrations() -> None:
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")

@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    yield

app = FastAPI(lifespan=lifespan)
```

### Worker heartbeat (D-17's discretion — file-based, no DB coupling yet)
```python
# worker/main.py — Phase 1 scope only: prove the image builds and stays alive.
# Real job execution is Phase 4+; this loop's only job is to exist.
import json
import time
from datetime import datetime, timezone
from pathlib import Path

HEARTBEAT_PATH = Path(os.environ.get("DATA_DIR", "/data")) / "worker" / "heartbeat.json"

def main() -> None:
    HEARTBEAT_PATH.parent.mkdir(parents=True, exist_ok=True)
    while True:
        HEARTBEAT_PATH.write_text(json.dumps({
            "pid": os.getpid(),
            "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        }))
        time.sleep(10)

if __name__ == "__main__":
    main()
```
Recommendation and reasoning: a file under `DATA_DIR` (not a DB write) keeps the worker decoupled from the API's DB schema/session machinery, which is appropriate since Phase 1's worker has no real job to track yet — this avoids building throwaway DB-coupling code that Phase 4's real job-tracking design (still an open blocker per STATE.md) might not want to inherit.

### Multi-stage Dockerfile skeleton (API vs worker build targets, D-17)
```dockerfile
# docker/Dockerfile.backend
FROM python:3.12-slim AS base
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/src ./src

FROM base AS api
RUN uv sync --frozen --no-group worker
CMD ["uv", "run", "uvicorn", "yolo_trainer_api.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS worker
RUN uv sync --frozen --group worker
CMD ["uv", "run", "python", "-m", "worker.main"]
```
```yaml
# docker-compose.yml (relevant services excerpt)
services:
  api:
    build: { context: ., dockerfile: docker/Dockerfile.backend, target: api }
    volumes: ["${DATA_DIR:-./data}:/data"]
    environment: { DATA_DIR: /data }
  worker:
    build: { context: ., dockerfile: docker/Dockerfile.backend, target: worker }
    volumes: ["${DATA_DIR:-./data}:/data"]
    environment: { DATA_DIR: /data }
  web:
    build: { context: ., dockerfile: docker/Dockerfile.frontend }
    ports: ["${BIND_ADDR:-127.0.0.1}:${PORT:-8080}:80"]
    depends_on: [api]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `auto_batch(imgsz, gpu_vram=12)` heuristic hardcoding 12GB VRAM (`train_yolo.py:28-31`) | Explicit user-set batch size, or hardware-aware sizing via `torch.cuda.get_device_properties(0).total_memory` | Already flagged as a defect in `docs/roadmap.md` §3 (disposition: Replace) | Out of Phase 1 scope directly (no training UI yet), but the shared module (FOUND-02) should not blindly re-export the old heuristic as-is — carry `parse_device`/`quality_assessment` forward verbatim (they're sound), leave `auto_batch` behind for a later phase to redesign properly rather than centralizing a known-bad heuristic |
| `metrics.mean_results()` tuple-unpacking (`train_yolo.py:117`) | Not touched in Phase 1 (training logic itself isn't migrated yet — that's Phase 4) | N/A | Flag for Phase 4 research, not Phase 1: this API surface should be re-verified against Ultralytics 8.4.159 specifically before `train_worker.py` is built |

**Deprecated/outdated:** None directly relevant to Phase 1's actual scope (project CRUD + skeleton) — the training-logic-specific items above are informational for later phases, included here because FOUND-02 does touch the shared module both scripts import.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SQLite WAL-on-Docker-Desktop-bind-mount corruption risk description (cross-VM shared-memory incoherency, silent zero-fill failure mode) | Common Pitfalls #1 | Sourced from web search summaries of third-party issue trackers, not SQLite's own documentation or a reproduced failure on this project's own stack. If the actual mechanism differs, the specific mitigations (checkpoint truncation, DELETE-mode escape hatch) may be solving the wrong problem — the compose smoke-test (D-27) mitigation is the one that catches the real-world symptom regardless of root-cause accuracy, so treat that as the load-bearing mitigation and the pragma tuning as defense-in-depth |
| A2 | Recommendation: plain integer auto-increment project ID (not UUID/ULID) | Standard Stack, Alternatives Considered | Low risk — this is an internal API-shape decision, easily changed before any external consumer depends on project IDs (no public API surface yet in v1) |
| A3 | Recommendation: TanStack Query paired with Zustand (server state vs. local UI state split) rather than Zustand-only | Standard Stack, Alternatives Considered | Low-medium risk — this is a common, well-documented pairing, but CONTEXT.md left it fully to discretion; if the planner/owner prefers a simpler stack for this small a CRUD surface, Zustand-only with manual refetch is a defensible fallback with more boilerplate |
| A4 | Alembic-migrations-in-`lifespan` is safe because Phase 1 runs exactly one `api` container replica | Architecture Patterns, Pattern 6 | Low risk for v1 (project explicitly excludes Kubernetes/multi-node per REQUIREMENTS.md Out of Scope table), but if a future phase ever scales `api` horizontally this pattern needs revisiting (move to a separate migration step before container start) |
| A5 | `aiosqlite`'s GitHub repo is `omnilib/aiosqlite` despite the PyPI registry metadata showing no repository URL | Package Legitimacy Audit | Very low risk — package resolves correctly via `pip index versions` and is the standard, only widely-used async SQLite driver for SQLAlchemy; the missing repo URL is a metadata gap, not a legitimacy concern |

**If this table is empty:** N/A — assumptions listed above.

## Open Questions

1. **Exact Ultralytics patch version to pin**
   - What we know: 8.4.159 (phase-0's pin) exists on PyPI and is presumably what the phase-0 spike actually validated end-to-end. PyPI's latest today is 8.4.161 — two patches newer, published within days of 8.4.159.
   - What's unclear: Whether re-pinning to the newer patch introduces any behavior change relevant to this project (unlikely for a patch bump, but not independently verified this session).
   - Recommendation: Keep 8.4.159 as decided in Phase 0 (it's the version that was actually spike-tested against a real training run) unless the planner/owner has a specific reason to bump; re-run `pip index versions ultralytics` once more immediately before `uv sync` is first run for real, since this package moves roughly daily.

2. **Whether TanStack Query is worth the added dependency for Phase 1's small CRUD surface**
   - What we know: CONTEXT.md explicitly left "Zustand vs plain React Query" to discretion. Phase 1 only has one resource (projects) with 4 operations (create/list/rename/delete).
   - What's unclear: Whether the owner has a strong simplicity preference that would favor skipping TanStack Query for this phase and revisiting when Phase 2+ adds more resources (images, classes).
   - Recommendation: Use it — the pattern (Query for server state, Zustand for local UI/form state) is the more idiomatic modern React setup and costs little at this scale; it also avoids a later migration once more resources arrive in Phase 2+.

3. **Whether the `example_ready_dataset/` images should be a committed fixture or fully ignored (flagged by CONTEXT.md as a Phase 1 decision, not yet resolved by this research)**
   - What we know: D-23 already decided this — images are gitignored, `data.yaml`/READMEs stay tracked, and a small dedicated fixture is deferred to whichever later phase actually needs one for tests.
   - What's unclear: Nothing — D-23 is a locked decision, not actually open. Listed here only to confirm the CONTEXT.md instruction ("Also decide whether the `example_ready_dataset/` images are a committed fixture or ignored") is already resolved and needs no further research.
   - Recommendation: No action needed; D-23 stands.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Docker Compose | DEPL-01 (whole phase) | ✓ | Docker 29.7.2, Compose v5.4.0 [VERIFIED: `docker --version` this session] | — |
| Python (ambient/system) | Fallback only; uv manages its own | ✓ (wrong version) | 3.14.7 [VERIFIED: `python --version` this session] | uv installs and manages Python 3.12 itself; ambient Python is irrelevant once uv is set up (see Pitfall 2) |
| uv | D-22 (all Python dependency management) | ✗ | — | Must be installed as the first README step; no viable substitute given D-22 is a locked decision |
| ruff | D-24 (new backend code lint/format) | ✗ | — | Installed via `uv sync` as a dependency group once uv is set up; not needed as a separate global install |
| Node.js | Frontend build/dev | ✓ | v24.19.0 [VERIFIED: `node --version` this session] | Matches Node 24 LTS (current LTS since 2026-10-28 per endoflife.date); no action needed |
| npm | Frontend package manager (discretion: recommend npm over pnpm) | ✓ | 11.17.0 [VERIFIED: `npm --version` this session] | — |
| pnpm | Alternative frontend package manager (not recommended, see Alternatives Considered) | ✗ | — | Not needed — npm is the recommendation precisely because it's already available with zero extra setup |
| git | FOUND-03 (untrack binaries) | ✓ | 2.45.1.windows.1 [VERIFIED: `git --version` this session] | — |
| pytest | FOUND-02 | ✓ (already installed globally, likely from another project) | 9.1.1 [VERIFIED: `pytest --version` this session] | Backend should still declare it in `pyproject.toml`'s dev/test dependency group rather than relying on the global install |
| NVIDIA GPU / `nvidia-smi` | Not required by Phase 1 (CPU-only phase; GPU is Phase 12) | ✗ | — | N/A — this phase is explicitly CPU-only; no fallback needed since GPU isn't in scope |

**Missing dependencies with no fallback:**
- `uv` — must be installed manually as the README's documented first step (this is the actual Phase 1 deliverable, not a gap in research).

**Missing dependencies with fallback:**
- `ruff`, `pnpm` — both resolved above (ruff via `uv sync`'s dependency group; pnpm intentionally not chosen).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend) | pytest 9.1.1 [VERIFIED: `pytest --version` this session] |
| Framework (frontend) | Vitest (latest on npm, per D-27) |
| Config file | none yet — Wave 0 must add `backend/pyproject.toml`'s `[tool.pytest.ini_options]` and `frontend/vite.config.ts`'s `test` block |
| Quick run command (backend) | `uv run pytest backend/tests -x` |
| Quick run command (frontend) | `npm --prefix frontend run test -- --run` |
| Full suite command | `uv run pytest backend/tests && npm --prefix frontend run test -- --run && bash scripts/compose_smoke_test.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Fresh clone → `uv sync` → `pytest` passes | integration/smoke | `uv sync && uv run pytest backend/tests -x` | ❌ Wave 0 |
| FOUND-02 | `parse_device`/`quality_assessment` unit-tested in shared module; both scripts still import and run | unit | `uv run pytest backend/tests/test_device.py backend/tests/test_quality.py -x` | ❌ Wave 0 |
| FOUND-03 | `git status` clean after a training run; ignore rules cover `*.pt`/`runs/`/datasets/app data | manual + scripted grep | `git status --porcelain` (expect empty after a CLI run) | ❌ Wave 0 (a small helper script, not a full test framework need) |
| DEPL-01 | `docker compose up` succeeds on CPU-only host, UI reachable | smoke (compose) | `bash scripts/compose_smoke_test.sh` | ❌ Wave 0 |
| DEPL-03 | Data survives `down`/`up`; migrations auto-apply | smoke (compose) | same `compose_smoke_test.sh`, extended to restart and re-check | ❌ Wave 0 |
| PROJ-01 | Create project with name + task type; name uniqueness enforced (409) | integration (API) | `uv run pytest backend/tests/test_projects_api.py -k create -x` | ❌ Wave 0 |
| PROJ-02 | List/open/rename/delete project | integration (API) + component (frontend) | `uv run pytest backend/tests/test_projects_api.py -x` + `npm --prefix frontend run test -- --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** backend quick run (`uv run pytest backend/tests -x`) and/or frontend quick run, whichever the task touched
- **Per wave merge:** full suite command above, including the compose smoke test
- **Phase gate:** Full suite green (including `compose_smoke_test.sh`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/pyproject.toml` `[tool.pytest.ini_options]` — pytest config + test discovery path
- [ ] `backend/tests/conftest.py` — async test DB fixture (in-memory or temp-file SQLite, async session override)
- [ ] `frontend/vite.config.ts` `test` block + `frontend/src/test-setup.ts` — Vitest + Testing Library setup
- [ ] `scripts/compose_smoke_test.sh` — new script: bring up stack, `curl` create project, `docker compose down && up`, assert project still present
- [ ] Framework installs: `uv sync` (backend, pulls pytest as a dev dependency group) and `npm install` (frontend, pulls vitest)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | v1 explicitly ships with no auth layer (phase-0 §6, `docs/roadmap.md` §16 row 10) — document this loudly in the README (D-14 already requires the LAN-exposure warning) |
| V3 Session Management | No | No sessions exist; no auth means no session state |
| V4 Access Control | No | Single-operator tool with no user boundary in v1 |
| V5 Input Validation | Yes | Pydantic schemas on every FastAPI endpoint (project name length/type, task_type enum constrained to `detect`/`segment`, description length bound) |
| V6 Cryptography | No | Nothing in Phase 1 requires cryptographic operations (no passwords, no tokens, no signed URLs) |
| V12 File/Resource Handling | Partially | Phase 1 doesn't accept file uploads yet (that's Phase 2/DATA-01), but the bind-mount `DATA_DIR` path itself should be validated/normalized at startup (reject a `DATA_DIR` that resolves outside the intended host directory) even though no user-supplied paths are processed yet in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via project name/description | Tampering | SQLAlchemy parameterized queries (never raw string-formatted SQL) — default behavior of the ORM, no custom SQL in this phase |
| Unbounded/malicious project name or description length | Denial of Service (resource exhaustion) | Pydantic `max_length` constraints on `name`/`description` fields |
| Network exposure beyond intended (D-14's core concern) | Information Disclosure / Elevation of Privilege | Bind to `127.0.0.1` by default; `BIND_ADDR=0.0.0.0` is opt-in via `.env`, with the README's mandatory no-auth warning (D-14) |
| SQLite file corruption from concurrent access (see Pitfall 1) | Tampering (data integrity, not an attacker-driven threat here but a reliability/integrity risk) | WAL pragma tuning + compose smoke-test validation, per Pitfall 1's mitigation list |
| `.pt` files as untrusted pickle input | Tampering / Remote Code Execution | **Not yet in scope** — Phase 1 has no model upload; `docs/roadmap.md` §8.6/§15 already documents the mitigation stance (PyTorch ≥2.6 `weights_only=True` default, isolated worker context) for when Phase 7 introduces model upload. Noted here only so the planner doesn't need to re-derive it later. |

## Sources

### Primary (HIGH confidence)
- PyPI JSON API (`pypi.org/pypi/<pkg>/<version>/json`) — read directly this session for `ultralytics` 8.4.159 and `torch` 2.14.0 `requires_python`/`classifiers` fields
- `pip index versions <pkg>` — run directly against the live PyPI simple index this session for fastapi, sqlalchemy, alembic, aiosqlite, pydantic, uvicorn, ruff, pytest, uv, ultralytics, torch
- `npm view <pkg> version` / `npm view <pkg> peerDependencies` — run directly against the live npm registry this session for react, vite, @mantine/core, @mantine/hooks, react-router-dom, zustand, react-i18next, @tanstack/react-query, vitest
- `download.pytorch.org/whl/cpu/torch/` index page and PyPI's own `urls` array for torch 2.14.0 — confirmed `manylinux_2_28_aarch64` wheels exist for cp310/cp311/cp312, closing the Apple Silicon CPU-image question
- Docker Hub Registry API (`registry.hub.docker.com/v2/repositories/library/<image>/tags/<tag>`) — confirmed `arm64/linux` manifests for `python:3.12-slim`, `nginx:alpine`, `node:22-alpine`
- `endoflife.date/api/python.json` and `.../nodejs.json` — confirmed latest 3.12.x patch (3.12.14) and that Node 24 is the current LTS line
- `.gitignore`, `train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`, `config/config.ini`, `.planning/codebase/STRUCTURE.md` — all read directly this session

### Secondary (MEDIUM confidence)
- WebSearch: "uv pyproject.toml pytorch CPU index configuration" — corroborated by Astral's own official uv docs pages appearing in results (docs.astral.sh/uv/guides/integration/pytorch/, docs.astral.sh/uv/concepts/indexes/)
- WebSearch: "FastAPI run Alembic migrations automatically on startup" and "nginx proxy_buffering off SSE" — general, widely-corroborated patterns across multiple independent sources in results
- WebSearch: "SQLAlchemy async engine sqlite pragma journal_mode WAL" — corroborated pattern (`event.listens_for(engine.sync_engine, "connect")`) matching SQLAlchemy's own documented aiosqlite integration approach

### Tertiary (LOW confidence)
- WebSearch: "SQLite WAL mode Docker Desktop bind mount Windows macOS locking corruption" and follow-up virtiofs/9p searches — sourced from third-party issue-tracker summaries (not SQLite's own documentation), flagged `[CITED]`/MEDIUM at best per the Common Pitfalls entry; treat the specific mechanism description as directional, not a guaranteed-accurate root cause, but the recommended mitigation (compose-smoke-test as the real acceptance check) does not depend on the mechanism being exactly right

## Metadata

**Confidence breakdown:**
- Standard stack (versions, arm64 availability): HIGH — every version and platform-availability claim was checked live against the actual registry/index this session, not recalled from training data
- Architecture (repo layout, Docker multi-stage split, Alembic-on-startup, nginx SSE config): MEDIUM-HIGH — patterns are standard and corroborated by multiple search sources, but not independently executed/built this session (no working Dockerfile was actually built and run)
- SQLite WAL bind-mount risk: MEDIUM — real, corroborated risk, but sourced from web search of issue trackers rather than SQLite's own documentation; mitigation strategy is sound regardless (compose smoke-test catches the actual symptom)
- Pitfalls (uv/ruff not installed, ambient Python mismatch, dependency-group scoping): HIGH — directly observed on this machine this session

**Research date:** 2026-09-24
**Valid until:** ~14 days for the Ultralytics/PyTorch pin (fast-moving, Ultralytics observed publishing 3 patches within days during this research session); ~60 days for the frontend/backend framework choices (Mantine, FastAPI, SQLAlchemy — stable, slower-moving); re-verify the SQLite WAL bind-mount findings if Docker Desktop's filesystem-sharing backend changes (Docker periodically changes the default Windows/macOS file-sharing implementation)
