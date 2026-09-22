---
last_mapped_commit: 229bea01a5922fee6dcff3c76b5dceb1c3e11db9
last_mapped_at: 2026-09-22
---
<!-- refreshed: 2026-09-22 -->

# Architecture

**Analysis Date:** 2026-09-22

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      Entry Point Layer                       │
├──────────────────┬──────────────────┬───────────────────────┤
│  train_yolo.py   │ finetune_yolo.py │    gpu_test.py        │
│  `train_yolo.py` │`finetune_yolo.py`│   `gpu_test.py`       │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Configuration Layer                        │
│              `config/config.ini` (INI Parser)                │
└────┬────────────────────────────────────────────────┬────────┘
     │                                                 │
     ▼                                                 ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│   Helper Functions   │  │   YOLO Model Training Engine     │
│ (Device, Batch, QA)  │  │  (Ultralytics Framework)        │
│`train_yolo.py`(L20-) │  │  - Training                      │
│`finetune_yolo.py`    │  │  - Validation                    │
│  (L21-)              │  │  - Metrics Evaluation            │
└──────────────────────┘  └──────────────────────────────────┘
         │                                 │
         └────────────┬────────────────────┘
                      ▼
        ┌───────────────────────────────┐
        │   Output & Model Storage      │
        ├───────────────────────────────┤
        │ runs/train, runs/finetune     │
        │ trained_models/               │
        │ CUDA Device Management        │
        └───────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Configuration Parser | Load INI config and provide dict-like access to Train/Finetune params | `config/config.ini` |
| Device Handler | Parse GPU/CPU device strings and validate CUDA availability | `train_yolo.py` (L20-26), `finetune_yolo.py` (L21-27) |
| Batch Calculator | Auto-calculate optimal batch size based on image size and GPU VRAM | `train_yolo.py` (L28-31) |
| Quality Assessor | Classify model quality based on mAP50 score | `train_yolo.py` (L33-41), `finetune_yolo.py` (L29-37) |
| Training Orchestrator | Load model, configure training, execute training loop, report metrics | `train_yolo.py` (L47-140) |
| Fine-tuning Orchestrator | Load pre-trained model, configure fine-tuning, validate on test split | `finetune_yolo.py` (L43-152) |
| GPU Test Utility | Simple diagnostic for CUDA availability | `gpu_test.py` |

## Pattern Overview

**Overall:** Configuration-Driven Script Pattern with CLI Entry Points

**Key Characteristics:**

- Configuration externalizes all hyperparameters (no hardcoding in scripts)
- Separate entry points for distinct workflows (training vs fine-tuning vs diagnostics)
- Shared helper functions avoid duplication between train and finetune paths
- Rich Console output for formatted, user-friendly logging instead of plain print
- Ultralytics YOLO as the ML training engine (abstracted away model complexity)

## Layers

**Entry Point Layer:**

- Purpose: Parse command-line context and delegate to workflows
- Location: `train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`
- Contains: Main guard blocks (`if __name__ == "__main__"`)
- Depends on: configparser, workflow functions
- Used by: Direct Python execution

**Configuration Layer:**

- Purpose: Externalize hyperparameters and dataset paths away from code
- Location: `config/config.ini`
- Contains: [Train] and [Finetune] sections with device, batch, learning rate, dataset paths
- Depends on: Nothing (static data)
- Used by: All entry points via configparser

**Helper Functions Layer:**

- Purpose: Provide utility functions used by training/fine-tuning workflows
- Location: Functions at module level before main() in each script
- Contains: parse_device(), auto_batch(), quality_assessment()
- Depends on: torch (for CUDA checks)
- Used by: train(), finetune()

**ML Engine Layer:**

- Purpose: Execute model training and validation using Ultralytics YOLO
- Location: Calls to YOLO() and model.train() / model.val()
- Contains: Ultralytics YOLO class (external)
- Depends on: torch, dataset files (YAML), pre-trained weights
- Used by: train(), finetune() functions

**Output/Storage Layer:**

- Purpose: Persist trained models and training artifacts
- Location: `runs/`, `trained_models/`
- Contains: Model weights (.pt files), training logs, plots
- Depends on: ML engine output
- Used by: Downstream inference tasks, model versioning

## Data Flow

### Primary Training Flow

1. Entry point imports and config read (`train_yolo.py:145-148`)
   - configparser loads `config/config.ini` [Train] section
   - Config dict passed to train() function

2. Device detection and info logging (`train_yolo.py:62-69`)
   - torch.cuda.is_available() checks GPU
   - parse_device() interprets device string from config
   - GPU name or "CPU" printed via Rich console

3. Hyperparameter preparation (`train_yolo.py:70-77`)
   - Image size (imgsz) from config
   - Batch size auto-calculated via auto_batch()
   - Total epochs from config
   - All parameters printed in formatted table

4. Model initialization and training (`train_yolo.py:79-99`)
   - YOLO model loaded from name_model (e.g., yolov8n.pt)
   - data.yaml path resolved from dataset_path config
   - model.train() called with all hyperparams from config
   - verbose logging controlled by config["verbose"]
   - Training runs on GPU/CPU, outputs to project directory

5. Metrics collection and display (`train_yolo.py:102-139`)
   - Best model path resolved from trainer.save_dir
   - model.val() runs validation on dataset
   - mean_results() extracts precision, recall, mAP50, mAP95
   - Metrics formatted in Rich table
   - Quality assessment applies mAP50 thresholds for user feedback
   - Total elapsed time calculated and displayed

### Fine-tuning Flow

1. Entry point and config load (`finetune_yolo.py:158-161`)
   - Same pattern: configparser loads [Finetune] section

