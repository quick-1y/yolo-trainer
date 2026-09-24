# Phase 1: Runnable Skeleton & Projects - Pattern Map

**Mapped:** 2026-09-24
**Files analyzed:** 34
**Analogs found:** 5 / 34 (in-repo); remaining 29 fall back to RESEARCH.md Architecture Patterns / Code Examples (no in-repo analog — this is a near-greenfield phase)

## Context

This repo currently has no backend framework, no frontend, and no Docker setup — only root CLI scripts (`train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`, `config/config.ini`) and `spikes/*.py`. Almost all new files in Phase 1 (FastAPI app, SQLAlchemy models, React components, Dockerfiles) have **no existing analog in this codebase**. For those, RESEARCH.md's `## Architecture Patterns` and `## Code Examples` sections (already vetted against CONTEXT.md decisions) are the authoritative pattern source — cite them directly in PLAN.md rather than inventing new conventions.

The only real in-repo analogs are: the two CLI scripts (source for the shared `device`/`quality` module extraction) and the `spikes/` worker scripts (informational only — not needed until Phase 4, per phase scope).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/yolo_trainer_common/device.py` | utility | transform | `train_yolo.py` L20-27 (`parse_device`) | exact (extraction) |
| `backend/src/yolo_trainer_common/quality.py` | utility | transform | `train_yolo.py` L33-41 / `finetune_yolo.py` L29-37 (`quality_assessment`) | exact (extraction, duplicated in both files) |
| `backend/tests/test_device.py` | test | transform | none in-repo (no tests exist anywhere in this repo today) | none — use RESEARCH.md pytest conventions |
| `backend/tests/test_quality.py` | test | transform | none in-repo | none |
| `train_yolo.py` (modified: import lines only) | script/entrypoint | batch | itself (pre-refactor) | exact — behavior must stay identical per D-24 |
| `finetune_yolo.py` (modified: import lines only) | script/entrypoint | batch | itself (pre-refactor) | exact — behavior must stay identical per D-24 |
| `backend/src/yolo_trainer_api/main.py` | controller (app factory) | request-response | none in-repo | none — RESEARCH.md Pattern 6 / Code Examples |
| `backend/src/yolo_trainer_api/db.py` | config/service | CRUD | none in-repo | none — RESEARCH.md Pattern 3 |
| `backend/src/yolo_trainer_api/models.py` | model | CRUD | none in-repo | none — RESEARCH.md Pattern 2 |
| `backend/src/yolo_trainer_api/schemas.py` | model (DTO) | request-response | none in-repo | none — standard Pydantic, no local convention to match |
| `backend/src/yolo_trainer_api/routers/projects.py` | controller/route | CRUD | none in-repo | none — RESEARCH.md Pattern 2 |
| `backend/alembic/env.py` + `versions/*` | migration | batch | none in-repo | none — standard Alembic scaffold |
| `backend/worker/main.py` | service (long-running) | event-driven | `spikes/train_worker_spike.py`, `spikes/subprocess_kill_spike.py` | partial (informational; heartbeat loop is simpler than spike's job-runner) |
| `docker/Dockerfile.backend` | config | batch | none in-repo | none — RESEARCH.md multi-stage Dockerfile example |
| `docker/Dockerfile.frontend` | config | batch | none in-repo | none — RESEARCH.md pattern (node build → nginx) |
| `docker/nginx.conf` | config | streaming (SSE-ready) | none in-repo | none — RESEARCH.md Pattern 5 |
| `docker-compose.yml` / `docker-compose.gpu.yml` | config | batch | none in-repo | none — RESEARCH.md Code Examples |
| `frontend/src/routes/ProjectsPage.tsx` | component | request-response | none in-repo (no frontend exists) | none — RESEARCH.md structure + D-06 |
| `frontend/src/routes/ProjectDetailPage.tsx` | component | request-response | none in-repo | none — D-11 |
| `frontend/src/api/projects.ts` | hook (TanStack Query) | request-response | none in-repo | none — RESEARCH.md Standard Stack |
| `frontend/src/i18n/*` | provider | transform | none in-repo | none — D-01/D-02 |
| `scripts/compose_smoke_test.sh` | test (smoke) | batch | none in-repo | none — RESEARCH.md Validation Architecture |

## Pattern Assignments

### `backend/src/yolo_trainer_common/device.py` (utility, transform)

**Analog:** `train_yolo.py` (L20-27) and `finetune_yolo.py` (L21-27) — identical duplicated function in both files.

**Current implementation to extract verbatim (per RESEARCH.md "State of the Art" — `parse_device`/`quality_assessment` are sound, carry forward as-is; do NOT carry forward `auto_batch`'s hardcoded-VRAM heuristic, which is flagged as a known defect and out of Phase 1 scope):**
```python
def parse_device(device_str):
    device_str = device_str.strip()
    if device_str.lower() == "cpu":
        return "cpu"
    if "," in device_str:
        return [int(d) for d in device_str.split(",")]
    return int(device_str)
```

**Known bug to fix during extraction** (RESEARCH.md Anti-Patterns): `gpu_test.py` L2-3 and both scripts' `torch.cuda.get_device_name(0)` calls crash with no GPU present. The shared module's device-detection helper should guard this (e.g. check `torch.cuda.is_available()` before calling `get_device_name`), even though `gpu_test.py`'s own UI isn't rebuilt until Phase 12.

**Do not migrate:** `auto_batch(imgsz, gpu_vram=12)` (`train_yolo.py` L28-31) — hardcodes 12GB VRAM, already flagged `Replace` in `docs/roadmap.md` §3. Leave it out of `yolo_trainer_common` for now (RESEARCH.md "State of the Art" table); a later phase redesigns it.

**Import pattern after refactor** (RESEARCH.md Pattern 1) — only the import block of each script changes:
```python
# train_yolo.py / finetune_yolo.py — only this block changes, rest of file identical
from yolo_trainer_common.device import parse_device
from yolo_trainer_common.quality import quality_assessment
# ... unchanged Rich console / configparser code below ...
```

---

### `backend/src/yolo_trainer_common/quality.py` (utility, transform)

**Analog:** `train_yolo.py` L33-41 and `finetune_yolo.py` L29-37 — byte-for-byte identical function, including the Russian-language emoji strings.

**Extract verbatim** (D-24: legacy scripts keep Russian-comment style; the string content itself is Russian user-facing output, not a "comment," so it is NOT translated to English — only import lines change):
```python
def quality_assessment(map50):
    if map50 >= 0.90:
        return "🔥 Отличная модель"
    elif map50 >= 0.75:
        return "👍 Хороший результат"
    elif map50 >= 0.60:
        return "⚠️ Среднее качество (можно улучшить)"
    else:
        return "❌ Требуется дообучение"
```

---

### `train_yolo.py`, `finetune_yolo.py` (script/entrypoint, batch — modified in place)

**Analog:** themselves, pre-refactor (full files read above).

**Constraint (D-24, D-21):** Only the top import block changes (`from yolo_trainer_common.device import parse_device` / `from yolo_trainer_common.quality import quality_assessment` replace the local `def parse_device` / `def quality_assessment` definitions). Everything else — Rich console usage (`console.print(Panel(...))`, `Table`, `box.ROUNDED`), `configparser.ConfigParser()` read pattern, Russian section-divider comments (`# ======`), `if __name__ == "__main__":` entry block reading `conf["Train"]` / `conf["Finetune"]` — stays byte-identical. Both scripts must still run as `python train_yolo.py` / `python finetune_yolo.py` from the repo root (FOUND-02), which is why the uv workspace root `pyproject.toml` (RESEARCH.md Code Examples, "uv workspace root pyproject.toml") is required — it installs `yolo_trainer_common` into the same venv these scripts run in, with no `sys.path` hacks.

**Note:** `train_yolo.py` currently reads `"Config/Config.ini"` (capitalized, L147) while `finetune_yolo.py` reads `"config/config.ini"` (lowercase, L161) — on case-sensitive filesystems (Linux CI, Docker Linux containers) `train_yolo.py`'s path is already broken. Flag this inconsistency for the planner; fixing it is a one-line change consistent with "only imports change" being the D-24 spirit (this is a pre-existing path bug, not new functionality) — planner's call whether it's in-scope for this phase's FOUND-01 "fresh clone works" acceptance criterion.

---

### `backend/worker/main.py` (service, event-driven)

**Analog:** `spikes/train_worker_spike.py`, `spikes/subprocess_kill_spike.py` (informational reference only per phase scope note — read them if implementing the heartbeat loop for subprocess-management conventions, but Phase 1's worker does no real job work).

**Use instead:** RESEARCH.md "Code Examples → Worker heartbeat" — a minimal `while True` loop writing a JSON heartbeat file under `DATA_DIR`, decoupled from any DB schema (Phase 4 will redesign real job tracking):
```python
HEARTBEAT_PATH = Path(os.environ.get("DATA_DIR", "/data")) / "worker" / "heartbeat.json"

def main() -> None:
    HEARTBEAT_PATH.parent.mkdir(parents=True, exist_ok=True)
    while True:
        HEARTBEAT_PATH.write_text(json.dumps({
            "pid": os.getpid(),
            "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        }))
        time.sleep(10)
```

---

### FastAPI backend files — no in-repo analog

`backend/src/yolo_trainer_api/{main,db,models,schemas,routers/projects}.py`, `backend/alembic/{env.py,versions/}` have **no existing analog anywhere in this codebase** — there is no prior FastAPI, SQLAlchemy, or Alembic code. Use RESEARCH.md directly as the pattern source:

- **App factory + Alembic-on-startup** — RESEARCH.md "Pattern 6" / "Code Examples → FastAPI + Alembic startup migration" (lifespan context manager calling `command.upgrade(cfg, "head")`)
- **Project model + case-insensitive uniqueness** — RESEARCH.md "Pattern 2" (`normalized_name` column, `before_insert`/`before_update` event listener, `IntegrityError` → HTTP 409 translation in the router)
- **SQLite WAL pragma tuning** — RESEARCH.md "Pattern 3" (`event.listens_for(engine.sync_engine, "connect")` setting `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=30000`)
- **Validation** — Pydantic schemas per RESEARCH.md Security Domain V5 row: `task_type` enum constrained to `detect`/`segment`, `name`/`description` with `max_length`

---

### Frontend files — no in-repo analog

No frontend exists in this repo today. `frontend/src/routes/ProjectsPage.tsx` (card grid, D-06), `ProjectDetailPage.tsx` (sidebar shell, D-11), `frontend/src/api/projects.ts` (TanStack Query hooks), `frontend/src/i18n/*` (react-i18next + language-detector, D-01/D-02) all follow RESEARCH.md's "Recommended Project Structure" and "Standard Stack (frontend)" table directly — there is no legacy pattern to reconcile against. Mantine v9 dark theme only (D-04), no light-theme toggle code path should exist at all.

---

### Docker/Compose files — no in-repo analog

`docker/Dockerfile.backend` (multi-stage `api`/`worker` targets), `docker/Dockerfile.frontend`, `docker/nginx.conf` (SSE-ready `proxy_buffering off`), `docker-compose.yml`, `docker-compose.gpu.yml` — none exist in this repo (`docs/roadmap.md §1.11`: "No Docker files exist"). Use RESEARCH.md "Code Examples" verbatim as starting points:
- Multi-stage Dockerfile skeleton (base → api/worker targets, `uv sync --no-group worker` vs `--group worker`)
- `docker-compose.yml` services excerpt (`api`, `worker`, `web`, bind-mounted `${DATA_DIR:-./data}:/data`, `${BIND_ADDR:-127.0.0.1}:${PORT:-8080}:80`)
- `docker/nginx.conf` (RESEARCH.md Pattern 5: `proxy_buffering off`, SPA fallback `try_files $uri /index.html`)

---

## Shared Patterns

### Config source of truth (env vars)
**Source:** RESEARCH.md "Don't Hand-Roll" table — `pydantic-settings BaseSettings`
**Apply to:** `backend/src/yolo_trainer_api/main.py`, `db.py`, `worker/main.py` — all `DATA_DIR`/`BIND_ADDR` reads go through one typed settings class, not scattered `os.environ.get()` calls (the legacy scripts' `configparser` pattern is NOT the model here — that pattern is explicitly kept isolated to the two root CLI scripts per D-21/D-24, not extended into the new backend).

### Error handling / uniqueness (409)
**Source:** RESEARCH.md Pattern 2
**Apply to:** `routers/projects.py` create and rename endpoints — catch `IntegrityError`, roll back, raise `HTTPException(409, "A project named '...' already exists.")`. Plain English text per D-05 (no error codes for the frontend to translate).

### SQLite WAL pragmas
**Source:** RESEARCH.md Pattern 3
**Apply to:** `db.py`'s async engine construction — single connect-event listener, not per-session pragma calls.

### i18n — no hardcoded strings
**Source:** D-01, D-02; RESEARCH.md Standard Stack (frontend)
**Apply to:** every `frontend/src/**/*.tsx` component — all user-facing text goes through `react-i18next` `t()` calls backed by `en.json`/`ru.json`, browser-language auto-detect via `i18next-browser-languagedetector`.

### Rich console + configparser (legacy scripts only — NOT a pattern to extend)
**Source:** `train_yolo.py`, `finetune_yolo.py` (full files, existing)
**Apply to:** Nothing new. This pattern is explicitly frozen/legacy per D-24 — new backend code does not use Rich console or configparser; it uses FastAPI logging and pydantic-settings instead. Listed here only so the planner doesn't accidentally propagate it.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/src/yolo_trainer_api/*.py` (all) | controller/model/config | CRUD, request-response | No FastAPI/SQLAlchemy code exists anywhere in this repo — first backend framework code in the project. Use RESEARCH.md Patterns 1-6 and Code Examples directly. |
| `backend/alembic/env.py`, `versions/*` | migration | batch | No migrations exist (first schema, from scratch per RESEARCH.md "Runtime State Inventory": "no application database exists yet"). Use standard Alembic async scaffold. |
| `frontend/**/*` (all) | component/hook/provider | request-response | No frontend exists in this repo at all. Use RESEARCH.md "Recommended Project Structure" and "Standard Stack (frontend)" tables. |
| `docker/**/*`, `docker-compose*.yml` | config | batch | "No Docker files exist" per `docs/roadmap.md §1.11`, confirmed in RESEARCH.md Runtime State Inventory. Use RESEARCH.md Code Examples verbatim as the starting skeleton. |
| `backend/tests/*.py`, frontend Vitest setup, `scripts/compose_smoke_test.sh` | test | batch | No test files or test framework config exist anywhere in this repo today (RESEARCH.md Validation Architecture: all rows show "❌ Wave 0"). Use RESEARCH.md's Test Framework / Wave 0 Gaps tables. |

## Metadata

**Analog search scope:** repo root (`*.py`, `config/config.ini`, `.gitignore`), `spikes/` directory, full `.planning/` tree for CONTEXT.md/RESEARCH.md. No `backend/`, `frontend/`, or `docker/` directories exist yet to search.
**Files scanned:** `train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`, `config/config.ini`, `.gitignore`, `spikes/` listing, `01-CONTEXT.md`, `01-RESEARCH.md`
**Pattern extraction date:** 2026-09-24
