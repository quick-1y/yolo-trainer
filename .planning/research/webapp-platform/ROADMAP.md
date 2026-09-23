# YOLO Training & Annotation Platform — Development Roadmap

**Status:** Research and planning only. No implementation has occurred as part of this document.
**Prepared:** 2026-09-22
**Amended:** 2026-09-22 — Phase 0 spikes ran and corrected one finding in this document (§1.7/§7.2's dataset-format characterization, see the inline correction notes and `docs/phase-0-decisions.md` for full detail) and empirically resolved several open questions. This document's original text is otherwise left intact; corrections are added as visible notes rather than silently rewriting prior findings.
**Scope:** Transform `yolo-trainer` from a personal-desktop pair of training scripts into a self-hosted, Dockerized, web-based YOLO training + dataset annotation platform, with optional NVIDIA GPU acceleration and CPU fallback.

This document is grounded in:
- A direct audit of the current repository (all files read, not summarized from memory).
- A structured 7-document codebase map (`.planning/codebase/*.md`) produced by parallel mapping agents.
- Four targeted research passes with live web/source verification (not assumption), archived at `.planning/research/webapp-platform/`:
  - `DOCKER-GPU-ARCHITECTURE.md`
  - `BACKEND-ARCHITECTURE.md`
  - `FRONTEND-ANNOTATION-UI.md`
  - `YOLO-FORMAT-AND-API.md`

Every claim below is either (a) verified directly against this repository's files, (b) verified against live upstream source/docs during research, or (c) explicitly marked as an open question / product decision that could not be resolved by research alone. Nothing here should be read as "already decided" unless it says so.

---

## 1. Current Project Audit

### 1.1 Repository inventory (as of 2026-09-22)

```
yolo-trainer/
├── README.md                    # "# yolo-trainer-v0.1" — one line, no content
├── config/
│   └── config.ini                # [Train] and [Finetune] sections
├── train_yolo.py                 # Train-from-pretrained entry point
├── finetune_yolo.py               # Fine-tune-from-local-checkpoint entry point
├── gpu_test.py                    # 2-line CUDA availability smoke test
├── yolov8n.pt                     # Pretrained checkpoint, committed to git (6.5MB)
├── yolo26n.pt                     # Pretrained checkpoint, committed to git (5.5MB)
├── trained_models/
│   └── best.pt                    # A previously trained model, committed to git
├── runs/
│   └── detect/
│       ├── runs/train/            # Nested/inconsistent output path (see 1.4)
│       └── val/                   # Validation plots (PNG), committed to git
└── example_ready_dataset/         # Roboflow-exported dataset, committed to git (18MB)
    ├── data.yaml
    ├── README.dataset.txt
    ├── README.roboflow.txt
    ├── train/{images,labels}/     # 218 images, 218 label files
    ├── valid/{images,labels}/     # 62 images, 62 label files
    └── test/{images,labels}/      # 31 images, 31 label files
```

No `requirements.txt`, `pyproject.toml`, `Pipfile`, or `environment.yml` exists anywhere in the repo. No `.gitignore` exists. No Docker files exist. No test files exist. No CI configuration exists.

### 1.2 Python version and dependencies

- No dependency manifest exists. The three imports used across the codebase are `ultralytics`, `torch`, `configparser` (stdlib), `os`/`logging`/`datetime` (stdlib), and `rich` (console formatting).
- No version pins exist anywhere for `ultralytics`, `torch`, or `rich`. Whatever the developer has installed locally is the only "spec." This is a genuine reproducibility gap — a fresh clone has no way to know what versions were used to produce `trained_models/best.pt`.
- This machine's system Python is 3.14.7, but `torch`/`ultralytics`/`rich` are **not installed** in the environment this audit ran in — confirming training actually happens on a different machine (see 1.4, the hardcoded `D:/Users/qu1ck1y/Desktop/...` paths point to a separate Windows desktop, not this repo's checkout location).
- Research finding (Section 5 of Docker research, verified against live PyPI/GitHub metadata): current PyTorch requires Python ≥3.10 and supports through 3.14; Ultralytics currently supports Python 3.8 through 3.13, with no 3.14 classifier yet. **The safe intersection is Python 3.10–3.13, with 3.11 or 3.12 recommended** as the pinned version for any new Docker base image — this repo's ambient 3.14 is outside Ultralytics' currently-declared support and must not be assumed compatible.

### 1.3 Current YOLO/Ultralytics implementation

Two independent, near-duplicate scripts, each a flat procedural function reading one `config.ini` section and calling the Ultralytics Python API directly:

- **`train_yolo.py`** — loads a *pretrained* checkpoint (`YOLO(config["name_model"])`, e.g. `yolov8n.pt`) and calls `model.train(...)`. Computes batch size via a custom `auto_batch(imgsz, gpu_vram=12)` heuristic (hardcoded 12GB VRAM assumption — does not query actual hardware). After training, calls `model.val()` and prints a Rich-formatted metrics table using the **deprecated-risk** `metrics.mean_results()` tuple-unpacking pattern (`precision, recall, map50, map95 = metrics.mean_results()`) — this API surface should be re-verified against the pinned Ultralytics version before this project depends on it further (not independently re-verified in this research pass; flagged as an open item, see §16).
- **`finetune_yolo.py`** — loads a *previously trained local checkpoint* (`YOLO(config["base_model_path"])`, e.g. `trained_models/best.pt`), explicitly sets `pretrained=False, resume=False` to avoid re-downloading/re-starting, and exposes more granular hyperparameters (`lr0`, `lrf`, `warmup_epochs`, `close_mosaic`, `single_cls`, `save_period`) than `train_yolo.py`. Validates against the `test` split specifically (`model.val(data=yaml_path, split="test")`), whereas `train_yolo.py` validates against the default (train script's own held-out val, per `data.yaml`'s `val:` key).
- Both scripts duplicate: `parse_device()`, `quality_assessment()`, the Rich console setup, the metrics-table rendering, and the overall control flow. This is a direct, fixable code-duplication debt (already flagged independently by the architecture-focus codebase mapper).
- **Device/GPU handling is unconditional and un-configurable at the point that matters**: both scripts check `torch.cuda.is_available()` and *only* consult `config["device"]` if a GPU is present; if no GPU is present, `device_value = "cpu"` regardless of what's in `config.ini`. This means the *existing* scripts already have a form of automatic GPU/CPU fallback baked in — it is not something the web platform needs to invent from scratch, only formalize, expose in the UI, and make robust (currently, on a CUDA-available machine, `parse_device()` never validates that the requested device index actually exists — a `device = 1` on a single-GPU box would fail inside Ultralytics with an unfriendly error, not a friendly one from this code).

### 1.4 Fine-tuning implementation

Covered above (1.3). Notable: `finetune_yolo.py` hardcodes `config["dataset_path"]` to a **different** absolute Windows path (`D:/Users/qu1ck1y/Desktop/yolo_dataset`, no `_sq` suffix) than `train_yolo.py`'s dataset path (`D:/Users/qu1ck1y/Desktop/yolo_dataset_sq`) — these are two entirely different datasets on the developer's personal machine, neither of which exists in this repository. The `example_ready_dataset/` included in the repo (see 1.7) is **not** what either script currently points at; it was added specifically for this audit/roadmap effort per the request, and represents the *shape* of dataset the platform must support, not a dataset either script has actually been run against.

### 1.5 GPU testing functionality

`gpu_test.py` is 2 lines: `print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))`. This is fragile in a way that matters for the platform's stated CPU-fallback requirement: `torch.cuda.get_device_name(0)` **raises an exception** (not a friendly `False`/`None`) if no CUDA device exists, meaning this exact script would crash on a CPU-only machine — the opposite of the graceful diagnostics the target platform needs. This is existing, real, reproducible fragility (already flagged by the concerns-focus codebase mapper), not a hypothetical risk.

### 1.6 CPU/GPU detection, model loading, dataset loading — current state

- **Detection:** `torch.cuda.is_available()`, called independently in each script (no shared module). Confirmed by research (Docker research §3) to be the correct, idiomatic detection mechanism — the existing scripts already do the right thing here, just without centralization, error handling, or reasoning about the case where the toolkit is present but a specific device index isn't.
- **Model loading:** `YOLO(<path-or-name>)` — Ultralytics resolves this either to a bundled pretrained name (auto-downloads) or a local `.pt` path. No validation that the file exists before attempting a load (only `finetune_yolo.py` checks `os.path.exists(base_model_path)` and raises a friendly `FileNotFoundError`; `train_yolo.py` has no equivalent check and would surface whatever raw error Ultralytics/PyTorch produces).
- **Dataset loading:** Both scripts assume `os.path.join(config["dataset_path"], "data.yaml")` exists and is a valid Ultralytics dataset YAML. No validation of dataset structure, split completeness, or label file integrity happens in this codebase — Ultralytics' own loader (`YOLODataset`) does that validation internally at training time, and any failure surfaces as an Ultralytics-level exception, not a friendly application-level message.

### 1.7 The included example dataset — ground truth for dataset format work

`example_ready_dataset/` (confirmed by direct inspection, not assumption):

