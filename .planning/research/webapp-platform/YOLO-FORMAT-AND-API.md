# Ultralytics YOLO: Data Formats and Python API — Research

**Researched:** 2026-09-22
**Scope:** Verifying label format assumptions for the example dataset and informing a web-based annotation tool that must emit correct YOLO label files (boxes and polygons) and integrate with Ultralytics training/inference.

---

## 0. Validation of the example dataset

I read `example_ready_dataset/data.yaml` and a label file directly (`train/labels/26000_jpg.rf...txt`).

- `data.yaml`: `nc: 2`, `names: ['car', 'license-plate']`, with `train/val/test` relative paths. This is a standard Ultralytics dataset YAML — nothing in it declares the annotation shape (box vs polygon). Confirmed below (Q1) that Ultralytics does not read task type from this file.
- The label file's two lines each start with a class id (`0`, `1`) followed by a long, even-length sequence of normalized `x y` pairs (e.g. line 1 has 166 coordinate values = 83 points). This is **not** the 5-value `class x_center y_center width height` detect format. It is exactly the segmentation polygon format: `<class-index> <x1> <y1> ... <xn> <yn>`.

**Your read is confirmed correct: this Roboflow export is polygon/segmentation-format YOLO labels, not detection-format bounding boxes.**

**Confidence: HIGH** (direct file inspection, cross-checked against official format spec in Q1).

---

## 1. Detection vs segmentation label format, and how Ultralytics decides the task

### Finding

**Detection format** (one line per object):
```
<class-index> <x_center> <y_center> <width> <height>
```
Exactly 5 whitespace-separated values. All coordinates normalized to `[0,1]` (divide x/width by image width, y/height by image height). Example: `0 0.5 0.45 0.3 0.6`.

**Segmentation format** (one line per object):
```
<class-index> <x1> <y1> <x2> <y2> ... <xn> <yn>
```
Class index plus a normalized polygon outline, minimum 3 points (≥7 values total). Row length is variable and does not need to match across rows in the same file.

**Is a polygon-labeled dataset interchangeable with detection training?** Partially, and only in one direction — this is the key nuance:

I pulled the actual loader source (`ultralytics/data/utils.py::verify_image_label` and `ultralytics/data/dataset.py::YOLODataset.verify_labels`, current `main` branch) rather than trusting docs prose, and the mechanism is:

- Every label file is parsed the same way regardless of task. If any row has **more than 6 columns**, the whole file is treated as segment-format: the polygon geometry is kept as `segments`, and a bounding box is *also* derived from it via `segments2boxes()` (tight axis-aligned box around the polygon). A file cannot mix a 5-value row with polygon rows — that raises `"labels mix segment and detection rows"`.
- The dataset-level task (`self.use_segments`, `self.use_keypoints`, `self.use_obb`) is set from a `task` string passed into `YOLODataset(...)`, **not** inferred from the label files or `data.yaml`. This `task` comes from which trainer/model class is instantiated (see below).
- `YOLODataset.verify_labels()` then enforces consistency for the *whole dataset* against that task:
  - If `task == "segment"` and the counts of derived boxes vs. polygons differ across the dataset (i.e., some images only have plain 5-value box rows, contributing 0 segment points), it **raises `ValueError`**: *"Segment dataset requires equal numbers of boxes and segments... Please supply a segment dataset, not a detect dataset."* → **You cannot train a `-seg` model on box-only labels.**
  - If `task == "detect"` (segments not required) but the labels *do* contain polygon rows, Ultralytics just uses the auto-derived bounding boxes (via `segments2boxes`) and silently drops the polygon data. **So yes — you CAN point a detection model (`YOLO('yolov8n.pt')`) at your polygon-labeled dataset today, and it will train fine**, using the tight bounding rectangle of each polygon as the box. No manual conversion is strictly required for detection training, though for a purpose-built annotation tool you should still generate clean detect-format files when the user is only drawing boxes (see Q2/Recommendation).

