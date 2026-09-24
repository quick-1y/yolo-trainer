# Roadmap: YOLO Trainer Platform

## Overview

This roadmap turns the existing CLI training scripts into a self-hosted, Dockerized browser app, one working slice at a time. Phase 0 (architecture validation spikes) is already complete (`docs/phase-0-decisions.md`), so numbering starts at 1. Phases 1-4 build the core loop as early as possible: a runnable service with projects, image upload and classes, a bounding-box annotation editor, then training in the browser with a downloadable `.pt`. Phase 5 makes training observable and controllable. Phase 6 makes the loop work for segmentation projects (polygons and click-to-segment). Phases 7-8 add the owner's next priority: a model library and model-powered AI-assisted annotation. Phases 9-11 add dataset import/export, dataset organization, and training tuning/evaluation. Phase 12 adds GPU acceleration and hardware diagnostics. It needs separate NVIDIA hardware and never blocks the CPU-path phases.

Detailed technical reference: `docs/roadmap.md` (§4 target architecture, §16 decisions), `docs/phase-0-decisions.md`, `.planning/research/webapp-platform/`, `.planning/codebase/`.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Runnable Skeleton & Projects** - Clean reproducible repo plus a `docker compose up` web app where the user creates and manages detect/segment projects
- [ ] **Phase 2: Image Upload & Classes** - User uploads images from the browser, browses them in a fast grid, and defines the project's classes
- [ ] **Phase 3: Box Annotation Editor** - User annotates images one by one with bounding boxes, autosave, undo/redo, shortcuts, and image status
- [ ] **Phase 4: Train & Download** - User splits the dataset, trains from the browser in a background worker, and downloads a working `.pt` (core loop complete)
- [ ] **Phase 5: Live Training Monitoring & Control** - User watches live metrics charts, cancels/resumes runs, sees run history and understandable failures
- [ ] **Phase 6: Polygons & Segmentation Projects** - User annotates with polygons and click-to-segment, and segment projects train end-to-end
- [ ] **Phase 7: Model Library** - User uploads their own `.pt`, manages models, gets task-type protection, and test-predicts on an image
- [ ] **Phase 8: AI-Assisted Annotation** - A chosen model proposes shapes on the current image; user accepts, edits, or rejects them
- [ ] **Phase 9: Dataset Import & Export** - User imports YOLO/Roboflow datasets and mounted folders with a validation report, and exports a trainable YOLO zip
- [ ] **Phase 10: Tags, Filters & Dataset Statistics** - User tags images, filters the grid by tag/class/split/status, and sees dataset statistics
- [ ] **Phase 11: Training Tuning & Evaluation** - User sets advanced hyperparameters, inspects detailed validation results, and compares runs
- [ ] **Phase 12: GPU Acceleration & Hardware Diagnostics** - GPU variant trains on NVIDIA hardware; diagnostics page shows available compute devices

## Phase Details

### Phase 1: Runnable Skeleton & Projects

**Goal**: A user can start the service with one `docker compose up` on a CPU-only machine, open it in the browser, and create and manage `detect`/`segment` projects that persist, on top of a clean, reproducible, tested codebase
**Mode:** mvp
**Depends on**: Nothing (first phase; Phase 0 spikes already complete)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, DEPL-01, DEPL-03, PROJ-01, PROJ-02
**Success Criteria** (what must be TRUE):

  1. On a fresh clone, a developer follows the README to a working Python 3.12 environment with the pinned PyTorch 2.14.0 / Ultralytics 8.4.159 stack (re-verified at implementation time), and `pytest` passes, all without manual guessing
  2. Device parsing and quality assessment live in one shared, unit-tested module; `train_yolo.py` and `finetune_yolo.py` import it and still run as before
  3. After a CLI training run, `git status` is clean: weights, `runs/`, datasets, and app data are ignored, and binaries committed earlier are untracked (the real `trained_models/best.pt` stays on disk)
  4. On the CPU-only dev machine, one `docker compose up` starts the service; the user opens the web UI, creates a project with a name and a fixed task type (`detect` or `segment`), and can list, open, rename, and delete projects
  5. Projects survive `docker compose down`/`up` and image rebuilds, and database migrations apply automatically on startup

