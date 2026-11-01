# Phase 4: Train & Download - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning

<domain>
## Phase Boundary

A user turns an annotated project into a trained model from the browser and downloads a `.pt` that the downstream project loads with `YOLO(path)`. This completes the upload → annotate → train → download loop.

In scope: per-image train/valid/test split (manual and a confirmed auto-split), a training start form (base model plus epochs, image size, batch, device), background execution in the worker with a FIFO queue, a minimal run status page, a dataset and settings snapshot per run, automatic model registration, and `.pt` download.

Out of scope here and owned by later phases:
- Live SSE charts, cancel and resume, full run history, and friendly failure explanations (Phase 5).
- Polygon and segment training end-to-end (Phase 6). Segment projects with boxes can still train, per P3 D-18.
- Uploading your own `.pt`, the model library page, rename and delete, and test-predict (Phase 7).
- Advanced hyperparameters, per-class metrics, and run comparison (Phase 11).
- GPU image and the diagnostics page (Phase 12).

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Job execution & training
- `docs/roadmap.md` §5.5 — Container topology. Training lives outside the api container, one job at a time.
- `docs/roadmap.md` §5.6 — Subprocess job management, DB-persisted state, startup reconciliation → `interrupted`.
- `docs/roadmap.md` §9.1 — `train_worker.py` responsibilities, DB-backed FIFO, no Celery or Redis.
- `docs/roadmap.md` §9.2 — Callbacks (`on_fit_epoch_end`, `on_model_save`, `on_train_end`) → per-job JSONL, not log scraping.
- `docs/roadmap.md` §9.4 — Training config tiers. Basic fields are this phase; Advanced is Phase 11; `workers` and `verbose` are system-managed.
- `docs/phase-0-decisions.md` §2 — Exact detect metric keys, the extra final `on_fit_epoch_end`, and recursive serialization.
- `docs/phase-0-decisions.md` §4 — Popen/terminate behavior (Windows hard kill). Relevant to native dev runs.
- `docs/phase-0-decisions.md` "Follow-up tasks" #5 — Spike shortcuts that must be fixed in the real worker.
- `spikes/train_worker_spike.py` — Phase 0 callback-instrumented training spike (reference implementation to harden).

### Dataset, models & storage
- `docs/roadmap.md` §6.2 — DB is the source of truth. YOLO label files are generated per task type.
- `docs/roadmap.md` §6.4 — Split management, user-confirmed auto-split, validate splits before training.
- `docs/roadmap.md` §7.4 — Box↔polygon conversion (boxes in `segment` projects).
- `docs/roadmap.md` §8.1–8.4 — Model sources, metadata to track, and task-type binding (filter pickers by task type).
- `docs/roadmap.md` §8.6, §15 — `.pt` pickle risk. Only service-produced and official weights are loaded in this phase.
- `docs/roadmap.md` §12, §13.3 — Storage layout and the `Model` / `TrainingRun` entity shape.