**How the task is actually determined** — I checked `ultralytics/nn/tasks.py::guess_model_task()`:
- For a `.pt` checkpoint: task is read from `model.args["task"]` / `model.yaml` if present, otherwise guessed by inspecting the model's final head module type (`Segment`→segment, `Detect`→detect, `Pose`→pose, `OBB`→obb, `Classify`→classify).
- For exported formats (ONNX/TensorRT/etc.): task is read from embedded export metadata.
- It is **explicit at model-load time**, driven by which checkpoint you load — `YOLO('yolov8n.pt')` (or `yolo11n.pt`, `yolo26n.pt`) is a detect model, `YOLO('yolov8n-seg.pt')` is a segment model, etc. You can also pass `task='segment'` explicitly when constructing from a `.yaml` architecture.
- `data.yaml` only supplies `nc`, `names`, and split paths — it plays no role in task selection.

### Recommendation/Implication for this project

- The annotation tool's own "task type" concept (box vs polygon annotation) is a **UI/UX and label-writer decision**, not something Ultralytics infers from the label file. **You must ask the user (or infer from project config) which training task they intend** (`detect` vs `segment` vs `obb`) and write label files consistently for the *whole dataset* in that format.
- If the tool lets a user mix annotation types per image (draw a box on one object, a polygon on another) within a project intended for **segmentation training**, this WILL break Ultralytics training with a hard `ValueError` unless every object has a real polygon. Practical fix: when the user draws a plain rectangle in a segmentation project, auto-emit it as a **4-point polygon** (see Q2) so every row has `>6` values and the box/segment counts match.
- If the project is a **detection** project, it's safe to also accept/import polygon-format labels (Ultralytics will collapse them to bounding boxes automatically) — but the tool should still store/display the box form for consistency and should not rely on this fallback as the primary code path.
- Because task is bound to the checkpoint, your backend's "train" step must pick the model filename (`yolov8n.pt` vs `yolov8n-seg.pt` vs `yolo11n-obb.pt`) to match the dataset's label format — this is a hard requirement, not a preference.

### Sources/evidence
- https://docs.ultralytics.com/datasets/detect/ (detect format, YAML fields)
- https://docs.ultralytics.com/datasets/segment/ (segment format, minimum points, box/polygon count mismatch behavior)
- `ultralytics/data/utils.py::verify_image_label` — fetched directly from `raw.githubusercontent.com/ultralytics/ultralytics/main/ultralytics/data/utils.py` (lines ~327–387), quoted inline above
- `ultralytics/data/dataset.py::YOLODataset.__init__` and `.verify_labels` — fetched from same repo (lines ~90–255)
- `ultralytics/nn/tasks.py::guess_model_task` — fetched from same repo (lines ~2259–2320)

**Confidence: HIGH** — verified against live source on the `main` branch, not just prose docs, with three independent code paths cross-checked (label parsing, dataset-level validation, task inference).

---

## 2. Converting between bounding box and polygon

### Finding

**Box → polygon (4-point rectangle):** No dedicated Ultralytics utility exists for "expand xywh box into a 4-corner polygon" — but it's trivial given existing utilities. Official conversion helpers in `ultralytics.utils.ops`:
- `xywh2xyxy`, `xyxy2xywh`, `xywhn2xyxy`, `xyxy2xywhn`, `ltwh2xywh`, `xyxy2ltwh`, etc. — convert between box representations (center-form, corner-form, top-left-form; normalized or pixel).
- From `xyxy` `(x1, y1, x2, y2)`, the 4-point polygon is simply the four corners in order: `(x1,y1), (x2,y1), (x2,y2), (x1,y2)` — one line of code, not something Ultralytics ships as a named function.

**Polygon → bounding box:** Official utility exists: `segments2boxes(segments)` in `ultralytics.utils.ops`, which takes a list of `(N,2)` polygon arrays and returns tight axis-aligned `xywh` boxes (this is literally the function the loader itself uses internally, per Q1). Also `segment2box(segment, width, height)` for a single polygon → box in pixel space.

**OBB-specific conversions:** `xyxyxyxy2xywhr` (4-corner → center/width/height/rotation) and `xywhr2xyxyxyxy` (the inverse) — used for oriented boxes specifically (see Q3).