- **Structure:** Standard Ultralytics YOLO layout — `{train,valid,test}/{images,labels}/` plus a root `data.yaml`. 218/62/31 image-label pairs respectively (311 total, matching the Roboflow export README's stated count).
- **`data.yaml` contents:** `nc: 2`, `names: ['car', 'license-plate']`, relative split paths (`../train/images` etc.), plus a `roboflow:` metadata block (workspace/project/version/license/url) — this metadata block is Roboflow-specific and not required by Ultralytics, but is useful provenance to preserve if the platform ever re-exports or re-imports this exact dataset.
- **Label format — critical finding, verified against live Ultralytics source, not assumed:** one manually inspected label line is `<class-index> <x1> <y1> <x2> <y2> ... <xn> <yn>` — **normalized polygon coordinates (YOLO segmentation format)**, not the simpler 5-value `<class-index> <x_center> <y_center> <width> <height>` detection format. One inspected line has 83 polygon points (166 coordinate values) for a single `car` instance. This directly and concretely answers one of the open questions in the original brief (§12 "whether standard YOLO detection labels support arbitrary polygons"): **they do not** — polygon annotation requires the distinct segmentation label format and (per YOLO-FORMAT-AND-API.md §1) a segmentation-task model checkpoint and dataset-wide consistency. See §7 and §9 below for the full implications.
  > **⚠ CORRECTED by Phase 0 (2026-09-22), see `docs/phase-0-decisions.md` §3:** this single-file manual inspection was **not representative of the dataset as a whole**. A full programmatic scan of every label file, prompted by an actual `segment`-task training run failing with `ValueError: Segment dataset requires equal numbers of boxes and segments, but got len(segments) = 2, len(boxes) = 280`, found the dataset is **overwhelmingly detection-format**: 278/280 train objects, 71/73 valid, 36/40 test are plain 5-value box rows. Only a handful of stray polygon rows exist, confined to one or two files per split. Treat `example_ready_dataset/` as a **detect-task example with a few inconsistent stray rows**, not a segmentation-format dataset — the stray rows are themselves a valuable, realistic example of the import-time normalization problem §6.2/§9 already designs around, just not evidence that this dataset is segmentation-labeled.
- **Provenance:** Exported from Roboflow (`russian-car-license-plates`, v3, Public Domain), pre-processed with auto-orientation and resize-to-640×640 (stretch), no augmentation applied.
- **Size on disk:** 18MB. Currently committed directly to git (see 1.9) — acceptable for a small example fixture, but establishes a pattern (committing dataset binaries to git) that must **not** continue once real user datasets enter the picture.

### 1.8 Configuration system (`config/config.ini`)

Full contents audited directly:

```ini
[Train]
dataset_path = D:/Users/qu1ck1y/Desktop/yolo_dataset_sq
name_model = yolov8n.pt
pretrained = True
project = runs/train
name = plate_exp
epochs = 120
imgsz = 960
device = 0
workers = 8
optimizer = SGD
close_mosaic = 10
single_cls = True
amp = True
dropout = 0.0
lr0 = 0.01
lrf = 0.01
warmup_epochs = 3
augment = True
save_period = 10
verbose = True

[Finetune]
base_model_path = trained_models/best.pt
dataset_path = D:/Users/qu1ck1y/Desktop/yolo_dataset
project = runs/finetune
name = plate_square_exp
epochs = 60
imgsz = 960
batch = 16
device = 0
workers = 8
optimizer = SGD
single_cls = True
amp = True
lr0 = 0.001
lrf = 0.001
warmup_epochs = 2
close_mosaic = 5
augment = True
save_period = 10
verbose = True
```

Observations that directly inform §21 (Configuration Architecture) and §5.3 of the platform's training-config UI:
- Every one of these ~20 keys is a real, currently-used Ultralytics `model.train()` parameter (cross-referenced against the YOLO-FORMAT-AND-API research and Ultralytics' own train-mode parameter surface) — none are dead/unused, so **none should be dropped**, only reorganized into user-facing vs. advanced tiers (see §5.3, §21).
- `[Train]` and `[Finetune]` have divergent parameter sets (`[Train]` has `pretrained`/`dropout`, lacks `batch`/explicit `lr0`/`lrf`/`warmup_epochs`; `[Finetune]` has the reverse) — this is not an oversight so much as two different, hand-tuned recipes for two different use cases (train-from-scratch-ish vs. fine-tune-from-checkpoint) that happen to share ~14 keys. The platform's job-config schema should model "shared training parameters" and "mode-specific parameters" as distinct groups, mirroring this real usage rather than forcing one flat schema.
- `device = 0` is written in both sections but, per 1.3/1.6, is **only consulted if CUDA is available at all** — on a CPU-only run the value is ignored entirely by the current scripts. This is worth preserving as explicit behavior (not a bug) but should be made visible to the user in the web UI ("GPU requested via config, but none detected — falling back to CPU") rather than silently overridden as it is today.
- `single_cls = True` is set in both — meaning the current real-world usage of this codebase treats detection as single-class (`license-plate` merged with everything into one class), even though `example_ready_dataset/data.yaml` declares two classes (`car`, `license-plate`). This is a meaningful signal about actual usage vs. the more general two-class dataset now included for reference; the platform should not assume single-class usage is required going forward, but should preserve `single_cls` as an available per-job toggle.

### 1.9 How training results and trained models are stored

- `project`/`name` config values map directly to Ultralytics' own `project/name` run-directory convention (`runs/train/plate_exp/`, etc.) — Ultralytics creates this structure itself; the scripts don't manage it.
- Actual on-disk state is inconsistent with the configured convention: `runs/detect/runs/train/` exists (a nested, doubled path), alongside `runs/detect/val/` containing validation plots. This looks like leftover/manually-reorganized output from ad hoc runs, not a clean reflection of what `config.ini` currently specifies. This is a real, existing data-hygiene issue the platform's own run-storage design (§12, §22) must not inherit.
- `trained_models/best.pt` is the only "promoted" model — there is no metadata file recording which run produced it, what dataset/config were used, or what its metrics were. This is the concrete current-state gap that §17's model-management phase and §13's model-metadata design must close.
- **All of the above (both pretrained checkpoints, the trained model, and the run-output PNGs) are currently committed directly to git**, with no `.gitignore`. Combined with the 18MB example dataset, this repo's git history already contains ~40MB+ of binary artifacts that have no business being version-controlled once real usage begins — this must be corrected early (Phase 1) before it compounds.

### 1.10 Logging, error handling, CLI/UI

- **Logging:** stdlib `logging` module is used only to set the *Ultralytics* logger's level (`CRITICAL` vs `INFO` depending on `verbose`) — the application's own scripts do not log anything themselves; all user-facing output is `rich.console.Console.print()` calls (panels, tables, emoji-prefixed status lines). There is no file-based logging, no log rotation, no structured logging anywhere.
- **Error handling:** Minimal and inconsistent. `finetune_yolo.py` has one explicit check (missing base model file → friendly `FileNotFoundError` with a Rich-formatted message before raising). Everything else (missing dataset path, malformed `config.ini`, invalid device index, CUDA-but-no-such-device, corrupt checkpoint) has **no application-level handling** — errors surface as whatever raw exception Ultralytics/PyTorch/configparser happens to raise, with no friendly message, no logging, no recovery path.
- **CLI/UI:** None beyond "run the Python file directly" (`if __name__ == "__main__":` blocks with zero argparse/click/typer — the only "interface" is editing `config.ini` by hand and re-running). Console output is Rich-formatted for readability but is not queryable/programmatic (nothing writes structured JSON/CSV metrics anywhere a future UI could consume without re-parsing console text).

### 1.11 Existing tests, documentation, Docker files

- **Tests:** None. No `pytest`/`unittest` config, no test files, no CI. (Confirmed independently by the quality-focus codebase mapper.)
- **Documentation:** `README.md` is a single line (`# yolo-trainer-v0.1`) — no setup instructions, no usage docs, nothing.
- **Docker:** No `Dockerfile`, `docker-compose.yml`, `.dockerignore`, or any Docker-related file exists anywhere in the repository. The entire Docker/GPU/CPU architecture discussed in §5 is being designed from a completely blank slate — there is nothing to migrate or preserve here, only new build.

---

## 2. Existing Architecture

The current architecture is a **configuration-driven pair of standalone scripts**, not a system in the software-architecture sense:

```
config/config.ini  ──read by──▶  train_yolo.py     ──calls──▶  Ultralytics YOLO API ──produces──▶  runs/train/*, weights/*.pt
                    ──read by──▶  finetune_yolo.py  ──calls──▶  Ultralytics YOLO API ──produces──▶  runs/finetune/*, weights/*.pt

gpu_test.py  (standalone, no config, no integration with the above)
```

There are no layers, no shared modules beyond copy-pasted helper functions, no persistence beyond the filesystem paths Ultralytics itself manages, and no process boundary beyond "the Python interpreter that's running." This is an entirely appropriate architecture for its actual current purpose (one developer, one machine, occasional manual training runs) — the point of this audit section is simply to be precise about the starting line, since §4 onward describes a materially different target shape.

---

## 3. Existing Functionality — Keep / Refactor / Replace / Migrate

Per the brief's explicit instruction (§31), every existing capability is inventoried with a disposition and reasoning:

| Capability | Disposition | Reasoning |
|---|---|---|
| Train-from-pretrained (`train_yolo.py`) | **Refactor → migrate into backend training-worker module** | Logic is sound and Ultralytics-idiomatic; needs to become an importable function callable from a subprocess worker (§9) instead of a `__main__` script, and its duplicated helpers merged with `finetune_yolo.py`'s. |
| Fine-tune-from-checkpoint (`finetune_yolo.py`) | **Refactor → migrate into backend training-worker module** | Same as above. Its extra hyperparameter surface (`lr0`, `lrf`, `warmup_epochs`, `close_mosaic`) should become the "advanced" parameter tier in the unified training-job schema (§21), not a separate code path per se — "train" and "fine-tune" become the same worker function parameterized by whether a base checkpoint is pretrained-generic or a prior local run. |
| `parse_device()` | **Refactor → shared module, harden** | Correct logic, needs centralization (currently duplicated verbatim) and validation (reject/report invalid device indices instead of passing them through to Ultralytics unchecked). |
| `auto_batch()` | **Replace** | Confirmed in this audit as a rough heuristic that "ignores actual VRAM" (hardcoded `gpu_vram=12` default, never queries real hardware) — already flagged as a concern by the quality-focus mapper. Replace with either an explicit user-set batch size (matching what `finetune_yolo.py` already does) or a properly hardware-aware auto-batch using `torch.cuda.get_device_properties(0).total_memory`, not a rewrite of the current guess.
| `quality_assessment()` | **Keep, refactor location** | Simple, working threshold-based labeling (mAP50 buckets) — genuinely useful for a training-summary UI panel. Move to shared module, keep logic.
| Rich console output (tables/panels) | **Replace for the web platform, keep for any CLI entry point** | The web UI needs structured JSON progress (§9, per Ultralytics callbacks), not console text. If a CLI/admin entry point is retained for scripting, Rich output can stay there. |
| `config.ini` (as a concept) | **Refactor → become the default/seed values for a proper job-config schema**, not deleted | See §21 — every key currently in `config.ini` maps to a real Ultralytics parameter and should surface somewhere in the new job-config UI (as user-facing, advanced, or system-managed). The *file* likely stops being the runtime source of truth (replaced by DB-persisted per-job config), but its *values* become sensible defaults. |
| `gpu_test.py` | **Replace** | Its core idea (a GPU diagnostics check) is exactly what §20 needs, but its implementation crashes on CPU-only hosts — rebuild as a proper `/api/system/gpu-status` endpoint (§14) with graceful `torch.cuda.is_available()`-gated logic (§1.5, §5). |
| `yolov8n.pt`, `yolo26n.pt`, `trained_models/best.pt` committed to git | **Migrate out of git** | Move to a mounted volume / model-storage location (§12, §22); remove from version control history in a deliberate Phase 1 cleanup (see §20 Migration Strategy — this needs care, not a blind `git rm`, since it's the user's real trained model). |
| `example_ready_dataset/` committed to git | **Keep as a fixture for now, but establish the pattern that real datasets never go in git** | Useful for local dev/testing of the annotation and training UI against real, correctly-shaped data. Should move to `.gitignore`'d local fixture status once the platform can mount arbitrary host datasets (§5, §7), so it's not treated as "the" dataset going forward. |
| `runs/` directory contents (existing PNGs, nested `runs/detect/runs/train/`) | **Archive, then start clean** | Not worth reverse-engineering the inconsistent existing layout; the new platform defines its own run/storage convention (§12) and these historical artifacts can be archived (zip + remove, or simply left as-is and ignored) rather than migrated. |

---

## 4. Target Architecture

High-level target, synthesizing all research (full detail in §5–§15):

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite SPA)                                          │
│  react-konva annotation canvas · react-virtuoso image grid ·         │
│  Recharts training metrics · SSE client for live progress            │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS (REST + SSE)
┌───────────────────────────────▼────────────────────────────────────┐
│  Web/API container (FastAPI, no GPU access required)                 │
│  - CRUD: projects, classes, tags, datasets, models, annotations      │
│  - Job orchestration: spawn/track/cancel training subprocesses       │
│  - SSE endpoints: tail per-job progress files, stream to browser     │
│  - Inference orchestration for auto-annotation                       │
│  - SQLAlchemy (async) + Alembic ── SQLite (WAL) or PostgreSQL         │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ subprocess.Popen (per job)
┌───────────────────────────────▼────────────────────────────────────┐
│  Training/inference container(s) (GPU access via NVIDIA Container    │
│  Toolkit when available; same image also runs CPU-only)              │
│  - train_worker.py: loads Ultralytics model, registers callbacks     │
│    (on_fit_epoch_end etc.), writes JSONL progress, calls model.train │
│  - predict_worker.py: runs model.predict() for auto-annotation       │
└────────────────────────────────────────────────────────────────────┘

Persistent state (outside containers):
  - Named volume: app DB, app-produced model artifacts
  - Bind mount (user-configured, read-only default): DATASET_DIR
  - Bind mount (user-configured): MODELS_DIR (existing/imported .pt files)
```

Key architectural decisions this diagram encodes (each justified in its own section below):
1. Web/API tier and training/inference tier are **separate containers** — the API never blocks on GPU/CPU-bound work (§5, §9, §10).
2. Training runs as a **subprocess**, tracked in the DB, not a Celery/Redis job queue — deliberately right-sized for single-server scale (§9, §10).
3. Progress flows via **Ultralytics callbacks → JSONL file → SSE**, not log-scraping (§9, §14, per YOLO-FORMAT-AND-API.md §5).
4. Datasets/models are **referenced via mounted host paths** by default, with upload as a secondary path (§6, §8, §12).
5. **Detect / Segment / OBB are modeled as mutually exclusive per-project task types**, not a free-mixing annotation surface (§7, per YOLO-FORMAT-AND-API.md §1 and §3 — this is an Ultralytics training-time hard constraint, not a design preference).

---

## 5. Docker + GPU/CPU Architecture

Full detail and sourcing in `DOCKER-GPU-ARCHITECTURE.md`. Decisions synthesized here:

### 5.1 Host GPU access
- **NVIDIA Container Toolkit is required on the host** and cannot be bundled into the app's own image — document as a prerequisite. Verified directly against Ultralytics' own live Dockerfiles.
- Default invocation: Compose's `deploy.resources.reservations.devices` (`driver: nvidia, capabilities: [gpu]`) as the primary, most-portable mechanism for a Compose-based app. The newer **CDI** form (`--device nvidia.com/gpu=all`) is the forward-looking alternative (it's what Ultralytics' own current Dockerfile examples show) — worth testing but not required as the v1 default.

### 5.2 Host tiers to explicitly support and document
1. **Native Linux + NVIDIA GPU** — full support, most reliable, treat as the reference platform.
2. **Windows + Docker Desktop (WSL2) + NVIDIA GPU** — supported but explicitly "best effort": requires a recent NVIDIA driver and `nvidia-ctk runtime configure` run inside the WSL2 distro; document as more failure-prone (driver mismatch is the most common cause) — **this matters directly for this project**, since the current development machine is Windows (confirmed by the `D:/Users/...` paths in `config.ini` and this environment being `win32`).
3. **macOS (Docker Desktop) or any GPU-less host** — CPU-only; no NVIDIA passthrough is possible on Mac at all (confirmed, not a current-limitation-that-might-change — architectural).

### 5.3 Runtime GPU detection
- `torch.cuda.is_available()` is the single source of truth for whether the running process can actually use a GPU (not `nvidia-smi`, which only confirms driver-level visibility, not that the installed torch build is CUDA-enabled). This is already how the existing scripts behave (§1.6) — formalize it as a shared, exception-safe utility and expose it via `/api/system/gpu-status`.
- `nvidia-smi` output is retained only as a **supplementary diagnostic** (e.g., a "Troubleshoot GPU" panel, §20) to help distinguish "no GPU on host" from "GPU present but toolkit/driver/wheel misconfigured."

### 5.4 One image or two?
- **Two separate image builds/tags (`app:cpu`, `app:gpu`)**, mirroring Ultralytics' own official pattern (verified directly from their live `docker/Dockerfile` and `docker/Dockerfile-cpu`) — not one "fat" image with runtime torch-variant switching. Application source code is identical between the two; only the base image and the torch install step differ (`pytorch/pytorch:<ver>-cuda<ver>-cudnn<ver>-runtime` vs. CPU-wheel install on a slim Python base).
- Pin the base image Python version to **3.11 or 3.12** — verified as the safe intersection of PyTorch's (≥3.10) and Ultralytics' (≤3.13) current support windows; avoid this repo's ambient 3.14 for the Docker image, and re-verify both projects' ranges again at actual implementation time since both move roughly twice a year.

### 5.5 Container topology
- **Separate the web/API container from the training/inference container(s).** Corroborated independently by two comparable OSS projects (CVAT's Nuclio-isolated functions, Label Studio's RQ-backed production ML backend) — both explicitly avoid running long-running model work inline in the request-serving process.
- Only the training/inference container(s) request GPU access; the web/API container needs none, shrinking the blast radius of any GPU/driver misconfiguration.
- Plan for **one training job at a time** on a single-GPU host (simple serialization via the job-tracking DB, §9) rather than GPU-sharing techniques (MPS/MIG) — those are legitimate but operationally complex, and out of scope until real concurrent-GPU demand exists (explicitly flagged as a non-goal for v1).

### 5.6 Long-running job management
- Training runs as a **managed OS subprocess** (`subprocess.Popen`), not in-process threading/`multiprocessing`, so its memory/GPU context is cleanly reclaimed on completion or cancellation (`terminate()`/`kill()`).
- Job state (status, PID, config, current epoch/metrics pointer) is **persisted in the app database**, with a **startup reconciliation sweep**: on backend boot, check every DB row marked "running" against actual OS process liveness, and mark orphans "interrupted" rather than silently believing stale state. This is the mechanism that satisfies "survive backend restarts" without adding Redis/Celery (§9, §10).
- Logs/progress stream via **SSE**, not WebSockets — the data flow (training subprocess → browser) is unidirectional, and SSE is simpler, auto-reconnecting, and proxy-friendlier for this exact shape (§9, §14).

### 5.7 Persistence and host-folder access
- **Named volumes** for data the app itself owns/produces: the database file, app-written model artifacts.
- **Bind mounts, user-configured via env vars** (`DATASET_DIR`, `MODELS_DIR`), for letting the user point the app at existing host folders — this is the *only* mechanism that lets a user reference a pre-existing arbitrary host location; a named volume cannot do this by design.
- Mount dataset/model bind mounts **read-only by default**; require the user to name a specific subfolder (never the whole home directory/drive root); do not support a live, HTTP-request-time "type any path to mount" flow — Compose bind-mount targets are decided at `docker compose up` time, not dynamically per-request, and treating this as anything else is a path-traversal risk (§15).

### 5.8 Open questions flagged by research (not resolved here — see §16)
- Exact Python version baked into the specific `pytorch/pytorch` CUDA tag chosen — must be confirmed at implementation time (`docker run --rm <image> python --version`), not assumed.
- CDI vs. Compose device-reservation behavior specifically on Windows/WSL2 was not independently verified — test both on the actual target dev machine before documenting one as canonical.
- The subprocess+SQLite+SSE job architecture (§5.6/§9) is a research **synthesis** of well-sourced adjacent patterns, not a single canonical reference implementation — flagged as worth a lightweight technical spike (Phase 0, §17) before full implementation, particularly around cleanly killing a mid-training PyTorch/CUDA subprocess and freeing GPU memory reliably.

---

## 6. Dataset Architecture

### 6.1 Supported input shapes (both required, per the brief and confirmed as the two realistic cases)

1. **Raw/unannotated image directory** — flat folder of images, no `data.yaml`, no labels. The platform's job is to let a user start annotating these from zero.
2. **Standard Ultralytics YOLO dataset** — `{train,valid,test}/{images,labels}/` + `data.yaml`, exactly the shape of `example_ready_dataset/` (§1.7). This is the format Ultralytics itself consumes directly for training, and the format the platform must always be able to produce/export regardless of internal representation.

Ultralytics dataset YAML variations to plan for (not exhaustively enumerated by research, flagged as a Phase-specific detail to nail down against Ultralytics' own dataset docs during Phase 6 implementation): relative vs. absolute split paths, optional `test:` key (not always present), single-file vs. directory-of-files datasets, and the `path:` root-prefix key some exports include.

### 6.2 Internal representation vs. on-disk YOLO format

The platform should **not** treat the on-disk YOLO label files as its live source of truth during active annotation — it should maintain its own DB-backed annotation model (images, annotation instances with class/tag/geometry, dataset-split assignment) and **generate/export** YOLO-format label files from that model, both because (a) round-tripping raw `.txt` files on every UI edit is fragile and slow, and (b) the DB model needs to carry information YOLO label files don't (tags, review/AI-suggested status, undo history) that would otherwise have to be smuggled into filenames or side-files.

- **On import** of an existing YOLO dataset (like `example_ready_dataset/`): parse each label file, detect its format (5-value vs. polygon, per YOLO-FORMAT-AND-API.md §1's parsing logic — "more than 6 columns" = segment format), populate the DB model, and preserve the *original* polygon geometry (not just its derived bounding box) so re-export doesn't silently degrade fidelity (§9's box↔polygon conversion utilities apply here too).
- **On export/training-time**, generate label files homogeneously per the project's task type (`detect`/`segment`/`obb`) — this is not optional, it's an Ultralytics training-time hard requirement (§7.2, §9.1).

### 6.3 Combining raw + already-annotated datasets

- Model this as: a **Project** owns one or more **Dataset Sources**, each either "raw" (images only) or "YOLO-formatted" (images+labels+split). At project level, the annotation UI presents the union of all images across sources.
- For images arriving from a YOLO-formatted source: import their existing annotations, classes (mapped into the project's own class list, with an explicit mapping/confirmation step if the source's `names:` list doesn't already match the project), and split (`train`/`valid`/`test`) as their initial state.
- For images with no existing annotations (raw source, or a YOLO source's images that happen to have empty label files): display unannotated, split defaults to unassigned until the user (or an auto-split feature, §16 open question) assigns one.

### 6.4 Dataset split management

- Track `train`/`valid`/`test` as a first-class per-image field in the DB model, editable by the user (move an image between splits) and exportable back into the correct YOLO directory layout.
- Offer (not require) an automatic-split helper (e.g., 80/10/10 by default, user-adjustable) for raw/unsplit imports — a genuinely useful convenience but must remain a deliberate, user-confirmed action, not an invisible default, since incorrect splitting can silently invalidate evaluation metrics.
- Validate split integrity before allowing a training job to start (e.g., warn if `valid` is empty — Ultralytics training will still run but produces meaningless validation metrics).

---

## 7. Annotation Architecture

### 7.1 Classes vs. Tags — explicit data model

Per the brief's explicit instruction not to assume these are identical, and grounded in what the *export format itself can actually represent*:

- **Class** is the concept YOLO label files natively encode (`<class-index>` in every label row, `names:` list in `data.yaml`). A class is mandatory metadata for every annotation instance and directly determines the trained model's output categories. Classes are **per-project**, ordered (their index *is* their position in `names:`), and changing/reordering them after annotation has begun is a breaking operation requiring re-indexing of every existing label (worth a dedicated, explicit "reorder classes" flow with a warning, not a silent list edit).
- **Tag** is an application-level concept with **no native YOLO label-file representation**. Tags are free-form/multi-valued metadata attached to an annotation instance or an image (e.g., `damaged`, `front`, `night-time`) used for filtering, review workflows, and dataset curation/subsetting — not for training directly. Because tags have no YOLO export slot, they live entirely in the platform's own DB and are **not** written into the `.txt` label files; they're an annotation-workflow/organization feature, not a training-data feature. (If a future need arises to encode tag-like distinctions into training itself, the correct mechanism is promoting that distinction to a full *class* — e.g., splitting `car` into `car-damaged`/`car-intact` — not inventing a non-standard label format extension.)
- Both classes and tags get a user-assigned **color**, used identically for canvas rendering — color is a per-project-class or per-project-tag display property, not a semantic one.

### 7.2 Detect / Segment / OBB as mutually exclusive per-project task types

This is the single most important, research-verified architectural constraint for the annotation system (full detail: YOLO-FORMAT-AND-API.md §1, §3, verified directly against live Ultralytics source, not docs prose):

- A dataset intended for **segmentation training** (`yolo11n-seg.pt` etc.) **cannot** contain any object with only a bounding box — Ultralytics' own dataset loader (`YOLODataset.verify_labels()`) hard-errors (`ValueError`) if box-count and segment-count differ anywhere in the dataset.
- A dataset intended for **detection training** *can* contain polygon-authored labels (Ultralytics silently collapses them to their bounding rectangle via `segments2boxes()`) — but this project should not rely on that asymmetric tolerance as a supported user-facing feature; it should be treated as an internal safety net, not a design premise.
- **OBB (Oriented Bounding Box)** is a third, distinct format (`<class> <x1> <y1> <x2> <y2> <x3> <y3> <x4> <y4>`, a 4-point rotated rectangle) with its own checkpoint family (`yolo11n-obb.pt`) and its own dataset-validation path — not a variant of detect or segment.
- **Product implication, directly informed by the actual included example dataset:** the example dataset's `license-plate` class is annotated with full polygons today, which is heavier to annotate than necessary for a roughly-rectangular, rotation-varying object — OBB is a strong candidate for that specific class if plate rotation matters for detection accuracy (flagged as a genuine product suggestion from research, not a requirement).
  > **⚠ CORRECTED by Phase 0, see `docs/phase-0-decisions.md` §3:** per the correction above, `license-plate` (and every other class) in this dataset is overwhelmingly box-annotated, not polygon-annotated — this OBB suggestion remains a reasonable *future* product direction, but should not be read as "matches how the current example dataset already does it."

**Architectural decision (recommended, not yet user-confirmed — see §16):** model "annotation task type" as a required, per-project setting (`detect` / `segment` / `obb`) chosen at project creation. The annotation UI then only offers the tool(s) consistent with that task type (bbox tool for `detect` and `obb`-in-simplified-form, polygon tool for `segment`) — this avoids ever producing an export that fails Ultralytics' own validation. If a `detect` project needs occasional polygon-drawn precision (e.g., an oddly-shaped object where a box is a poor fit), the polygon tool can still be offered, converting to its bounding box on save (§7.4) — but the underlying training-time homogeneity constraint always applies to the *export*, regardless of what tool was used to draw it.

### 7.3 Manual annotation tools

**Bounding box tool** (brief §11): four-point rectangle, class/tag assignment, standard draw→assign→save flow. Maps directly to detect-format label rows (`xywhn`) on save.

**Polygon tool** (brief §12): click-to-place vertices, close polygon, class/tag assignment. Maps directly to segment-format label rows (flattened normalized point list) on save. Confirmed (§7.2) that this is a materially different on-disk format from bounding boxes, not a cosmetic UI variant — the export logic must branch on the project's task type, not just "did the user use the box tool or the polygon tool."

Both tools render through **react-konva** (frontend research §1, §2 — same library choice independently verified as what Label Studio Frontend uses for the identical problem), with a shared `Transformer`-based resize/edit interaction model.

### 7.4 Box↔polygon conversion

Per YOLO-FORMAT-AND-API.md §2 (verified against live Ultralytics source):
- **Polygon → box:** use Ultralytics' own `segments2boxes()` utility (exactly what the loader itself uses internally) rather than reimplementing the geometry — ensures the platform's derived-box display always agrees with what Ultralytics would compute.
- **Box → polygon:** no dedicated Ultralytics utility exists, but it's trivial — the four corners of the `xyxy` box in consistent winding order.
- When a `segment`-task project needs to store a plain rectangle the user drew with the box tool, **convert it to a 4-point polygon on save** so the on-disk label file stays homogeneous per §7.2's hard constraint — do this conversion at write-time, not read-time, so stored files are always directly valid for training without a separate export pass.
- When displaying an imported polygon-labeled dataset's instances in a hypothetical box-oriented view, compute the bounding rectangle for display but **preserve the original polygon** in the DB (a hidden/secondary field) so re-saving without touching that specific instance never silently destroys its original fidelity.

### 7.5 Annotation saving — file/data model specifics

- **Coordinate normalization:** all stored/exported coordinates normalized to `[0,1]` relative to image width/height, per YOLO convention — confirmed as required by both detect and segment formats.
- **File naming:** `images/<name>.<ext>` ↔ `labels/<name>.txt`, one label file per image, one line per instance — standard Ultralytics convention, no deviation needed.
- **Multiple objects per image:** one line per instance in the same label file, exactly as the example dataset already demonstrates (two lines in the one inspected label file, one per class instance).
- **Editing/deleting existing annotations, changing class/tag:** all standard DB-backed CRUD against the platform's own annotation model; the on-disk `.txt` files are a *derived export artifact*, regenerated from DB state at export/training time (or kept in sync incrementally — an implementation choice for Phase 10/11, not an architectural one).
- **Undo/redo:** per frontend research §5 (grounded in official Konva guidance and CVAT's real-world precedent) — implement as a **snapshot/command history stack committed per completed user gesture** (shape created; shape moved-and-released; shape resized-and-released; class changed; shape deleted), storing plain serializable annotation data, **not** live canvas-node references. This keeps history independent of the rendering library and directly serializable to the same DB model used for saving.
- **Autosave vs. manual save:** per CVAT's precedent (manual save primary/authoritative, autosave as a periodic safety-net, off-by-default in CVAT's case) — recommend **manual save as the primary action** (explicit button/shortcut) with a **periodic autosave** (tuned more aggressively than CVAT's 15-minute default, given shorter per-image sessions — e.g., 60–120s or on image-navigation) as a backup, not the primary mechanism.
- **Consistency validation:** before allowing export/training, validate per-project task-type homogeneity (§7.2) and flag any instance that would violate it (e.g., a `segment` project with an image that has zero real polygon instances).

---

## 8. Model Architecture

### 8.1 Model selection sources

- **Default/pretrained models** — Ultralytics' own bundled/auto-downloadable checkpoints (`yolo11n.pt`, `-seg`, `-obb` variants per §7.2's task type), matching the naming convention verified in YOLO-FORMAT-AND-API.md §4.
- **Locally available models** — files already present under the mounted `MODELS_DIR` (§5.7) — the backend lists what's there, the UI presents a picker. This is the **primary** path for "select a previously trained model," per backend research §7's recommendation, since it avoids re-uploading large files that already exist on the user's host.
- **Previously trained models produced by this platform** — recorded in the DB with metadata (§8.2) and also physically living under the app-owned model-artifact volume (§5.7) — effectively a subset of "locally available," but with richer metadata than an arbitrarily-placed file would have.

### 8.2 What gets stored permanently vs. stays external

Per the brief's explicit instruction ("I probably do NOT want previously trained models permanently stored on the server") and backend research §7:
- **Do not** copy every selectable model into the app's own storage by default. The DB stores **metadata** (name, task type, source run/config if platform-trained, file path reference, file hash for integrity checking) — the actual `.pt` bytes live either on the app-owned volume (for models the platform itself produced) or on the user's mounted `MODELS_DIR`/`DATASET_DIR`-adjacent location (for models the user brought).
- Support **both** upload and mounted-path reference for bringing in an external model, with mounted-path as the default/primary flow and streamed upload (never fully buffered in memory — FastAPI's `UploadFile` already streams to a spooled temp file) as the secondary convenience path for a file that isn't already on the host.

### 8.3 Model metadata to track

Training run reference (if platform-produced), task type (`detect`/`segment`/`obb`/etc. — see §8.4), base checkpoint used, dataset used, final metrics (precision/recall/mAP50/mAP50-95), training duration, file path/hash, creation date. This directly closes the gap identified in §1.9 (currently `trained_models/best.pt` has zero recorded provenance).

### 8.4 Task-type binding (critical constraint, not a UI nicety)

Per YOLO-FORMAT-AND-API.md §1/§4 (verified against live source `guess_model_task()`): a model's task (`detect`/`segment`/`obb`/etc.) is **determined by the checkpoint itself** (its head architecture, or embedded metadata for exported formats) — not by `data.yaml`, not by user selection at training time. This means:
- The model-picker UI **must filter by the project's task type** (§7.2) — offering a `detect` checkpoint for a `segment` project's fine-tuning job is not a soft warning, it's a hard mismatch that will error or silently reinitialize the model head.
- Every model record in the DB should store its resolved task type (derived at import/registration time) so the rest of the platform can filter/validate without re-deriving it ad hoc on every use.

### 8.5 Model file format scope

Ultralytics natively trains/saves `.pt`; `model.export()` and direct `YOLO(path)` loading also support ONNX, TensorRT, OpenVINO, CoreML, TF variants, and more (full table in YOLO-FORMAT-AND-API.md §7). For v1, scope to **`.pt` only** — it's the only format that supports continued training/fine-tuning (the platform's core use case), and exported inference-only formats (ONNX etc.) are a reasonable **future extension** (§22) for users who want to deploy a trained model elsewhere, not a v1 requirement.

### 8.6 Security implication — untrusted `.pt` uploads (carries into §15)

Verified via live GitHub issue search against the Ultralytics repo, not speculation: loading a `.pt` file goes through PyTorch's `torch.load`, which is pickle-based and can execute arbitrary code if the file is malicious. PyTorch 2.6+ defaults to `weights_only=True` (mitigates but doesn't eliminate risk, since legitimate Ultralytics checkpoints need some custom-class unpickling). **Any model file the user uploads or references must be treated as untrusted input** — see §15 for the full mitigation stance.

---

## 9. Training Architecture

### 9.1 Job execution model

Per Docker research §5/§6 and backend research §2 (both converge independently on the same shape):

- Each training run executes as a **dedicated OS subprocess** running a small `train_worker.py` entry point — not `multiprocessing`, not inline in the API process. Rationale, grounded in this project's own existing code: `model.train()` is already a long-running, blocking Ultralytics call (confirmed by both existing scripts) that expects to own its process; a subprocess is the natural fit, not a workaround.
- `train_worker.py` is responsible for: loading the model (pretrained or local checkpoint per §8), registering Ultralytics callbacks (§9.2), and calling `model.train(...)` with the job's resolved config (§21).
- Job **queueing/concurrency control** is a DB-backed FIFO plus a simple "max N concurrent" semaphore the API checks before spawning a new subprocess — appropriate for a single-server, likely-single-GPU deployment (§5.5).
- Job **cancellation** sends a terminate signal to the tracked PID.
- Job **restart-survival**: on API startup, reconcile every DB row marked "running" against actual process liveness; mark orphans "interrupted" (§5.6).

**Deliberately not chosen for v1, with reasoning:** Celery/Redis/RQ/arq task queues. Research (backend §2) is explicit that a queue's core value propositions (retries, distributed workers, complex routing) don't fit training jobs well — you don't want to silently "retry" a failed multi-hour training run, you want to surface the failure — and the actually-needed properties (restart-survival, queueing, cancellation, progress) are fully achievable with the subprocess+DB+reconciliation pattern above, without adding a Redis dependency to what's meant to be a simple self-hosted app. This is flagged as a **documented upgrade path**, not a permanent ceiling: if the app later needs many concurrent small async jobs beyond training (batch inference, exports), introduce a lightweight queue then (Huey or arq recommended over Celery at that point, per backend research §2).

### 9.2 Progress and metrics capture — callbacks, not log-scraping

Verified directly against official Ultralytics docs and source (YOLO-FORMAT-AND-API.md §5, backend research §4) — this is the single clearest "don't do it the way you'd naively guess" finding from this research pass:

- Ultralytics exposes `model.add_callback(event_name, fn)`, invoked at defined lifecycle points, receiving the live `Trainer` object (not a plain dict).
- **`on_fit_epoch_end`** is the right hook for per-epoch summary metrics — fires after both train and validation complete for that epoch, with `trainer.metrics` (mAP, precision, recall) fully populated. **`on_train_batch_end`** is available for finer sub-epoch progress if wanted. **`on_model_save`**/`on_train_end` expose `trainer.best`/`trainer.last` checkpoint paths for "artifact ready" notifications.
- **Critical architectural implication:** callbacks execute *inside the training subprocess*, not the API process. `train_worker.py` must therefore itself own the responsibility of serializing `trainer.metrics`/`trainer.epoch`/etc. to a per-job **structured progress channel** — recommended: a JSONL file (`runs/<job_id>/progress.jsonl`), appended to by the callback, one JSON object per emitted event. This keeps the worker script decoupled from whatever streaming mechanism the API layer uses.
- The API process's SSE endpoint (§9.3) **tails that JSONL file** and forwards new lines to connected browser clients — no stdout/log-text parsing anywhere in the pipeline.
- **Open item, explicitly flagged by research and not yet empirically confirmed:** the exact key names inside `trainer.metrics` (e.g., whether it's literally `metrics/mAP50(B)`-style) are not enumerated in Ultralytics' docs and should be captured empirically (print `trainer.metrics` on a first real run with the pinned Ultralytics version) before finalizing the progress-schema contract between worker and API (§16).

### 9.3 Streaming to the browser

SSE (`StreamingResponse`, `media_type="text/event-stream"`), not WebSockets — the data flow is unidirectional (training subprocess → browser); cancellation is a normal REST `POST`, not a message over the same channel. Confirmed as the converging recommendation across every source consulted in backend research §3, and it avoids WebSocket-upgrade friction behind reverse proxies. WebSockets remain the right future tool *if* a genuinely bidirectional feature is added later (e.g., live multi-user annotation collaboration) — a different problem, not this one.

### 9.4 Training configuration surface

Directly derived from the audited `config.ini` (§1.8) — every existing key is preserved and tiered, not dropped:

**User-facing (exposed prominently in the job-creation UI):**
`epochs`, `imgsz`, `batch` (explicit user value, replacing the current unreliable `auto_batch()` heuristic — §3), `device` (GPU/CPU selector, informed by live `/api/system/gpu-status`), `dataset` (picker), `model`/base checkpoint (picker, filtered by task type per §8.4), `project`/`name` (job naming).

**Advanced (collapsed by default, present for power users):**
`optimizer`, `lr0`, `lrf`, `warmup_epochs`, `close_mosaic`, `augment`, `amp`, `dropout`, `single_cls`, `save_period`, `patience` (not in current config but a standard, relevant Ultralytics parameter worth adding), `seed`, `resume`, `cache`.

**Internal/system-managed (not user-editable, derived by the platform):**
`workers` (derive from host CPU count, not a raw user input — current config hardcodes `8` with no relation to actual hardware), `verbose` (platform always wants structured callback output regardless; this becomes moot once §9.2 is implemented), `pretrained` (implied by whether the selected base model is a generic pretrained checkpoint vs. a prior local run, not a separate toggle the user sets directly).

---

## 10. Backend Architecture

Full detail: `BACKEND-ARCHITECTURE.md`. Synthesis:

### 10.1 Framework

**FastAPI.** Reasoning specific to this project (not a generic "FastAPI is popular" claim): native SSE/WebSocket support without extensions (§9.3 is a first-class requirement), async endpoints keep the API responsive while training subprocesses run (§9.1), Pydantic models double as validation for both annotation payloads and job-config schemas (§9.4, §21), and — notably — Ultralytics' own commercial cloud product (Ultralytics Platform) is itself FastAPI-based, meaning "FastAPI + YOLO" patterns are unusually well-trodden. Pair with **SQLAlchemy 2.0 (async) + Alembic** for the ORM/migration layer if/when the CRUD surface (projects/datasets/annotations/models/jobs) grows large enough to want one, rather than hand-rolling SQL.

Honest tradeoff noted by research: Django+DRF would reduce CRUD boilerplate (and is what CVAT actually uses) — a legitimate second choice if the team already knows Django well and CRUD volume dominates over the streaming/async requirements. FastAPI is the better default given the explicit real-time-streaming requirement.

### 10.2 Job execution — see §9.1 (subprocess + DB tracking, deliberately no Celery/Redis at v1).

### 10.3 Database

**SQLite (WAL mode) as the default**, with **PostgreSQL as the recommended upgrade if multi-user concurrent annotation is a day-one requirement** — this is flagged as an open product question (§16), not resolved by research alone, because the right choice depends on expected concurrent-user count. Technical basis: SQLite WAL allows unlimited concurrent *readers* but only one writer at a time; annotation CRUD (potentially-simultaneous users saving labels) plus training-job status writes is exactly the "bursty concurrent small writers" pattern that stresses SQLite's single-writer model. **Mitigating factor:** since §9.2 already routes high-frequency training progress to a JSONL file rather than the DB, DB write pressure is much lower than it would otherwise be (the DB only needs a write at job start/end/status-change) — this tilts the calculus back toward SQLite being sufficient for longer than it otherwise would be. Migration to Postgres later is mechanically simple (same SQLAlchemy models, swap connection string, run Alembic) if the decision needs revisiting.

### 10.4 Comparable OSS precedent (validates the above, doesn't dictate it)

- **CVAT**: Django+DRF for CRUD, RQ (not Celery) for async jobs, Nuclio-isolated serverless functions for ML inference — validates "never run ML work inline in the request-handling process" regardless of framework choice, and validates DRF-viewset-style resource modeling for projects/tasks/jobs/annotations as a proven shape (whether built in Django or replicated as FastAPI routers).
- **Label Studio**: RQ+Redis for production training-job offload, pluggable storage backends (local/S3/GCS/Azure) for annotation data via a documented connector API — relevant if the platform later wants object-storage support (§22) rather than only local/mounted filesystem.
- **Ultralytics Platform**: FastAPI-based, with real-time metrics streaming back from cloud training jobs — direct same-domain validation of the FastAPI + streamed-training-metrics architecture (§9.2/§9.3), from the company that owns the training loop itself. (Confidence: MEDIUM — this specific claim is inferred from job postings/docs, not an official published architecture document; treat as directional validation, not a load-bearing fact.)

### 10.5 Large model file handling

See §8.2 — mounted-volume reference as the default/primary path, streamed multipart upload (never fully buffered in memory) as the secondary convenience path. Consistent with how CVAT/Label Studio-style tools generally support both.

---

## 11. Frontend Architecture

Full detail: `FRONTEND-ANNOTATION-UI.md`. Synthesis:

### 11.1 Stack

**React + Vite, plain SPA — no Next.js/meta-framework.** For a self-hosted, internal, non-SEO dashboard+editor app, SSR/SSG's main value is irrelevant while it adds real operational self-hosting friction (Next.js in particular is optimized around Vercel-style deployment). A Vite-built SPA deploys as static files served by whatever backend is already running. This directly matches both CVAT's and Label Studio's own actual choice (React, plain SPA architecture), which de-risks the decision — their patterns can be studied directly.

**State management:** Zustand, paired with its `zundo` middleware for undo/redo (§7.5) — lighter-weight than Redux, though Redux (CVAT's actual choice) remains a fine alternative if team familiarity argues for it. This is flagged as a defensible opinion, not an industry-consensus finding (MEDIUM confidence per research).

### 11.2 Annotation canvas

**react-konva** for the bounding-box and polygon drawing/editing surface (§7.3). This is not a generic "canvas library" pick — it is the **same library Label Studio Frontend itself uses** for the identical problem (interactive box/polygon annotation over an image), confirmed via direct inspection of their source layout (`Rectangle`/`Polygon`/`ImageView` classes rendering through react-konva). It ships a built-in `Transformer` for resize/rotate handles and per-shape event handling out of the box, avoiding a large chunk of hand-rolled interaction plumbing. CVAT's own canvas (`cvat-canvas`) instead uses SVG.js for vector shapes + Fabric.js for masks — a valid alternative architecture, but one that demands building drag/resize/select interaction from scratch, a poor tradeoff for a small/solo-maintained team.

**Do not** build on `react-image-annotate` (even its maintained community fork) as the core dependency — its feature gaps (editable AI-overlay UX, YOLO-specific round-tripping, custom class-color handling) would likely force heavy forking anyway, for a library with a small ecosystem footprint. Instead, **study Label Studio Frontend's `Rectangle`/`Polygon`/`ImageView` source** directly as the closest real-world reference architecture while building on react-konva independently.

### 11.3 Image browser / dataset grid

**react-virtuoso** for the thumbnail grid (native grid support + built-in infinite scroll, lower integration effort than react-window for this specific need), combined with **server-generated thumbnails** (distinct, small previews — not full-resolution images in the grid) and a **paginated/cursor-based listing API** so the frontend never holds an entire large dataset's metadata in memory at once. Full-resolution image fetch reserved for the single currently-open annotation view.

### 11.4 Training metrics visualization

**Recharts** as the default (React-idiomatic, SVG-based, comfortably handles epoch-level/few-times-per-second update rates and realistic point counts for this use case). If a future requirement calls for very high-frequency, high-density streaming (e.g., raw per-batch loss at sub-second intervals over long runs), switch *that specific chart* to Chart.js (via `react-chartjs-2`) or uPlot for the Canvas-rendering performance advantage — don't standardize the whole app on Canvas-only charting preemptively.

### 11.5 Reference architectures worth studying directly (not vendoring)

- **CVAT** (`cvat-ai/cvat`, MIT) — React + Redux + Ant Design, standalone `cvat-canvas` module (SVG.js + Fabric.js) — study for coordinate-transform and multi-shape state management patterns.
- **Label Studio Frontend** (`HumanSignal/label-studio`) — React + MobX-State-Tree + react-konva — study directly for the `Tool`/`Rectangle`/`Polygon` abstraction, since it solves the identical rendering problem with the identical library choice recommended here.

---

## 12. Storage Architecture

Synthesizing §5.7, §6, §8, §9:

```
Named volume (app-owned, Docker-managed):
  - app.db (or Postgres data dir if that path is chosen, §10.3)
  - runs/<job_id>/progress.jsonl, checkpoints/weights the platform itself produces
  - server-generated thumbnails cache

Bind mount, user-configured (DATASET_DIR, read-only by default):
  - user's existing/imported dataset folders (raw or YOLO-formatted)

Bind mount, user-configured (MODELS_DIR):
  - user's existing .pt files for selection/reference (§8.1)
```

- Large binary artifacts (datasets, model weights) are **never** duplicated into the DB or into git — the DB stores paths/metadata/hashes, the filesystem (volume or bind mount) stores bytes, exactly once per artifact where practically achievable.
- This directly corrects the current-state problem identified in §1.9/§3 (checkpoints, run outputs, and the example dataset all currently committed to git) — the target architecture has no code path that would recreate that mistake, since datasets/models never flow through git in the new design.
- Backups: for the named-volume/SQLite path, backup is "copy the file" (a genuine operational simplicity win noted in backend research §5); for bind-mounted user data, backup is explicitly the user's own responsibility (it's their host filesystem), which should be stated plainly in documentation (§19) rather than implied.

---

## 13. Database Architecture

### 13.1 Whether a database is necessary — yes, confirmed necessary

Per the brief's own framing and confirmed by this audit: the current "config file + filesystem" approach (§1.8, §1.9) already fails to answer basic questions the platform must answer (what produced this model, what dataset was used, what are its metrics) — this is not something a config file or bare filesystem convention can reasonably solve once there are multiple projects, datasets, models, and users. A relational database is warranted.

### 13.2 Engine choice

See §10.3 — SQLite (WAL) default, PostgreSQL if multi-user concurrency is a day-one requirement. Not re-litigated here.

### 13.3 Core entities (first-pass schema shape, to be refined during Phase 3 implementation)

- **Project** — name, task type (`detect`/`segment`/`obb`, §7.2), created/updated timestamps.
- **Class** — project-scoped, ordered index (maps to YOLO `names:` position), name, color.
- **Tag** — project-scoped, name, color (§7.1 — explicitly not a training-format concept).
- **DatasetSource** — project-scoped, type (`raw`/`yolo-formatted`), host path reference (or upload-derived path), import status.
- **Image** — belongs to a DatasetSource, file path/hash, dimensions, assigned split (`train`/`valid`/`test`/unassigned, §6.4).
- **AnnotationInstance** — belongs to an Image, class_id, tag_ids (many-to-many), geometry (polygon point list, canonical; box-only instances stored as their 4-point polygon per §7.4's write-time conversion, OR a discriminated geometry-type field — an implementation decision for Phase 3/9/10, not resolved here), AI-suggested/reviewed status flag (§14 of the brief — auto-annotation results must be distinguishable from human-confirmed ones), created/updated timestamps.
- **Model** — task type, source (pretrained/uploaded/platform-trained), file path reference, hash, linked TrainingRun (nullable), metrics snapshot.
- **TrainingRun** (job) — project_id, dataset reference, base model reference, resolved config (JSON, §9.4), status (`queued`/`running`/`completed`/`failed`/`cancelled`/`interrupted`), PID (while running), progress-file path, start/end timestamps, final metrics.

### 13.4 What's genuinely open here

Whether `AnnotationInstance` geometry should be one polymorphic column (box vs. polygon discriminated by a type field) or two related tables is a normal implementation-detail decision, not an architectural one this roadmap needs to force — flagged for Phase 3/9 design, not §16.

---

## 14. API Architecture

Illustrative resource grouping (not a frozen contract — exact routes/verbs are a Phase 3/6/7/9 implementation detail):

```
/api/auth/*                (if/when auth is added — see §15, currently out of v1 scope per single-operator framing)
/api/projects/*             CRUD projects, classes, tags
/api/datasets/*             register/import dataset sources, list images, assign splits
/api/images/{id}/annotations/*   CRUD annotation instances for an image
/api/models/*                list/register/upload models, filtered by task type (§8.4)
/api/training/jobs/*         create/list/cancel training jobs
/api/training/jobs/{id}/events   SSE endpoint, tails progress.jsonl (§9.2/§9.3)
/api/inference/annotate      run auto-annotation inference on an image/batch (§14 of the brief)
/api/system/gpu-status       GPU/CPU detection endpoint (§5.3)
/api/system/health           basic liveness/readiness
```

Every endpoint that touches the filesystem (dataset import, model reference, image serving) must validate paths against the configured mount roots (§5.7, §15) — never trust a client-supplied path directly.

---

## 15. Security

Per the brief's explicit list, addressed point by point:

- **Filesystem access / path traversal / arbitrary file access:** every user-facing "pick a file/folder" operation resolves against a server-configured mount root (`DATASET_DIR`/`MODELS_DIR`, §5.7) — never accepts a client-supplied absolute path directly. Validate resolved paths stay within the configured root (reject `../` traversal) before any file operation.
- **Docker permissions:** the web/API container needs no GPU access and no elevated host privileges; only the training/inference container(s) need GPU device access (§5.5) — minimizes blast radius.
- **Uploaded files:** stream to disk (never fully buffer in memory, §8.2/§10.5); validate file type/size bounds before processing.
- **Model files — the most concrete, research-verified risk found in this entire audit (§8.6):** `.pt` files are pickle-based and can execute arbitrary code on load. Any user-uploaded or user-referenced `.pt` file must be treated as untrusted input:
  - Prefer running any user-provided-model inference/training in an isolated worker context (already the plan per §5.5/§9.1's separate training container) rather than in-process in the main API server.
  - Require/pin a PyTorch version ≥2.6 where `weights_only=True` is the load default; avoid any code path that explicitly overrides to `weights_only=False` without a separate provenance check.
  - Validate uploaded files are plausible Ultralytics checkpoints (expected keys/structure, sane size bounds) before attempting a load; surface clear errors rather than attempting execution on malformed input.
  - Consider ONNX as an alternative "bring your own model" path specifically for inference-only use cases (auto-annotation), since ONNX Runtime's execution model has a narrower attack surface than PyTorch pickle loading — flagged as a possible future/optional path (§22), not a v1 requirement, since ONNX is inference-only and can't support the fine-tuning use case.
- **Command/subprocess execution:** training jobs are launched via a fixed, code-controlled subprocess invocation (`train_worker.py` with a validated, schema-checked config) — never via raw shell-string construction from user input, to avoid command-injection surface.
- **Resource exhaustion:** the job-concurrency semaphore (§9.1) already bounds simultaneous training load; consider basic request-rate limiting on inference/auto-annotation endpoints if the app is ever exposed beyond localhost/LAN (explicitly flagged by the brief as a heightened-risk scenario).
- **Authentication/authorization:** **not resolved by this research** — the brief doesn't specify single-user vs. multi-user exposure, and it directly affects whether any auth layer is needed at all for v1. Flagged as an open product question (§16).

---

## 16. Architecture Questions / Decisions

Per the brief's explicit request, every major open question, with options, recommendation, and whether it blocks implementation start:

| # | Question | Options | Recommendation | Consequences | Blocks Phase 0? |
|---|---|---|---|---|---|
| 1 | Docker GPU access mechanism | Compose `deploy.resources.reservations.devices` vs. CDI (`--device nvidia.com/gpu=all`) | Default to Compose device-reservation (more universally documented for Compose); note CDI as forward-looking alternative | Low — both require the same host prerequisite (NVIDIA Container Toolkit); switching later is a Compose-file change, not an app-code change | No |
| 2 | Single vs. separate CPU/GPU Docker images | One image with runtime switching vs. two images/tags | Two images (`app:cpu`, `app:gpu`), mirroring Ultralytics' own pattern | Slightly more build/release complexity (two Dockerfiles to maintain); avoids requiring the NVIDIA toolkit on CPU-only hosts and avoids bundling an unnecessarily large CUDA-wheel image everywhere | No — but should be decided before Phase 2 (Docker infra) |
| 3 | Training container topology | Same container as web backend vs. separate training container(s) | Separate — validated independently by two comparable OSS projects | Slightly more Compose complexity (two services); required for the app to stay responsive during training and for restart-survival to work cleanly | **Yes** — affects Phase 2/3 foundation |
| 4 | Job execution mechanism | subprocess+DB vs. Celery/RQ/arq+Redis | subprocess+DB+reconciliation sweep, defer a queue | Simpler v1 deployment (no Redis service); documented upgrade path if concurrency needs grow | **Yes** — affects Phase 7 design directly |
| 5 | Progress streaming transport | SSE vs. WebSockets | SSE | Simpler, proxy-friendlier; would need revisiting only if bidirectional live features (e.g., collaborative annotation) are added later | No |
| 6 | Database engine | SQLite (WAL) vs. PostgreSQL from day one | SQLite default; Postgres if multi-user concurrent annotation is a **day-one** requirement | **Directly depends on an unresolved product question: expected concurrent users** — see row 10 | Partially — affects Phase 3 schema/connection setup |
| 7 | Annotation data model | Classes vs. tags as distinct concepts | Distinct — classes are training-format-native, tags are workflow-only metadata (§7.1) | Low risk either way at the schema level; the risk is conflating them later and trying to export tags into label files, which has no valid YOLO representation | No |
| 8 | Per-project task type | Free mixing of box/polygon/OBB vs. one enforced task type per project | One enforced task type per project (`detect`/`segment`/`obb`), **verified as an Ultralytics training-time hard constraint, not a preference** | Simplifies annotation UI logic and guarantees exportable datasets; a user wanting both a detect and a segment model from the same source images needs two projects (or a documented "clone project, different task type" workflow) | **Yes** — this is foundational to the annotation data model (Phase 3, Phase 9) |
| 9 | Model storage | Copy every referenced model into app storage vs. reference mounted/external paths | Reference external paths by default (§8.2), matching the brief's explicit stated preference | Requires careful path-validation/security work (§15) but avoids unbounded server storage growth | No |
| 10 | **Expected concurrent users** | Single-operator tool vs. small-team multi-user | **DECIDED by project owner (Phase 0, see `docs/phase-0-decisions.md` §6):** primarily single-operator for now, but architecture must not preclude a small team later. **SQLite for v1**, with the data-access layer (SQLAlchemy + Alembic, no SQLite-specific query patterns) built so migration to PostgreSQL is mechanically simple. **No auth layer for v1.** | DB engine (SQLite) and no-auth decision now locked for v1; revisit before Phase 3 actually encodes the connection layer, per the decision's own explicit revisit clause | No longer blocks — resolved |
| 11 | Frontend state library | Zustand+zundo vs. Redux | Zustand+zundo (lighter-weight); Redux remains a fine alternative | Low-stakes, easily revisited early since it's isolated to the frontend | No |
| 12 | OBB for the `license-plate` class specifically | Full polygon segmentation (current example dataset's approach) vs. OBB | Offer OBB as a project-creation option for near-rectangular, rotation-varying classes; not a forced migration of the existing example dataset | Product decision, not a technical blocker either way | No |
| 13 | Auto-split (train/valid/test) for raw imports | Always manual vs. offered-but-confirmed automatic split | Offer as an explicit, user-confirmed convenience action (§6.4), never a silent default | Low risk if always confirmed; real risk (invalid evaluation metrics) if ever made silent | No |
| 14 | ONNX/exported-format support for "bring your own model" | .pt-only (v1 scope, §8.5) vs. also support ONNX etc. | .pt-only for v1; ONNX flagged as a future extension (§22), partly motivated by its narrower security surface (§15) | Low — purely additive if pursued later | No |

**Bottom-line framing:** rows 3, 4, 8, and 10 are the decisions that materially shape early-phase code structure and should be locked in (or explicitly deferred with a documented default, as this roadmap already does for 3/4/8) before Phase 3 begins in earnest. Row 10 (concurrent users) is the one genuinely unresolved **product** question in this entire document that this research could not answer on its own — it needs an answer from the project owner, not further research.

---

## 17. Development Phases

Scope discipline per the brief's §30: this is a single-server/self-hosted application. No phase below introduces Kubernetes, multi-node orchestration, or distributed job scheduling. Redis/task-queue infrastructure is explicitly deferred past v1 (§9.1, §16 row 4) unless a later phase's real-world usage proves it's needed.

Each phase lists: objective, why it exists, files/modules affected, architecture/dependency/DB/API/frontend/Docker changes, testing requirements, migration requirements, acceptance criteria, dependencies on prior phases, and risks.

### Phase 0 — Architecture Validation / Research Spikes

- **Objective:** De-risk the specific items research flagged as synthesized-but-unverified before committing real implementation time to them.
- **Why it exists:** Several load-bearing decisions above (subprocess+SQLite+SSE job architecture, cleanly killing a mid-training CUDA subprocess, `trainer.metrics` key shapes, Windows/WSL2 GPU passthrough behavior on the actual dev machine) are MEDIUM-confidence syntheses, not single-sourced facts — cheaper to spike now than to discover mid-Phase-7.
- **Files/modules:** New, throwaway spike scripts only (not part of the shipped app) — e.g., `spikes/train_worker_spike.py`, `spikes/gpu_passthrough_check.md`.
- **Architecture changes:** None to the shipped app.
- **Dependencies:** Pin exact Ultralytics + PyTorch versions for the project now (§9.2's open item explicitly depends on this) — this single decision unblocks several downstream unknowns.
- **DB/API/Frontend/Docker changes:** None.
- **Testing requirements:** N/A (spikes are throwaway, not tested code).
- **Migration requirements:** None.
- **Acceptance criteria:**
  - Pinned Ultralytics + PyTorch versions recorded in a decision doc.
  - `trainer.metrics` dict keys captured empirically from one real training run against the pinned version.
  - A minimal `subprocess.Popen`-based training-and-cancel spike confirms a mid-training process can be cleanly terminated and GPU memory is freed afterward (verified via `nvidia-smi` before/after).
  - GPU passthrough tested on the actual Windows dev machine (Docker Desktop + WSL2 + NVIDIA Container Toolkit) — outcome documented either way (works / doesn't work / partial).
  - Answer to §16 row 10 (expected concurrent users) obtained from the project owner.
- **Dependencies on previous phases:** None (first phase).
- **Risks:** If Windows/WSL2 GPU passthrough proves unreliable on the actual dev machine, CPU-only development becomes the practical default until a Linux host is available for GPU testing — worth knowing now, not after Phase 7 is built.

### Phase 1 — Project Restructuring & Dependency Hygiene

- **Objective:** Establish a clean, reproducible foundation before any new feature code is written.
- **Why it exists:** Current repo has no dependency manifest, no `.gitignore`, and ~40MB of binary artifacts (checkpoints, run outputs, example dataset) committed directly to git (§1.9, §3) — building new infrastructure on top of this compounds the problem.
- **Files/modules changed:** `train_yolo.py`, `finetune_yolo.py` (merge duplicated helpers into a shared module, e.g. `common/device.py`, `common/quality.py`).
- **New files/modules:** `pyproject.toml` or `requirements.txt` (pinned versions, informed by Phase 0's version decision), `.gitignore` (exclude `*.pt`, `runs/`, `trained_models/`, any local dataset directories), `README.md` rewrite (real setup instructions).
- **Architecture changes:** None functional yet — this is hygiene, not restructuring behavior.
- **Dependencies:** Pin `ultralytics`, `torch`, `rich` to the versions decided in Phase 0.
- **DB changes:** None.
- **API changes:** None.
- **Frontend changes:** None.
- **Docker changes:** None yet (Phase 2).
- **Testing requirements:** Establish the test framework itself here (pytest + config) even if initial coverage is minimal — first unit tests for `parse_device()`/`quality_assessment()` once centralized.
- **Migration requirements:** **Careful, deliberate git history cleanup** for the committed binaries (§3) — coordinate with the project owner before rewriting history (e.g., `git filter-repo` or BFG) since `trained_models/best.pt` is the user's real trained model, not disposable; at minimum, stop new commits from re-adding binaries via `.gitignore`, and treat historical cleanup as an explicit, confirmed, separate action rather than an automatic one.
- **Acceptance criteria:** Fresh clone + documented setup steps produces a working environment with zero manual guessing; `git status` is clean after a training run (no accidental binary commits); duplicated helper functions exist in exactly one place.
- **Dependencies on previous phases:** Phase 0 (version pins).
- **Risks:** Git history rewrite (if pursued) is inherently disruptive if anyone else has cloned the repo — confirm solo-repo status before attempting it.

### Phase 2 — Docker Infrastructure

- **Objective:** Establish the two-image (CPU/GPU), multi-container Compose foundation per §5.
- **Why it exists:** Nothing Docker-related currently exists (§1.11) — this is new build, not migration.
- **Files/modules changed:** None from Phase 1's Python code yet.
- **New files/modules:** `docker/Dockerfile` (GPU), `docker/Dockerfile-cpu`, `docker-compose.yml` (base, CPU-portable), `docker-compose.gpu.yml` (GPU overlay), `.dockerignore`.
- **Architecture changes:** Establishes the web/training container split (§5.5) — even before the web app exists, the Compose topology should be scaffolded so later phases slot into an already-correct shape rather than retrofitting separation later.
- **Dependencies:** Base images per §5.4 (Python 3.11/3.12, `pytorch/pytorch:<pinned>-cuda...` for GPU).
- **DB changes:** Scaffold the named volume for future DB use (§12), even before Phase 3 adds an actual database.
- **API changes:** None yet.
- **Frontend changes:** None yet.
- **Docker changes:** This entire phase is Docker changes.
- **Testing requirements:** Verify both images build; verify `torch.cuda.is_available()` returns `True` inside the GPU image on a GPU host and `False` (gracefully, no crash) inside the CPU image; verify the reconciliation-relevant basics (container restart doesn't lose the named volume's contents).
- **Migration requirements:** None (net-new).
- **Acceptance criteria:** `docker compose up` (CPU path) and `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up` (GPU path, on a GPU host) both start successfully; `DATASET_DIR`/`MODELS_DIR` bind-mount env vars are wired and documented.
- **Dependencies on previous phases:** Phase 0 (GPU passthrough spike findings directly inform whether the GPU path is even testable on the dev machine yet).
- **Risks:** If Phase 0 found Windows/WSL2 GPU passthrough unreliable, this phase's GPU-path testing may need to happen on a different host — flag this explicitly rather than silently skipping GPU verification.

### Phase 3 — Backend Foundation

- **Objective:** Stand up the FastAPI app, database, and core entity CRUD (Project/Class/Tag/DatasetSource/Image, per §13.3), with no training/annotation *logic* yet — just the data model and basic API surface.
- **Why it exists:** Every later phase depends on this foundation existing.
- **Files/modules:** New Python package structure (`backend/app/`, `backend/models/`, `backend/api/`, `backend/db/`).
- **New files/modules:** SQLAlchemy models, Alembic migration setup, FastAPI app entrypoint, Pydantic schemas for the core entities.
- **Architecture changes:** Establishes the backend layering (routers → services → models) that later phases build onto rather than each inventing their own pattern.
- **Dependencies:** `fastapi`, `sqlalchemy[asyncio]`, `alembic`, `pydantic`, plus whichever DB driver §16 row 10's answer implies (`aiosqlite` or `asyncpg`).
- **DB changes:** Initial schema migration for Project/Class/Tag/DatasetSource/Image (Model/TrainingRun/AnnotationInstance land in Phases 5/7/9 respectively, once their owning features exist).
- **API changes:** `/api/projects/*`, `/api/system/health` at minimum.
- **Frontend changes:** None yet (Phase 4).
- **Docker changes:** Wire the FastAPI app into the web container from Phase 2.
- **Testing requirements:** API integration tests for basic CRUD; DB migration tests (upgrade/downgrade both work cleanly).
- **Migration requirements:** None (net-new schema).
- **Acceptance criteria:** Can create/list/update/delete a Project (with task type, §7.2/§16 row 8) via the API; OpenAPI docs auto-generate correctly; the §16 row 10 decision (SQLite vs. Postgres) is reflected in the actual connection config, not left as a TODO.
- **Dependencies on previous phases:** Phase 2 (container to run in); Phase 0 (row 10 answer).
- **Risks:** If row 10's answer arrives late, schema/connection choices made here may need revisiting — worth explicitly blocking this phase's *start* on that answer rather than guessing.

### Phase 4 — Frontend Foundation

- **Objective:** Stand up the React+Vite SPA shell, talking to Phase 3's API for basic project CRUD — no canvas, no training UI yet.
- **Why it exists:** Establishes the frontend build/deploy pipeline and core layout before the harder canvas/streaming work.
- **New files/modules:** `frontend/` (Vite React project), routing shell, Zustand store scaffold, API client layer.
- **Architecture changes:** Establishes how the SPA is served (via the backend container or a separate static-serving step — an implementation detail to resolve here, not earlier).
- **Dependencies:** `react`, `vite`, `zustand`, `zundo`, base UI/component library choice (not researched in depth here — a reasonable Phase 4 decision, e.g. a lightweight component kit consistent with the React+Vite choice).
- **DB changes:** None.
- **API changes:** None beyond what Phase 3 already provides.
- **Frontend changes:** Entire phase.
- **Docker changes:** Wire static frontend build output into the web container's serving path.
- **Testing requirements:** Component smoke tests for the shell; basic API-integration tests (project list renders real data from Phase 3's API).
- **Migration requirements:** None.
- **Acceptance criteria:** A user can open the app in a browser, see a project list, and create a new project through the UI, end to end.
- **Dependencies on previous phases:** Phase 3.
- **Risks:** Low — this is a well-trodden pattern with no novel research-flagged uncertainty.

### Phase 5 — Model Management

- **Objective:** Implement the Model entity (§8), the mounted-path/upload dual selection flow, and task-type filtering (§8.4).
- **Why it exists:** Both training (Phase 7) and auto-annotation (Phase 11) need a working model picker before they can be built meaningfully.
- **Files/modules:** `backend/models/model.py`, `backend/api/models.py`, model-file validation logic (§8.6/§15).
- **New files/modules:** Task-type resolution utility (wraps Ultralytics' `guess_model_task`-equivalent logic, §8.4).
- **Architecture changes:** None beyond what §8/§12 already specify.
- **Dependencies:** None new beyond `ultralytics` (already required).
- **DB changes:** Add `Model` table.
- **API changes:** `/api/models/*` (list, register-from-path, upload, filter-by-task-type).
- **Frontend changes:** Model picker component (filtered by project task type).
- **Docker changes:** None beyond Phase 2's `MODELS_DIR` mount already being wired.
- **Testing requirements:** Validate rejection of malformed/oversized uploaded files (§15); validate task-type filtering excludes mismatched checkpoints.
- **Migration requirements:** None.
- **Acceptance criteria:** A user can select a pretrained checkpoint, reference a model already sitting in `MODELS_DIR`, or upload a new `.pt` file, and the UI correctly filters options by the current project's task type.
- **Dependencies on previous phases:** Phase 3 (DB/API foundation), Phase 4 (UI shell).
- **Risks:** §8.6's security mitigations must land here, not be deferred — this is the phase that first accepts untrusted binary input from users.

### Phase 6 — Dataset Management & Import

- **Objective:** Implement DatasetSource/Image registration, raw and YOLO-formatted import (§6), and split assignment (§6.4).
- **Why it exists:** Both annotation (Phase 9/10/11) and training (Phase 7) need real, imported image data to operate on.
- **Files/modules:** `backend/services/dataset_import.py` (parses `data.yaml` and label files per §6.2, detects box vs. polygon format per YOLO-FORMAT-AND-API.md §1's column-count logic).
- **Architecture changes:** Establishes the "DB is the live source of truth, YOLO files are import/export artifacts" pattern (§6.2) that later annotation phases depend on.
- **Dependencies:** None new.
- **DB changes:** Populate `Image` records from import; wire split assignment.
- **API changes:** `/api/datasets/*` (register source, trigger import, list images, assign/reassign split).
- **Frontend changes:** Dataset import flow UI; basic (non-annotation-canvas) image list view, ready for Phase 11's virtualized grid to replace.
- **Docker changes:** None beyond Phase 2's `DATASET_DIR` mount already being wired.
- **Testing requirements:** Import `example_ready_dataset/` itself as the first real integration test — confirm 218/62/31 image-label pairs import correctly, confirm the polygon-format labels are correctly detected and preserved (§1.7/§6.2), confirm class names map correctly (`car`, `license-plate`).
- **Migration requirements:** None.
- **Acceptance criteria:** `example_ready_dataset/` imports cleanly end-to-end with zero data loss (polygon fidelity preserved, splits correctly assigned from directory structure); a raw unannotated folder also imports cleanly with all images unassigned/unannotated.
- **Dependencies on previous phases:** Phase 3.
- **Risks:** Real-world YOLO dataset YAML variations (§6.1) beyond what `example_ready_dataset/` demonstrates may surface here — budget time for edge cases, don't assume one example generalizes perfectly.

### Phase 7 — Training Job Execution

- **Objective:** Implement `train_worker.py`, the subprocess-based job execution model, DB job tracking, and reconciliation sweep (§9.1).
- **Why it exists:** This is the platform's core original purpose (§1.3's existing scripts), now properly architected.
- **Files/modules changed:** Logic from `train_yolo.py`/`finetune_yolo.py` (Phase 1's cleaned-up versions) is absorbed into `train_worker.py`.
- **New files/modules:** `backend/services/job_manager.py` (subprocess spawn/track/cancel/reconcile), `train_worker.py` (standalone entry point run inside the training container).
- **Architecture changes:** Implements §9.1's full subprocess+DB+reconciliation pattern.
- **Dependencies:** None new.
- **DB changes:** Add `TrainingRun` table (§13.3).
- **API changes:** `/api/training/jobs/*` (create, list, cancel) — **not** the SSE endpoint yet (Phase 8).
- **Frontend changes:** Job creation form (using §9.4's tiered config surface), job list/status view (polled, not yet streamed).
- **Docker changes:** Confirm the training container actually runs `train_worker.py` as spawned by the web container's job manager, across the container boundary established in Phase 2/5.
- **Testing requirements:** Start/cancel/reconciliation-after-restart integration tests; confirm a cancelled job's process is actually terminated (not orphaned) and GPU memory is freed (building directly on Phase 0's spike).
- **Migration requirements:** None.
- **Acceptance criteria:** A user can start a training job against an imported dataset (Phase 6) and a selected model (Phase 5), see it transition `queued → running → completed`, and cancel a running job cleanly. Restarting the backend mid-training correctly marks the job `interrupted` rather than losing track of it.
- **Dependencies on previous phases:** Phase 5, Phase 6, Phase 0 (subprocess-kill spike).
- **Risks:** This is the phase where §16 row 4's "no queue" bet is actually tested under real conditions — if it proves inadequate (e.g., reconciliation edge cases prove harder than expected), this is the natural point to reconsider introducing Huey/arq, not earlier.

### Phase 8 — Training Monitoring (Live Progress)

- **Objective:** Wire Ultralytics callbacks (§9.2) into `train_worker.py`, implement the SSE endpoint (§9.3), and build the live metrics UI (§11.4).
- **Why it exists:** Job execution (Phase 7) without visible progress is not usable — this closes that gap.
- **Files/modules changed:** `train_worker.py` (add callback registration).
- **New files/modules:** `backend/api/training_events.py` (SSE endpoint, tails `progress.jsonl`).
- **Architecture changes:** None beyond §9.2/§9.3 already specify.
- **Dependencies:** None new.
- **DB changes:** None beyond Phase 7's `TrainingRun` (progress itself lives in the JSONL file, §9.2, not the DB — deliberate, to keep DB write pressure low per §10.3).
- **API changes:** `/api/training/jobs/{id}/events` (SSE).
- **Frontend changes:** Live progress panel (epoch/loss/mAP), Recharts-based metric charts (§11.4), GPU status indicator during training.
- **Docker changes:** None beyond what Phase 2/7 already established.
- **Testing requirements:** Empirically capture and lock down `trainer.metrics` key shapes (Phase 0's open item, finalized here against real usage); SSE reconnection behavior test (browser refresh mid-training should resume seeing progress, not lose the connection permanently).
- **Migration requirements:** None.
- **Acceptance criteria:** Starting a training job shows live, per-epoch updating metrics in the browser within one epoch's latency, with no manual page refresh required.
- **Dependencies on previous phases:** Phase 7, Phase 0 (empirical `trainer.metrics` capture).
- **Risks:** Low, given how directly this follows official, source-verified Ultralytics callback behavior (YOLO-FORMAT-AND-API.md §5) — the main risk is the still-open exact-key-shape question, already scoped as this phase's first task.

### Phase 9 — Annotation Project System (Classes, Tags, Data Model)

- **Objective:** Implement the Class/Tag entities (§7.1), per-project task-type enforcement (§7.2/§16 row 8), and the `AnnotationInstance` schema (§13.3) — the data layer the annotation UI (Phase 10/11) will sit on top of.
- **Why it exists:** The canvas work in Phase 10/11 needs a settled data model to save into; building the canvas first would invite rework.
- **Files/modules:** `backend/models/annotation.py`, `backend/api/annotations.py`, `backend/services/label_conversion.py` (wraps Ultralytics' `segments2boxes` etc. per §7.4).
- **Architecture changes:** Establishes the box↔polygon conversion and homogeneity-validation logic (§7.2/§7.4) as a shared service, used by both manual annotation (Phase 10/11) and auto-annotation (Phase 13) alike.
- **Dependencies:** None new (reuses `ultralytics.utils.ops` functions directly, per YOLO-FORMAT-AND-API.md §2).
- **DB changes:** Add `Class`, `Tag`, `AnnotationInstance` tables.
- **API changes:** `/api/projects/{id}/classes`, `/api/projects/{id}/tags`, `/api/images/{id}/annotations/*` (CRUD, no canvas yet).
- **Frontend changes:** Class/tag management UI (create/edit/color-pick) at the project-settings level — not the canvas itself.
- **Docker changes:** None.
- **Testing requirements:** Homogeneity-validation tests (a `segment` project must reject/convert a box-only instance per §7.2's hard constraint); round-trip tests (import a polygon instance from `example_ready_dataset/`, save it unchanged, confirm byte-for-byte-equivalent-geometry export).
- **Migration requirements:** None.
- **Acceptance criteria:** A project's class/tag lists are fully manageable via the UI; the annotation-instance API correctly enforces task-type homogeneity server-side (not just as a UI suggestion).
- **Dependencies on previous phases:** Phase 6 (imported images to annotate), Phase 3.
- **Risks:** Getting the box↔polygon conversion and homogeneity validation right here is foundational — errors surface much more expensively once Phase 10/11's canvas is built on top.

### Phase 10 — Manual Annotation: Bounding Box Tool

- **Objective:** Implement the react-konva canvas (§11.2) with the bounding-box tool (§7.3) end-to-end: draw, assign class/tag, save.
- **Why it exists:** The first concrete, user-facing annotation capability.
- **New files/modules:** `frontend/annotation/Canvas.tsx`, `Rectangle.tsx` (studying Label Studio Frontend's equivalent per §11.2), image navigation/zoom/pan controls.
- **Architecture changes:** None beyond §7.3/§7.5/§11.2 already specify.
- **Dependencies:** `konva`, `react-konva`.
- **DB changes:** None beyond Phase 9's schema.
- **API changes:** None beyond Phase 9's annotation CRUD (canvas now actually calls it).
- **Frontend changes:** Entire phase.
- **Docker changes:** None.
- **Testing requirements:** Frontend interaction tests (draw, resize via Transformer, delete); save round-trip test against the backend.
- **Migration requirements:** None.
- **Acceptance criteria:** A user can draw a bounding box on an image, assign a class and tags, save it, reload the page, and see it persisted correctly; undo/redo (§7.5) works for box create/move/resize/delete.
- **Dependencies on previous phases:** Phase 9.
- **Risks:** This is the phase that validates the react-konva architectural bet from research — if serious friction appears here, it's better discovered now than after Phase 11 (polygon, a strictly harder version of the same interaction model) is also built on it.

### Phase 11 — Manual Annotation: Polygon Tool

- **Objective:** Add the polygon tool (§7.3) alongside the box tool from Phase 10, with correct segment-format export (§7.5).
- **Why it exists:** The `example_ready_dataset/`'s actual label format (§1.7) — this is not a "nice to have," it's what the included real dataset already requires to round-trip correctly.
- **New files/modules:** `frontend/annotation/Polygon.tsx` (click-to-place vertices, close-polygon interaction).
- **Architecture changes:** None beyond §7.2/§7.3 already specify.
- **Dependencies:** None new.
- **DB changes:** None beyond Phase 9's schema (geometry already modeled to support this).
- **API changes:** None beyond Phase 9's annotation CRUD.
- **Frontend changes:** Entire phase.
- **Docker changes:** None.
- **Testing requirements:** Re-run Phase 9's `example_ready_dataset/` round-trip test through the actual UI this time (draw-equivalent polygon geometry, not just API-level); confirm segment-format export is byte-shape-correct for real Ultralytics training consumption.
- **Migration requirements:** None.
- **Acceptance criteria:** A user can draw a polygon, save it, and the exported label file for that image is valid segment-format input Ultralytics will accept without error.
- **Dependencies on previous phases:** Phase 10 (shares canvas/tool-switching infrastructure).
- **Risks:** Polygon close-detection and vertex-editing UX is inherently fiddlier than box editing — budget more UX iteration time here than Phase 10.

### Phase 12 — Automatic Annotation (AI-Assisted)

- **Objective:** Implement inference-based pre-annotation (§14 of the brief) using `model.predict()` (YOLO-FORMAT-AND-API.md §6), with results surfaced as editable, explicitly-flagged "AI-suggested" overlays.
- **Why it exists:** A named, explicit requirement — auto-annotation is a core differentiator of the target platform, not an afterthought.
- **Files/modules:** `predict_worker.py` (inference-only, runs in the training/inference container per §4), `backend/services/inference.py`.
- **Architecture changes:** Reuses the training container's GPU access for inference too — no new container needed, but inference is a separate, shorter-lived subprocess invocation than training (`stream=True` for batch pre-annotation per YOLO-FORMAT-AND-API.md §6, to avoid loading all results into memory at once).
- **Dependencies:** None new.
- **DB changes:** `AnnotationInstance` gains (if not already present from Phase 9) an explicit AI-suggested/reviewed status flag.
- **API changes:** `/api/inference/annotate` (§14).
- **Frontend changes:** "Auto Detect" action, confidence/IoU/class-filter controls (§14's explicit requirement), accept/reject/edit UX for AI-suggested overlays before they count as confirmed annotations.
- **Docker changes:** None beyond what Phase 2/7 already established.
- **Testing requirements:** Confirm `boxes.xywhn`/`masks.xyn` output correctly maps to the project's task-type-appropriate label format (§7.2, reusing Phase 9's conversion service); confirm AI-suggested annotations are visually/data-model distinct from human-confirmed ones until explicitly accepted.
- **Migration requirements:** None.
- **Acceptance criteria:** Selecting a trained model and clicking "Auto Detect" populates editable, clearly-marked-as-AI-suggested boxes/polygons on the current image, with adjustable confidence/IoU thresholds and class filtering; nothing AI-suggested is treated as ground truth until a human accepts it.
- **Dependencies on previous phases:** Phase 5 (model selection), Phase 9 (annotation data model), Phase 10/11 (editing UI the overlays plug into).
- **Risks:** Confidence/IoU defaults matter for first-impression UX (research recommends Ultralytics' own defaults, 0.25/0.7, as a sensible starting point per YOLO-FORMAT-AND-API.md §6) — tune based on real usage, not guesswork.

### Phase 13 — Dataset Export / YOLO Format Finalization

- **Objective:** Implement full dataset export (DB annotation model → on-disk YOLO-formatted directory tree, §6.2/§7.5), ready to feed directly into Phase 7's training jobs or be downloaded for external use.
- **Why it exists:** Training (Phase 7) needs a materialized YOLO dataset to point Ultralytics at — this phase is what actually produces it from the DB-backed annotation work of Phase 9-12.
- **Files/modules:** `backend/services/dataset_export.py`.
- **Architecture changes:** Closes the loop implied by §6.2's "DB is live source of truth, YOLO files are derived" design.
- **Dependencies:** None new.
- **DB changes:** None.
- **API changes:** `/api/datasets/{id}/export` (or equivalent — triggers materialization).
- **Frontend changes:** Export/download action; explicit split-integrity warnings (§6.4) surfaced before export if `valid` is empty, etc.
- **Docker changes:** None.
- **Testing requirements:** Export → re-import round-trip test (export a project's annotations, re-import the resulting directory, confirm identical geometry/class/split data) as the definitive correctness check for the whole annotation pipeline.
- **Migration requirements:** None.
- **Acceptance criteria:** A project's annotations export to a directory structure indistinguishable in shape from `example_ready_dataset/` (§1.7), and that exported directory trains successfully via Phase 7's job pipeline with zero manual fixup.
- **Dependencies on previous phases:** Phase 9, Phase 10, Phase 11.
- **Risks:** This phase is the actual proof that the whole annotation→training loop works end-to-end — treat its acceptance criteria as a hard gate before considering the "core" product complete, not a nice-to-have polish phase.

### Phase 14 — GPU/CPU Diagnostics Page

- **Objective:** Replace `gpu_test.py` (§1.5/§3) with a proper `/api/system/gpu-status`-backed diagnostics UI (§5.3, §20 of the brief).
- **Why it exists:** Named explicitly in the brief; also directly closes the fragility gap identified in the audit (current script crashes on CPU-only hosts).
- **Files/modules:** `backend/api/system.py` (expand beyond the basic health check from Phase 3).
- **Architecture changes:** None beyond §5.3 already specifies.
- **Dependencies:** None new.
- **DB changes:** None.
- **API changes:** Expand `/api/system/gpu-status` with CPU/RAM/GPU/VRAM/CUDA-version/driver info where obtainable.
- **Frontend changes:** System/hardware diagnostics page.
- **Docker changes:** None.
- **Testing requirements:** Verify graceful (non-crashing) behavior on both GPU and CPU-only hosts — directly re-testing the exact failure mode identified in §1.5.
- **Migration requirements:** None (replaces, doesn't migrate, `gpu_test.py` — the old script can be deleted once this ships).
- **Acceptance criteria:** The diagnostics page correctly reports GPU presence/absence on both host types without crashing, matching or exceeding `gpu_test.py`'s original informational intent.
- **Dependencies on previous phases:** Phase 3.
- **Risks:** Low — this is a narrow, well-understood phase.

### Phase 15 — Testing Hardening

- **Objective:** Fill out the full testing strategy (§18) across backend, frontend, YOLO integration, Docker, and annotation-specific scenarios that earlier phases only partially covered inline.
- **Why it exists:** Earlier phases include phase-relevant tests as they go, but a dedicated hardening pass is needed to hit the breadth §32 of the brief describes (Docker CPU/GPU/missing-GPU scenarios, interrupted training, container restart, invalid dataset/model handling end-to-end).
- **Files/modules:** Expand `backend/tests/`, `frontend/tests/`, add `tests/docker/` scenario tests.
- **Architecture changes:** None.
- **Dependencies:** Test tooling only (pytest plugins, frontend testing library, etc. — specific choices are an implementation detail).
- **DB/API/Frontend changes:** None functional (test-only).
- **Docker changes:** CI-runnable Docker test scenarios (CPU-only run, simulated missing-GPU, invalid CUDA config).
- **Testing requirements:** This phase *is* the testing requirements — see §18 for the full breakdown.
- **Migration requirements:** None.
- **Acceptance criteria:** §18's checklist is fully covered with passing automated tests, not just manually verified once.
- **Dependencies on previous phases:** All prior phases (this is explicitly a cross-cutting hardening pass).
- **Risks:** Low technically, but easy to under-budget time for — treat as a real phase with real time allocated, not a footnote.

### Phase 16 — Documentation & Production Packaging

- **Objective:** Deliver the documentation plan (§19) and finalize production-ready Docker packaging (image tagging/versioning, example `.env`, upgrade path notes).
- **Why it exists:** Named explicitly in the brief; current `README.md` is a single line (§1.11) — this phase is what makes the platform actually usable by someone who isn't the original developer.
- **Files/modules:** `README.md` (full rewrite), `docs/` directory.
- **Architecture changes:** None.
- **Dependencies:** None.
- **DB/API/Frontend changes:** None functional.
- **Docker changes:** Finalize versioned image tags, document the CPU/GPU image choice clearly for end users (§5.2's three host tiers).
- **Testing requirements:** "Can a new user follow the docs from zero to a running training job" as a literal, manually-executed acceptance test.
- **Migration requirements:** None.
- **Acceptance criteria:** §19's full documentation checklist exists and has been validated by someone following it fresh (not the original implementer, if at all possible).
- **Dependencies on previous phases:** All prior phases.
- **Risks:** Low.

---

## 18. Testing Strategy

### Backend
- Unit tests: device parsing/validation, quality assessment, job-config schema validation, box↔polygon conversion utilities, path-traversal validation (§15).
- Integration tests: full API CRUD for every entity (§13.3); dataset import/export round-trip (Phase 6/13's core acceptance criteria); job lifecycle (create→run→complete, create→cancel, create→interrupt-via-restart).
- API tests: OpenAPI-schema-driven contract tests; SSE endpoint tests (connect, receive events, disconnect/reconnect).
- Dataset validation tests: malformed `data.yaml`, missing labels directory, mismatched image/label counts, mixed detect/segment rows in one file (should be rejected per §7.2's homogeneity rule).
- Training configuration tests: every §9.4 parameter tier round-trips correctly from UI-submitted config to the actual `model.train()` call arguments.
- Process management tests: subprocess spawn/cancel/kill correctness; startup reconciliation correctness after a simulated unclean shutdown.

### Frontend
- Component tests: canvas shape creation/edit/delete (box and polygon), Transformer resize/rotate interactions, undo/redo stack correctness.
- Annotation interaction tests: full draw→assign-class→save flow; AI-suggested-overlay accept/reject/edit flow (Phase 12).
- API integration tests: mocked-backend tests for every major screen (project list, dataset import, job creation, live progress panel, annotation canvas).

### YOLO-specific
- Model loading: valid `.pt`, missing file, malformed/corrupt file (should fail gracefully, not crash the process).
- Inference: `model.predict()` output correctly parsed into the annotation-instance format for both detect and segment task types.
- Training: end-to-end smoke test using `example_ready_dataset/` (small enough to run quickly) — actually invoke a short (1-2 epoch) real training run through the full pipeline as a CI-friendly integration test, not just unit-level mocks.
- Fine-tuning: same, starting from a previously-produced checkpoint rather than a pretrained one.
- Dataset validation: reuse the backend dataset-validation tests above, but specifically re-verified against Ultralytics' own loader behavior (i.e., confirm the platform's pre-validation actually predicts what Ultralytics itself would accept/reject).
- Annotation export: byte-shape correctness of generated label files, both detect and segment format (Phase 13's round-trip test is the canonical version of this).

### Docker
- CPU-only environment (no GPU present) — full pipeline runs correctly, no crashes, correctly reports CPU-only status.
- NVIDIA GPU environment — GPU is correctly detected and used.
- Missing GPU (GPU image run without `--gpus`/device reservation passed) — should degrade to CPU gracefully via `torch.cuda.is_available()`, not crash.
- Invalid CUDA configuration (toolkit present but misconfigured) — should be distinguishable via diagnostics (§5.3/Phase 14) from "no GPU at all."
- Missing dataset (bad `DATASET_DIR` path) — friendly error, not a raw filesystem exception.
- Invalid dataset (malformed `data.yaml`, corrupt labels) — friendly error at import time, before a training job ever starts.
- Invalid model (malformed/untrusted `.pt`) — rejected per §8.6/§15's validation, not silently loaded.
- Interrupted training (process killed mid-run) — reconciliation sweep correctly marks it `interrupted`, GPU memory is freed.
- Container restart during training — same as above, verified specifically across an actual `docker compose restart` of the training container, not just a simulated process kill.

### Annotation-specific
- Bounding boxes: create/edit/delete/multiple-per-image, all verified in §10/§18-Backend above.
- Polygons: same, plus segment-format-specific export correctness (Phase 11/13).
- Editing existing (imported) annotations without destroying original fidelity (§7.4's "preserve original polygon" requirement).
- Deletion, class changes: correct DB and eventual-export-time consistency.
- Loading existing annotations: the `example_ready_dataset/` import test (Phase 6) is the canonical version of this.
- Saving annotations: covered throughout Phase 9-13's acceptance criteria.
- Automatic model-generated annotations: Phase 12's accept/reject/edit flow, specifically testing that unreviewed AI suggestions never leak into a training export as if they were human-confirmed.

---

## 19. Documentation Plan

- **Installation** — prerequisites (Docker, Docker Compose, and conditionally the NVIDIA Container Toolkit), clone/setup steps.
- **Docker setup** — general Compose usage, image tags, environment variables (`DATASET_DIR`, `MODELS_DIR`, DB connection if Postgres is chosen).
- **GPU setup** — per §5.2's three host tiers, with the Windows/WSL2 tier explicitly documented as "best-effort" with its specific prerequisites (`nvidia-ctk runtime configure` inside WSL2, driver version guidance) and known failure modes (driver mismatch as the most common cause).
- **CPU setup** — explicit confirmation that CPU-only is a fully first-class path, not a degraded afterthought (directly reflecting the brief's own framing that GPU must not be mandatory).
- **NVIDIA Container Toolkit** — installation steps, verification commands (`docker run --rm --gpus all nvidia/cuda:... nvidia-smi` as a sanity check independent of this app).
- **Configuration** — every job-config parameter (§9.4/§21) documented with its meaning, tier (user-facing/advanced/system), and Ultralytics-native name, directly tracing back to this audit's `config.ini` analysis (§1.8) so the documentation has a clear lineage from "what the original scripts already did."
- **Dataset formats** — raw vs. YOLO-formatted input (§6.1), with `example_ready_dataset/` usable as a live, correct worked example in the docs themselves.
- **Annotation format** — detect vs. segment vs. OBB (§7.2), classes vs. tags (§7.1), explained plainly enough that a non-ML-expert user understands why the platform asks them to pick a task type up front.
- **Training** — how to start a job, what each config tier means, how to read the live progress UI.
- **Model management** — mounted-path vs. upload flows (§8), what gets stored where and why (directly addressing the brief's own stated preference about not permanently storing every model).
- **Troubleshooting** — GPU-detection failures (tie directly to Phase 14's diagnostics page), common dataset-import errors, common training-job failures.
- **Architecture documentation** — a maintained version of this roadmap's §4 diagram and §5-§15 decisions, kept current as the source of truth for future contributors (not left to go stale once implementation starts).
- **Developer documentation** — backend layering conventions (Phase 3), frontend component/state conventions (Phase 4), how to add a new API endpoint/DB entity, how to run the test suite (§18).

---

## 20. Migration Strategy

There is no live production deployment to migrate *away from* — the current state is a personal developer's local scripts (§1), not a running service with users. "Migration" in this project's context means three concrete things, all already flagged in their relevant phases above:

1. **Existing binary artifacts committed to git** (§1.9, §3, Phase 1) — deliberate, confirmed-with-the-owner history cleanup, not an automatic bulk delete, since `trained_models/best.pt` is a real trained model the owner may still want.
2. **Existing training logic** (`train_yolo.py`/`finetune_yolo.py`, §3, Phase 1/7) — refactored and absorbed into `train_worker.py`, not thrown away; the underlying Ultralytics call pattern and parameter set are preserved, only the surrounding architecture changes.
3. **Existing `config.ini` values** (§1.8, §21) — become seed/default values for the new job-config schema, not deleted; every key's meaning is preserved even as its storage location changes from a flat INI file to DB-persisted per-job config.

No data migration tooling (e.g., a one-time import script for pre-existing runs under `runs/detect/runs/train/`) is planned, given §1.9's finding that this existing output is already inconsistent/disorganized — Phase 1 explicitly recommends archiving it rather than attempting to reverse-engineer it into the new system.

---

## 21. Configuration Architecture

Resolving the brief's §21 questions directly, building on §9.4's tiering and §1.8's audit:

- **Remain in configuration files:** Docker/deployment-level settings only (`DATASET_DIR`, `MODELS_DIR`, DB connection string, port bindings) — via `.env`/Compose, not application-level `config.ini`.
- **Become database/application settings:** Every current `config.ini` training parameter (§1.8's full list) — becomes either a per-job DB-persisted value (most of them) or a system-derived value (`workers`, per §9.4).
- **User-configurable per training job:** The full §9.4 "user-facing" and "advanced" tiers.
- **Environment variables:** Deployment-time-only concerns — mount paths, DB connection, GPU-image-vs-CPU-image selection (a build-time/Compose-file concern more than a runtime env var, per §5.4).
- **Docker configuration:** Image tag selection (cpu/gpu), volume/mount wiring, resource reservations (§5.1) — all Compose-file-level, not application config.
- **System-level configuration:** GPU detection results (§5.3) — never user-set, always derived at runtime.

Nothing from `config.ini` is dropped without replacement — §1.8's full parameter audit is the direct input to this section, honoring the brief's explicit instruction to understand each parameter's purpose before deciding its fate.

---

## 22. Risks

- **Windows/WSL2 GPU passthrough reliability** (§5.2, §16) — the actual development machine is Windows; this is the single most concrete environment-specific risk, since research confirms this path is genuinely more failure-prone than native Linux, and driver-version mismatch is a common, hard-to-preemptively-rule-out cause. Mitigation: Phase 0's explicit spike on the real dev machine.
- **`trainer.metrics` key-shape uncertainty** (§9.2) — not independently enumerated in Ultralytics' docs; mitigated by Phase 0's empirical-capture task, but a version bump later could still shift key names without warning — recommend pinning Ultralytics tightly and re-verifying on any intentional upgrade.
- **Untrusted `.pt` file execution risk** (§8.6, §15) — a real, actively-discussed issue in the Ultralytics project itself, not a theoretical concern; mitigation is architectural (isolated worker, `weights_only=True`, validation) but residual risk remains inherent to PyTorch's pickle-based checkpoint format regardless of mitigation quality — this should be communicated honestly in documentation (§19), not presented as fully solved.
- **SQLite-vs-Postgres decision resting on an unanswered product question** (§16 row 10) — if development proceeds on the SQLite assumption and the concurrent-user answer later turns out to require Postgres, Phase 3's schema/connection layer needs revisiting; mitigated by SQLAlchemy's abstraction making this a mechanically simple (if not zero-cost) change.
- **"No queue" bet (§9.1, §16 row 4) under-delivering at real scale** — if reconciliation/cancellation edge cases prove harder in practice than the research synthesis suggests, this is a knowable-only-by-building risk; Phase 7 is deliberately scoped to surface this early rather than late.
- **Existing dataset/label-format variations beyond `example_ready_dataset/`** (§6.1) — only one real example dataset has been inspected; other users' YOLO exports (different tools, different Ultralytics versions) may have YAML/label variations not covered here — Phase 6 should budget explicit time for this rather than assuming full generality from one example.
- **Scope creep against the brief's own §30 "don't over-engineer" instruction** — the sheer breadth of this roadmap (17 phases) is inherent to the brief's own breadth, not padding; the risk is treating every phase as equally urgent rather than sequencing strictly (Phase 0-9 is the critical path to a usable core product; Phase 10-16 delivers the full annotation+polish experience) — recommend the project owner explicitly re-confirm phase sequencing/priority once Phase 0's spikes land, rather than treating this document's ordering as immutable.

---

## 23. Future Extensions

Explicitly **not** part of v1, consistent with the brief's own §27/§30 framing — listed here so they're not forgotten, not so they're built prematurely:

- Classification, pose estimation task types (beyond detect/segment/obb, §8.5's task-type list already anticipates these structurally).
- ONNX/exported-format "bring your own model" support (§8.5, §15) — partly motivated by its narrower security surface relative to `.pt` pickle loading.
- Concurrent multi-GPU-job scheduling (MPS/MIG, §5.5) — explicitly deferred until real concurrent-GPU demand exists.
- A real task queue (Huey/arq, §9.1/§16 row 4) if job types multiply beyond training or true multi-node distribution becomes a requirement.
- Object-storage backend (S3/GCS/Azure) for datasets/models, following Label Studio's pluggable-storage precedent (§10.4) — relevant if the platform ever moves beyond single-server/local-filesystem deployment.
- Dataset augmentation previews, dataset statistics/comparison tooling, experiment tracking/model comparison UI, batch inference, active learning workflows — all named in the original brief's §27 as legitimate future directions, none required for a working v1.
- Authentication/authorization layer — entirely dependent on §16 row 10's still-open concurrent-user answer; if the platform stays single-operator, this may never be strictly necessary; if multi-user, it becomes a near-term (not "future") requirement and should be re-scoped into the core phases once that answer is known.

---

## Final Recommended Architecture — Summary

**What is already understood (high confidence, verified against this repo and/or live upstream sources):**
- The current codebase's actual behavior, parameters, and real fragilities (§1) — nothing here is guessed.
- The example dataset's true format is YOLO segmentation/polygon, not detection bboxes (§1.7) — verified by direct inspection and cross-checked against live Ultralytics source.
- Detect/segment/OBB are mutually exclusive, training-time-enforced dataset task types, not a free-mixing UI choice (§7.2) — verified against live Ultralytics source, the single most load-bearing technical fact this research surfaced.
- Ultralytics' callback system is the correct, documented mechanism for live training progress — not log-scraping (§9.2) — verified against official docs.
- The Docker CPU/GPU image-separation pattern, container-topology separation, and subprocess-based job model are all independently corroborated by comparable real-world OSS projects (§5, §9, §10), not invented from scratch.
- A concrete, real security risk exists around untrusted `.pt` file loading (§8.6/§15) — confirmed via live GitHub issues on the Ultralytics repo itself, not speculation.

**What has been decided (recommended defaults this document commits to, pending the explicit open questions below):**
- FastAPI backend, React+Vite+react-konva frontend, SQLite-default/Postgres-if-needed database, subprocess+DB job execution (no Redis/Celery at v1), SSE for progress streaming, two-image (CPU/GPU) Docker packaging with separate web/training containers, mounted-volume-first model/dataset access, per-project enforced task type for annotation.

**What remains uncertain (genuinely open, listed in full in §16):**
- Expected concurrent users (blocks finalizing the DB engine and whether auth is needed at all).
- Exact Windows/WSL2 GPU passthrough reliability on the actual dev machine (untested as of this document).
- Exact `trainer.metrics` key shapes for the eventually-pinned Ultralytics version (not enumerated in docs).
- Whether the "no queue" subprocess architecture holds up under real Phase 7 implementation, or needs revisiting.

**What must be resolved before implementation begins:**
- §16 row 10 (concurrent users) — a product decision only the project owner can make.
- Exact Ultralytics + PyTorch version pins (Phase 0) — everything downstream (Docker base image, `trainer.metrics` shape, `weights_only` security default) depends on this being a specific, deliberate choice, not "whatever's latest at implementation time."

**What Phase 0 should validate first (§17):** version pinning, the subprocess-kill/GPU-memory-release spike, empirical `trainer.metrics` capture, real GPU-passthrough testing on the actual Windows dev machine, and obtaining the concurrent-users answer from the project owner. Every one of these is cheap to get wrong at spike-scale and expensive to discover wrong mid-Phase-7-or-later.

---

*This document contains no implementation. All findings are traceable to either direct repository inspection or the four research files in this same directory. Where research could not reach a confident answer, that is stated explicitly rather than filled in with a guess.*
