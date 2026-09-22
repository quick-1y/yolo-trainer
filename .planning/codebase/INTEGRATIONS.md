---
last_mapped_commit: 229bea01a5922fee6dcff3c76b5dceb1c3e11db9
last_mapped_at: 2026-09-22
---
# External Integrations

**Analysis Date:** 2026-09-22

## APIs & External Services

**Object Detection Framework:**

- Ultralytics YOLOv8 - Local API for model training and inference
  - SDK/Client: ultralytics Python package
  - Auth: None (local package)
  - Used in: `train_yolo.py`, `finetune_yolo.py`

**Deep Learning Framework:**

- PyTorch - Local deep learning framework
  - SDK/Client: torch Python package
  - Auth: None (local package)
  - Used for GPU/CPU computation and model training

## Data Storage

**Datasets:**

- Local filesystem only
  - Training dataset path configured in `config/config.ini`
    - `[Train]` section: `dataset_path = D:/Users/qu1ck1y/Desktop/yolo_dataset_sq`
    - `[Finetune]` section: `dataset_path = D:/Users/qu1ck1y/Desktop/yolo_dataset`
  - Expected format: YOLO dataset with data.yaml file (referenced in `train_yolo.py` line 80)

**Model Storage:**

- Local file system
  - Pre-trained weights: `yolov8n.pt`, `yolo26n.pt` (in project root)
  - Fine-tuned models: `trained_models/best.pt` (configured in `config/config.ini` line 24)
  - Training outputs: `runs/train/` and `runs/finetune/` directories

**File Storage:**

- None (local filesystem only for datasets and models)

**Caching:**

- None detected

## Authentication & Identity

**Auth Provider:**

- None - This is a local training application with no authentication requirements

**Implementation:**

- No user authentication or API keys required
- Configuration file contains only training parameters, no credentials

## Monitoring & Observability

**Error Tracking:**

- None (local error handling only)

**Logs:**

- Python logging module configured per training mode
  - Controlled by `verbose` parameter in `config/config.ini`
  - Ultralytics logging level set conditionally:
    - INFO level when verbose=True (`train_yolo.py` line 55)
    - CRITICAL level when verbose=False (`train_yolo.py` line 58)
  - Console output via Rich library for formatted display

**Metrics Collection:**

- Ultralytics model validation (`model.val()` calls)
  - Precision, Recall, mAP50, mAP50-95 metrics calculated post-training
  - See: `train_yolo.py` lines 115-126, `finetune_yolo.py` lines 127-139

## CI/CD & Deployment

**Hosting:**

- None - Local development/training environment only
- No cloud deployment or remote hosting detected

**CI Pipeline:**

- None detected

**Runtime Environment:**

- Direct Python script execution
- Configurable GPU device selection via `device` parameter in config
- CPU fallback automatic if GPU unavailable (`train_yolo.py` lines 62-68)

## Environment Configuration

**Required env vars:**

- None - All configuration via config/config.ini file

**Secrets location:**

- None - No secrets or API keys required
- Configuration file location: `config/config.ini`

**Configuration File Structure:**

- INI format with two sections: `[Train]` and `[Finetune]`
- No sensitive data (database credentials, API keys, etc.)

## Webhooks & Callbacks

**Incoming:**

- None

**Outgoing:**

- None

## Output Formats

**Model Export:**

- PyTorch format (.pt files) - native Ultralytics/PyTorch model weights
- ONNX support available via Ultralytics (not configured)
- Inference via Ultralytics detect functionality

**Results Storage:**

- Training outputs automatically saved by Ultralytics trainer
  - Directory: `runs/train/plate_exp/` and `runs/finetune/plate_square_exp/`
  - Contains: weights, results.csv, confusion matrix plots, training curves

---

*Integration audit: 2026-09-22*