**Mask → polygon** (relevant if you ever run segmentation inference and need polygon output): `masks2segments(masks)` converts binary mask tensors to polygon point lists using `cv2.findContours`.

### Recommendation/Implication for this project

- Implement a small conversion module in your backend/label-writer, but you don't need to reinvent the geometry math for the polygon→box direction — call `ultralytics.utils.ops.segments2boxes` (or reimplement the ~5-line min/max logic if you want to avoid an Ultralytics import in a lightweight writer service). For box→polygon, just emit the 4 corners in consistent winding order (clockwise or counter-clockwise, doesn't matter to Ultralytics but be consistent for canvas rendering).
- This conversion is exactly what you need for the "let a user draw a box in a segmentation project" case flagged in Q1's recommendation — convert on write, not on load, so the on-disk label files are always homogeneous per Ultralytics' rules.
- For reverse editing (loading an existing polygon-labeled dataset like the example one into a box-editing UI), compute the bounding rectangle for display purposes with the same `segments2boxes`-equivalent logic, but preserve the original polygon in a hidden field so you don't silently destroy annotation fidelity when the user re-saves without touching that instance.

### Sources/evidence
- `ultralytics/utils/ops.py` — fetched directly from `raw.githubusercontent.com/ultralytics/ultralytics/main/ultralytics/utils/ops.py`; confirmed function list: `segment2box`, `xyxy2xywh`, `xywh2xyxy`, `xywhn2xyxy`, `xyxy2xywhn`, `xywh2ltwh`, `xyxy2ltwh`, `ltwh2xywh`, `xyxyxyxy2xywhr`, `xywhr2xyxyxyxy`, `ltwh2xyxy`, `segments2boxes`, `resample_segments`, `masks2segments`
- https://docs.ultralytics.com/usage/simple-utilities/ (documents the same functions with usage examples)

**Confidence: HIGH** — verified against live source, function signatures confirmed by grep of the actual file.

---

## 3. Mixing detect/segment labels in one dataset; OBB as a third format

### Finding

**Mixing within one dataset is not supported for training.** As shown in Q1, `YOLODataset.verify_labels()` enforces homogeneity across the whole dataset for the task you're training (segment task requires every object to have a real polygon; box-only objects trigger a hard error). Within a single label file, a 5-value row and a polygon row cannot coexist (`assert not any(len(x) == 5 ...)`). The one asymmetry: a **detect** task tolerates polygon rows in the source files (auto-collapsed to boxes), so technically a *detect* dataset can contain polygon-authored labels without erroring — but a *segment* dataset cannot contain plain box-authored labels. Practically: **treat "detect" and "segment" as mutually exclusive dataset modes** for this project; don't rely on the asymmetric detect-side tolerance as a feature.

**OBB (Oriented Bounding Box) is a distinct third task/format**, not a variant of detect or segment:
- Label format: `<class-index> <x1> <y1> <x2> <y2> <x3> <y3> <x4> <y4>` — four corner points, normalized `[0,1]`, representing a rotated rectangle (not axis-aligned).
- Internally, losses/training operate on `xywhr` (center x, center y, width, height, rotation angle in radians), but the on-disk label format is always the 4-corner form.
- OBB has its own dataset validation path (`self.use_obb = task == "obb"` in `YOLODataset.__init__`), its own model head module (`OBB`), and its own pretrained checkpoints (`yolo11n-obb.pt`, etc.).
- Used for aerial imagery, rotated text/license plates, etc. — notably relevant since your example dataset's second class is `license-plate`, which is a classic OBB use case if plates appear rotated/skewed in the source images (current dataset uses full polygon segmentation instead, which is a superset but heavier to annotate than a 4-point oriented box for a roughly-rectangular object).

### Recommendation/Implication for this project

- Model the annotation "task type" as a first-class, per-project setting with (at least) three mutually exclusive values: `detect`, `segment`, `obb`. Do not let users freely mix box/polygon/rotated-box annotations within one export intended for training — either enforce one mode per project, or auto-convert everything to the dominant/selected mode at export time (per Q2).
- Given the domain (car + license-plate), consider offering **OBB** as an option for the license-plate class specifically — plates are near-rectangular and rotate with vehicle angle, so a 4-point rotated box is much faster to annotate than a full polygon and trains a lighter model than full segmentation, while being more geometrically accurate than an axis-aligned box for tilted plates. This is a product suggestion, not a hard requirement.

