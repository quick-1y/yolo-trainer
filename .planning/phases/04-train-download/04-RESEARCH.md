# Phase 4: Train & Download - Research

**Researched:** 2026-10-04
**Domain:** DB-queued background training (worker service + `Popen` subprocess + Ultralytics callbacks -> JSONL), per-image split management, materialized per-run YOLO dataset snapshot (hard links), model registration and `.pt` download, FastAPI/SQLAlchemy/Alembic + React/Mantine integration
**Confidence:** HIGH for the training mechanics, dataset snapshot, SQLite multi-container behavior and Ultralytics internals (all executed or read from the installed 8.4.159 source this session). MEDIUM for the frontend integration (read from code, not prototyped) and for anything that depends on hosts other than the Windows 11 + Docker Desktop (WSL2) dev machine (Linux native, macOS).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Carried forward from earlier phases (still binding)
- Mantine, dark theme only, i18n en/ru with no hardcoded strings (P1 D-01..D-04). API errors are plain English (P1 D-05).
- The sidebar shell gets a **Training** entry now that it exists (P1 D-11: no placeholders). No "Models" entry yet (see D-17).
- All data lives in the bind-mounted `./data` (P1 D-13). The api image stays torch-free, and the worker image carries torch and ultralytics (P1 D-17). The GPU override comes later (P1 D-18).
- Hard delete, no trash (P1 D-10). Deleting a project removes `data/projects/<id>/` (P2 D-19).
- Class index = position, computed at export/training time. Annotations reference the class id (P2 D-13).
- Box coordinates are normalized to the EXIF-oriented image, matching Ultralytics (P2 D-17).
- Unannotated and background are distinct. Background exports as an empty label file. An unannotated image must never become an empty-label negative example (P3 D-13/D-14, ANNO-10).
- Segment projects may contain boxes. Training/export converts boxes to 4-point polygons for `segment` projects (P3 D-18, `docs/roadmap.md` §7.4).
- Job model: subprocess + DB tracking + Ultralytics callbacks → JSONL. No Redis or Celery. One training job at a time. A startup reconciliation sweep runs (`docs/roadmap.md` §5.5, §5.6, §9.1).
- Detect metrics are recorded under the exact keys from `docs/phase-0-decisions.md` §2 (`metrics/precision(B)`, `metrics/recall(B)`, `metrics/mAP50(B)`, `metrics/mAP50-95(B)`, `val/*_loss`).

### Splits (DATA-05)
- **D-01:** Each image has a split: `train` | `valid` | `test` | **unassigned**. Newly uploaded images are **unassigned** and are not used for training until assigned. — **Reversibility:** costly — new `images` column via Alembic migration; split values become part of the snapshot manifest and later import/export (Phase 9) contracts.
- **D-02:** Manual assignment happens in two places. (a) In the **Images grid**, a multi-selection gets a "Split → train / valid / test / unassigned" action in the existing `SelectionBar`, and each tile shows a split chip. (b) The **editor top bar** gets a split selector for the current image. Changing the split is not an annotation change. It must not bump `annotation_version` or demote a reviewed image.
- **D-03:** **Auto-split** applies only to **unassigned** images and never touches manual assignments. It covers **all unassigned images, including unannotated ones**, so a split is fixed up front and an image annotated later stays where it was. Default ratios are **80/10/10**, editable, and test may be 0%. Nothing changes until the user confirms a dialog that shows the resulting counts ("train N, valid M, test K"). The roadmap §6.4 rule holds: no invisible default split.
- **D-04:** At training time, only **annotated images (≥1 box) and background images** in train/valid/test enter the dataset. **Unannotated images with a split are excluded**, and the start form warns: "N unannotated images will not be used." Unassigned images are never used.
- **D-05:** A run **cannot start while train or valid is empty** after exclusions. The start button is disabled and the form explains why (success criterion 1). An empty test split is allowed.

### Training start form (TRAN-01, MODL-01)
- **D-06:** The **Training** section lists the project's runs and has a "New training" button. The button opens a **dedicated route** (e.g. `/projects/:id/training/new`), not a modal. Phase 11 adds an Advanced section to the same page. The form shows a **dataset summary** next to the fields: usable images per split, excluded unannotated count, and class count.
- **D-07:** Official base models are a **static list of YOLO26 and YOLO11, sizes n/s/m/l/x**. `segment` projects automatically get the `-seg` variants. The default is **yolo26n** (or `yolo26n-seg`). Weights download automatically on first use and are cached under `DATA_DIR` so they survive restarts. Model names and download sources must be re-verified against Ultralytics 8.4.159 at research time.
- **D-08:** Models **previously trained in this service** can be used as a base from **any project with the same task type**. Models of another task type never appear in the picker (MODL-05 protection is in place for this path now). If the base model's class names differ from the project's classes, the form shows a non-blocking note that the head will be re-initialized for the new classes.
- **D-09:** Defaults follow **standard Ultralytics**: epochs 100, imgsz 640, batch **auto** (AutoBatch `-1` on GPU, a fixed fallback such as 16 on CPU), device **auto** (GPU if available, else CPU). All four can be edited. On a CPU-only host the device control offers only CPU, or shows GPU disabled with a reason.
- **D-10:** Each run gets an **auto-generated, editable name** that is unique within the project and pre-filled as `run-<n>`. The run name is also the registered model's display name.

### Queue, status & restart (TRAN-04)
- **D-11:** Only **one training job runs per installation**. Starting another run while one is active **enqueues** it (`queued`, FIFO, across all projects), and it starts automatically when the worker frees up. The run page shows "queued, position N". A queued run can be **removed from the queue**. Cancelling a running job stays in Phase 5 (TRAN-06).
- **D-12:** The Phase 4 run page shows: status, **epoch X of Y** with a progress bar, elapsed time, and the latest mAP50, updated by **polling** every few seconds. After completion it shows final P/R/mAP50/mAP50-95, the quality verdict from `yolo_trainer_common.quality`, the settings used, and **Download .pt**. The extra post-training `on_fit_epoch_end` event (Phase 0 §2) must not show as "epoch Y+1 of Y". Phase 5 adds SSE charts to this same page.
- **D-13:** Restart behavior: when the backend or worker restarts, a `running` run becomes **`interrupted`** (resume comes in Phase 5). **`queued` runs stay queued** and the next one starts automatically once the worker is back. Closing the browser never affects a run. Reopening shows its current status.
- **D-14:** A **global indicator in the app header** shows the active training ("Training: <project> / <run>, epoch 12/100") with a link to the run page. It is visible on every page, including the full-screen editor.
- **D-15:** On failure, the run shows **`failed`, the exception message, and the last ~50 lines of the worker/training log** in a collapsible block. Human-friendly explanations (OOM, invalid dataset) are Phase 5 (TRAN-11).
- Minimal run list for the Training section: name, status, base model, created time, final mAP50, and a download icon. Full history with duration and settings columns is Phase 5 (TRAN-08).

### Models, download & snapshot (MODL-03, MODL-04, TRAN-03)
- **D-16:** When a run completes, **`best.pt` is registered as the run's model**. The model record holds its metrics, class names (in index order), task type, base model, and source run. `last.pt` stays in the run folder for Phase 5 resume and is **not** registered as a model. — **Reversibility:** costly — the model table and its relation to runs are what Phase 7 (library), Phase 8 (AI assist picker), and further fine-tuning build on.
- **D-17:** Models can be downloaded from the **run page and the run list**. A registered model also appears in the **base-model picker** (D-08). There is **no separate Models page** in this phase. It arrives in Phase 7.
- **D-18:** The downloaded file is named **`<project>_<run>_best.pt`**, sanitized to safe filename characters (e.g. `plates_run-3_best.pt`). The file must load and predict via `YOLO(path)` in a plain Python script (success criterion 4). Its embedded `names` must match the project's classes at snapshot time.
- **D-19:** The snapshot is a **materialized YOLO dataset folder per run** (e.g. `data/runs/<run_id>/dataset/`). It contains `{train,valid,test}/images` + `labels`, `data.yaml`, and a `manifest.json` (image ids, sha256, original filenames, split, class list with indices, and the resolved settings). Images are **hard-linked** from project storage, with a **copy fallback** when hard-linking fails (e.g. a cross-device or Docker Desktop bind-mount limitation). The folder **is kept after training**, so the run stays reproducible even if images are later deleted from the project. Settings are also stored on the run row. — **Reversibility:** costly — folder layout and manifest schema become the reproducibility contract that resume (Phase 5) and evaluation (Phase 11) read.
- **D-20:** The snapshot is taken **when the user clicks Start**, not when the worker picks the run up. A queued run trains on exactly what the form showed. Later annotation edits, class changes, or image deletes do not alter it (success criterion 5). Materializing labels and hard links needs no torch, so it can happen on the api side.
- **D-21:** **Deleting a project deletes its runs, run folders, and models.** The delete dialog warns "N runs and M models will be deleted". A **running or queued run blocks project deletion**. Models trained in other projects that used one of these models as a base keep working and keep the base model's name as plain text.

