# Requirements: YOLO Trainer Platform

**Defined:** 2026-09-24
**Core Value:** The full loop works end-to-end in the browser: upload images → annotate → train with configurable settings → download a working `.pt`.

Detailed technical background for every category: `docs/roadmap.md`, `docs/phase-0-decisions.md`, `.planning/research/webapp-platform/`.

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: Developer can set up the project from a fresh clone with pinned dependencies (Python 3.12, PyTorch 2.14.0, Ultralytics 8.4.159) by following the README, with no manual guessing
- [ ] **FOUND-02**: Duplicated helpers from `train_yolo.py` / `finetune_yolo.py` (device parsing, quality assessment) live in one shared module with unit tests (pytest configured)
- [ ] **FOUND-03**: Generated artifacts (`*.pt`, `runs/`, datasets, app data) are git-ignored so a training run leaves `git status` clean

### Deployment

- [ ] **DEPL-01**: User can start the whole service with a single `docker compose up` on a CPU-only host (Windows, Linux, macOS)
- [ ] **DEPL-02**: User with an NVIDIA GPU can start a GPU variant that trains on the GPU (validated on real NVIDIA hardware, not the dev machine)
- [ ] **DEPL-03**: User's data (database, images, models, training runs) persists across container restarts and upgrades
- [ ] **DEPL-04**: User can configure host folders (datasets, models) mounted into the service via a documented `.env` / compose setting
- [ ] **DEPL-05**: User can see which compute devices are available (CPU / GPU name, VRAM, CUDA status) on a diagnostics page

### Projects

- [ ] **PROJ-01**: User can create a project with a name and a fixed task type (`detect` or `segment`)
- [ ] **PROJ-02**: User can list, open, rename, and delete projects
- [ ] **PROJ-03**: User can create, rename, recolor, and delete classes in a project
- [ ] **PROJ-04**: User can create tags and assign/remove them on images; tags are never written into exported label files
- [ ] **PROJ-05**: User can filter the image list by tag, class, split, and annotation status

### Dataset

- [ ] **DATA-01**: User can upload images into a project from the browser (multiple files / folder, drag & drop)
- [ ] **DATA-02**: User can import an existing YOLO-format dataset (images + labels + `data.yaml`, e.g. a Roboflow export) including classes and splits
- [ ] **DATA-03**: User can add images from a folder on disk mounted into the container without uploading through the browser
- [ ] **DATA-04**: On import, user sees a validation report; mixed box/polygon label rows are surfaced as an actionable warning explaining what happens under `detect` vs `segment`
- [ ] **DATA-05**: User can assign images to train/valid/test manually and run a user-confirmed automatic split by ratio
- [ ] **DATA-06**: User can see dataset statistics: image counts per split/status and object counts per class
- [ ] **DATA-07**: User can export the project's dataset as a YOLO-format zip (images, labels, `data.yaml`) that trains directly with Ultralytics

### Annotation

- [ ] **ANNO-01**: User can browse project images in a virtualized thumbnail grid that stays responsive with thousands of images
- [ ] **ANNO-02**: User can open an image in an annotation editor with zoom/pan and navigate to next/previous image
- [ ] **ANNO-03**: User can draw, select, move, resize, and delete bounding boxes and assign a class to each
- [ ] **ANNO-04**: User can draw polygons and edit them (add, move, delete vertices), and assign a class to each
- [ ] **ANNO-05**: User can click on an object to get an auto-generated polygon/box (click-to-segment, SAM-style) as a drawing tool
- [ ] **ANNO-06**: User can change an existing annotation's class
- [ ] **ANNO-07**: Annotations are saved automatically and survive a page reload; user can undo/redo edits
- [ ] **ANNO-08**: User can use keyboard shortcuts for tools, class selection, save, and next/previous image
- [ ] **ANNO-09**: Each image has a status (unannotated / annotated / reviewed); user can jump to the next unannotated image
- [ ] **ANNO-10**: User can mark an image as background (no objects), exported as an empty label file
- [ ] **ANNO-11**: Annotation tools respect the project task type (a `detect` project stores boxes; a `segment` project stores polygons, with boxes convertible)

### AI-Assisted Annotation

- [ ] **AI-01**: User can choose which model (trained in the service or uploaded) powers AI assist in a project, limited to models compatible with the project task type and classes
- [ ] **AI-02**: User can select a class and click "AI" on the current image to get proposed shapes for that class from the chosen model
- [ ] **AI-03**: AI proposals are visually distinct from confirmed annotations; user can accept, edit, or reject each (and accept all)
- [ ] **AI-04**: User can set the confidence threshold used for AI proposals
- [ ] **AI-05**: User can run AI assist for all classes at once on the current image

### Models

- [ ] **MODL-01**: User can choose an official Ultralytics pretrained model (detect/segment, multiple sizes) as a training base; weights download automatically on first use
- [ ] **MODL-02**: User can upload their own `.pt` file (e.g. existing `trained_models/best.pt`); its task type and class names are read and shown
- [ ] **MODL-03**: Models produced by training are registered automatically with their metrics, classes, task type, and source run
- [ ] **MODL-04**: User can download any registered model's `.pt`
- [ ] **MODL-05**: The service prevents using a model whose task type doesn't match the project (for training base or AI assist) with a clear message
- [ ] **MODL-06**: User can rename and delete registered models
- [ ] **MODL-07**: User can upload a test image to any model and see its predictions drawn on the image