### Sources/evidence
- https://docs.ultralytics.com/datasets/obb/ (OBB format spec, example line, `use_cases`)
- `ultralytics/data/dataset.py` (task flags `use_segments`/`use_keypoints`/`use_obb`, `verify_labels` homogeneity check) — fetched from source as in Q1

**Confidence: HIGH** for format/validation mechanics (source-verified). **MEDIUM** for the OBB-for-license-plates product recommendation (reasonable inference from the domain, not something Ultralytics docs state directly).

---

## 4. Task types and pretrained checkpoint naming convention

### Finding

Ultralytics YOLO (current line, e.g. YOLO11/YOLO26, and YOLOv8 which the example dataset predates) supports these task types, each with dedicated pretrained checkpoints:

| Task | Purpose | Checkpoint pattern |
|------|---------|---------------------|
| `detect` | Axis-aligned bounding-box object detection | `yolo11n.pt`, `yolo11s.pt`, `yolo11m.pt`, `yolo11l.pt`, `yolo11x.pt` (no suffix) |
| `segment` | Instance segmentation (per-object polygon/mask) | `yolo11n-seg.pt`, ... `-x-seg.pt` |
| `classify` | Whole-image classification | `yolo11n-cls.pt`, ... |
| `pose` | Keypoint/pose estimation | `yolo11n-pose.pt`, ... |
| `obb` | Oriented bounding box detection | `yolo11n-obb.pt`, ... |