2. Device setup (`finetune_yolo.py:58-64`)
   - Same GPU/CPU detection and parse_device()

3. Hyperparameter stage (`finetune_yolo.py:66-73`)
   - Same image size, epochs, batch preparation

4. Model loading and fine-tuning (`finetune_yolo.py:76-110`)
   - **Key difference:** Base model loaded from config["base_model_path"] (e.g., trained_models/best.pt)
   - FileNotFoundError if base model missing
   - model.train() called with pretrained=False (don't reload yolov8n.pt)
   - resume=False prevents continuing a previous incomplete run
   - Learning rates (lr0, lrf) typically lower than from-scratch training
   - Augmentation and warmup configured per Finetune section

5. Test validation and metrics (`finetune_yolo.py:126-152`)
   - **Key difference:** model.val() uses split="test" to evaluate on test dataset
   - Same metrics collection and quality assessment
   - Results displayed in Rich table

### Diagnostic Flow

1. GPU test (`gpu_test.py:1-3`)
   - torch.cuda.is_available() prints True/False
   - torch.cuda.get_device_name(0) prints GPU name or error

**State Management:**

- Mutable state: None at the module level
- Configuration state: Read-only, passed as parameter to functions
- Model state: Managed entirely by Ultralytics YOLO class (not exposed to our code)
- Output state: Persisted to disk (runs/, trained_models/) by YOLO trainer

## Key Abstractions

**Model Configuration Object:**

- Purpose: Centralize all hyperparameters and paths in one place
- Examples: `config["Train"]` and `config["Finetune"]` from configparser
- Pattern: Dict-like interface (section[key]), supports getint/getfloat/getboolean conversions

**Device Abstraction:**

- Purpose: Parse device string (CPU, GPU index, multi-GPU list) into format Ultralytics expects
- Examples: parse_device("0") → 0, parse_device("0,1") → [0, 1], parse_device("cpu") → "cpu"
- Pattern: Simple string parser, returns int/list/string based on input

**Quality Classification:**

- Purpose: Convert numeric mAP50 score into user-friendly feedback
- Examples: mAP50 ≥0.90 → "🔥 Отличная модель"
- Pattern: Threshold-based classification with emoji visual cues

## Entry Points

**Training Script:**

- Location: `train_yolo.py`
- Triggers: `python train_yolo.py`
- Responsibilities: Load fresh model (yolov8n.pt), train from scratch on dataset, report final metrics

**Fine-tuning Script:**

- Location: `finetune_yolo.py`
- Triggers: `python finetune_yolo.py`
- Responsibilities: Load pre-trained model (e.g., trained_models/best.pt), fine-tune on new dataset, validate on test split

**GPU Diagnostic:**

- Location: `gpu_test.py`
- Triggers: `python gpu_test.py`
- Responsibilities: Verify CUDA is available and print GPU name

## Architectural Constraints

- **Threading:** Single-threaded event loop; Ultralytics YOLO internally manages DataLoader workers (config["workers"])
- **Global state:** No module-level mutable state; config read once at startup
- **Circular imports:** None detected; clean dependency graph (entry points → helpers → YOLO)
- **External dependency:** Ultralytics YOLO package handles all model complexity; we only orchestrate
- **Configuration source:** Single INI file; multiple workflows (Train, Finetune) share structure but separate sections
- **Output destinations:** Hard-coded to runs/ and trained_models/; driven by config["project"] and config["name"]

## Anti-Patterns

### Duplicate Helper Functions

**What happens:** parse_device() and quality_assessment() defined in both train_yolo.py and finetune_yolo.py
**Why it's wrong:** Code duplication makes maintenance harder; bug fix needed in one place requires fix in two places
**Do this instead:** Extract parse_device() and quality_assessment() to a shared utils module (e.g., `utils.py`), then import in both scripts

### Hard-coded Config Path

**What happens:** Both scripts hard-code "Config/Config.ini" or "config/config.ini" as the config file path (train_yolo.py:147, finetune_yolo.py:160)
**Why it's wrong:** No flexibility to test with alternate configs or support different environments
**Do this instead:** Pass config path as command-line argument or environment variable, with a sensible default fallback

### Logging via Rich Console

**What happens:** Rich library used for formatted output, but no structured logging for downstream analysis
**Why it's wrong:** Training metrics only visible in terminal; not persisted for dashboards or alerts
**Do this instead:** Use Python logging module with file handler in addition to Rich console for formatted output

## Error Handling

**Strategy:** Immediate failure on preconditions; let Ultralytics exceptions bubble

**Patterns:**

- FileNotFoundError raised if base model not found (finetune_yolo.py:80)
- CUDA device parsing via parse_device() attempts parse but no validation; Ultralytics will error if invalid
- Logging level set based on verbose config; exceptions from YOLO training not caught (let user see full traceback)

## Cross-Cutting Concerns

**Logging:** 

- Rich Console for user-facing formatted output (tables, panels, colors)
- Ultralytics logging level controlled by verbose config flag
- No structured logging to files by default

**Validation:** 

- Base model file existence checked before loading (finetune_yolo.py:78-80)
- Device string syntax validated by parse_device()
- No validation of dataset YAML structure (delegated to Ultralytics)

**Configuration:** 

- Centralized in config/config.ini with two sections
- Parameters passed as dict to train()/finetune() functions
- Conversion to appropriate types (int, float, bool) done at read time via configparser methods

**Device Management:** 

- CUDA availability checked at runtime
- Device string supports single GPU (0), multi-GPU (0,1), or CPU (cpu)
- Batch size auto-calculated based on image size and GPU VRAM if not explicitly set (train_yolo.py:28-31)

---

*Architecture analysis: 2026-09-22*