### Training

- [ ] **TRAN-01**: User can start training for a project from the browser, choosing a base model and basic settings (epochs, image size, batch, device)
- [ ] **TRAN-02**: User can open an "Advanced" section to set further hyperparameters (lr0/lrf, patience, optimizer, augmentation parameters, etc.) with sensible defaults shown
- [ ] **TRAN-03**: Each training run records a snapshot of the dataset state and settings it used, so it's reproducible
- [ ] **TRAN-04**: Training runs in the background; the UI stays responsive and the job keeps running if the browser is closed
- [ ] **TRAN-05**: User sees live progress: current epoch, losses, and mAP metrics with charts updating in real time (final-validation event labeled correctly)
- [ ] **TRAN-06**: User can cancel a running training job; the process stops cleanly and frees resources
- [ ] **TRAN-07**: User can resume an interrupted/cancelled training run from its last checkpoint
- [ ] **TRAN-08**: User can see a history of training runs with status, settings, duration, and final metrics
- [ ] **TRAN-09**: After training, user sees validation results: per-class metrics, confusion matrix, PR curves
- [ ] **TRAN-10**: User can compare metrics and settings of several training runs side by side
- [ ] **TRAN-11**: Training failures (e.g. out-of-memory, invalid dataset) are shown to the user with an understandable error, not a silent stop

## v2 Requirements

Deferred to a future release. Tracked but not in current roadmap.

### AI-Assisted Annotation

- **AI-V2-01**: User can batch pre-annotate all unannotated images with a model and review proposals image by image (iterative loop at scale)

### Annotation

- **ANNO-V2-01**: User can copy annotations from the previous image
- **ANNO-V2-02**: OBB (oriented bounding box) project task type and rotated-box tool

### Dataset

- **DATA-V2-01**: Full Roboflow-style dataset versions with offline preprocessing and augmentation

### Collaboration

- **COLB-V2-01**: Multiple user accounts with login on one installation
- **COLB-V2-02**: PostgreSQL deployment option for small teams

### Models

- **MODL-V2-01**: Export trained models to ONNX / other formats

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Open-vocabulary / text-prompted detection (YOLO-World, Grounding DINO) | AI assist is based on the user's own trained models |
| Kubernetes, multi-node, distributed training | Single-server self-hosted scale only |
| Redis/Celery job queue | Subprocess + DB tracking is right-sized for v1 (validated in Phase 0) |
| Hosted SaaS offering | Self-hosted tool only |
| Non-NVIDIA GPU acceleration (AMD ROCm, Apple MPS in Docker) | CPU fallback covers these hosts |
| Video annotation / frame extraction | Image datasets only |
| Classification and pose task types | Not needed by the downstream project |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| DEPL-01 | Phase 1 | Pending |
| DEPL-02 | Phase 12 | Pending |
| DEPL-03 | Phase 1 | Pending |
| DEPL-04 | Phase 9 | Pending |
| DEPL-05 | Phase 12 | Pending |
| PROJ-01 | Phase 1 | Pending |
| PROJ-02 | Phase 1 | Pending |
| PROJ-03 | Phase 2 | Pending |
| PROJ-04 | Phase 10 | Pending |
| PROJ-05 | Phase 10 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 9 | Pending |
| DATA-03 | Phase 9 | Pending |
| DATA-04 | Phase 9 | Pending |
| DATA-05 | Phase 4 | Pending |
| DATA-06 | Phase 10 | Pending |
| DATA-07 | Phase 9 | Pending |
| ANNO-01 | Phase 2 | Pending |
| ANNO-02 | Phase 3 | Pending |
| ANNO-03 | Phase 3 | Pending |
| ANNO-04 | Phase 6 | Pending |
| ANNO-05 | Phase 6 | Pending |
| ANNO-06 | Phase 3 | Pending |
| ANNO-07 | Phase 3 | Pending |
| ANNO-08 | Phase 3 | Pending |
| ANNO-09 | Phase 3 | Pending |
| ANNO-10 | Phase 3 | Pending |
| ANNO-11 | Phase 6 | Pending |
| AI-01 | Phase 8 | Pending |
| AI-02 | Phase 8 | Pending |
| AI-03 | Phase 8 | Pending |
| AI-04 | Phase 8 | Pending |
| AI-05 | Phase 8 | Pending |
| MODL-01 | Phase 4 | Pending |
| MODL-02 | Phase 7 | Pending |
| MODL-03 | Phase 4 | Pending |
| MODL-04 | Phase 4 | Pending |
| MODL-05 | Phase 7 | Pending |
| MODL-06 | Phase 7 | Pending |
| MODL-07 | Phase 7 | Pending |
| TRAN-01 | Phase 4 | Pending |
| TRAN-02 | Phase 11 | Pending |
| TRAN-03 | Phase 4 | Pending |
| TRAN-04 | Phase 4 | Pending |
| TRAN-05 | Phase 5 | Pending |
| TRAN-06 | Phase 5 | Pending |
| TRAN-07 | Phase 5 | Pending |
| TRAN-08 | Phase 5 | Pending |
| TRAN-09 | Phase 11 | Pending |
| TRAN-10 | Phase 11 | Pending |
| TRAN-11 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-24*
*Last updated: 2026-09-24 after roadmap creation (traceability mapped)*
