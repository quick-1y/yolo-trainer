---
last_mapped_commit: 229bea01a5922fee6dcff3c76b5dceb1c3e11db9
last_mapped_at: 2026-09-22
---
# Codebase Structure

**Analysis Date:** 2026-09-22

## Directory Layout

```
yolo-trainer/
├── config/                          # Configuration files
│   └── config.ini                   # Hyperparameters for Train and Finetune workflows
├── runs/                            # Training and inference output artifacts
│   └── detect/                      # Detection run subdirectory (may contain multiple runs)
├── trained_models/                  # Pre-trained and fine-tuned model storage
│   └── best.pt                      # Pre-trained/baseline model (PyTorch weights)
├── train_yolo.py                    # Entry point for training from scratch
├── finetune_yolo.py                 # Entry point for fine-tuning pre-trained models
├── gpu_test.py                      # Diagnostic utility to check CUDA availability
└── README.md                        # Project documentation (minimal)
```

## Directory Purposes

**config/:**

- Purpose: Store externalized hyperparameter and path configuration
- Contains: INI-format configuration file
- Key files: `config/config.ini` (contains [Train] and [Finetune] sections with device, batch, learning rates, dataset paths, etc.)

**runs/:**

- Purpose: Store training and inference artifacts (logs, weights, plots)
- Contains: Subdirectories created by Ultralytics YOLO trainer per run
- Key files: weights/best.pt, weights/last.pt, training plots (results.png, etc.), training logs
- Note: Generated directory; not committed to version control typically

**trained_models/:**

- Purpose: Store pre-trained baseline models or intermediate checkpoints
- Contains: PyTorch model weights (.pt files)
- Key files: `trained_models/best.pt` - model used as starting point for fine-tuning
- Note: Contains binary model files; should be managed via LFS or artifact storage in production

**(Root level):**

- Purpose: Entry point scripts and project metadata
- Contains: Training/fine-tuning/diagnostic scripts and documentation
- Key files: train_yolo.py, finetune_yolo.py, gpu_test.py, README.md

## Key File Locations

**Entry Points:**

- `train_yolo.py`: Execute `python train_yolo.py` to train a model from scratch using yolov8n.pt base
- `finetune_yolo.py`: Execute `python finetune_yolo.py` to fine-tune a pre-trained model from trained_models/best.pt
- `gpu_test.py`: Execute `python gpu_test.py` to verify CUDA is available and print GPU name

**Configuration:**

- `config/config.ini`: Single configuration file with [Train] and [Finetune] sections; INI format parsed by configparser
  - [Train] section: dataset_path, name_model (e.g., yolov8n.pt), pretrained, epochs, imgsz, device, batch calculation params
  - [Finetune] section: base_model_path (e.g., trained_models/best.pt), dataset_path, epochs, learning rates (lr0, lrf), batch size, etc.

**Core Logic:**

- `train_yolo.py:47-140`: Main train() function orchestrates model loading, training, and metric reporting
- `train_yolo.py:20-31`: Helper functions (parse_device, auto_batch)
- `train_yolo.py:33-41`: Quality assessment function
- `finetune_yolo.py:43-152`: Main finetune() function with pre-trained model loading and test validation
- `finetune_yolo.py:21-37`: Shared helper functions

**Testing/Diagnostics:**

- `gpu_test.py`: Simple two-line GPU diagnostic (no test framework; manual execution)

## Naming Conventions

**Files:**

- Workflow scripts: snake_case with descriptive verbs (`train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`)
- Configuration: lowercase with underscore (`config.ini`)
- Model weights: descriptive names (`best.pt`, `last.pt`)

**Directories:**

- Configuration: lowercase singular (`config/`)
- Outputs: lowercase plural (`runs/`, `trained_models/`)
- Subdirectories created by YOLO: snake_case (`detect/`, `train/`, `finetune/`)

**Functions:**

- Helper utilities: snake_case (`parse_device`, `auto_batch`, `quality_assessment`)
- Main workflow functions: snake_case verb (`train`, `finetune`)
- Avoid: CamelCase not used in this codebase

**Variables:**

- Configuration keys: snake_case matching INI section keys (`device_value`, `verbose_mode`, `base_model_path`)
- Computed values: descriptive snake_case (`total_time`, `precision`, `gpu_name`)
- Temporary/iteration: single letters OK for loops (e.g., model outputs)