(Newer releases add `semantic` segmentation and `depth` estimation task heads too, per `guess_model_task`'s docstring, but these are not relevant to this project.)

Naming convention: `yolo<version><size>[-<task-suffix>].pt`. Size suffix (`n`/`s`/`m`/`l`/`x`) trades speed for accuracy (nano → extra-large). No suffix = detect. `-seg`, `-cls`, `-pose`, `-obb` select the task. This pattern holds across YOLOv8, YOLO11, and the newer YOLO26 generation — version number changes, suffix scheme doesn't.

### Recommendation/Implication for this project

- Build the model-selection UI/backend around this convention: when a user picks a base model to fine-tune, filter the offered checkpoints by the project's task type (`detect`/`segment`/`obb`) so they can't accidentally start a segmentation fine-tune from a plain detect checkpoint (mismatched head shapes will error or silently reinitialize the head).
- Store the resolved `task` string (from `guess_model_task` semantics) alongside any model file the user uploads, so the rest of the pipeline (training config generation, label format validation) can key off it rather than re-deriving it ad hoc.

### Sources/evidence
- https://docs.ultralytics.com/tasks/ (task list, checkpoint naming table)
- https://docs.ultralytics.com/models/yolov8 (YOLOv8-specific checkpoint families, relevant since example dataset is a v8-era Roboflow export)
- `ultralytics/nn/tasks.py::guess_model_task` docstring (task string enum)

**Confidence: HIGH**

---

## 5. Training callbacks for live metric streaming

### Finding

Ultralytics exposes a callback system you can hook without parsing log files. `model.add_callback(event_name, function)` registers a function invoked at defined lifecycle points. Relevant events for a live-metrics UI:

- Training: `on_pretrain_routine_start`, `on_train_start`, `on_train_epoch_start`, `on_train_batch_start`, `on_train_batch_end`, `on_train_epoch_end`, `on_model_save`, `on_fit_epoch_end`, `on_train_end`
- Validation (runs each epoch as part of `fit`): `on_val_start`, `on_val_batch_start`, `on_val_batch_end`, `on_val_end`
- Prediction (relevant for Q6's live-inference use case too): `on_predict_start`, `on_predict_batch_start`, `on_predict_postprocess_end`, `on_predict_batch_end`, `on_predict_end`

The callback function receives the live `Trainer` (or `Validator`/`Predictor`) object itself — not a plain dict — giving access to:
- `trainer.metrics` — dict of current metrics (loss components, mAP50, mAP50-95, precision, recall, depending on task)
- `trainer.loss_names` — names matching the loss tensor components
- `trainer.tloss` — running total loss tensor
- `trainer.best_fitness`, `trainer.epoch`, `trainer.epochs` for progress tracking

Example (from official docs):
```python
from ultralytics import YOLO

def print_checkpoint_metrics(trainer):
    print(
        f"Best fitness: {trainer.best_fitness}, "
        f"Loss names: {trainer.loss_names}, "
        f"Metrics: {trainer.metrics}, "
        f"Total loss: {trainer.tloss}"
    )

model = YOLO("yolo26n.pt")
model.add_callback("on_model_save", print_checkpoint_metrics)
results = model.train(data="coco8.yaml", epochs=3)
```
`on_fit_epoch_end` is the most useful single hook for a "per-epoch metrics" UI — it fires once per epoch after both train and val complete, when `trainer.metrics` is fully populated for that epoch (mAP, precision, recall included, not just training loss which is available earlier at `on_train_epoch_end`).

### Recommendation/Implication for this project

- **Do not parse Ultralytics' console/log output for live metrics.** Register a callback (`on_fit_epoch_end`, and optionally `on_train_batch_end` for finer-grained progress within an epoch) on the `YOLO` model instance before calling `.train()`, and inside the callback push `trainer.metrics` (JSON-serializable after `dict(trainer.metrics)`/casting tensors to floats) to your backend's event stream (SSE/WebSocket) for the frontend.
- Since training is typically a long-running, blocking call, this must run in a background worker/process; the callback closure needs a reference to your streaming/queue mechanism (e.g., capture a queue or websocket-broadcast function in the callback's closure, or write to a small SQLite/JSON progress file the API server polls).
- `on_train_end` / `on_model_save` are good hooks for "final artifacts ready" notifications (best.pt/last.pt paths available via `trainer.best`/`trainer.last`).

### Sources/evidence
- https://docs.ultralytics.com/usage/callbacks/ (full event list, Trainer/Validator/Predictor objects, code example)
- https://github.com/ultralytics/ultralytics/blob/main/docs/en/usage/callbacks.md (source of the same page)

**Confidence: HIGH** for the mechanism and event names (official docs, code example reproduced verbatim). **MEDIUM** for the exact shape/keys of `trainer.metrics` dict per task (docs don't enumerate exact key strings like `metrics/mAP50(B)`; recommend a quick empirical check — print `trainer.metrics` on a first real training run — before finalizing the streaming schema).

---

## 6. AI-assisted pre-annotation: `model.predict()` output

### Finding

`model.predict(source, ...)` / `model(source, ...)` returns a **list of `Results` objects**, one per input image/frame. Verified directly against `ultralytics/engine/results.py` source: each `Results` instance carries task-specific sub-objects, only the relevant one populated per task:

- `results.boxes` (`Boxes` object) — detect & obb-adjacent tasks: `.xyxy`, `.xywh`, `.xywhn`, `.xyxyn` (coords in various forms), `.conf` (confidence per detection), `.cls` (class id per detection), `.data` (raw `[x1,y1,x2,y2,conf,cls]` tensor)
- `results.masks` (`Masks` object) — segment task: `.data` (binary mask tensor `(N,H,W)`), `.xy` (polygon points in pixel coords, ready to write as segmentation labels), `.xyn` (normalized polygon points — this is literally what you want for writing YOLO segment-format label lines)
- `results.obb` (`OBB` object) — obb task: rotated box data
- `results.keypoints` (`Keypoints` object) — pose task
- `results.probs` (`Probs` object) — classify task

Key inference parameters (from `model.predict()`/`model()` signature, cross-checked against `docs.ultralytics.com/modes/predict/`):

| Param | Default | Purpose |
|-------|---------|---------|
| `conf` | `0.25` | Minimum confidence threshold — detections below this are dropped |
| `iou` | `0.7` | IoU threshold used by NMS to suppress overlapping duplicate detections |
| `classes` | `None` | List of class ids to keep, e.g. `classes=[0,1]` — filters everything else out |
| `imgsz` | `640` | Inference resolution |
| `device` | `None` (auto) | `cpu`, `cuda:0`, etc. |
| `stream` | `False` | If `True`, returns a memory-efficient generator instead of a list (important for batch pre-annotation over a whole unlabeled folder without OOM) |

Example:
```python
model = YOLO("best.pt")  # user's trained/uploaded model
results = model("image.jpg", conf=0.5, iou=0.45, classes=[0, 1])
for r in results:
    for box, conf, cls in zip(r.boxes.xywhn, r.boxes.conf, r.boxes.cls):
        ...  # write as detect-format label row
    # or, for a -seg model:
    for poly, conf, cls in zip(r.masks.xyn, r.boxes.conf, r.boxes.cls):
        ...  # write as segment-format label row (flatten poly points)
```

### Recommendation/Implication for this project

- For the "run inference to pre-populate annotations" feature: expose `conf` and `iou` as user-adjustable sliders in the UI (sensible defaults 0.25 / 0.7, matching Ultralytics defaults) so users can tune how aggressive the pre-fill is before manual review.
- `classes` filtering is useful if a user only wants pre-annotation for a subset of classes (e.g., only auto-detect `car`, hand-annotate `license-plate` manually).
- The output shape directly determines your label-writer input: `boxes.xywhn` → detect-format rows; `masks.xyn` → segment-format rows (each polygon point array flattens directly to the `<x1> <y1> <x2> <y2>...` line). This means your existing polygon-writing code path (needed regardless, per Q1/Q2) is exactly what AI pre-annotation for a `-seg` model needs — no separate conversion logic required.
- Use `stream=True` when running pre-annotation over an entire uploaded folder to avoid loading all results into memory at once.
- Every predicted box/polygon should be tagged as "AI-suggested, unreviewed" in your data model distinct from human-confirmed annotations, since `conf` only filters at inference time — false positives at a given threshold still need human review before being trusted as ground truth for training.

### Sources/evidence
- https://docs.ultralytics.com/modes/predict/ (Results object, parameter table, code examples)
- `ultralytics/engine/results.py` — fetched directly from source, confirmed `self.boxes/.masks/.probs/.keypoints/.obb` assignment (lines ~285–372)

**Confidence: HIGH**

---

## 7. Supported model file formats and implications for "user selects a model file"

### Finding

Ultralytics natively trains/saves to **`.pt`** (PyTorch). Beyond that, `model.export()` supports a wide range of deployment formats, and — importantly — `YOLO(path)` / `model.predict()` can load **exported** formats directly too, not just `.pt`:

| Format | Argument | Output |
|---|---|---|
| PyTorch | (native) | `.pt` |
| TorchScript | `torchscript` | `.torchscript` |
| ONNX | `onnx` | `.onnx` |
| OpenVINO | `openvino` | `_openvino_model/` |
| TensorRT | `engine` | `.engine` |
| CoreML | `coreml` | `.mlpackage` |
| TF SavedModel | `saved_model` | `_saved_model/` |
| TF GraphDef | `pb` | `.pb` |
| TFLite | `tflite`/`litert` | `.tflite` |
| Edge TPU | `edgetpu` | `_edgetpu.tflite` |
| PaddlePaddle | `paddle` | `_paddle_model/` |
| MNN / NCNN / RKNN / Hailo / IMX500 | various | various |

`yolo predict model=yolo26n.onnx` (or the Python equivalent `YOLO("model.onnx")`) works directly — Ultralytics auto-detects the format from the file/dir and picks the right backend at load time, embedding task metadata in the export so `guess_model_task` can still resolve it (per Q1).

**Security implication (not covered in official docs, verified via GitHub issue search against the Ultralytics repo):** loading a `.pt` file goes through PyTorch's `torch.load`, which historically defaulted to `weights_only=False` — i.e., **full pickle deserialization, which can execute arbitrary code embedded in a malicious checkpoint.** This is a real, actively-discussed issue in the Ultralytics GitHub repo (multiple open issues referencing `weights_only` and `FutureWarning`/breaking changes as PyTorch tightened this). PyTorch 2.6+ flipped the *default* to `weights_only=True`, which mitigates but doesn't eliminate risk (Ultralytics checkpoints legitimately need to unpickle custom classes, so a fully strict `weights_only=True` load can break loading legitimate custom architectures unless an allowlist is set up).

### Recommendation/Implication for this project

- Supporting "user uploads their own `.pt` file" is a genuine **arbitrary code execution risk** if that file didn't originate from your own training pipeline or a trusted source (Ultralytics/COCO pretrained weights). Treat user-uploaded `.pt` files as untrusted input:
  - Prefer running any user-provided-model inference/training in an isolated/sandboxed worker (container, restricted user, no network egress) rather than in-process in your main API server.
  - Pin/require a recent PyTorch (2.6+) where `weights_only=True` is the default, and avoid code paths that explicitly pass `weights_only=False` unless you've separately verified the file's provenance.
  - Consider accepting ONNX as an alternative "bring your own model" path for inference-only use cases (pre-annotation) — ONNX Runtime's execution model doesn't carry the same arbitrary-pickle-code-execution risk profile as PyTorch pickle loading, though ONNX has its own (much narrower) attack surface.
  - At minimum, validate the uploaded file is a plausible Ultralytics/YOLO checkpoint (check for expected keys/structure, reasonable file size bounds) before attempting to load it, and surface clear errors rather than silently executing.
- For the "select a model file from their computer" requirement broadly: `.pt` is the most flexible (works for continued training/fine-tuning, not just inference), but ONNX/TensorRT etc. are inference-only from Ultralytics' perspective — if the product needs users to keep training an uploaded model, it must be a `.pt` checkpoint (or convertible back), which puts the security mitigation above squarely in scope rather than optional.

### Sources/evidence
- https://docs.ultralytics.com/modes/export/ (format table, `yolo predict model=....onnx` direct-load confirmation)
- GitHub issues on `ultralytics/ultralytics`: "Yolo10 - weights_only" (#16569), "FutureWarning for using torch.load with (implicit) weights_only=False" (#14994), "WeightsUnpickler error" (#19824) — confirms this is a live, acknowledged issue in the project, not speculation
- General PyTorch knowledge: `torch.load` pickle semantics and the 2.6 default-flip to `weights_only=True` (well-established, matches search results)

**Confidence: HIGH** for supported export formats and direct-load capability (official docs). **MEDIUM** for the security recommendation specifics — the *existence* of the risk is well-documented (GitHub issues, PyTorch's own default change), but there's no single authoritative Ultralytics security advisory page enumerating mitigations, so the sandboxing/validation recommendations above are my synthesis of general pickle-security best practice applied to this specific loading mechanism, not a quoted Ultralytics recommendation.

---

## Summary of confidence levels

| Question | Confidence | Basis |
|---|---|---|
| 1. Detect vs segment format, task determination | HIGH | Live source code (`utils.py`, `dataset.py`, `tasks.py`) cross-checked against docs |
| 2. Box↔polygon conversion utilities | HIGH | Live source code (`ops.py`) function list confirmed |
| 3. Mixing formats / OBB as third format | HIGH (mechanics) / MEDIUM (product suggestion) | Source-verified mechanics; OBB-for-plates is my inference |
| 4. Task types & checkpoint naming | HIGH | Official docs, consistent across model generations |
| 5. Training callbacks | HIGH (mechanism) / MEDIUM (exact metrics dict keys) | Official docs + example; metrics schema not enumerated in docs |
| 6. Predict API output & params | HIGH | Official docs + live source (`results.py`) |
| 7. Model file formats & security | HIGH (formats) / MEDIUM (security specifics) | Official export docs; security risk confirmed via GitHub issues, mitigation is my synthesis |

## Open items for follow-up during implementation

- Empirically capture `trainer.metrics` dict keys on a real training run (e.g., `metrics/precision(B)`, `metrics/mAP50(B)` style keys are typical in Ultralytics but should be confirmed against the exact version pinned for this project) before finalizing the live-metrics streaming schema.
- Decide and pin the exact Ultralytics + PyTorch version for this project up front, since checkpoint-loading security behavior (`weights_only` default) is version-dependent.
