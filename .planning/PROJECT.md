# YOLO Trainer Platform

## What This Is

A self-hosted, Dockerized web service for annotating image datasets and training Ultralytics YOLO models on them — a local replacement for the owner's current Roboflow annotation + training workflow. The user creates a project, uploads/imports images, defines classes (labels such as `car`, `plane`), annotates images one by one with manual tools (box, polygon, click-to-segment) or AI assistance from a previously trained model, then fine-tunes a pretrained model with configurable training settings and downloads the resulting `.pt`. The trained `.pt` files are consumed by the owner's separate downstream project (which today uses `trained_models/best.pt`). It must be universal: anyone should be able to run it on their own machine via Docker, with NVIDIA GPU acceleration when available and CPU fallback otherwise.

## Core Value

The full loop works end-to-end in the browser: **upload images → annotate them → train with configurable settings → download a working `.pt`** that the downstream project can load. AI-assisted annotation is the next priority once this loop works.

## Requirements

### Validated

<!-- Inferred from the existing codebase (.planning/codebase/) and Phase 0 spikes. -->

- ✓ Train a YOLO model from a pretrained base on a YOLO-format dataset via CLI (`train_yolo.py`) — existing
- ✓ Fine-tune an existing `.pt` model on a new dataset and validate on the test split (`finetune_yolo.py`) — existing
- ✓ CPU/GPU device selection with CUDA availability validation and auto batch sizing — existing
- ✓ Training configuration via `config/config.ini` (epochs, imgsz, batch, lr, etc.) — existing
- ✓ Post-training quality assessment based on mAP50 — existing
- ✓ Callback-instrumented training in a subprocess with structured JSONL progress, and clean subprocess cancellation (CPU path) — Phase 0 spike
- ✓ `example_ready_dataset/` (Roboflow YOLO export, detect format) trains successfully end-to-end — Phase 0 spike

### Active

<!-- v1 scope. Hypotheses until shipped and validated. -->

**Foundation & deployment**
- [ ] Reproducible project setup with pinned dependencies (Python 3.12, PyTorch 2.14.0, Ultralytics 8.4.159) and a test framework
- [ ] Runs via `docker compose up` on Windows/Linux/macOS; CPU image works everywhere, GPU image uses NVIDIA GPU when present
- [ ] Web UI (browser SPA) backed by an API service; training runs in a separate worker process/container so the UI stays responsive

**Projects, classes, tags**
- [ ] User can create a project with a fixed task type: `detect` or `segment`
- [ ] User can create, rename, recolor, and delete classes (labels) per project
- [ ] User can tag images (e.g. `night`, `rain`) and filter the image list by tags; tags are workflow metadata, never exported into label files

**Dataset ingestion & export**
- [ ] User can upload images via browser (files / folder, drag & drop)
- [ ] User can import an existing YOLO-format dataset (e.g. a Roboflow export like `example_ready_dataset/`) including its labels and splits
- [ ] User can point a project at a folder on disk (mounted into Docker) without uploading through the browser
- [ ] Import validates label format and surfaces mixed box/polygon rows as an actionable warning (Phase 0 finding)
- [ ] User can manage train/valid/test splits, with an explicit user-confirmed auto-split option
- [ ] User can export the annotated dataset as a YOLO-format zip

**Manual annotation**
- [ ] User can browse images in a grid and open them one by one in an annotation canvas
- [ ] User can draw, move, resize, and delete bounding boxes
- [ ] User can draw and edit polygons (vertex add/move/delete)
- [ ] User can click on an object to get an auto-generated polygon (click-to-segment, e.g. SAM) as a drawing tool
- [ ] Annotations save reliably, with undo/redo and keyboard shortcuts

**AI-assisted annotation**
- [ ] User selects a class and clicks "AI" on the current image; a chosen model (previously trained in the service or uploaded `.pt`) detects that class and proposes shapes
- [ ] User reviews each AI proposal and accepts, edits, or rejects it
- [ ] Optional iterative loop: annotate a subset → train → use that model to pre-annotate the rest → retrain

**Models**
- [ ] User can pick an official Ultralytics pretrained model (e.g. yolo11n/s/m, yolo26n) as a training base, auto-downloaded
- [ ] User can upload their own `.pt` (e.g. existing `trained_models/best.pt`)
- [ ] Models trained in the service are registered automatically and reusable for further fine-tuning and AI annotation
- [ ] Model task type is validated against project task type
- [ ] User can download any trained `.pt`

**Training**
- [ ] User can start training from the browser with basic settings (base model, epochs, image size, batch, device) plus an "Advanced" section (lr0/lrf, patience, optimizer, augmentations, etc.)
- [ ] User sees live progress (epoch, losses, mAP) with charts while training runs
- [ ] User can cancel a running training job cleanly
- [ ] Training history persists: past runs, their settings, final metrics, and resulting model
- [ ] User can see which device (CPU/GPU) is available and used