### Claude's Discretion
- **The job hand-off between the api and worker containers (STATE.md blocker).** Recommended: the api inserts a `queued` run row (plus the materialized snapshot). The **worker service polls the DB**, claims the oldest queued run atomically, and spawns `train_worker` as a subprocess with `Popen` inside its own container. It tracks the PID and heartbeat, writes progress JSONL, and updates status. The reconciliation sweep (D-13) runs in the worker on start, and the api can also treat a stale worker heartbeat as an interrupt signal. Research must confirm SQLite WAL multi-container write safety on the bind mount (Phase 1 already mitigated this for the api).
- Progress serialization must walk nested dicts and lists recursively (Phase 0 follow-up #5, `trainer.tloss`). Handle the extra final `on_fit_epoch_end` event explicitly.
- **Disable Ultralytics analytics/sync in the worker** before any real training (STATE.md "Phase 4 follow-up").
- The exact `workers` value (derived from CPU count, `docs/roadmap.md` §9.4), the CPU batch fallback, the polling interval, the log-tail size, and the auto-name format.
- The auto-split algorithm: random with a stored seed, optionally stratified by class. Keep it simple and deterministic per confirmation.
- The API route shapes for splits, runs, queue removal, models and download. The run status enum, which must cover at least `queued | running | completed | failed | interrupted` and leave room for Phase 5's `cancelled`.
- How the base-model weight cache is laid out under `DATA_DIR`, and how a download failure (offline host) is reported. It should at least fail the run with a clear message.

### Deferred Ideas (OUT OF SCOPE)
- Separate **Models** page/section in the sidebar → Phase 7 (model library).
- "Pre-fill the form from the last run's settings" was considered and not chosen as the default. It could return as a "Duplicate run" action with Phase 5 history or Phase 11 comparison.
- Cancel a running job, resume `interrupted` runs, live SSE charts, human-friendly failure messages → Phase 5.
- YOLOv8 in the official base list was not chosen. Users can bring a v8 `.pt` via upload in Phase 7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-05 | Assign images to train/valid/test manually and run a user-confirmed automatic split by ratio | `images.split` nullable column (Pattern 1), bulk split route that never touches `annotation_version`, deterministic seeded auto-split with preview + confirm + drift guard (Pattern 2), split summary with block reasons |
| MODL-01 | Choose an official Ultralytics pretrained model (detect/segment, multiple sizes); weights download automatically | 20 official names verified in `GITHUB_ASSETS_NAMES`; download to an absolute path verified (Pattern 6); allow-list, never a free path |
| MODL-03 | Trained models registered automatically with metrics, classes, task type, source run | Registration in the worker at run completion in one transaction; metrics come from the final-validation event (best.pt); `models` table (Pattern 7) |
| MODL-04 | Download any registered model's `.pt` | `FileResponse` with sanitized name, id-derived path, plain anchor download (Pattern 8); loading via plain `YOLO(path)` executed |
| TRAN-01 | Start training from the browser: base model, epochs, imgsz, batch, device | Pydantic-validated `RunCreate`, `GET options` endpoint, device options from the worker heartbeat (Pattern 4) |
| TRAN-03 | Each run records a snapshot of dataset and settings | Materialized `data/runs/<id>/dataset` + `manifest.json`, consistent single-transaction capture, hard links (Pattern 3) |
| TRAN-04 | Training runs in the background; survives browser close | Worker polls DB, claims atomically, `Popen` supervisor, reconciliation sweep, SQLite WAL multi-container behavior verified (Patterns 5, 6) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `./.claude/CLAUDE.md` (its Conventions/Architecture blocks describe only the legacy root scripts; new backend code follows English comments, type hints and ruff, as in Phases 1-3):

- **GSD workflow enforcement:** no repo edits outside a GSD command; this phase is executed through `/gsd-execute-phase`.
- **Phase completion:** after the phase is marked complete, commit all remaining `.planning/` changes, make sure the branch is `dev`, `git push origin dev`, and report the pushed commit range. Merging `dev` to `main` only on request.
- **Stack pins:** Python 3.12, Ultralytics 8.4.159, PyTorch 2.14.0; FastAPI + SQLAlchemy/Alembic + SQLite (WAL), Postgres-ready; React + Vite SPA.
- **Deployment:** Docker Compose, separate CPU and GPU images; must run on CPU-only hosts; api image stays torch-free.
- **Job execution:** training/inference as subprocesses tracked in DB, progress via Ultralytics callbacks -> JSONL (-> SSE in Phase 5); no Redis/Celery.
- **Data model:** one task type per project; classes and tags are distinct.
- **Hardware:** no NVIDIA GPU on the dev machine; GPU-path acceptance needs other hardware (Phase 12).
- **Security:** `.pt` files are pickle-based, trusted-user input only (document the risk); mounted/derived paths must be validated.
- **Language:** RESEARCH.md in English; user-facing prose to the orchestrator in Russian.

## Summary

Phase 4 is four coupled slices: (1) a per-image `split` column with bulk/single assignment and a confirmed seeded auto-split; (2) a start-time **snapshot** of the project (a materialized Ultralytics dataset folder with hard-linked images, generated labels, `data.yaml` and `manifest.json`); (3) a **job pipeline**: the api inserts a run, the existing worker service polls the SQLite DB, claims the oldest queued run with one atomic statement, and supervises a `python -m yolo_trainer_worker.train_job` subprocess that writes progress JSONL through Ultralytics callbacks; (4) **registration and download** of `best.pt`.

Everything risky was executed this session on the pinned stack (Ultralytics 8.4.159, torch 2.14.0+cpu, Python 3.12.10, Docker Desktop 29.7.2 on WSL2): two containers writing the same WAL SQLite file on the bind mount (about 2,900 inserts in 20 s, zero errors, `integrity_check` ok); hard links on the bind mount work; real 2- and 3-epoch CPU trainings of `yolo26n` (detect) and `yolo26n-seg` (segment from box-derived 4-point polygons) on a relocatable `data.yaml` without a `path:` key; callbacks to JSONL with recursive serialization; plain `YOLO(best.pt)` load and `predict` in a separate process. Findings that change the plan: **YOLO26 has no `val/dfl_loss`** (it logs `val/l1_loss`, and segment adds `val/seg_loss` and `val/sem_loss`), so the "exact detect keys" rule must be implemented as "store the metrics dict as-is and read the four `metrics/*` keys"; the extra post-training `on_fit_epoch_end` carries **only** the `metrics/*` keys of `best.pt` and is the right source for the registered metrics; a **segment** dataset with box rows hard-fails in Ultralytics, so labels must be polygons for segment projects; bind-mount file operations on Docker Desktop cost about 6 ms per file (3,000 hard links took 17 s), so snapshot materialization must be a background step with a `preparing` status, not a blocking request.

**Primary recommendation:** Use the worker-polls-DB design. Add migration `0005` (`images.split`, `training_runs`, `models`), snapshot in a short write transaction that starts with the run `INSERT` (consistent read), materialize files in a thread pool after the response, flip `preparing -> queued`, claim with a single `UPDATE ... RETURNING`, supervise a subprocess that never touches the DB, tail its JSONL into DB columns, and register `best.pt` from the final-validation metrics in one transaction.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Split assignment, auto-split preview/confirm | API / Backend | Browser | Server owns the data and the deterministic algorithm; the browser shows counts and confirms |
| Dataset summary + block reasons (train/valid empty, unannotated excluded) | API / Backend | Database | One consistent SQL read; the browser only renders reasons |
| Snapshot capture (rows -> in-memory manifest) | API / Backend | Database | Needs one write transaction for a consistent read (Pattern 3) |
| Snapshot materialization (hard links, label files, `data.yaml`, `manifest.json`) | API / Backend (thread pool) | Filesystem | No torch needed (D-20); runs after the HTTP response |
| Run queue (FIFO, one active job) | Worker | Database | Worker claims atomically; DB is the queue (no Redis) |
| Training execution, callbacks -> JSONL | Worker subprocess (`train_job`) | Filesystem | Needs torch/ultralytics; must not touch the DB |
| Supervision, progress tail -> DB, reconciliation, registration | Worker (supervisor) | Database | Only process that knows child liveness; single writer for run state |
| Compute device options | API (reads worker heartbeat file) | Worker | API image has no torch; heartbeat already carries `cuda_available`/`device_name` |
| Polling status, header indicator, forms | Browser / Client | API | TanStack Query `refetchInterval` (D-12, D-14) |
| `.pt` download | API / Backend | Filesystem | Id-derived path, sanitized `Content-Disposition`; browser uses a plain anchor |
| Orphan cleanup of `data/runs`, `data/models` | API / Backend (startup) | Filesystem | Extends the Phase 2 reconcile pattern |

## Standard Stack

### Core (no new packages are required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ultralytics | 8.4.159 (installed) | Training, callbacks, weights download | Pinned project-wide [VERIFIED: `.venv` import printed `8.4.159 2.14.0+cpu`] |
| torch / torchvision | 2.14.0+cpu / 0.29.0 | Compute | Pinned in `backend/pyproject.toml:18` `worker = ["torch==2.14.0", "torchvision==0.29.0", "ultralytics==8.4.159"]` |
| FastAPI 0.141.1 / Starlette 1.7.0 | installed | Routes, `FileResponse` | Already the api stack [VERIFIED: executed import] |
| SQLAlchemy 2.0 + Alembic + aiosqlite | existing | ORM, migration `0005`; worker uses the sync engine | Existing stack |
| Mantine 9.6.3 / TanStack Query 5.104 / react-router 7 / i18next | existing | Forms, `Progress`, polling, routes | Existing frontend stack; Mantine already has `Progress`, `NumberInput`, `Select`, `SegmentedControl`, `Collapse`, `Menu` |
| Python stdlib `subprocess`, `os.link`, `json`, `hashlib`, `concurrent.futures`, `random` | 3.12 | Supervisor, snapshot, auto-split | No dependency needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PyYAML | transitive of ultralytics | Test-only: round-trip check of generated `data.yaml` | Tests run in the full uv env where it exists; **do not** import it in api code (api image is torch-free and has no PyYAML) |
| psutil | 7.2.2 transitive | not needed | Avoid: use `start_new_session=True` + `os.killpg` on POSIX |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Worker polls the shared SQLite DB | Worker calls internal HTTP endpoints on the api | Removes the shared-DB question but adds an internal API surface, Host allow-list changes and api-up dependency. Not needed: the shared-DB test passed (Pitfall 7) |
| Snapshot materialized by the worker | Materialize on the api (D-20) | Worker-side would run after pickup and lose the "images deleted after click" protection; keep api-side |
| `shutil.copytree`-style copy | Hard links with copy fallback (D-19) | Copy doubles image storage per run |
| Celery / RQ | DB-backed FIFO | Rejected by project decision |

**Installation:** none. `uv.lock` and `frontend/package-lock.json` stay untouched.

**Version verification:** `uv run python -c "import ultralytics, torch"` -> `8.4.159 2.14.0+cpu` (2026-10-04). Official asset names: all 20 of `yolo26{n,s,m,l,x}{,-seg}.pt` and `yolo11{n,s,m,l,x}{,-seg}.pt` are members of `ultralytics.utils.downloads.GITHUB_ASSETS_NAMES` [VERIFIED: executed membership check -> `20 True`]. An actual download was executed for `yolo26n.pt` only (5,544,453 bytes from `github.com/ultralytics/assets/releases/download/v8.4.0/`) [VERIFIED: executed]; the other 19 names are membership-verified, not download-verified (A4).

## Package Legitimacy Audit

This phase installs **no new external packages** (backend or frontend). `psutil` and `PyYAML` are already present as transitive Ultralytics dependencies [VERIFIED: `importlib.metadata.requires('ultralytics')` -> `pyyaml>=5.3.1`, `psutil>=5.8.0`] and are deliberately not promoted to direct dependencies.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | No install, no checkpoint needed |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 Browser (React)                      api container (torch-free)                         worker container (torch + ultralytics)
 ───────────────                      ──────────────────────────                         ──────────────────────────────────────
 Images grid / editor ──split ops──▶  POST /images/split, /splits/auto(/preview)
                                       UPDATE images.split (no annotation_version bump)
 Training form ─────────GET options─▶ dataset summary + blockers, base models, devices ◀── data/worker/heartbeat.json (cuda_available, device_name)
        │
        └────POST /runs──▶  Tx1 (write lock): INSERT run(status=preparing) → SELECT images/annotations/classes
                             commit → respond 201 (run, status=preparing)
                             background: thread pool → data/runs/<id>/dataset/{train,valid,test}/{images,labels}
                                         (os.link, copy fallback), data.yaml, manifest.json, job.json
                             Tx2: UPDATE status preparing→queued
                                                         ┌────────────── SQLite WAL on bind mount (/data/app.db) ──────────────┐
                                                         │ worker loop (poll 2 s): claim = UPDATE…WHERE id=(oldest queued)       │
                                                         │   AND NOT EXISTS(running) RETURNING id                              │
                                                         └──────────────────────────────────────────────────────────────────────┘
                                                                                                │ Popen([python,-m,train_job,--run-dir], start_new_session, cwd=run dir)
                                                                                                ▼
                                                                                  train_job (subprocess; never opens the DB)
                                                                                   settings.update(sync=False) → resolve base weights
                                                                                   YOLO(...).train(...) + callbacks → progress.jsonl
                                                                                   → result.json | error.json ; stdout/stderr → train.log
                                                                                                │
                                      worker supervisor: tail progress.jsonl → UPDATE run (epoch, epochs, last_map50)
                                      on exit 0: INSERT model + hard-link best.pt → data/models/<id>.pt + UPDATE run completed (1 Tx)
                                      on exit ≠0: UPDATE failed + error_message + log_tail
 Run page ◀──poll 3 s── GET /runs/{id} (DB only)        GET /models/{id}/download (FileResponse)  ──▶ plain anchor in browser
 Header indicator ◀──poll── GET /training/active
```

### Recommended Project Structure

```
backend/src/
├── yolo_trainer_api/
│   ├── models.py                  # + Image.split, TrainingRun, TrainedModel (table "models")
│   ├── migrations/versions/0005_training.py
│   ├── splits.py                  # pure: auto_split(ids, ratios, seed) + SQL helpers
│   ├── training/
│   │   ├── catalog.py             # OFFICIAL_MODELS allow-list, default per task type
│   │   ├── labels.py              # pure: label rows, data.yaml text, manifest dict
│   │   ├── snapshot.py            # capture (Tx1) + materialize (thread pool) + cleanup
│   │   └── service.py             # create_run, remove_queued, active run, project-delete guard
│   ├── routers/{splits.py,runs.py,models.py}
│   └── storage.py                 # + runs_dir/run_dir/models_dir/model_path/weights_dir, remove_run_dir, reconcile of runs/models
├── yolo_trainer_common/
│   ├── quality.py                 # + quality_level(map50) -> "excellent|good|fair|poor"
│   └── progress.py                # pure: jsonable(), event schema, tail parser (shared by worker + tests)
└── yolo_trainer_worker/
    ├── main.py                    # heartbeat thread + supervisor loop (heartbeat gains active_run_id)
    ├── queue.py                   # sync engine, claim_next, reconcile_on_start, finalize_*
    ├── supervisor.py              # Popen, progress tail, stop handling, registration
    └── train_job.py               # subprocess entry: callbacks, weights resolution, model.train
frontend/src/
├── api/{splits.ts,training.ts,models.ts}
├── features/training/{TrainingPage,NewRunPage,RunPage,RunStatusBadge,DatasetSummary,ActiveRunIndicator}.tsx
├── features/images/{SplitMenu,SplitChip,AutoSplitDialog}.tsx   # SelectionBar / ImageTile / toolbar hooks
└── i18n/locales/{en,ru}/training.json (+ additions to images.json, editor.json, project.json)
```

### Pattern 1: `images.split` and bulk assignment (D-01, D-02)

**What:** `images.split VARCHAR(5) NULL` with `CHECK (split IN ('train','valid','test'))`; `NULL` means unassigned. Index `(project_id, split)`. One route covers single and bulk: `POST /api/projects/{pid}/images/split` with `{ids: [1..1000], split: "train"|"valid"|"test"|null}` (mirrors `POST /images/delete`, scoped by `project_id`, `extra="forbid"`, `Depends(require_xhr)`). The statement is `UPDATE images SET split = :s WHERE project_id = :p AND id IN (...)` and **must not** touch `annotation_version`, `is_reviewed` or `is_background` (D-02). `ImageRead` gains `split: Literal["train","valid","test"] | None`.
**Frontend cache rule (Phase 3 lesson):** patch cached image lists with `setQueriesData` for a bulk split; invalidating re-fetches every loaded page. Auto-split touches many rows, so one invalidation there is acceptable.

### Pattern 2: Auto-split (D-03)

**What:** Pure function `auto_split(ids: list[int], train: int, valid: int, test: int, seed: int) -> dict[int, str]`: sort ids ascending, shuffle with `random.Random(seed)`, then allocate `n_test = round(n*test%)`, `n_valid = round(n*valid%)`, rest train; if `valid% > 0` and `n >= 2` force `n_valid >= 1`; if `test% > 0` and `n >= 4` force `n_test >= 1`; train never gets fewer than 1 when `n >= 1`. Ratios are integers summing to 100, `test` may be 0, `train` and `valid` must be > 0.
**Routes:** `POST /splits/auto/preview` `{train,valid,test,seed?}` -> `{seed, unassigned_total, counts}` (server picks the seed if absent and returns it); `POST /splits/auto` `{train,valid,test,seed,expected_unassigned}` recomputes with the same seed over the *current* unassigned set and returns `409` ("The set of unassigned images changed. Review the split again.") when `expected_unassigned` differs. This keeps the confirmation honest without a server-side token. Pool = every image with `split IS NULL`, annotated or not (D-03). Stratification is skipped (Claude's discretion); instead the summary warns about classes with zero instances in train or valid (non-blocking).

### Pattern 3: Snapshot = consistent capture, then background materialization (D-19, D-20)

**Capture (Tx1):** `pysqlite` does not `BEGIN` before a `SELECT`, so consecutive SELECTs can observe different states. Phase 3 solved the same issue by making an `UPDATE` the first statement. Do the same: `INSERT` the run row (`status='preparing'`, `flush()`), then run the three SELECTs (split images with `split IS NOT NULL` and usable; annotations joined to those images ordered by `(image_id, position)`; classes ordered by `position`), then `commit()`. The write lock is held only for these reads (no file I/O inside). Everything needed for files is now in memory.
**Usable images (D-04):** `split IS NOT NULL` and (`is_background` or has >=1 annotation). Unannotated-with-split images are counted as `excluded`. Reuse `annotations.unannotated_clause()` for the SQL form.
**Materialize (after the 201 response):** `asyncio.create_task(asyncio.to_thread(...))` using a `ThreadPoolExecutor(8)`; per image `os.link(project_image_path, run_dir/dataset/<split>/images/<image_id>.<ext>)` with a `shutil.copy2` fallback on `OSError`; per image a label file `<image_id>.txt` (empty for background); then `data.yaml`, `manifest.json`, `job.json` (atomic temp + `os.replace`); then Tx2 `UPDATE training_runs SET status='queued' WHERE id=:id AND status='preparing'`. If a source image vanished meanwhile (`FileNotFoundError`), mark the run `failed` with "An image was deleted while the dataset was being prepared. Start the run again." and remove the folder.
**Why background:** measured on this machine in a `python:3.12-slim` container on the Windows bind mount: 3,000 `os.link` = 17.45 s, 3,000 label writes = 18.45 s, `rmtree` = 7.79 s; with 8 threads 7.15 s and 6.31 s (about 2.5x) [VERIFIED: executed]. Native Linux will be far faster (A9).
**Layout (D-19):** `data/runs/<run_id>/{dataset/,job.json,progress.jsonl,train.log,result.json,error.json,out/train/weights/{best,last}.pt}`. Directory names are canonical decimal ids only.
**Hard-link safety:** project images are written once via `os.replace` into their final id-named path (`storage.commit_files`), never modified in place, so a hard link is an immutable snapshot and survives `unlink` of the project copy. A future phase that edits image bytes in place would break this; it must write a new inode.
**`data.yaml`:** omit `path:` and use relative `train: train/images`, `val: valid/images`, optional `test: test/images`; Ultralytics then roots the dataset at the yaml's parent (`path = Path(extract_dir or data.get("path") or Path(data.get("yaml_file", "")).parent)`, `data/utils.py:621`), so the run folder is relocatable and the same file works in the api and worker containers. Omit the `test:` key when the test split is empty.

### Pattern 4: Run creation contract (TRAN-01, MODL-01, D-07..D-10)

`RunCreate` (`extra="forbid"`): `name: str | None` (default `run-<n>`: smallest `n >= 1` whose normalized name is free in the project), `base: {kind:"official", name: <allow-list literal>} | {kind:"model", model_id:int}` (discriminated union), `epochs: int 1..1000`, `imgsz: int 32..2048 and % 32 == 0`, `batch: int (-1 or 1..512)`, `device: "auto" | "cpu" | "0"`. The server **never accepts a path**: official names are mapped through the static catalog, model ids through the DB (`task_type` must equal the project's, else `422` "This model was trained for a different task type."). `device="0"` requires `cuda_available` in a fresh heartbeat (else `422` "No GPU is available."); `auto` is stored as requested and the worker records the resolved device/batch/workers in `training_runs.resolved`. CPU: send `batch=16` instead of `-1` (Ultralytics would fall back to 16 with a warning anyway, `utils/autobatch.py:82`). `workers`: on CPU Ultralytics forces `0` (`engine/trainer.py:170-171`); on GPU use `min(8, os.cpu_count() or 1)`.
**Recommended routes** (Claude's discretion): `GET /api/projects/{pid}/training/options` (official + eligible trained models with `classes_match`, devices, defaults, dataset summary, `blockers[]`, `warnings[]`); `POST /api/projects/{pid}/runs`; `GET /api/projects/{pid}/runs`; `GET /api/projects/{pid}/runs/{rid}`; `DELETE /api/projects/{pid}/runs/{rid}` (queued only, 409 otherwise); `GET /api/training/active`; `GET /api/models/{mid}/download`. The status enum (CHECK constraint, including Phase 5's value now because SQLite cannot alter a CHECK without a table rebuild): `preparing | queued | running | completed | failed | interrupted | cancelled`.

### Pattern 5: Worker queue, claim, supervision, reconciliation (TRAN-04, D-11, D-13)

- **Claim** (single statement, executed against SQLite 3.49.1 this session; container sqlite is 3.46.1, both support `RETURNING`): the `UPDATE ... WHERE id = (oldest queued) AND NOT EXISTS (running) RETURNING id` shown under Code Examples returned the oldest id once and `[]` while another run was running [VERIFIED: executed].
- **Process model:** the existing heartbeat loop moves to a background thread; the main thread runs the supervisor loop (poll 2 s). The heartbeat payload gains `active_run_id` (update `test_worker.py`'s exact key-set assertion). The worker uses a **sync** SQLAlchemy engine on `sync_database_url` with the same pragmas (`apply_sqlite_pragmas`, `busy_timeout=30000`); add `db_path`/`sqlite_journal_mode` to `WorkerSettings` rather than importing api `Settings`.
- **Subprocess:** `Popen([sys.executable, "-m", "yolo_trainer_worker.train_job", "--run-dir", str(run_dir), "--data-dir", str(data_dir)], cwd=run_dir, stdout=logfile, stderr=STDOUT, env={..., "PYTHONUNBUFFERED":"1", "PYTHONUTF8":"1", "YOLO_AUTOINSTALL":"false"}, start_new_session=True)` (Windows native dev: `creationflags=CREATE_NEW_PROCESS_GROUP`). `cwd=run_dir` keeps any stray relative download (e.g. the GPU AMP check's `YOLO("yolo26n.pt")`) out of the repo/data root. No shell, argument list only.
- **Supervisor loop (~1 s):** `proc.poll()`; read new complete lines of `progress.jsonl` from a stored offset; on each real epoch `UPDATE training_runs SET epoch, epochs, last_map50, progress_updated_at`; stop if `stop_event` is set (SIGTERM -> terminate the process group, wait ~10 s, kill, mark `interrupted` with "The worker was stopped while this run was in progress"); if the run row vanished, kill the child.
- **Finish:** exit 0 and `result.json` and `weights/best.pt` present -> register (Pattern 7). Otherwise `failed` with `error_message` from `error.json` (written by `train_job` on any exception) or "The training process exited with code N" and `log_tail` = last 50 lines of `train.log` after stripping ANSI/`\r` progress noise.
- **Reconciliation (D-13):** worker start: `running -> interrupted` (its children died with the container; native-dev leftovers: best-effort kill of a recorded live PID); `queued` untouched. Api start: `preparing -> failed` ("Dataset preparation was interrupted"; remove folder) and, only if the heartbeat file is missing or older than 60 s, `running -> interrupted`. An api-only restart with a fresh worker heartbeat therefore does **not** wrongly interrupt a live run.
- **Worker startup order:** the worker may start before the api has migrated; add `depends_on: api: condition: service_healthy` to the worker service and also tolerate `OperationalError: no such table` in the poll loop (log, sleep, retry).

### Pattern 6: `train_job` (subprocess) (TRAN-04, D-12)

Executed prototype (`yolo26n`, 3 epochs, CPU, 12+4 images, imgsz 64) produced the exact event stream below. Key rules: (a) `settings.update({"sync": False, ...})` first; (b) resolve weights to an **absolute** path under `DATA_DIR/weights/` and call `attempt_download_asset(str(path))` (a relative name downloads into the cwd; an absolute path with a missing parent is created, `safe_download` writes `.<name>.<uuid>.part` and publishes only after size validation, so an interrupted download never leaves a truncated target [VERIFIED: `utils/downloads.py:351-358` read and executed]); (c) pass an **absolute** `project=<run_dir>/out`, `name="train"`, `exist_ok=True` (a relative project is nested under `runs_dir/<task>/`, `cfg/__init__.py:548-551`); (d) `plots=False` (avoids the font download and keeps Phase 11 free to enable plots), `verbose=False`, `amp` left default; (e) register `on_train_epoch_end`, `on_fit_epoch_end`, `on_model_save`, `on_train_end`; (f) on completion write `result.json` (final metrics, `names`, task, paths, ultralytics/torch versions, base-weights sha256) atomically, on any exception write `error.json` (type, message) and exit 1; (g) when the weights file is still missing after the download attempt, raise a plain message: "Could not download <name>.pt. Check the internet access of the worker container, or place the file in <DATA_DIR>/weights/."
**Final-validation detection (D-12):** `final_eval()` increments `trainer.epoch` by one and fires `on_fit_epoch_end` again with `best.pt` metrics (`engine/trainer.py:977-993`). Robust rule independent of epoch arithmetic and early stopping: set `pending=True` in `on_train_epoch_end`; in `on_fit_epoch_end`, `final = not pending`, then clear `pending`. Executed: 3 real events had `final_validation:false`, the 4th (epoch 3 of 3) `true`.
**Registered metrics:** take them from the `final_validation:true` event (validation of `best.pt`), falling back to the last real epoch's metrics when no final event exists.

### Pattern 7: Registration (MODL-03, D-16)

In one worker transaction after a successful exit: `INSERT models` (flush for the id) -> `os.link(best.pt, data/models/<id>.pt)` (copy fallback) -> compute `sha256`/`size` -> `UPDATE training_runs SET status='completed', finished_at, metrics..., model_id` -> commit; on any file error roll back and fail the run. `data/models/<id>.pt` decouples the model lifetime from the run folder for Phase 7 rename/delete. `last.pt` is not registered. Model row: `name` (= run name), `task_type`, `class_names` JSON in index order (from the snapshot, cross-checked with `result.json` `names`), `metrics` JSON (as-is), denormalized `precision/recall/map50/map50_95` from `metrics/*(B)` for detect and `metrics/*(M)` for segment, `base_name` (text), `base_model_id` FK `SET NULL`, `source_run_id` FK `CASCADE`, `project_id` FK `CASCADE` (nullable for Phase 7 uploads), `source` (`'trained'`), `size_bytes`, `sha256`, `created_at`. File path is derived from the integer id, never stored from input.

### Pattern 8: Download (MODL-04, D-18)

`GET /api/models/{id}/download` -> `FileResponse(path, filename=safe_name, media_type="application/octet-stream")`. Starlette emits `attachment; filename*=utf-8''<quoted>` automatically for non-ASCII names (`responses.py` `content_disposition_filename = quote(self.filename)`) [VERIFIED: source read]. `safe_name = f"{project}_{run}_best.pt"` after NFKC, replacing every char outside Unicode `\w`, `.`, `-` with `_`, stripping leading dots, truncating to 120 chars. The browser triggers it with a plain `<a href="/api/models/{id}/download" download>` (a GET, no CSRF concern; never `fetch` + blob for 5-250 MB). nginx `location /api/` already has `proxy_buffering off` and `proxy_read_timeout 3600s`, so no nginx change is needed.

### Pattern 9: Project delete guard and cleanup (D-21)

One guarded statement closes the race with the worker's claim: `DELETE FROM projects WHERE id=:p AND NOT EXISTS (SELECT 1 FROM training_runs WHERE project_id=:p AND status IN ('preparing','queued','running'))`; `rowcount == 0` after the project is known to exist -> `409` ("A training run is active or queued for this project. Wait for it to finish or remove it from the queue.") [VERIFIED: executed with `foreign_keys=ON`: guarded delete returned 0, unguarded project returned 1 and cascaded]. Collect `run ids` and `model ids` **before** the delete (like Phase 2), delete rows, then `remove_run_dir`/`remove_model_file` in a thread (same "direct child, not a symlink" guards as `remove_project_dir`). Extend the startup orphan reconcile to `data/runs/<id>` and `data/models/<id>.pt` with the same empty-table safety valve. `ProjectRead` gains derived `run_count`, `model_count`, `active_run_count` (`column_property` subqueries like `image_count`) for the delete dialog.

### Pattern 10: Frontend integration

- `ProjectLayout.SECTIONS`: insert `{ key: "training", to: "training", labelKey: "project:nav.training" }` between classes and settings; routes `training` (list), `training/new`, `training/:runId` inside the `ProjectLayout` route.
- Polling: `useQuery({ refetchInterval: (q) => active(q.state.data?.status) ? 3000 : false })`; elapsed time ticks client-side from `started_at`.
- Header indicator: one `ActiveRunIndicator` component (poll `GET /training/active` every 3 s) mounted in `AppLayout` **and** in `EditorTopBar` (the editor route is outside `AppLayout`). It adds one request to every page: update the strict fetch stubs (`test/stubImagesApi.ts` `handleImagesSideRequest` pattern) or tests that throw on unknown URLs will break (Phase 3 Pitfall 13).
- Download: anchor, not fetch. Failure log: Mantine `Collapse` + `<pre>`/`Code`, text only.
- Verdict: the API returns `quality: "excellent"|"good"|"fair"|"poor"` from a new `quality_level(map50)` in `yolo_trainer_common/quality.py` (thresholds 0.90/0.75/0.60 as in `quality_assessment`); the UI maps the key through i18n. `quality_assessment` keeps returning its Russian strings (existing tests) and is rebuilt on `quality_level`.
- Visual design belongs to `/gsd-ui-phase` (UI hint: yes); this research does not prescribe layouts.

### Anti-Patterns to Avoid

- **Training in the api process or a thread:** blocks, and dies with the api. Subprocess in the worker only.
- **The subprocess writing to SQLite:** keep the DB single-writer-per-concern; the child writes files, the supervisor writes the DB.
- **Scraping stdout for progress:** use the JSONL channel; stdout is only for the failure log tail.
- **Accepting a model path from the client:** allow-list names or DB ids only.
- **Reading annotations with separate un-transactioned SELECTs** for the snapshot.
- **Calling `settings.update` after importing/using `YOLO`:** do it first.
- **Using `trainer.epoch` comparisons to detect the final event:** use the pending flag.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Weights download/caching | Custom HTTP downloader | `ultralytics.utils.downloads.attempt_download_asset(abs_path)` | Retries, `.part` publish, size validation built in |
| Batch auto-sizing | VRAM heuristics (`auto_batch()` legacy) | `batch=-1` on GPU; fixed 16 on CPU | Ultralytics AutoBatch is the standard; legacy heuristic was judged unreliable (roadmap §9.4) |
| Label cache / verification | Own label validator | Ultralytics `labels.cache` | It validates and caches inside the snapshot dir |
| Progress | Log scraping | Ultralytics callbacks -> JSONL | Roadmap §9.2; log has ANSI/`\r` noise |
| Job queue | Celery/Redis | One `UPDATE ... RETURNING` + poll | Project decision; verified atomic |
| Process-tree kill | `psutil` walk | `start_new_session=True` + `os.killpg` | No dependency; CPU training has `workers=0` anyway |
| Download header quoting | Manual RFC 5987 | Starlette `FileResponse(filename=...)` | Already handles non-ASCII |
| Atomic file writes | Ad hoc writes | temp + `os.replace` (pattern in `write_heartbeat`) | Readers never see half files |
| Box -> polygon | Library | 4 corners in fixed winding (roadmap §7.4) | Trivial and already decided |
| YAML for `data.yaml` in the api | Add PyYAML to the api image | JSON-quoted scalars with `ensure_ascii=False` | Valid YAML, round-trips (executed) |

**Key insight:** every hard part (download, AutoBatch, label validation, metrics) already exists in Ultralytics; the phase's own code is orchestration, atomicity and file layout.

## Common Pitfalls

### Pitfall 1: YOLO26 has no `val/dfl_loss`
**What goes wrong:** code or schema keyed on `val/dfl_loss` (Phase 0 captured keys with `yolo11n`) breaks for the default `yolo26n`.
**Evidence:** executed `yolo26n` detect: metrics keys `metrics/precision(B)`, `metrics/recall(B)`, `metrics/mAP50(B)`, `metrics/mAP50-95(B)`, `val/box_loss`, `val/cls_loss`, `val/l1_loss`; `loss_names` = `["box_loss","cls_loss","l1_loss"]`. Segment (`yolo26n-seg`) adds `metrics/*(M)` and `val/seg_loss`, `val/sem_loss` (Phase 0 follow-up #3 partly closed).
**How to avoid:** store the metrics dict unmodified; read only the four `metrics/*(B|M)` keys by name; treat `val/*` as optional.

### Pitfall 2: The extra final `on_fit_epoch_end` has only `metrics/*` keys
It is `best.pt`'s validation (no `val/*` losses, no `fitness`). Do not render it as "epoch Y+1 of Y" (D-12); use it for registration. See Pattern 6.

### Pitfall 3: Segment datasets hard-fail on box rows
Executed: a `yolo26n-seg` run on 5-value rows raised `ValueError: Segment dataset requires equal numbers of boxes and segments, but got len(segments) = 0, len(boxes) = 13`. For `segment` projects emit every box as a 4-point polygon; the same data trained fine once converted.

### Pitfall 4: Bind-mount file operations are slow on Docker Desktop
About 6 ms per link/file/unlink there. Materialize and delete in threads, never inside the request; show `preparing`; cap nothing but expect minutes for 10k+ images on Windows hosts.

### Pitfall 5: Ultralytics analytics are on by default from the Python API
`Events.enabled = SETTINGS["sync"] and RANK in {-1,0} and not TESTS_RUNNING and ONLINE and (IS_PIP_PACKAGE or ...)` (`utils/events.py:87-93`); the CLI-name check applies only to the Sentry hook. Call `settings.update({"sync": False})` before any training (STATE.md follow-up). Do **not** set `YOLO_OFFLINE`, it also disables downloads. Set `YOLO_AUTOINSTALL=false` (`utils/__init__.py:71`) so a missing package never triggers a runtime `pip install`.

### Pitfall 6: Relative weights names download into the cwd
`attempt_download_asset("yolo26n.pt")` downloads into the current directory unless the name already exists in cwd or `SETTINGS["weights_dir"]`. Always pass an absolute `DATA_DIR/weights/<name>.pt`; also set `weights_dir` to that folder so Ultralytics' internal lookups find the cache.

### Pitfall 7: Shared SQLite between two containers
Verified on Docker Desktop (WSL2 backend, Windows bind mount): two `python:3.12-slim` containers, WAL, `synchronous=NORMAL`, `busy_timeout=30000`, `foreign_keys=ON`, writing for 20 s: 1,395 and 1,490 commits, 0 errors, `PRAGMA integrity_check` = `ok`, hard link works and `st_nlink == 2` [VERIFIED: executed]. This is evidence for this host only (A1, A2). Keep the worker's DB writes tiny and infrequent (claim, per-epoch progress, finish), reuse `apply_sqlite_pragmas`, and keep `SQLITE_JOURNAL_MODE=DELETE` as the documented escape hatch.

### Pitfall 8: Inconsistent snapshot reads
See Pattern 3: begin with the `INSERT`. A test must edit annotations between two reads in a controlled way (monkeypatch a hook) and assert the manifest is internally consistent.

### Pitfall 9: Worker starts before the api migrated
`no such table: training_runs` on the first poll. `depends_on` + tolerant loop.

### Pitfall 10: Progress tail edge cases
A reader can see a partial last line; consume only lines ending in `\n` and keep the offset at the last full line. Serialize with `json.dumps(..., allow_nan=False)` after mapping NaN/inf to `None`, otherwise `JSON.parse` in the browser or pydantic fails on `NaN`.

### Pitfall 11: Log tail noise
`train.log` contains tqdm output with `\r` and ANSI escapes (`ESC[K`). Split on `\r|\n`, strip ANSI, drop empties, take the last 50, then store text in the run row (survives folder removal). Render as plain text.

### Pitfall 12: Shutdown and process groups
Compose sends SIGTERM to the worker (PID 1) with `stop_grace_period: 20s`. The handler must set the stop event, terminate the training group, and write `interrupted` within that window. `Popen.terminate()` on Windows is a hard kill (Phase 0 §4); native-Windows dev needs `CREATE_NEW_PROCESS_GROUP` and is best-effort.

### Pitfall 13: Shared memory only matters on GPU
PyTorch needs a larger `/dev/shm` for multi-process data loaders in containers ("increase shared memory size either with `--ipc=host` or `--shm-size`", pytorch/pytorch README). CPU runs use `workers=0`, so Phase 4 on CPU is unaffected; add `shm_size: "2gb"` to the worker service now so Phase 12's GPU override inherits it (value is a recommendation, A7).

### Pitfall 14: `best.pt` embeds absolute server paths
`train_args` inside the checkpoint contains `data`, `project`, `model` as container paths (executed: `ckpt['train_args']['data']` = the dataset yaml path). Harmless for loading; note it in docs as informational. The checkpoint also records `version` 8.4.159: the downstream project needs an Ultralytics version that understands YOLO26 (A5).

### Pitfall 15: Quality verdict strings are Russian
`quality_assessment` returns Russian text with emoji by design. The en/ru UI needs a language-neutral key (`quality_level`).

### Pitfall 16: Strict fetch stubs and the global indicator
Every page now issues `GET /training/active`; existing strict stubs throw on unknown paths. Update shared stub helpers in the same plan as the indicator.

### Pitfall 17: Class mismatch semantics for trained bases (D-08)
Verified behavior: with COCO `yolo26n.pt` and 2 classes the head is re-created automatically (training ran). For a trained base: different `nc` -> head re-initialized (note per D-08); same `nc` but different names -> head weights are reused with different class meanings and names are overwritten by the dataset's. `classes_match` should compare ordered name lists and the UI note should say "classes differ", not claim re-initialization for same-`nc` cases.

### Pitfall 18: Run name races
Unique index `(project_id, normalized_name)`; creation can race on `run-<n>`; map `IntegrityError` to `409` with the existing "already exists" wording style and let the form retry.

### Pitfall 19: Migration constraints
SQLite cannot alter a CHECK in place. Include `cancelled` in the status CHECK now. Downgrade of `images.split` needs `batch_alter_table`. Existing test `test_migrations.py` compares to `migration_head()` dynamically, so it needs no head edit but should get a `0004 -> head` populated-DB test.

## Code Examples

### Verbatim in-repo values the examples rely on

- `backend/src/yolo_trainer_api/schemas.py:19` — `TaskType = Literal["detect", "segment"]`
- `backend/src/yolo_trainer_api/schemas.py:162` — `ImageStatus = Literal["unannotated", "annotated", "reviewed"]`
- `backend/src/yolo_trainer_api/models.py:103` — `CheckConstraint("ext IN ('jpg', 'png', 'webp', 'bmp')", name="ck_images_ext"),`
- `backend/src/yolo_trainer_api/models.py:183` — `CheckConstraint("kind IN ('box', 'polygon')", name="ck_annotations_kind"),`
- `backend/src/yolo_trainer_api/models.py:130` — `position: Mapped[int] = mapped_column(Integer, nullable=False)` (class `position` = YOLO index; box geometry is "normalized top-left x/y/w/h", `models.py:152-154`)
- `backend/src/yolo_trainer_api/models.py:92-100` — `is_background`, `is_reviewed`, `annotation_version` columns on `Image`
- `backend/src/yolo_trainer_api/storage.py:46` — `return images_dir(settings, project_id) / f"{int(image_id)}.{ext}"`
- `backend/src/yolo_trainer_api/storage.py:110` — `os.replace(staged, final_image)` (images are published once, never edited in place)
- `backend/src/yolo_trainer_api/annotations.py:41-51` — `unannotated_clause()` (`Image.is_background.is_(False)`, `Image.is_reviewed.is_(False)`, `~exists().where(Annotation.image_id == Image.id)`)
- `backend/src/yolo_trainer_api/db.py:22-36` — pragmas `journal_mode`, `synchronous=NORMAL`, `busy_timeout=30000`, `foreign_keys=ON`
- `backend/src/yolo_trainer_api/settings.py:58-63` — `db_path = data_dir / "app.db"`, `projects_dir = data_dir / "projects"`
- `backend/src/yolo_trainer_worker/main.py:71-80` — heartbeat keys `pid, started_at, last_heartbeat, torch_version, ultralytics_version, cuda_available, device, device_name`; `heartbeat_path = data_dir / "worker" / "heartbeat.json"` (`main.py:49-51`)
- `backend/src/yolo_trainer_common/quality.py:13-20` — thresholds `0.90`, `0.75`, `0.60`
- `backend/src/yolo_trainer_common/device.py:15-29` — `parse_device` returns `"cpu"`, `list[int]`, or `int`
- `docker/Dockerfile.backend:45-46` — `ENV DATA_DIR=/data \ YOLO_CONFIG_DIR=/tmp/ultralytics`
- `docker-compose.yml:37-41` — worker `image: yolo-trainer-worker:cpu`, `volumes: - ${DATA_DIR:-./data}:/data`; `stop_grace_period: 20s` (line 50)
- `docs/phase-0-decisions.md:31-39` — keys `metrics/precision(B)`, `metrics/recall(B)`, `metrics/mAP50(B)`, `metrics/mAP50-95(B)`, `val/box_loss`, `val/cls_loss`, `val/dfl_loss`

Proposed (not in repo): table names `training_runs`, `models`; statuses `preparing|queued|running|completed|failed|interrupted|cancelled`; split values `train|valid|test`.

### Label rows (pure, unit-testable) — design

```python
# Source: roadmap §7.4 box->polygon; executed in the research prototype (segment run succeeded)
def label_rows(boxes, task_type, class_index):
    """boxes: iterable of (class_id, x, y, w, h), top-left normalized."""
    for class_id, x, y, w, h in boxes:
        idx = class_index[class_id]  # ProjectClass.position, contiguous 0..N-1
        if task_type == "detect":
            yield f"{idx} {x + w / 2:.6f} {y + h / 2:.6f} {w:.6f} {h:.6f}"
        else:  # segment: 4-point polygon, fixed winding
            x1, y1 = x + w, y + h
            yield f"{idx} {x:.6f} {y:.6f} {x1:.6f} {y:.6f} {x1:.6f} {y1:.6f} {x:.6f} {y1:.6f}"
```
Background image -> empty file (zero bytes). Unannotated images with a split are not materialized.

### `data.yaml` without PyYAML (round-trip executed through `yaml.safe_load`)

```python
import json

def data_yaml(class_names: list[str], has_test: bool) -> str:
    lines = ["train: train/images", "val: valid/images"]
    if has_test:
        lines.append("test: test/images")
    lines.append("names:")
    # ensure_ascii=False is required: the ASCII-escaped form breaks on astral characters (emoji)
    lines += [f"  {i}: {json.dumps(n, ensure_ascii=False)}" for i, n in enumerate(class_names)]
    return "\n".join(lines) + "\n"
```
Executed: names `car`, `грузовик`, `a"b`, `back\slash`, emoji, `yes`, `null`, `123`, `a: b`, `#hash`, `it's` round-trip exactly with `ensure_ascii=False`; the default ASCII-escaped variant failed.

### Claim, delete guard, queue removal (executed on SQLite 3.49.1)

```sql
-- claim (worker)
UPDATE training_runs SET status='running', started_at=:now, worker_pid=:pid
 WHERE id = (SELECT id FROM training_runs WHERE status='queued' ORDER BY id LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM training_runs WHERE status='running')
 RETURNING id;
-- project delete guard (api); rowcount 0 + project exists => 409
DELETE FROM projects WHERE id=:p AND NOT EXISTS
  (SELECT 1 FROM training_runs WHERE project_id=:p AND status IN ('preparing','queued','running'));
-- remove from queue (api); rowcount 0 => 409 (already claimed)
DELETE FROM training_runs WHERE id=:r AND project_id=:p AND status='queued';
```

### Callbacks with recursive serialization (executed, produced the event stream analysed above)

```python
def jsonable(v):
    import torch
    if isinstance(v, torch.Tensor): return jsonable(v.detach().cpu().tolist())
    if isinstance(v, dict): return {str(k): jsonable(x) for k, x in v.items()}   # trainer.tloss is a dict
    if isinstance(v, (list, tuple)): return [jsonable(x) for x in v]
    if hasattr(v, "item"):
        try: return jsonable(v.item())
        except (ValueError, RuntimeError): pass
    if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))): return None
    if isinstance(v, (int, float, str, bool)) or v is None: return v
    return str(v)

state = {"pending": False}
def on_train_epoch_end(t): state["pending"] = True; emit("train_epoch_end", epoch=t.epoch, epochs=t.epochs, tloss=t.tloss)
def on_fit_epoch_end(t):
    final = not state["pending"]; state["pending"] = False
    emit("fit_epoch_end", epoch=t.epoch, epochs=t.epochs, final_validation=final, metrics=dict(t.metrics))
```
Observed `tloss` serialized as `{"box_loss": 3.07, "cls_loss": 3.15, "l1_loss": 0.106}` (a dict, not a Tensor).

### Migration `0005` shape (proposal)

```python
op.add_column("images", sa.Column("split", sa.String(5), nullable=True))   # + CheckConstraint split IN ('train','valid','test')
op.create_index("ix_images_project_split", "images", ["project_id", "split"])
op.create_table("training_runs",
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    sa.Column("name", sa.String(100), nullable=False), sa.Column("normalized_name", sa.Text, nullable=False),
    sa.Column("status", sa.String(16), nullable=False),  # CHECK in (...7 values...)
    sa.Column("task_type", sa.String(16), nullable=False),
    sa.Column("base_kind", sa.String(16), nullable=False), sa.Column("base_name", sa.String(100), nullable=False),
    sa.Column("base_model_id", sa.Integer, sa.ForeignKey("models.id", ondelete="SET NULL"), nullable=True),
    sa.Column("settings", sa.JSON, nullable=False), sa.Column("resolved", sa.JSON, nullable=True),
    sa.Column("epoch", sa.Integer), sa.Column("epochs", sa.Integer), sa.Column("last_map50", sa.Float),
    sa.Column("worker_pid", sa.Integer), sa.Column("error_message", sa.Text), sa.Column("log_tail", sa.Text),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("finished_at", sa.DateTime(timezone=True)),
    sa.Column("progress_updated_at", sa.DateTime(timezone=True)),
    sqlite_autoincrement=True)
op.create_index("uq_training_runs_project_name", "training_runs", ["project_id", "normalized_name"], unique=True)
op.create_index("ix_training_runs_status_id", "training_runs", ["status", "id"])
# create "models" (source_run_id FK -> training_runs.id ON DELETE CASCADE, project_id FK CASCADE nullable, ...)
```
The `training_runs.base_model_id` / `models.source_run_id` FK cycle is legal in SQLite DDL (references are checked at DML); create `models` first or declare both without ORM `relationship()`, as elsewhere in this codebase.

### Compose changes (proposal)

```yaml
worker:
  depends_on:
    api: { condition: service_healthy }
  shm_size: "2gb"
  environment:
    DATA_DIR: /data
    YOLO_AUTOINSTALL: "false"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `yolo11n` + `val/dfl_loss` (Phase 0 capture) | `yolo26n` default; `val/l1_loss`, no DFL | YOLO26 in 8.4.x | Metric keys differ; store dict as-is |
| Legacy scripts, `auto_batch()` heuristic, `config.ini` | `batch=-1` on GPU, 16 on CPU, form settings | This phase | `train_yolo.py` logic moves to `train_job` |
| Log/stdout progress | Callbacks -> JSONL | Roadmap §9.2 | Phase 5 SSE tails the same file |

**Deprecated/outdated:** the Phase 0 spike's `str(value)` fallback for nested tensors (replaced by recursive `jsonable`); the spike's hard-coded `task: "segment"` labelling.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Two-container WAL SQLite also works on macOS Docker Desktop (virtiofs) | Pitfall 7 | Corruption/locking on macOS; mitigated by `SQLITE_JOURNAL_MODE=DELETE` escape hatch, but the worker would need the same mode |
| A2 | Native Linux Docker behaves like the tested WSL2 setup (same kernel, local FS) | Pitfall 7 | Low; shared page cache on one kernel |
| A3 | OpenCV in the Linux worker image applies EXIF orientation to JPEG/PNG/WebP like the Windows wheel tested here (all three gave the rotated shape) | Pitfall (EXIF) / Pattern 3 | Mis-oriented training pixels for EXIF-rotated WebP/PNG; verify once in the built worker image |
| A4 | The 19 official names other than `yolo26n.pt` actually download from release `v8.4.0` | Standard Stack | A model size fails on first use with a download error (reported as a failed run) |
| A5 | The downstream project's Ultralytics version loads YOLO26 checkpoints (`ckpt['version']` = 8.4.159) | Pitfall 14 | Downstream `YOLO(path)` fails on an older Ultralytics; note in docs |
| A6 | A queue length cap (suggest 20 queued runs) is unnecessary for single-operator use | Pattern 4 | Disk growth from many queued snapshots |
| A7 | `shm_size: "2gb"` is adequate for the GPU path | Pitfall 13 | GPU data-loader crashes; tune in Phase 12 |
| A8 | 8 materialization threads is a good default | Pattern 3 | Slower/faster only |
| A9 | Native Linux file operations are much faster than the measured 6 ms/file Docker Desktop figure | Pitfall 4 | `preparing` lasts longer than expected |
| A10 | Ultralytics does not verify downloaded weights against a published checksum | Security | Supply-chain trust rests on HTTPS and GitHub; record the sha256 of base weights in `result.json` for auditability |
| A11 | Hard links work on macOS bind mounts; otherwise the copy fallback applies | Pattern 3 | Doubled disk usage per run |

## Open Questions

1. **Should a run with zero annotated instances in train block start?**
   - Known: D-05 only blocks on empty train/valid. Ultralytics trains (all-background) without crashing in principle (not executed).
   - Unclear: usefulness. Recommendation: non-blocking warning, keep D-05 exact.
2. **Storage growth of kept snapshots.**
   - Known: D-19 keeps folders; hard links cost only labels, copy fallback doubles images.
   - Recommendation: report run folder size in the run payload later; Phase 5 history delete frees space. Queued-run removal deletes its folder now.
3. **Model file location.**
   - Recommendation adopted: `data/models/<id>.pt` hard link of `best.pt` (decoupled lifetime for Phase 7). Confirm in planning.
4. **Where `quality_level` thresholds live for segment (mask mAP vs box mAP).**
   - Recommendation: use the task's primary metric (`(B)` detect, `(M)` segment) for verdict and list.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uv + Python 3.12 venv | backend, tests, real-training test | ✓ | uv 0.12.19 / 3.12.10 | — |
| Ultralytics / torch (CPU) | `train_job`, training tests | ✓ | 8.4.159 / 2.14.0+cpu | — |
| Docker + Compose | compose smoke, worker image | ✓ | 29.7.2 / v5.4.0 | — |
| Node / npm | frontend tests/build | ✓ | v24.19.0 / 11.17.0 | — |
| Internet to github.com (weights) | first-use download | ✓ (5.3 MB in 1.7 s) | — | Pre-place `DATA_DIR/weights/yolo26n.pt` (repo root already has a git-ignored copy) |
| NVIDIA GPU | GPU path | ✗ | — | Phase 12 on other hardware |
| Built `yolo-trainer-worker:cpu` image | compose-level training test | ✗ (not built locally) | — | Build once (slow: torch wheels, `UV_CONCURRENT_DOWNLOADS=1`); native tests cover logic |
| SQLite RETURNING | claim statement | ✓ | 3.49.1 local, 3.46.1 in `python:3.12-slim` | — |

**Missing dependencies with no fallback:** none for Phases 4's CPU scope.
**Missing dependencies with fallback:** worker image not built (build during execution); GPU deferred.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend | pytest 9.1 + TestClient over temp-file SQLite and real Alembic (`backend/tests/conftest.py`: `settings`, `make_client`, `client`) |
| Frontend | Vitest 5 + jsdom 30 + Testing Library (`renderWithProviders`, `stubImagesApi`) |
| Lint | ruff (`line-length = 100`, py312) |
| Config | `backend/pyproject.toml [tool.pytest.ini_options]` (add marker `training`, default `addopts = "-ra -m 'not training'"`), `frontend/vite.config.ts` |
| Quick run | `uv run pytest backend/tests/<file> -x -q` ; `npm --prefix frontend run test -- --run <pattern>` |
| Full suite | `bash scripts/run_full_suite.sh` (+ `uv run pytest -m training backend/tests/test_train_job.py` as a phase-gate step) |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-05 | bulk/single split set, project scoping, `null` = unassigned, no `annotation_version`/reviewed change | integration | `uv run pytest backend/tests/test_splits_api.py -x` | ❌ Wave 0 |
| DATA-05 | auto-split: only unassigned, seeded determinism, ratio rules, small-n rules, preview == apply, 409 on drift, annotated + unannotated both included | unit+integration | `uv run pytest backend/tests/test_splits_auto.py -x` | ❌ Wave 0 |
| DATA-05 | summary: usable/excluded per split, blockers (train/valid empty, no classes), warnings | integration | `uv run pytest backend/tests/test_training_summary.py -x` | ❌ Wave 0 |
| TRAN-03 | label rows detect/segment, background empty, class index by position, `data.yaml` round-trip via `yaml.safe_load` | unit | `uv run pytest backend/tests/test_training_labels.py -x` | ❌ Wave 0 |
| TRAN-03 | materialization: hard links (`st_nlink`), copy fallback (patch `os.link`), manifest content+sha256, later annotation/class/image edits do not change files, vanished image -> failed | integration | `uv run pytest backend/tests/test_training_snapshot.py -x` | ❌ Wave 0 |
| TRAN-01/MODL-01 | create validation (bounds, imgsz % 32, device, official allow-list, model task mismatch 422, no path input), `run-<n>` naming, 409 duplicate | integration | `uv run pytest backend/tests/test_runs_api.py -x` | ❌ Wave 0 |
| TRAN-04 | claim atomic + FIFO + one running; remove queued; reconcile sweep (running->interrupted, queued stays, preparing->failed); api sweep respects fresh heartbeat | integration | `uv run pytest backend/tests/test_worker_queue.py -x` | ❌ Wave 0 |
| TRAN-04/MODL-03 | supervisor with a fake train command: success registers model + hard link + metrics from final event; failure keeps message + 50-line tail; progress tail updates DB; partial JSONL line tolerated; stop event -> interrupted | integration | `uv run pytest backend/tests/test_worker_supervisor.py -x` | ❌ Wave 0 |
| TRAN-04 | progress helpers: recursive `jsonable`, NaN -> null, final-validation flag | unit | `uv run pytest backend/tests/test_progress.py -x` | ❌ Wave 0 |
| MODL-03/MODL-04/TRAN-03 | real tiny CPU run (`yolo26n`, needs cached weights or network): best.pt registered, `YOLO(path)` loads in a fresh process, `names` == project classes, task matches | integration (slow) | `uv run pytest -m training backend/tests/test_train_job.py -x` | ❌ Wave 0 |
| MODL-04 | download: headers, sanitized name incl. Cyrillic, 404 for unknown id, path derived from id | integration | `uv run pytest backend/tests/test_models_api.py -x` | ❌ Wave 0 |
| D-21 | project delete blocked by active run (409), cascades runs/models, removes folders, orphan sweep of `runs`/`models` | integration | `uv run pytest backend/tests/test_training_cleanup.py backend/tests/test_projects_api.py -x` | ❌ / ✅ extend |
| TRAN-04 | migration `0005` upgrades a populated `0004` DB; existing images unassigned | integration | `uv run pytest backend/tests/test_migrations.py -x` | ✅ extend |
| D-12 | `quality_level` thresholds; Russian `quality_assessment` unchanged | unit | `uv run pytest backend/tests/test_quality.py -x` | ✅ extend |
| TRAN-04 | heartbeat gains `active_run_id` | unit | `uv run pytest backend/tests/test_worker.py -x` | ✅ update |
| DATA-05 | SelectionBar split menu, tile chip, AutoSplitDialog shows counts and requires confirm | component | `npm --prefix frontend run test -- --run SelectionBar ImageTile AutoSplit` | ❌ Wave 0 |
| DATA-05/D-02 | editor top bar split selector calls the split route, not the annotation saver | component | `npm --prefix frontend run test -- --run EditorSplit` | ❌ Wave 0 |
| TRAN-01 | NewRunPage: defaults, base picker grouping, CPU-only device control, disabled Start with reasons, unannotated warning, class-mismatch note | component | `npm --prefix frontend run test -- --run NewRunPage` | ❌ Wave 0 |
| TRAN-04/D-12 | RunPage: preparing/queued position/running epoch X of Y/completed metrics+verdict+download/failed log/interrupted; polling stops at terminal state; never "Y+1" | component | `npm --prefix frontend run test -- --run RunPage` | ❌ Wave 0 |
| D-14 | ActiveRunIndicator in AppLayout and editor; stub updates keep old tests green | component | `npm --prefix frontend run test -- --run ActiveRunIndicator` | ❌ Wave 0 |
| D-21 | DeleteProjectModal shows run/model counts and the active-run block | component | `npm --prefix frontend run test -- --run DeleteProjectModal` | ✅ extend |
| — | en/ru key parity incl. `training` | unit | `npm --prefix frontend run test -- --run locales` | ✅ auto |
| TRAN-04 | restart `docker compose restart worker` mid-run -> `interrupted`, queued survives; api-only restart keeps `running` | manual / smoke | documented UAT + optional `SMOKE_TRAIN=1` stage in `scripts/compose_smoke_test.sh` | Manual |
| MODL-04 | `scripts/verify_model_download.py <url-or-file>`: plain `YOLO(path).predict()` in a clean process | script | `uv run python scripts/verify_model_download.py <path>` | ❌ Wave 0 |
| All | end-to-end on CPU with a small manually annotated detect project in the browser | manual UAT | list in VERIFICATION | Manual |

### Sampling Rate

- **Per task commit:** the relevant single pytest file or Vitest pattern.
- **Per wave merge:** `uv run pytest backend/tests -q`, `uv run ruff check backend`, `uv run ruff format --check backend`, `npm --prefix frontend run test -- --run`.
- **Phase gate:** `bash scripts/run_full_suite.sh` green, `uv run pytest -m training` green, then manual UAT, before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] New backend test files listed above; helper to bulk-insert images, classes, annotations and splits (extend `backend/tests/imaging.py` patterns)
- [ ] A fake training command (small Python script) used by the supervisor tests: writes JSONL, `result.json`, a dummy `best.pt`, exits 0/1, or sleeps for stop tests
- [ ] A tiny synthetic detect fixture (8-16 generated images with boxes) for the `training` marker test, imgsz 64
- [ ] pytest marker `training` registered; CI keeps it off by default (network + weights)
- [ ] Frontend fixtures: `Image.split`, run/model/option payloads in `src/test/fixtures.ts`; `handleImagesSideRequest`-style helper for `/training/active`
- [ ] `scripts/verify_model_download.py`; optional `SMOKE_TRAIN=1` stage in `scripts/compose_smoke_test.sh` (copies a cached `yolo26n.pt` into `DATA_DIR/weights/` when present)

## Security Domain

ASVS level 1, `security_block_on: high`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-operator, no auth (Phase 0) |
| V3 Session Management | no | no sessions |
| V4 Access Control | partial | every route scoped by `project_id` (+ run/model id); models for a base pick filtered by task type; ids never trusted across projects except the intended cross-project base-model reuse (D-08) |
| V5 Input Validation | yes | Pydantic `extra="forbid"`, discriminated base union, numeric bounds, `device` literal, name rules, ids list <= 1000 |
| V6 Cryptography | no | `sha256` is integrity metadata only |
| V10 Malicious Code | yes | `.pt` is pickle: only official allow-listed names and service-produced files are ever loaded; no user path or upload in this phase |
| V12 Files and Resources | yes | paths built from integers only; hard-link sources from `storage.image_path`; `rmtree` only for direct non-symlink children of `runs`/`models` roots; download name sanitized |
| V13 API | yes | plain-English errors, 409/422 semantics, literal routes before param routes |
| V14 Configuration | yes | no new published port; nginx limits unchanged (JSON bodies < 1 MiB); worker has outbound internet for weights only |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| T4-01 Arbitrary model path / pickle load via the base-model field | Elevation | Allow-list of 20 names + DB model id; never a path; task-type check |
| T4-02 Command injection into the training subprocess | Tampering | `Popen` argument list, no shell, only run-dir path from an integer id; settings travel via `job.json` validated at the API |
| T4-03 Path traversal via run/project/class names | Tampering | filesystem names are integer ids; display names only in manifest content and sanitized download filename |
| T4-04 Cross-project data leakage in snapshot | Info disclosure | every SELECT filtered by `project_id`; annotation class must belong to the project (already enforced on save) |
| T4-05 Project delete during active run | Integrity | guarded `DELETE ... NOT EXISTS`; worker tolerates a vanished run row |
| T4-06 Cross-site JSON write | Spoofing | JSON POST needs a preflight (no CORS middleware) + `Depends(require_xhr)` on new write routes |
| T4-07 Resource exhaustion (huge epochs/batch/imgsz, many queued runs) | DoS | bounds in `RunCreate`; consider a queued-run cap (A6) |
| T4-08 Stored XSS through run name, class names, error message, log tail | Tampering | React text rendering only; `<pre>`/`Code` text; no `dangerouslySetInnerHTML` |
| T4-09 Supply-chain trust of downloaded weights | Tampering | HTTPS to `github.com/ultralytics/assets` fixed release URL by allow-listed name; record sha256 (A10) |
| T4-10 Server paths leaking inside downloaded `.pt` | Info disclosure | accepted (single operator); documented (Pitfall 14) |
| T4-11 Download of another project's model | Access | single-operator model; id-derived path only; acceptable per Phase 0 no-auth |

Add these to the plan threat models and `04-SECURITY.md`.

## Sources

### Primary (HIGH confidence)
- Installed Ultralytics 8.4.159 source (read this session): `utils/downloads.py` (asset names `20-27`, `attempt_download_asset` `558-605`, `safe_download` `340-440`), `engine/trainer.py` (`160-175`, `615-690`, `977-993`), `cfg/__init__.py:525-560` (`get_save_dir`), `data/utils.py:615-625` (dataset root), `utils/events.py:49-110` (analytics), `utils/__init__.py:71,864,1215-1230,1395-1420` (AUTOINSTALL, `is_online`, settings defaults), `utils/autobatch.py:60-135`
- Executed experiments (scratch dir): two-container WAL SQLite test + hard link; bind-mount file-operation timings (3,000 files, serial and 8 threads); `yolo26n` detect and `yolo26n-seg` segment CPU trainings with callbacks/JSONL; plain-process `YOLO(best.pt)` load and predict; EXIF behavior of `cv2.imread`/Ultralytics `imread` for JPEG/PNG/WebP; `data.yaml` round trip; claim/delete-guard SQL; official asset membership; `yolo26n.pt` download to an absolute path
- Repository files read: `04-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `docs/phase-0-decisions.md`, `docs/roadmap.md` §5.5-5.6, §6, §7.4, §8, §9, §12-13, `03-RESEARCH.md` (shape), `backend/src/yolo_trainer_api/{models,schemas,db,storage,settings,main,annotations,migrate,security}.py`, `routers/{projects,images}.py`, `migrations/versions/0004_create_annotations.py`, `yolo_trainer_common/{device,quality}.py`, `yolo_trainer_worker/main.py`, `docker-compose.yml`, `docker/{Dockerfile.backend,nginx.conf.template}`, `scripts/compose_smoke_test.sh`, `spikes/train_worker_spike.py`, frontend `app/{routes,AppLayout}.tsx`, `features/project/{ProjectLayout,DeleteProjectModal}.tsx`, `features/images/SelectionBar.tsx`, `features/editor/EditorTopBar.tsx`, `api/client.ts`

### Secondary (MEDIUM confidence)
- github.com/pytorch/pytorch README (shared-memory statement for containers) [CITED: github.com/pytorch/pytorch]

### Tertiary (LOW confidence)
- Items A1-A11 in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nothing new to install; versions executed
- Architecture (queue, snapshot, registration): HIGH — claim/delete SQL, shared-DB test, real trainings executed; remaining risk is non-Windows hosts (A1, A9)
- Training mechanics / pitfalls: HIGH — metric keys, final event, segment failure, analytics condition all observed in source or executed
- Frontend integration: MEDIUM — read from existing code, not prototyped
- Security: MEDIUM-HIGH — standard controls, no new attack surface beyond allow-listed model selection

**Research date:** 2026-10-04
**Valid until:** 2026-11-03 (Ultralytics releases roughly weekly; re-verify the pin and the `GITHUB_ASSETS_NAMES` list if the pin changes)
