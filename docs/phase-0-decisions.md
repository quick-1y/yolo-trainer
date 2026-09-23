# Phase 0 — Architecture Validation Spikes: Results & Decisions

**Executed:** 2026-09-22
**Scope:** De-risk the items `docs/roadmap.md` flagged as synthesized-but-unverified, per the roadmap's own Phase 0 definition, before committing real implementation time in Phase 1+.
**Status:** 4 of 5 acceptance criteria closed. 1 (GPU passthrough) genuinely cannot be closed on this machine — see below.

All spike code lives in `spikes/` (gitignored, throwaway, not part of the shipped application). This document is the durable record of what was learned; the spike code itself can be deleted at any time without losing information.

---

## 1. Version pins — DECIDED

| Component | Pinned version | Verified how |
|---|---|---|
| Python | **3.12.10** | Installed fresh via `py install 3.12` (this machine only had 3.14, which Ultralytics does not yet declare support for — matches the roadmap's §1.2/§5.4 recommendation). |
| PyTorch | **2.14.0 (CPU build: `2.14.0+cpu`)** | Installed from `https://download.pytorch.org/whl/cpu`, the latest version available on that index at spike time. |
| Ultralytics | **8.4.159** | Latest stable on PyPI at spike time (`pip index versions ultralytics`). |

**Decision:** Pin exactly these three versions in the real `pyproject.toml`/`requirements.txt` (Phase 1), and in the Docker base images (Phase 2) — for the GPU image, use the matching CUDA build of the same PyTorch 2.14.0 release (`pytorch/pytorch:2.14.0-cuda...-cudnn9-runtime`, per the Docker research already on file) rather than picking versions independently for CPU vs GPU.

**Re-verify at actual Phase 1 implementation time** (not just trust this document) — both projects release roughly weekly (Ultralytics) to twice-yearly (PyTorch), and this pin should be a deliberate, re-confirmed choice, not silently inherited months later.

---

## 2. Empirical `trainer.metrics` capture — DONE, with a real gotcha found

Ran a genuine 2-epoch training job (`spikes/train_worker_spike.py`) against `example_ready_dataset/`, with Ultralytics callbacks registered exactly as `docs/roadmap.md` §9.2 designs, writing structured JSON progress to `spikes/output/progress.jsonl`.

**Confirmed `trainer.metrics` keys for a `detect`-task model** (this project's actual first real dataset, see finding #3 below):

```
metrics/precision(B)
metrics/recall(B)
metrics/mAP50(B)
metrics/mAP50-95(B)
val/box_loss
val/cls_loss
val/dfl_loss
```

This resolves the open item flagged in `BACKEND-ARCHITECTURE.md` §4 and `YOLO-FORMAT-AND-API.md` §5 ("exact metrics dict keys not enumerated in docs"). **Decision:** the Phase 8 progress-streaming schema should use these exact key names for `detect`-task jobs. (A `segment`-task run would add mask-specific keys, e.g. `metrics/mAP50(M)` — not captured this session since the dataset couldn't actually run as `segment`, see finding #3; capture this separately before Phase 8 ships segment-task support.)

**Real gotcha found, not documented anywhere in Ultralytics' own docs:** `on_fit_epoch_end` fires **one extra time after training completes** — for a 2-epoch run, it fired for `epoch=0`, `epoch=1` (the two real epochs), **and then again for `epoch=2`** (`total_epochs`, i.e. one past the last real epoch), corresponding to Ultralytics re-validating `best.pt` after the training loop exits (visible in the raw log as a separate "Validating .../best.pt..." step). **Decision:** the Phase 8 SSE/progress consumer must not assume exactly `epochs` `fit_epoch_end` events — either cap displayed epoch number at `total_epochs - 1`, or explicitly label this final event as "final validation" rather than another training epoch, so the UI doesn't show a confusing "epoch 3 of 2."

**Secondary implementation note:** the spike's naive JSON-serialization helper only handled top-level tensor values, not tensors nested inside a dict (`trainer.tloss` is a `dict[str, Tensor]`) — it fell back to `str(value)`, producing an unparseable Python-repr string in the JSONL output instead of clean JSON. **Decision:** the real Phase 7/8 progress-serialization code must recursively walk dicts/lists, not just check the top-level value type.

---

## 3. Dataset format — CORRECTED (this is the most important finding from Phase 0)

`docs/roadmap.md` §1.7/§7.2 (written before this spike) claimed, based on manually inspecting **one** label file, that `example_ready_dataset/` is "segmentation/polygon format, not detection format." **Running an actual `segment`-task training job against the full dataset immediately proved this wrong at the dataset level:**

```
ValueError: Segment dataset requires equal numbers of boxes and segments,
but got len(segments) = 2, len(boxes) = 280.
Please supply a segment dataset, not a detect dataset.
```

Following up with a full programmatic scan of every label file (`spikes/_label_format_audit.py`) confirmed the real shape:

| Split | Files | Total objects | Plain box rows (5 values) | Polygon rows (>6 values) |
|---|---|---|---|---|
| train | 218 | 280 | **278** | 2 (all in one file: `26000_jpg...txt`) |
| valid | 62 | 73 | **71** | 2 (all in one file: `26004_jpg...txt`) |
| test | 31 | 40 | **36** | 4 (across two files) |

**Corrected understanding:** the dataset is **overwhelmingly detection-format** (97-99% of objects per split are plain bounding boxes), with a tiny number of stray polygon-format rows scattered in a handful of individual files — almost certainly an artifact of how a few images were annotated differently in the source Roboflow project (e.g., a different annotation tool/mode used for just those images), not evidence that this is "a segmentation dataset."

**Why this matters beyond just correcting one document:** this is a live, concrete example of exactly the real-world dataset inconsistency `docs/roadmap.md` §6.2/§9 already designed around ("the platform should not assume homogeneity, and must validate/normalize on import") — but it's no longer a hypothetical the roadmap defends against in the abstract, it's a bug that would have hit the very first real dataset used in Phase 6 testing had this not been caught in Phase 0. **Decision:** Phase 6's dataset-import validation must explicitly detect and surface exactly this scenario (a dataset that's mostly one format with stray rows of the other) as an actionable warning at import time — "271 of 280 objects are box-format, 2 are polygon-format; importing as a `detect` project will auto-collapse the polygon rows to boxes, importing as `segment` will fail" — rather than only erroring opaquely at training time the way raw Ultralytics does today.

**Follow-up correction needed:** `docs/roadmap.md` §1.7 and §7.2's framing ("the example dataset's label files use polygon coordinates... not plain 5-value bounding boxes") should be amended to reflect this — the dataset is correctly used as a `detect`-task example, not a `segment`-task one, and the OBB-for-license-plates product suggestion in §7.2/§16 row 12 should be re-read as "a possible future direction," not "matches what the current example dataset already does."

The training job that actually succeeded (`detect` task, `yolo11n.pt`, 2 epochs, 320px, CPU) completed in 47.8s and reached `mAP50=0.307` — a real, working, first end-to-end proof that this project's actual dataset trains successfully through a callback-instrumented pipeline.

---

## 4. Subprocess spawn/cancel mechanics — DONE, with a Windows-specific caveat

`spikes/subprocess_kill_spike.py` spawned a dummy long-running worker via `subprocess.Popen`, confirmed it was genuinely alive (heartbeat file updating), called `.terminate()`, and confirmed clean exit with no orphaned process (heartbeat stopped updating immediately, stayed stopped 5s later). **Result: PASSED** — full detail in `spikes/output/subprocess_kill_result.json`.

**Windows-specific finding:** `Popen.terminate()` on Windows maps directly to `TerminateProcess()` — an immediate, non-catchable hard kill (exit code was `1`, not a graceful `0`). This is different from POSIX, where `terminate()` sends `SIGTERM`, which a well-behaved process can catch to save state/clean up before exiting. **Decision:** if Phase 7's real `train_worker.py` should attempt a graceful shutdown on cancellation (e.g., to let Ultralytics save a final checkpoint before dying), plain `terminate()` will not allow that on Windows — the alternative is spawning with `creationflags=subprocess.CREATE_NEW_PROCESS_GROUP` and sending `CTRL_BREAK_EVENT` via `proc.send_signal(signal.CTRL_BREAK_EVENT)` first, falling back to `terminate()`/`kill()` if the process doesn't respond within a timeout. Since the target deployment is Docker/Linux containers (per §5 of the roadmap) this Windows nuance mostly matters for **local, non-Docker development** on this machine — but it should still be handled (or explicitly, consciously ignored) rather than assumed away.

**Not performed — genuinely cannot be, on this machine:** the GPU-memory-freed-after-cancel check (`nvidia-smi` before/after). This machine has **no NVIDIA GPU** (confirmed below). **Decision:** re-run `spikes/subprocess_kill_spike.py`'s cancellation test on a CUDA-capable host, with a real (not dummy) training subprocess and `nvidia-smi --query-gpu=memory.used` before spawn / after cancel, before Phase 7 is considered fully validated. Track this as an explicit follow-up task, not a silently-dropped requirement.

---

## 5. GPU passthrough (Windows/WSL2/Docker Desktop/NVIDIA Container Toolkit) — CANNOT BE TESTED HERE

Checked directly:
- `nvidia-smi`: not found on this machine.
- `Get-CimInstance Win32_VideoController`: reports **AMD Radeon(TM) Graphics** as the only video adapter (an integrated GPU on an AMD Ryzen 7 5700U CPU, confirmed by the training run's own hardware banner: `CPU (AMD Ryzen 7 5700U with Radeon Graphics)`).
- Docker: **is installed** (Docker version 29.7.2, Compose v5.4.0) — so Docker itself is available for Phase 2 work, just not with an NVIDIA GPU behind it.
- WSL: `wsl --status` shows only the `docker-desktop` distro present, and reports the current configuration doesn't support WSL1 (a secondary, non-blocking finding — Docker Desktop's own WSL2 integration is what matters for GPU passthrough, not WSL1).

**Decision — this is a genuine, permanent environment constraint, not a transient setup issue:** this development machine has no NVIDIA GPU and therefore can never validate the GPU code path (`docker-compose.gpu.yml`, NVIDIA Container Toolkit, `--device nvidia.com/gpu=all`, or the Windows/WSL2-specific driver requirements the Docker research flagged as failure-prone). **The entire GPU path — Phase 2's GPU image build, Phase 5's device-selection UI's "GPU detected" branch, Phase 7's GPU-accelerated training — must be validated on a different host** (a Linux machine or cloud instance with an actual NVIDIA GPU) before it can be considered working, not just "should work per research."

**Practical implication for sequencing:** everything else in this roadmap (backend, frontend, annotation, CPU-path training, job management) can and should continue development on this machine using the CPU path exclusively — which this Phase 0 spike has now proven works end-to-end, real dataset, real callbacks, real subprocess management. GPU-path validation is a **separate, explicitly-tracked task** to run on GPU-capable hardware before Phase 2/7 are marked complete, not a blocker for starting Phase 1-4 work here.

---

## 6. Expected concurrent users — DECIDED (by the project owner)

**Decision (from the project owner, not inferred by research):** proceed with **SQLite** for now. The application is primarily for the owner's own individual use initially, but the architecture must not preclude supporting a small team later — so the data-access layer and schema must be designed so migration to PostgreSQL later is straightforward (concretely: SQLAlchemy models + Alembic migrations, no SQLite-specific query patterns baked into application code, per `BACKEND-ARCHITECTURE.md` §5's existing "same models, swap connection string" migration path).

**For v1: no authentication or multi-user complexity** unless the architecture specifically requires it. This directly resolves the open item in `docs/roadmap.md` §15 ("Authentication/authorization: not resolved by this research") — v1 ships with no auth layer.

**This decision is explicitly revisitable, not permanent:** re-confirm it before Phase 3 finalizes the database/connection layer, since Phase 3 is where this choice actually gets encoded into working code (per `docs/roadmap.md` §16 row 10 and row 6).

---

## Summary — Phase 0 acceptance criteria, closed vs. open

| Acceptance criterion (from `docs/roadmap.md` Phase 0) | Status |
|---|---|
| Pinned Ultralytics + PyTorch versions recorded | ✅ Closed — §1 above |
| `trainer.metrics` dict keys captured empirically | ✅ Closed — §2 above (detect task; segment task deferred, see follow-up) |
| Subprocess cancel spike confirms clean termination + GPU memory freed | ⚠️ **Partially closed** — process termination confirmed clean (✅); GPU memory check not performed, no NVIDIA GPU on this host (❌, tracked as a follow-up on GPU-capable hardware) |
| GPU passthrough tested on the actual dev machine | ✅ Closed, but the **outcome** is "not possible on this machine" — documented, not silently skipped, per the roadmap's own instruction to document either way |
| Concurrent-users answer obtained | ✅ Closed — §6 above |

## Follow-up tasks carried forward (not part of Phase 0, tracked here so they aren't lost)

1. Re-run the GPU-memory-freed-after-cancel check on a CUDA-capable host before Phase 7 is considered done.
2. Test actual Docker GPU passthrough (Compose device reservation, NVIDIA Container Toolkit, Windows/WSL2 driver requirements) on a GPU-capable host before Phase 2/5 GPU-path work is considered done.
3. Capture `trainer.metrics` keys for a `segment`-task run once a genuinely polygon-labeled dataset is available (this project's own example dataset turned out not to be a good `segment`-task fixture — see §3).
4. Amend `docs/roadmap.md` §1.7 and §7.2's characterization of `example_ready_dataset/` from "segmentation format" to "predominantly detection format with a few stray polygon rows," per §3 above.
5. When implementing the real `train_worker.py` (Phase 7), fix the two spike-code shortcuts noted in §2: recursive tensor-to-JSON serialization, and explicit handling of the extra post-training `on_fit_epoch_end` event.