**Plans:** 10 plans (5 waves; walking skeleton in `SKELETON.md`)

Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — Walking skeleton (tracer): create and list projects through SPA -> nginx -> FastAPI -> migrated SQLite on `./data`, compose smoke test, pytest harness (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Deployment hardening: WAL tuning/checkpoint, SQLITE_JOURNAL_MODE escape hatch, DATA_DIR validation, host allow-list, rebuild + integrity smoke stage (wave 2)
- [ ] 01-03-PLAN.md — Create-project edges (empty, Unicode, case, repeats, races) with plain-English errors, Vitest harness, create-modal validation (wave 2)
- [ ] 01-04-PLAN.md — Shared `yolo_trainer_common` module + pinned torch 2.14.0 CPU / ultralytics 8.4.159 env; legacy scripts import it (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-05-PLAN.md — Repo hygiene: ignore rules, untrack weights/runs without deleting them, automated CLI-run git-clean check, roadmap dataset correction (wave 3)
- [ ] 01-06-PLAN.md — Worker service on the real CPU ML image with heartbeat; api image proven torch-free (wave 3)
- [ ] 01-07-PLAN.md — Language switcher (en/ru), browser-based default, key-parity guard (wave 3)
- [ ] 01-08-PLAN.md — Open a project: detail API, sidebar shell, Overview, not-found states (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-09-PLAN.md — Manage a project: rename/description (PATCH), typed-name delete (DELETE), Settings page (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 01-10-PLAN.md — README (en) + README.ru.md, fresh-clone and full-suite scripts, final phase run (wave 5)

**UI hint**: yes
**Notes**:

- Re-verify the version pins at implementation time (phase-0 §1). Do not inherit them silently.
- Carried Phase 0 follow-up #4: amend `docs/roadmap.md` §1.7/§7.2 to describe `example_ready_dataset/` as predominantly detect-format with a few stray polygon rows, so later planners are not misled.
- `trained_models/best.pt`, `yolo26n.pt`, `yolov8n.pt`, and `runs/` are still tracked despite `.gitignore`. Untrack them without deleting local files. Rewriting git history is a separate, owner-confirmed action and not part of this phase. Also decide whether the `example_ready_dataset/` images are a committed fixture or ignored.
- Set up the Compose topology (web/API service plus a worker service) now so later phases slot in. Use SQLAlchemy + Alembic on SQLite (WAL) with a Postgres-ready layer and no auth (phase-0 §6).
- DEPL-01 on Linux/macOS hosts can only be verified when those hosts are available. Apple Silicon needs a `linux/arm64` CPU image.

### Phase 2: Image Upload & Classes

**Goal**: A user can fill a project with images from the browser, browse them smoothly even at thousands of images, and define the project's class list
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DATA-01, ANNO-01, PROJ-03
**Success Criteria** (what must be TRUE):

  1. User drags and drops multiple image files or a whole folder into a project (or picks them in a file dialog), sees upload progress, and gets a clear report of any rejected files (unsupported or corrupt)
  2. Uploaded images appear in the project's thumbnail grid, and the grid scrolls smoothly with several thousand images (verified with a seeded large project)
  3. User creates, renames, recolors, and deletes classes in a project; each class shows a stable index and color
  4. Uploaded images and classes are still present after a service restart

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Store image files on the persistent data volume and generate thumbnails on the server. Use a virtualized grid (react-virtuoso, `docs/roadmap.md` §11.3).
- A class index is its position in `names:`. Deleting or reordering classes later affects labels (§7.1), so design the class model with that in mind.

### Phase 3: Box Annotation Editor

**Goal**: A user can annotate images one by one with bounding boxes in a fast, keyboard-driven editor without ever losing work
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: ANNO-02, ANNO-03, ANNO-06, ANNO-07, ANNO-08, ANNO-09, ANNO-10
**Success Criteria** (what must be TRUE):

  1. User opens an image from the grid in the annotation editor, zooms and pans, and moves to the next/previous image without returning to the grid
  2. User draws, selects, moves, resizes, and deletes bounding boxes, assigns a class to each, and changes the class of an existing box
  3. Every change saves automatically and survives a page reload; undo/redo steps backward and forward through create, move, resize, class-change, and delete actions
  4. User switches tools, picks classes, saves, and navigates images with keyboard shortcuts listed in an on-screen shortcut reference
  5. Each image shows a status (unannotated / annotated / reviewed); the user can jump to the next unannotated image and mark an image as background (no objects)

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Use a react-konva canvas and Zustand + zundo snapshot-per-gesture undo history (`docs/roadmap.md` §7.5, §11.2). This phase validates the react-konva choice before polygons build on it.
- The DB is the live source of truth, and YOLO label files are derived artifacts (§6.2).

### Phase 4: Train & Download

**Goal**: A user can turn an annotated project into a trained model from the browser and download a `.pt` the downstream project can load, completing the upload → annotate → train → download loop
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: DATA-05, MODL-01, MODL-03, MODL-04, TRAN-01, TRAN-03, TRAN-04
**Success Criteria** (what must be TRUE):

  1. User assigns images to train/valid/test by hand, or runs an automatic split by ratio that applies only after they confirm it; a run cannot start while train or valid is empty, and the UI explains why
  2. User starts training from the browser by choosing a base model and setting epochs, image size, batch, and device; the base is either an official Ultralytics pretrained model for the project's task type (downloaded automatically on first use) or a model previously trained in this service
  3. Training runs in a background worker: the UI stays responsive, closing the browser does not stop the run, reopening shows its current status, and restarting the backend mid-run marks the run interrupted instead of losing track of it
  4. When the run finishes, its model is registered automatically with metrics, classes, task type, and source run; the user downloads the `.pt`, and it loads and predicts via `YOLO(path)` in a plain Python script, the same way the downstream project uses `trained_models/best.pt`
  5. Each run stores a snapshot of its settings and the exact dataset (images, labels, splits, classes) it trained on; later annotation edits do not change what the run records it was trained with

**Plans**: TBD
**UI hint**: yes
**Notes**:

- `train_worker.py` takes over the logic of `train_yolo.py`/`finetune_yolo.py`. Progress goes to per-job JSONL through Ultralytics callbacks. Carried Phase 0 follow-up #5a: serialization must walk nested dicts/lists recursively (e.g. `trainer.tloss`), not just top-level tensors.
- Decide in planning how jobs cross the container boundary. The API container cannot `Popen` into a separate worker container, so the options are a worker service that picks up DB-queued jobs, or keeping the subprocess in one container. The Phase 0 spike only validated same-host `Popen`.
- Run one training job at a time (§5.5) and do a reconciliation sweep on startup (§5.6). Record detect metrics under the exact keys captured in phase-0 §2.
- Validate end-to-end on the CPU dev machine with a small, manually annotated detect project.

### Phase 5: Live Training Monitoring & Control

**Goal**: A user can watch training progress live, stop or resume runs, understand failures, and browse the history of all runs
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: TRAN-05, TRAN-06, TRAN-07, TRAN-08, TRAN-11
**Success Criteria** (what must be TRUE):

  1. While a run trains, the user sees the current epoch, losses, and mAP/precision/recall update live in charts without refreshing; reloading the page mid-run restores the live view, and the extra post-training validation shows as "final validation", never as an epoch past the total
  2. User cancels a running job; it shows as cancelled within seconds, no orphaned training process remains, and a new run can start immediately (validated on the CPU path)
  3. User resumes an interrupted or cancelled run, and it continues from its last saved checkpoint instead of restarting from epoch 1
  4. User sees a history of all runs in a project with status, settings, duration, and final metrics
  5. A failing run (e.g. out of memory, invalid dataset) ends in a failed state with an understandable error message in the UI, not a silent stop

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Carried Phase 0 follow-up #5b: `on_fit_epoch_end` fires one extra time after training (re-validation of `best.pt`). Label that event as final validation.
- Carried Phase 0 finding: on Windows, `Popen.terminate()` is an immediate hard kill. For local non-Docker development, either do a graceful stop (`CREATE_NEW_PROCESS_GROUP` + `CTRL_BREAK_EVENT`, then fall back to terminate/kill) or explicitly document the limitation. Docker/Linux gets SIGTERM.
- SSE tails the per-job `progress.jsonl` (§9.3). Charts use Recharts (§11.4).
- The GPU-memory-freed-after-cancel check needs NVIDIA hardware and is tracked in Phase 12.

### Phase 6: Polygons & Segmentation Projects

**Goal**: A user can annotate `segment` projects with polygons, drawn by hand or generated with one click, and train segmentation models end-to-end
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: ANNO-04, ANNO-05, ANNO-11
**Success Criteria** (what must be TRUE):

  1. In a segment project, the user draws a polygon vertex by vertex, closes it, edits it by adding, moving, and deleting vertices, and assigns a class
  2. User clicks an object with the click-to-segment tool and, within a few seconds on the CPU dev machine, gets an auto-generated polygon (segment project) or box (detect project) that can be edited like a hand-drawn shape
  3. Tools follow the project task type: a detect project stores boxes; a segment project stores polygons and converts a drawn box into a 4-point polygon; the server refuses geometry that violates the project's task type
  4. A segment project annotated in the UI trains end-to-end, and its live charts show mask metrics, using exact keys captured from this first real segment run

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Research flag: prior research does not cover click-to-segment. Research the SAM variant (Ultralytics SAM/SAM2/MobileSAM/FastSAM), CPU latency, where inference runs, and weight download before planning.
- Carried Phase 0 follow-up #3: capture `trainer.metrics` keys for a segment run (mask `(M)` keys) and lock them into the progress schema. This needs a genuinely polygon-labeled test dataset, because `example_ready_dataset/` is detect-format.
- Use Ultralytics `segments2boxes` for polygon → box. Convert box → polygon at write time (§7.4).

### Phase 7: Model Library

**Goal**: A user can bring their own `.pt` models, manage all models in one place, and quickly try any model on a test image
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: MODL-02, MODL-05, MODL-06, MODL-07
**Success Criteria** (what must be TRUE):

  1. User uploads an existing `.pt` (e.g. `trained_models/best.pt`) and sees its detected task type and class names; the upload screen warns that `.pt` files can execute code and must come from a trusted source
  2. User renames and deletes registered models, and must confirm before a delete
  3. An attempt to use a model whose task type does not match the project as a training base, whether in the UI or via the API, is refused with a clear message naming both task types
  4. User uploads a test image to any registered model and sees its predictions (boxes or masks with class names and confidences) drawn on the image

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Security (§8.6, §15): `.pt` files are pickle-based. Treat them as trusted-user input only, document the risk, stream uploads, and enforce size limits.
- Resolve each model's task type when it is registered (the equivalent of Ultralytics' `guess_model_task`) and store it in the DB (§8.4).
- Phase 8 reuses the predict pipeline built here.

### Phase 8: AI-Assisted Annotation

**Goal**: A user can have a chosen model propose annotations on the current image and quickly accept, fix, or reject them, matching the owner's Roboflow-style AI workflow
**Mode:** mvp
**Depends on**: Phase 6, Phase 7
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05
**Success Criteria** (what must be TRUE):

  1. User picks the model that powers AI assist in a project, and only models compatible with the project's task type and classes are offered (e.g. an uploaded `best.pt` for a `car`/`license-plate` detect project)
  2. In the editor, the user selects a class and clicks "AI" to get proposed shapes for that class on the current image within seconds, or runs AI for all classes at once
  3. Proposals look visibly different from confirmed annotations; the user accepts, edits, or rejects each one or accepts all, and unaccepted proposals are never saved as annotations, trained on, or exported
  4. User changes the confidence threshold, and re-running AI shows correspondingly more or fewer proposals
  5. User completes the iterative loop by hand: annotate a subset, train, set the new model as the AI-assist model, and pre-annotate the remaining images one by one

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Proposal geometry (`boxes.xywhn` / `masks.xyn`) goes through the Phase 6 task-type conversion service. Start with the Ultralytics default confidence (0.25).
- Batch pre-annotation of all unannotated images is v2 (AI-V2-01) and out of scope here.

### Phase 9: Dataset Import & Export

**Goal**: A user can bring existing YOLO datasets and on-disk image folders into a project, see label problems up front, and take the annotated dataset out as a trainable YOLO zip
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: DATA-02, DATA-03, DATA-04, DATA-07, DEPL-04
**Success Criteria** (what must be TRUE):

  1. User imports `example_ready_dataset/` (as a zip upload or from a mounted folder) into a detect project and gets all 311 images with their labels, the `car`/`license-plate` classes, and the 218/62/31 train/valid/test split intact
  2. Before an import is committed, the user sees a validation report; the dataset's stray polygon rows get an actionable warning explaining that a `detect` project collapses them to boxes, while a `segment` project would fail training
  3. User sets host dataset and model folders in `.env` and restarts with `docker compose up`; they add images from the mounted dataset folder to a project and register a `.pt` from the mounted models folder without uploading. Mounts are read-only by default, and paths outside them are rejected
  4. User exports a project as a YOLO-format zip (images, labels, `data.yaml`; background images as empty label files) that trains directly with Ultralytics with no manual fixes, and re-importing it reproduces the same annotations, classes, and splits

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Handle `data.yaml` variations: relative/absolute split paths, optional `test:`, and the `path:` root key (§6.1). Map source `names:` to project classes with an explicit confirmation step (§6.3).
- The mixed-row detection comes from phase-0 §3 (the example dataset has 2/2/4 polygon rows in train/valid/test).
- Mount safety (§5.7, §15): read-only by default, named subfolders only, path-traversal checks.
- Export reuses the dataset materialization built for training snapshots in Phase 4.

### Phase 10: Tags, Filters & Dataset Statistics

**Goal**: A user can organize and inspect a growing dataset: tag images, find exactly the images they need, and see how balanced the dataset is
**Mode:** mvp
**Depends on**: Phase 9
**Requirements**: PROJ-04, PROJ-05, DATA-06
**Success Criteria** (what must be TRUE):

  1. User creates tags (e.g. `night`, `rain`) and assigns or removes them on a single image or on a multi-selection in the grid
  2. User filters the image grid by any combination of tag, class, split, and annotation status, and the grid stays responsive on projects with thousands of images
  3. User sees dataset statistics: image counts per split and per annotation status, and object counts per class
  4. Tags never appear in exported label files, `data.yaml`, or training snapshots

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Tags are workflow metadata only and are kept distinct from classes (§7.1, §16 row 7).

### Phase 11: Training Tuning & Evaluation

**Goal**: A user can tune training with advanced hyperparameters and tell which run produced the best model from detailed validation results and side-by-side comparison
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: TRAN-02, TRAN-09, TRAN-10
**Success Criteria** (what must be TRUE):

  1. User expands an "Advanced" section in the training form to set lr0/lrf, patience, optimizer, augmentation parameters, and similar hyperparameters, each pre-filled with its default; invalid values are rejected before the run starts
  2. After a run completes, the user sees its validation results: per-class precision/recall/mAP, the confusion matrix, and PR curves
  3. User selects several runs and compares their settings and final metrics side by side, with differing settings highlighted

**Plans**: TBD
**UI hint**: yes
**Notes**:

- The configuration surface tiers (user-facing / advanced / system-managed) follow `docs/roadmap.md` §9.4, which is derived from `config/config.ini`.

### Phase 12: GPU Acceleration & Hardware Diagnostics

**Goal**: Users with an NVIDIA GPU get GPU-accelerated training from a GPU variant of the service, and every user can see what compute hardware the service detects
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: DEPL-02, DEPL-05
**Success Criteria** (what must be TRUE):

  1. A diagnostics page shows the available compute devices (CPU, plus GPU name, VRAM, and CUDA status when a GPU is present), and on the CPU-only dev machine it reports "no GPU" cleanly without errors
  2. On a host with an NVIDIA GPU and the NVIDIA Container Toolkit, the user starts the GPU variant with the documented command, the diagnostics page lists the GPU, and a training run executes on it. This is validated on real NVIDIA hardware, because the dev machine has none
  3. On that GPU host, cancelling a running training job frees its GPU memory (confirmed with `nvidia-smi` before and after)
  4. The README documents GPU prerequisites and the supported host tiers (native Linux + NVIDIA; Windows/WSL2 + NVIDIA, best-effort; CPU-only including macOS), so a new user can pick the right variant

**Plans**: TBD
**UI hint**: yes
**Notes**:

- Hardware-gated: criteria 2-3 need a separate NVIDIA host. This phase depends only on Phase 5, so it can run whenever such hardware is available and never blocks Phases 1-11. The diagnostics page and GPU image can be built and CPU-verified on the dev machine.
- Carried Phase 0 follow-ups #1 (GPU memory freed after cancel) and #2 (Docker GPU passthrough on a GPU host).
- Build two images (cpu/gpu). The GPU image uses the CUDA build of the same PyTorch 2.14.0 release. Compose device reservation is the default mechanism, with CDI as the alternative (§5.1, §16 rows 1-2).
- The diagnostics page replaces `gpu_test.py`, which crashes on CPU-only hosts.

## Phase 0 Carried Follow-ups

| # | Follow-up (from `docs/phase-0-decisions.md`) | Phase |
|---|----------------------------------------------|-------|
| 1 | GPU-memory-freed-after-cancel check on CUDA hardware | Phase 12 |
| 2 | Docker GPU passthrough on a GPU-capable host | Phase 12 |
| 3 | Capture `trainer.metrics` keys for a `segment` run | Phase 6 |
| 4 | Amend `docs/roadmap.md` §1.7/§7.2 dataset characterization | Phase 1 |
| 5a | Recursive tensor→JSON progress serialization in `train_worker.py` | Phase 4 |
| 5b | Label the extra post-training `on_fit_epoch_end` event as final validation | Phase 5 |
| - | Windows `Popen.terminate()` hard-kill nuance on cancel | Phase 5 |

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. Phase 12 is hardware-gated and depends only on Phase 5, so it can run earlier whenever an NVIDIA host is available.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Runnable Skeleton & Projects | 0/10 | Planned | - |
| 2. Image Upload & Classes | 0/TBD | Not started | - |
| 3. Box Annotation Editor | 0/TBD | Not started | - |
| 4. Train & Download | 0/TBD | Not started | - |
| 5. Live Training Monitoring & Control | 0/TBD | Not started | - |
| 6. Polygons & Segmentation Projects | 0/TBD | Not started | - |
| 7. Model Library | 0/TBD | Not started | - |
| 8. AI-Assisted Annotation | 0/TBD | Not started | - |
| 9. Dataset Import & Export | 0/TBD | Not started | - |
| 10. Tags, Filters & Dataset Statistics | 0/TBD | Not started | - |
| 11. Training Tuning & Evaluation | 0/TBD | Not started | - |
| 12. GPU Acceleration & Hardware Diagnostics | 0/TBD | Not started | - |
