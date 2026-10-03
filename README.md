# YOLO Trainer Platform

[Русская версия](README.ru.md)

## What it is

YOLO Trainer Platform is a self-hosted, Dockerized web service for annotating image datasets and training [Ultralytics YOLO](https://docs.ultralytics.com/) models on them — a local replacement for a Roboflow-style annotation + training workflow. Phase 1 (this release) delivers the runnable skeleton: a browser UI backed by a FastAPI service, a worker container, and persistent project management (create, list, rename, delete `detect`/`segment` projects). Image upload, annotation, and training are built in later phases — see [`.planning/ROADMAP.md`](.planning/ROADMAP.md) for the full plan.

## Security notice — read before you run this

**This service has no authentication in v1.** Anyone who can reach its address on the network has full, unrestricted access — no login, no API keys.

- By default the service only listens on `127.0.0.1` (this computer only). This is safe.
- Setting `BIND_ADDR=0.0.0.0` (or any non-loopback address) in `.env` exposes it to **everyone on your local network**. Only do this if you understand and accept that risk, and add your LAN address/hostname to `ALLOWED_HOSTS` (see [Configuration](#configuration)) or requests will be rejected.
- `.pt` model files are Python pickle files and **can execute arbitrary code when loaded**. Only load `.pt` files from sources you trust.

## Quick start with Docker

Prerequisites:
- **Windows/macOS:** Docker Desktop
- **Linux:** Docker Engine + Compose v2
- A CPU-only machine is enough — no GPU required.

Steps:
```bash
# optional: copy the example env file and adjust it
cp .env.example .env

docker compose up --build
```
The first build downloads the PyTorch CPU wheel and Ultralytics, which takes several minutes. Once it's up, open **http://127.0.0.1:8080**.

Stop the stack with:
```bash
docker compose down
```
Update to a newer version with:
```bash
git pull
docker compose up --build
```
Images are built locally from source — there is no registry or prebuilt image in v1.

## Your data

Everything the app stores (the SQLite database today; images, models, and training runs in later phases) lives in `./data` next to `docker-compose.yml`, or in the directory named by `DATA_DIR` in `.env`. This folder:
- **Survives** `docker compose down` / `up` and image rebuilds.
- Has database migrations applied automatically on every `api` container start.
- Can be **backed up** by stopping the stack (`docker compose down`) and copying the folder.
- On Linux, files inside it are owned by `root`, because the containers run as root.
- Holds uploaded images in `data/projects/<project id>/images/`, with thumbnails in `data/projects/<project id>/thumbs/`. Originals are stored exactly as uploaded.
- Has **no disk quota**: uploading many large images can fill the disk, so keep an eye on free space.

## Configuration

All variables are read from a `.env` file in the repo root (see `.env.example`). None are required — every one has a safe default.

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `./data` | Host directory bind-mounted into the containers for all application data. |
| `BIND_ADDR` | `127.0.0.1` | Network interface the `web` service publishes its port on. `0.0.0.0` exposes it to your whole LAN — see the security notice above. |
| `PORT` | `8080` | Host port the app is reachable on. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated list of Host headers the API accepts (or `*` for any). Add your LAN address/hostname here if you set `BIND_ADDR=0.0.0.0`. |
| `SQLITE_JOURNAL_MODE` | `WAL` | SQLite journal mode. See [Troubleshooting](#troubleshooting) for when to change this to `DELETE`. |
| `MAX_UPLOAD_MB` | `50` | Maximum size of one uploaded image, in MB. Applies to the image upload route only; every other API route keeps a 1 MiB request limit. |

## Developer setup

This is for running the backend and frontend natively (not in Docker) to develop or run the test suite.

1. **Install [uv](https://docs.astral.sh/uv/getting-started/installation/)** (the Python package/project manager):
   - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
   - macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`

   Your system `python` may be a different version (for example Python 3.14) — that's fine. `uv` reads `.python-version` (pinned to `3.12` in this repo) and installs/uses that exact Python version automatically. **Always run Python commands through `uv run`**, not the bare `python` on your `PATH`.

2. **Install backend dependencies** (from the repo root):
   ```bash
   uv sync --locked
   ```
   This installs the FastAPI service, PyTorch 2.14.0 (CPU) and Ultralytics 8.4.159 for the worker, and the dev tools (pytest, ruff).

3. **Install Node.js 24 LTS + npm** (if not already installed), then install frontend dependencies:
   ```bash
   npm --prefix frontend ci
   ```

## Running natively

Two terminals, both from the repo root:

**Terminal 1 — backend:**
```bash
uv run uvicorn yolo_trainer_api.main:app --reload --port 8000
```
Data is written to `./data` (or `DATA_DIR`), same as the Docker path.

**Terminal 2 — frontend:**
```bash
npm --prefix frontend run dev
```
Open **http://localhost:5173** — Vite's dev server proxies `/api` requests to the backend on port 8000.

## Tests and checks

Run everything in one command:
```bash
bash scripts/run_full_suite.sh
```

Rehearse the developer setup steps above in a throwaway clone of the current commit:
```bash
bash scripts/fresh_clone_check.sh
```

Individual checks:
```bash
uv run pytest backend/tests                    # backend unit/API tests
uv run ruff check backend                       # backend lint
uv run ruff format --check backend              # backend format check
npm --prefix frontend run test -- --run         # frontend unit tests
npm --prefix frontend run build                 # frontend type-check + production build
bash scripts/compose_smoke_test.sh              # full Docker stack end-to-end check (its own data dir, port 18080)
uv run python scripts/check_cli_run_git_clean.py  # legacy CLI training leaves git status clean (needs example_ready_dataset/ images locally)
```

## Legacy CLI scripts

The original command-line training scripts still work, unchanged in behavior, from the repo root:
```bash
uv run python train_yolo.py
uv run python finetune_yolo.py
```
Both are configured by `config/config.ini` and write their output under `runs/` (both git-ignored). Their shared helper functions (device selection, quality assessment) now live in `backend/src/yolo_trainer_common` and are imported by both scripts.

Known limitations:
- `gpu_test.py` requires an NVIDIA GPU and will fail on CPU-only machines. It will be replaced by an in-app diagnostics page in a later phase (Phase 12).
- `train_yolo.py` reads its config from `Config/Config.ini` (capital `C`), which only resolves on case-insensitive filesystems (Windows, and default macOS). On case-sensitive filesystems (most Linux setups) this path will not be found — use `config/config.ini` if you hit this.

## Troubleshooting

**SQLite error: "database disk image is malformed"** — This is a known Docker Desktop (Windows/macOS) risk: SQLite's WAL mode relies on shared-memory coherency that Docker Desktop's cross-VM bind-mount bridge does not fully guarantee under write pressure. Native Linux Docker hosts are not affected (a bind mount there is a real host filesystem, no VM boundary).
1. Stop the stack: `docker compose down`
2. If needed, restore `./data` from a backup
3. Add `SQLITE_JOURNAL_MODE=DELETE` to `.env` (trades some concurrent-read throughput for removing the cross-VM WAL coherency dependency)
4. Restart: `docker compose up`

**Port 8080 already in use** — Set a different `PORT` in `.env` and restart.

**"Invalid host header" (HTTP 400)** — Add the host/IP you're connecting from to `ALLOWED_HOSTS` in `.env`.

## Repository layout

```
backend/     FastAPI app, worker entrypoint, shared helper module, tests, pyproject.toml
frontend/    React + Vite + Mantine single-page app
docker/      Dockerfiles and nginx config
scripts/     Smoke-test, full-suite, and fresh-clone check scripts
config/      config.ini for the legacy CLI scripts
docs/        Background/reference documentation
.planning/   Project planning artifacts (roadmap, requirements, phase plans)
train_yolo.py, finetune_yolo.py, gpu_test.py   Legacy CLI scripts (see above)
```