### Out of Scope

- Multi-user accounts, authentication, collaborative annotation — v1 is single-operator per installation (Phase 0 decision); architecture must not preclude it later
- OBB (oriented bounding box) task type — deferred to after v1; detect + segment cover current needs
- Open-vocabulary / text-prompted detection (YOLO-World, Grounding DINO) — AI assist uses the user's own trained models instead
- Kubernetes, multi-node, distributed training, Redis/Celery job queue — single-server self-hosted scale only
- ONNX/TensorRT and other export formats for models — `.pt` is the required output; exports are a possible future extension
- Hosted/cloud SaaS offering — self-hosted only
- Non-NVIDIA GPU acceleration (AMD ROCm, Apple MPS inside Docker) — CPU fallback covers these hosts in v1

## Context

- **Existing code:** Two CLI training scripts (`train_yolo.py`, `finetune_yolo.py`) with duplicated helpers, INI config, `gpu_test.py`. No dependency manifest, no tests, binaries (`*.pt`, `runs/`) historically committed. Full map in `.planning/codebase/`.
- **Prior research & roadmap:** `docs/roadmap.md` (17-phase roadmap, target architecture, open decisions) and `.planning/research/webapp-platform/` (Docker/GPU, backend, frontend/annotation UI, YOLO format & API). These remain the detailed technical reference.
- **Phase 0 (validation spikes) is complete** — see `docs/phase-0-decisions.md`. Key findings: version pins decided; exact `trainer.metrics` keys for detect captured; `on_fit_epoch_end` fires one extra time after training (final validation); progress serialization must recurse into nested dicts; `example_ready_dataset/` is detect-format with a few stray polygon rows (not segmentation); `Popen.terminate()` on Windows is a hard kill.
- **Dev machine:** Windows 11, AMD Ryzen 7 5700U, no NVIDIA GPU, Docker 29.7.2 installed. The CPU path is developed and validated here; the GPU path must be validated on separate NVIDIA hardware.
- **Current workflow being replaced:** Roboflow — project → upload images → create classes → annotate one by one (box/polygon/AI-assist with review) → train → get model.
- **Downstream consumer:** a separate project of the owner that loads the trained `.pt` (currently `trained_models/best.pt`).

## Constraints

- **Tech stack**: Python 3.12 + Ultralytics 8.4.159 + PyTorch 2.14.0 — pinned in Phase 0; re-verify at implementation time
- **Tech stack**: FastAPI + SQLAlchemy/Alembic + SQLite (WAL) backend; React + Vite SPA frontend (react-konva canvas) — per research; Postgres-ready data layer
- **Deployment**: Docker Compose, separate CPU and GPU images; GPU via NVIDIA Container Toolkit — must also run on CPU-only hosts
- **Job execution**: training/inference as subprocesses tracked in DB, progress via Ultralytics callbacks → JSONL → SSE; no Redis/Celery in v1
- **Data model**: one task type per project (Ultralytics hard constraint); classes and tags are distinct concepts
- **Hardware**: no NVIDIA GPU on the dev machine — GPU-path acceptance requires testing on other hardware
- **Security**: uploaded `.pt` files are pickle-based and can execute code — treat as trusted-user input only, document the risk; mounted paths must be validated

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single-operator per install, no auth in v1 | Owner's primary use is personal; others install their own copy | ✓ Good (Phase 0) |
| SQLite for v1 with Postgres-ready SQLAlchemy/Alembic layer | Simple self-hosting; migration path for small teams later | — Pending |
| Docker Compose as the distribution method | Universal install for other users across OSes | — Pending |
| v1 task types: detect + segment (OBB later) | Covers box and polygon workflows the owner uses in Roboflow | — Pending |
| AI assist = user's own trained/uploaded models, not open-vocabulary | Matches owner's workflow: manually label, train, use model to label more | — Pending |
| Click-to-segment (SAM-style) is a drawing tool, not the main AI mode | Owner's clarification during initialization | — Pending |
| Per-image AI assist is primary; batch/iterative pre-annotation is optional | Owner's primary workflow is image-by-image review | — Pending |
| Training settings: basic + collapsible "Advanced" | Balance of usability and control | — Pending |
| Subprocess + DB job model, SSE progress streaming | Right-sized for single server; validated in Phase 0 spike | ✓ Good (Phase 0) |
| Existing `docs/roadmap.md` retained as detailed technical reference | Avoid losing research; GSD ROADMAP.md becomes the execution plan | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-24 after initialization*
