# Phase 1: Runnable Skeleton & Projects - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

After this phase, a user on a CPU-only machine runs one `docker compose up`, opens the web UI, and creates, lists, opens, renames, and deletes `detect`/`segment` projects. Projects persist across `down`/`up` and image rebuilds, and Alembic migrations apply automatically on startup. Underneath is a clean, reproducible, tested codebase: pinned Python 3.12 / PyTorch 2.14.0 / Ultralytics 8.4.159 (re-verified at implementation time), pytest, one shared unit-tested helper module used by `train_yolo.py` and `finetune_yolo.py`, and ignore rules that leave `git status` clean after a CLI training run.

Requirements: FOUND-01, FOUND-02, FOUND-03, DEPL-01, DEPL-03, PROJ-01, PROJ-02.

Not in this phase: images and classes (Phase 2), jobs and training (Phase 4+), the GPU image and its validation (Phase 12), user-configured dataset/model mounts (DEPL-04, Phase 9), and the diagnostics page (DEPL-05, Phase 12).

</domain>

<decisions>
## Implementation Decisions

### UI language & look
- **D-01:** Build the UI with i18n in both English and Russian from day one (react-i18next or equivalent). No user-facing string is hardcoded in components. — **Reversibility:** costly — adding i18n retroactively means extracting strings from every component.
- **D-02:** The default UI language follows the browser language: `ru*` gets Russian, everything else gets English. A manual switcher is available, and the choice is remembered in the browser (localStorage).
- **D-03:** Use **Mantine** as the component library.
- **D-04:** The app has a **dark theme only**. No light theme and no theme toggle in v1.
- **D-05:** API error messages are plain English text. The API does not return error codes for the frontend to translate. The frontend shows the API message as-is, although its own UI chrome (for example the "Error" title) is translated.

### Projects screen
- **D-06:** The project list is a **card grid** (Roboflow-like). Each card shows the name, a task-type badge (`detect`/`segment`), and the relative updated time. A dashed "+ New project" card opens the create modal. Cards will later gain a preview thumbnail and counts, so leave room for them.
- **D-07:** A project has a name (required), a task type (required, `detect` | `segment`), and an optional description. `created_at` and `updated_at` are set automatically.
- **D-08:** Project names are **unique, case-insensitive**, enforced both at the DB level and in the API (409 with a clear English message). Keep the approach Postgres-portable, for example a normalized-name column with a unique index rather than a SQLite-only `COLLATE NOCASE`. — **Reversibility:** costly — relaxing or changing it later needs an Alembic migration.
- **D-09:** The task type is **fixed at creation** and cannot be changed afterward, even on an empty project. To fix a mistake, delete and recreate the project.
- **D-10:** Deletion is confirmed by **typing the project name** (GitHub-style). Deletion is hard, with no trash or soft delete.
- **D-11:** An opened project uses a **sidebar shell layout**: "← Projects" back link, then sections. In Phase 1 only **Overview** (name, type badge, description, created date, an empty-state hint) and **Settings** (rename, edit description, delete) exist. Later phases add Images, Classes, Training, and Models entries as they land. Placeholder links for unbuilt sections are not shown.
- **D-12:** The list is sorted by `updated_at` descending, with no search or filter.