**Types:**

- No explicit type hints in current code (Python 3.6+ style)
- Dynamic typing; rely on configparser type conversion methods (getint, getfloat, getboolean)

## Where to Add New Code

**New Training Workflow (e.g., distillation, pruning, quantization):**

- Create new entry point script at root: `distill_yolo.py` (same pattern as train_yolo.py)
- Add [Distill] section to `config/config.ini`
- Extract shared helpers (parse_device, quality_assessment) into `utils.py` and import in all workflows
- Follow function signature: def distill(config): ... (config passed as dict-like parameter)

**New Helper Function:**

- Currently duplicated in train_yolo.py and finetune_yolo.py (parse_device, quality_assessment)
- Create `utils.py` in project root
- Move shared functions to utils.py
- Import at top of both train_yolo.py and finetune_yolo.py: `from utils import parse_device, quality_assessment, auto_batch`
- Update only one copy in future

**New Diagnostic Utility:**

- Create new script at root with descriptive name (e.g., `dataset_validate.py`, `model_export.py`)
- Follow pattern: import dependencies, define main function, use if __name__ == "__main__" guard
- Add to config if it needs parameters, otherwise inline defaults

**New Configuration Section:**

- Add new [SectionName] block to `config/config.ini`
- Add corresponding entry point script that reads conf.read("config/config.ini") and accesses conf["SectionName"]

**Data/Models:**

- Pre-trained baseline models: Place in `trained_models/` (e.g., trained_models/baseline_v2.pt)
- Training outputs: Ultralytics YOLO writes to runs/[project]/[name]/ automatically; don't manage manually
- Dataset files: Keep external (linked via dataset_path in config); don't commit large YOLO datasets to repo

## Special Directories

**runs/:**

- Purpose: YOLO trainer output (auto-generated)
- Generated: Yes (created by Ultralytics YOLO during model.train())
- Committed: No (typically gitignored; contains large training logs and plots)

**trained_models/:**

- Purpose: Model weight storage (manually managed or CI/CD artifact)
- Generated: No (manually placed or downloaded from upstream)
- Committed: Conditionally (small models could be committed; large models typically use Git LFS or artifact storage)

**.claude/, .idea/:**

- Purpose: IDE and Claude Code configuration
- Generated: Yes
- Committed: No (in .gitignore)

## Import Organization

**Pattern Observed:**

```python

# Standard library (built-in)

import os
import logging
from datetime import datetime
import configparser

# Third-party dependencies

import torch
from ultralytics import YOLO
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box
```

**Order:**

1. Python standard library imports (os, sys, logging, datetime, configparser)
2. Third-party ML/framework imports (torch, ultralytics)
3. Third-party UI/display imports (rich)
4. (No internal/relative imports currently; single-file modules)

**When adding new code:** Follow this order in any new modules

## Code Organization Pattern

**Current Scripts (train_yolo.py, finetune_yolo.py):**

1. Imports block (lines 1-14)
2. Console setup (line 14: `console = Console()`)
3. Comment section markers (`# ========= ... =========`)
4. Helper functions group (lines 20-41 in train_yolo.py)
5. Main workflow function (train() or finetune(), ~100 lines each)
6. If __name__ guard with entry point (lines 145-148)

**Pattern to follow for new scripts:**

- Keep everything in one file per workflow (no need for module structure yet)
- Use comment section markers for readability
- Keep helper functions above main function
- Use if __name__ == "__main__" guard for entry point

## Configuration Access Pattern

**How config is passed and used:**

```python

# At entry point

conf = configparser.ConfigParser()
conf.read("config/config.ini")
train(conf["Train"])  # Pass specific section as dict-like object

# Inside train() function

def train(config):
    # Access via config dict-like interface
    device_value = parse_device(config["device"])
    imgsz = config.getint("imgsz")
    epochs = config.getint("epochs")
    batch = auto_batch(imgsz)
    verbose_mode = config.getboolean("verbose", fallback=False)
```

**When adding new config parameters:**

1. Add to [Train] or [Finetune] section in config/config.ini
2. Access in function via config["key"] or config.get("key") or config.getint("key") etc.
3. No need to update function signatures; pass entire section dict

---

*Structure analysis: 2026-09-22*