### Project-level
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, and notes.
- `.planning/REQUIREMENTS.md` — DATA-05, MODL-01, MODL-03, MODL-04, TRAN-01, TRAN-03, TRAN-04.
- `.planning/phases/03-box-annotation-editor/03-CONTEXT.md` — Annotation model (D-12 version CAS, D-13/D-14 status and background, D-18 boxes in segment projects).
- `.planning/phases/02-image-upload-classes/02-CONTEXT.md` — Class index semantics (D-13), storage layout (D-18), delete semantics (D-19).
- `.planning/phases/01-runnable-skeleton-projects/01-CONTEXT.md` — Compose services, data dir, worker image (D-13..D-18).
- `.planning/phases/01-runnable-skeleton-projects/01-SECURITY.md`, `.planning/phases/02-image-upload-classes/02-SECURITY.md`, `.planning/phases/03-box-annotation-editor/03-SECURITY.md` — Existing mitigations (Host allow-list, body limits, JSON-preflight CSRF stance, path safety) that new run, model, and download routes must follow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/yolo_trainer_worker/main.py`: the worker loop with an atomic heartbeat file, signal handling, and `--healthcheck`. It becomes the job poller/supervisor. The heartbeat already carries device info usable by the start form's device control.
- `backend/src/yolo_trainer_common/device.py` (`detect_compute_device`, device parsing) and `quality.py` (mAP50 quality verdict): reuse them for device resolution and the run result verdict (D-12).
- `train_yolo.py` / `finetune_yolo.py`: the legacy training orchestration whose logic `train_worker` takes over (roadmap notes).
- `backend/src/yolo_trainer_api/annotations.py` and `models.py` (`Image.is_background`, `is_reviewed`, `annotation_version`, `Annotation.kind/x/y/w/h`, `ProjectClass.position`): the source data for label generation. The derived status logic decides annotated/background/unannotated for D-04.
- `backend/src/yolo_trainer_api/storage.py`: id-based paths under `data/projects/<id>/images/`. These are the hard-link sources for D-19.
- `frontend/src/features/images/SelectionBar.tsx`, `ImageTile.tsx`, `StatusSummary.tsx`: the bulk split action, the tile split chip, and per-split counts.
- `frontend/src/features/editor/EditorTopBar.tsx`: where the split selector goes (D-02).
- `frontend/src/features/project/DeleteProjectModal.tsx`: extend it with the run and model counts and the active-run block (D-21).

### Established Patterns
- Alembic migrations only, ORM-only queries, a Postgres-portable schema, pydantic `extra="forbid"`, and AUTOINCREMENT integer ids.
- JSON write routes rely on the CORS preflight for CSRF. Downloads must set `Content-Disposition` with a sanitized filename, and paths never derive from user input (P2 D-18).
- Class index is computed from `position` at export time, never stored on annotations.
- TanStack Query for server state. Polling via `refetchInterval` fits D-12. Vitest + Testing Library, and pytest on temp-file SQLite.
- Atomic file writes (temp + `os.replace`) as in the worker heartbeat. Use them for run state files and manifest writes.

### Integration Points
- `frontend/src/features/project/ProjectLayout.tsx` `SECTIONS`: add `training` (suggested order: Overview, Images, Classes, Training, Settings).
- `frontend/src/app/routes.tsx`: training list, `training/new`, and `training/:runId` routes. `AppLayout.tsx` header: the global active-run indicator (D-14), which must also render on the full-screen editor route.
- `docker-compose.yml` `worker` service: already mounts `DATA_DIR` at `/data`. Needs network access for the first weight download. Keep `stop_grace_period` in mind for the D-13 interrupt semantics.
- `images` table: new `split` column (D-01). New tables for training runs and models (D-16), all with project-cascading deletes plus run-folder cleanup (D-21, extending P2 D-19's orphan cleanup to `data/runs/`).
- The image list and status-counts APIs need per-split counts for the grid and the start-form summary.

</code_context>

<specifics>
## Specific Ideas

- The owner's current workflow uses `trained_models/best.pt` in a downstream project. Acceptance means a downloaded file works as a drop-in replacement (after renaming) with `YOLO(path).predict(...)`.
- The owner's `config/config.ini` used `yolov8n`, epochs 120, imgsz 960, `single_cls=True`. These are **not** the defaults (D-09 chose standard Ultralytics). `single_cls` and other advanced knobs are Phase 11.
- Overnight use case: queue several runs and let them run in sequence (D-11, D-13).
- Annotating while a run trains (the header indicator is visible in the editor, D-14) is an expected workflow, and the snapshot guarantees it doesn't disturb the run (D-20).
- Validate end-to-end on the CPU dev machine with a small, manually annotated detect project (ROADMAP note).

</specifics>

<deferred>
## Deferred Ideas

- Separate **Models** page/section in the sidebar → Phase 7 (model library).
- "Pre-fill the form from the last run's settings" was considered and not chosen as the default. It could return as a "Duplicate run" action with Phase 5 history or Phase 11 comparison.
- Cancel a running job, resume `interrupted` runs, live SSE charts, human-friendly failure messages → Phase 5.
- YOLOv8 in the official base list was not chosen. Users can bring a v8 `.pt` via upload in Phase 7.

</deferred>

---

*Phase: 04-train-download*
*Context gathered: 2026-10-04*