### Docker & data storage
- **D-13:** All app data (SQLite DB, and later images, models, and runs) lives in a host **bind-mounted `./data` folder** next to the compose file. The path can be overridden with `DATA_DIR` in `.env`, and `data/` is gitignored. This deliberately overrides the named-volume default in `docs/roadmap.md` §5.7, because the owner wants data visible and easy to back up. **Research must check SQLite WAL on a Docker Desktop (Windows/macOS) bind mount** for locking and corruption risk, and propose mitigations while keeping the bind-mount decision. — **Reversibility:** costly — moving existing users' data later needs a migration and upgrade note.
- **D-14:** The service is exposed on port **8080**, bound to **127.0.0.1 by default**. Access from the local network is opt-in via `.env` (for example `BIND_ADDR=0.0.0.0`). The README must warn that there is no auth, so opting into LAN access gives everyone on the network full access. The owner first chose 0.0.0.0 and then reversed it after the no-auth implication was raised.
- **D-15:** The frontend is served by a **separate nginx container**. It serves the built SPA static files, handles SPA fallback routing, and reverse-proxies `/api` (including future SSE, so proxy buffering for the stream endpoints must be disabled later) to the FastAPI container. The Compose services are `web` (nginx), `api` (FastAPI), and `worker`.
- **D-16:** Images are **built locally from source** (`docker compose up --build`). There is no registry and no prebuilt GHCR images in v1.
- **D-17:** The worker service in Phase 1 runs on the **real CPU worker image** (torch CPU wheels + ultralytics) and writes a heartbeat (to the DB or a file under `DATA_DIR`), so heavy-image build problems surface now. The **API image stays light, without torch.** Two different images or build targets are used. How jobs cross from api to worker is still decided in Phase 4 (STATE.md blocker).
- **D-18:** The GPU variant will use an **override file**, `docker-compose.gpu.yml` (`docker compose -f docker-compose.yml -f docker-compose.gpu.yml up`). Phase 1 ships only the CPU compose file, but its structure (for example the worker's build args or targets) should make the override straightforward.
- **D-19:** Development runs **natively**, with `uvicorn --reload` and `vite dev` on the host (Vite proxying `/api`). The full compose stack is used for acceptance. The README documents both paths.
- **D-20:** Alembic migrations run automatically when the api container starts (success criterion 5).

### Repo layout & hygiene
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` § Phase 1 — goal, success criteria, notes (re-verify pins, untrack binaries, amend roadmap §1.7/§7.2 wording about `example_ready_dataset/`)
- `.planning/REQUIREMENTS.md` — FOUND-01..03, DEPL-01, DEPL-03, PROJ-01, PROJ-02
- `.planning/PROJECT.md` — constraints, key decisions
- `.planning/STATE.md` — open blockers (Linux/macOS verification, arm64 image, untracking binaries)

### Prior decisions & architecture
- `docs/phase-0-decisions.md` §1 — version pins (re-verify); §6 — SQLite + Postgres-ready layer, no auth
- `docs/roadmap.md` §4 — target architecture; §5.4 — two images (cpu/gpu); §5.5 — container topology; §5.7 — persistence (overridden by D-13: `./data` bind mount); §11 — frontend stack; §12–13 — storage/DB
- `docs/roadmap.md` §1.7, §7.2 — must be amended in this phase (Phase 0 follow-up #4)
- `.planning/research/webapp-platform/DOCKER-GPU-ARCHITECTURE.md` — Docker/GPU image details
- `.planning/research/webapp-platform/BACKEND-ARCHITECTURE.md` — FastAPI/SQLAlchemy/Alembic/SQLite WAL
- `.planning/research/webapp-platform/FRONTEND-ANNOTATION-UI.md` — React/Vite SPA stack

### Existing code maps
- `.planning/codebase/STACK.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STRUCTURE.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parse_device()`, `auto_batch()`, `quality_assessment()` are duplicated in `train_yolo.py` and `finetune_yolo.py`. They become the shared, unit-tested module (FOUND-02). `auto_batch` exists only in `train_yolo.py`.
- `spikes/train_worker_spike.py` and `spikes/subprocess_kill_spike.py` are reference patterns for the future worker, not needed for Phase 1 beyond the worker image and heartbeat.

### Established Patterns
- The legacy scripts use a Rich console, `configparser` INI, and Russian section comments. Keep their behavior identical after refactoring the imports.
- `.gitignore` already ignores `*.pt`, `runs/`, and `trained_models/`, but those files are still tracked (committed before the ignore rules). Untrack them per D-25.

### Integration Points
- The root scripts must import the shared module from `backend/` without breaking `python train_yolo.py` from the repo root. The planner decides the mechanism (installed editable package via uv, or a path setup).
- The worker image needs the same shared module and the ultralytics/torch pins.

</code_context>

<specifics>
## Specific Ideas

- The UX model is Roboflow: card grid of projects, a sidebar inside a project.
- The project card mock is name + `[detect]`/`[segment]` badge + "2 days ago", plus a dashed "+ New project" card.
- The inside-project mock: left sidebar with "← Projects", "▸ Overview", "Settings"; the main area shows name + badge, description, created date, and an empty-state hint.

</specifics>

<deferred>
## Deferred Ideas

- Prebuilt multi-arch images on GHCR with CI publishing (amd64 + arm64). Possible later, not v1.
- Light theme / theme toggle.
- Project search/filter on the list page (worth adding once there are dozens of projects).
- Trash / soft delete for projects.
- Playwright browser E2E tests.

</deferred>

---

*Phase: 01-runnable-skeleton-projects*
*Context gathered: 2026-09-24*
