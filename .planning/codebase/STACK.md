---
last_mapped_commit: 229bea01a5922fee6dcff3c76b5dceb1c3e11db9
last_mapped_at: 2026-09-22
---
# Technology Stack

**Analysis Date:** 2026-09-22

## Languages

**Primary:**

- Python 3.x - All application code for YOLO training and fine-tuning

## Runtime

**Environment:**

- Python 3.8+ (inferred from dependency requirements)

**Package Manager:**

- pip (implicit - no lock file or requirements.txt present)
- No lockfile detected

## Frameworks

**Core:**

- Ultralytics (YOLOv8) - Object detection model training and inference
  - Located in: `train_yolo.py`, `finetune_yolo.py`
  - Provides model loading, training, validation, and evaluation

**Deep Learning:**

- PyTorch (torch) - Deep learning framework for GPU/CPU computation
  - GPU support via CUDA (auto-detected in training scripts)
  - Device management: GPU selection or CPU fallback

**UI/Output:**

- Rich - Terminal output formatting and visualization
  - Tables, panels, colored console output
  - Used in: `train_yolo.py` (lines 9-12), `finetune_yolo.py` (lines 10-13)

**Utilities:**

- configparser (Python stdlib) - Configuration file parsing
- logging (Python stdlib) - Application logging
- datetime (Python stdlib) - Timestamp and duration tracking
- os (Python stdlib) - File and path operations

## Key Dependencies

**Critical:**

- ultralytics (YOLOv8) - Core model training and inference framework
  - Provides pre-trained weights (yolov8n.pt, yolo26n.pt)
  - Handles dataset YAML configuration
  - Generates training metrics (Precision, Recall, mAP50, mAP50-95)

**Infrastructure:**

- torch (PyTorch) - GPU/CPU tensor operations and neural network training
  - CUDA support for GPU acceleration (optional but recommended)
  - Fallback to CPU if CUDA not available

**Development/Utility:**

- rich - Terminal UI components for formatted output and progress visualization

## Configuration

**Environment:**

- Configuration file: `config/config.ini`
- INI-based configuration with sections for different training modes
- No environment variables for configuration detected

**Build:**

- No build configuration files detected
- Python scripts run directly without compilation

**Key Configuration Sections:**

- `[Train]` - Parameters for initial model training
  - Dataset path, model name, epochs, batch size, device selection
  - Optimizer type (SGD), learning rates, augmentation settings
  - See: `config/config.ini` lines 1-21
- `[Finetune]` - Parameters for fine-tuning existing models
  - Base model path, dataset path, reduced epochs
  - Custom learning rates and warmup configuration
  - See: `config/config.ini` lines 23-42

## Platform Requirements

**Development:**

- Python 3.8 or higher
- NVIDIA GPU with CUDA support (optional but recommended for training)
- At least 8 GB GPU VRAM (mentioned in `train_yolo.py` line 30)
- Dataset in YOLO format with data.yaml file

**Production:**

- Python 3.8+
- PyTorch installation with appropriate backend (CPU or CUDA)
- Pre-trained model weights (.pt files)
- Inference data in supported formats

## Version Tracking

**Model Weights:**

- yolov8n.pt (5.5 MB) - YOLOv8 Nano base model
- yolo26n.pt (6.5 MB) - Alternative Nano variant
- trained_models/best.pt - Project-specific fine-tuned models

---

*Stack analysis: 2026-09-22*
