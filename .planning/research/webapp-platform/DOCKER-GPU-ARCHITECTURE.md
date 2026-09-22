# Docker + GPU/CPU Architecture for a Self-Hosted YOLO Training Web App

**Scope:** Single-server, self-hosted Dockerized web app running PyTorch/Ultralytics YOLO training, with optional NVIDIA GPU acceleration and CPU fallback. Not a cloud-scale / Kubernetes platform.

**Researched:** 2026-09-22

---

## 1. How does a container get access to a host NVIDIA GPU?

**Finding**

The NVIDIA Container Toolkit is required on the host. It is the "glue" that intercepts container creation and injects the correct GPU device nodes, driver libraries, and (for legacy mode) a custom OCI runtime (`nvidia-container-runtime`) into the container at launch. Without it installed and registered with the Docker daemon, `--gpus all` (or the Compose equivalent) will fail or silently produce a container with no GPU access.

There are now two supported mechanisms to actually request the GPU at container-start time:

- **Legacy/still-current:** `docker run --gpus all` (Docker Engine ≥19.03) or Compose's `deploy.resources.reservations.devices` with `driver: nvidia`, `capabilities: [gpu]`, and optionally `count` or `device_ids` to pick specific GPUs. Both require the toolkit installed and `nvidia` registered as a runtime/driver on the host.
- **Modern (recommended going forward):** the **Container Device Interface (CDI)**, invoked as `docker run --device nvidia.com/gpu=all`. CDI is a vendor-neutral device spec that Docker, containerd, Podman, and Kubernetes are all standardizing on. NVIDIA's own current documentation and Ultralytics' own GPU Dockerfile examples now show `--device nvidia.com/gpu=all` rather than `--gpus all`. You generate the CDI spec once with `nvidia-ctk cdi generate` and it tends to fix compatibility issues that plagued the older hook-based runtime.

Both approaches need the toolkit; the difference is just which invocation syntax the toolkit is configured to serve. For a Compose-based single-server app, `deploy.resources.reservations.devices` is the most portable/declarative choice since it's expressed in `docker-compose.yml` and works the same with `docker compose up` regardless of whether the underlying engine additionally exposes CDI.

**Recommendation**

- Require the host to have the **NVIDIA Container Toolkit** installed (document this as a prerequisite in setup docs; it cannot be bundled inside the app's own image — it must live on the host).
- In `docker-compose.yml`, gate GPU access behind a Compose profile or an optional override file (e.g. `docker-compose.gpu.yml`) using:
  ```yaml
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
  ```
  This keeps the base `docker-compose.yml` CPU-only/portable, and GPU becomes an explicit opt-in overlay — which also naturally supports "GPU intentionally not selected" per the requirements.
- Note CDI (`--device nvidia.com/gpu=all`) as the forward-looking alternative if Compose device reservation causes friction on a given host, but don't require it as v1 — it's newer and less universally documented in Compose form.

**Sources/evidence**
- [Run Docker Compose services with GPU access — Docker Docs](https://docs.docker.com/compose/how-tos/gpu-support/)
- [Specialized Configurations with Docker — NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html)
- [Support for Container Device Interface — NVIDIA Container Toolkit docs](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/1.16.2/cdi-support.html)
- Ultralytics' own `docker/Dockerfile` (fetched directly from GitHub main branch) shows GPU run examples using `--device nvidia.com/gpu=all`.
- [How to Run Docker Compose Containers With GPU Access — How-To Geek](https://www.howtogeek.com/devops/how-to-run-docker-compose-containers-with-gpu-access/)

**Confidence:** HIGH (toolkit requirement, `--gpus all`, and Compose `deploy.resources.reservations.devices` are well-established and cross-confirmed across NVIDIA's own docs, Docker's own docs, and Ultralytics' live Dockerfile). CDI-as-the-emerging-default is directionally correct but newer/less battle-tested in Compose contexts — treat that specific framing as MEDIUM.

---

## 2. Does Docker Desktop (Windows/Mac) handle GPU passthrough differently than native Linux?

**Finding**

Yes, materially differently, and this matters for a self-hosted dev building/testing on Windows.

- **Native Linux Docker Engine:** talks to the NVIDIA driver and Container Toolkit directly. This is the best-supported, most predictable path and what nearly all NVIDIA/Docker official documentation assumes.
- **Docker Desktop on Windows:** GPU access goes through **WSL2**. Docker Desktop must be using the WSL2 backend, and GPU support depends on a sufficiently new NVIDIA Windows driver (WSL2 GPU paravirtualization requires driver support — community reporting cites v545.23.06+ as a practical baseline, though NVIDIA's own driver page should be checked at install time). Inside the WSL2 distro you still need to register the NVIDIA runtime with `nvidia-ctk runtime configure --runtime=docker && systemctl restart docker`. This is officially described by Docker/NVIDIA as still being in a form of "preview" maturity relative to native Linux, and community reports note real friction: multi-GPU passthrough has documented rough edges (only one GPU visible from inside a container despite the host exposing several), and a large share of reported passthrough failures trace back to Windows-host NVIDIA driver version mismatches rather than the toolkit/container config itself.
- **Docker Desktop on macOS:** **No NVIDIA GPU passthrough is possible at all.** Docker Desktop on Mac runs containers inside a Linux VM with no path to a discrete NVIDIA GPU (and Apple Silicon Macs have no NVIDIA GPUs in any case; Apple's own GPU/Metal is not accessible to Linux containers via the NVIDIA toolkit). Mac must always run the CPU-only path.

**Recommendation**

- Document three supported host tiers explicitly for users:
  1. **Native Linux + NVIDIA GPU** — full GPU support, most reliable.
  2. **Windows + Docker Desktop (WSL2) + NVIDIA GPU** — supported but treat as "best effort": require a recent NVIDIA driver, WSL2 backend enabled, and `nvidia-ctk runtime configure` run inside the WSL2 distro. Warn users this path has more failure modes (driver mismatch is the #1 cause) and test it explicitly rather than assuming parity with Linux.
  3. **macOS (Docker Desktop) or any host without a supported NVIDIA GPU** — CPU-only; the app should detect this and not attempt GPU code paths.
- Because of tier 2's fragility, the app's runtime GPU-detection logic (see Q3) is not optional polish — it's required for the Windows dev-machine case to degrade gracefully instead of crashing.

**Sources/evidence**
- [WSL 2 GPU Support is Here — Docker Blog](https://www.docker.com/blog/wsl-2-gpu-support-is-here/)
- [WSL 2 GPU Support for Docker Desktop on NVIDIA GPUs — Docker Blog](https://www.docker.com/blog/wsl-2-gpu-support-for-docker-desktop-on-nvidia-gpus/)
- [Docker Desktop WSL 2 backend — Docker Docs](https://docs.docker.com/desktop/features/wsl/)
- [In WSL2's docker container: GPU access blocked by the operating system — microsoft/WSL#9962](https://github.com/microsoft/WSL/issues/9962)
- Community reporting on multi-GPU WSL2 limitations and driver-mismatch failure rates (oneuptime.com, markaicode.com blog posts, 2026) — treated as corroborating but non-primary sources.

**Confidence:** HIGH for the core architecture (WSL2 dependency on Windows, no GPU passthrough on Mac). MEDIUM for the specific driver-version threshold and the "60% of failures are driver mismatch" statistic — that number came from a secondary blog, not an NVIDIA/Docker primary source, so treat it as directional rather than exact.

---

## 3. How should GPU availability be detected from inside a container at runtime?

**Finding**

The standard, idiomatic approach is to let **PyTorch itself** be the detector, since it already needs to initialize CUDA to do anything useful:

```python
import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
```

`torch.cuda.is_available()` returns `False` gracefully (no exception) if there's no GPU, no driver, or no CUDA-enabled build of torch — which makes it the correct single source of truth for runtime fallback logic, rather than trying to shell out to `nvidia-smi` and parse its output/exit code (which is a reasonable **supplementary** health check for diagnostics/logging, but shouldn't be the thing gating actual device selection, since it doesn't tell you whether *torch* can actually use the GPU).

A common pitfall documented in PyTorch/NVIDIA/Docker forums: `torch.cuda.is_available()` returning `False` inside a container even though the host has a working GPU. The two most common root causes are:
1. The container was started without `--gpus all` / the Compose device reservation (i.e., the toolkit never injected the device into that specific container), or
2. The **installed torch build inside the image is the CPU-only wheel** (see Q4) — the NVIDIA driver being visible via `--gpus all` is necessary but not sufficient; torch itself must have been built/installed with CUDA support to use it.

**Recommendation**

- On backend startup (and again when a training job begins), call `torch.cuda.is_available()` and `torch.cuda.get_device_name(0)` to determine and log the effective device.
- Expose this as a small `/api/system/gpu-status` endpoint so the frontend can show "GPU: RTX 4070 detected" vs "CPU-only mode" and let the user explicitly choose CPU even when a GPU is present (per the requirement that GPU can be "intentionally not selected").
- Do NOT rely solely on `nvidia-smi` presence to decide the code path — use it only as an optional diagnostic (e.g., surfaced in a "Troubleshoot GPU" panel) to help distinguish "no GPU on host" from "GPU present but toolkit/driver/wheel misconfigured."

**Sources/evidence**
- [PyTorch Forums — Could not detect GPU when running from docker](https://discuss.pytorch.org/t/could-not-detect-gpu-when-running-from-docker/183959)
- [GPU Detection and PyTorch Setup — NVIDIA Brev Docs](https://docs.nvidia.com/brev/troubleshooting/instances-gpus/gpu-detection-pytorch)
- [A developer's guide to PyTorch, containers, and NVIDIA — Red Hat Emerging Technologies, Aug 2025](https://next.redhat.com/2025/08/26/a-developers-guide-to-pytorch-containers-and-nvidia-solving-the-puzzle/)

**Confidence:** HIGH — this is a standard, widely-documented pattern with no real controversy.

---

## 4. One image with runtime detection, or separate CPU/GPU images? What do real projects (Ultralytics) do?

**Finding**

Real-world practice — including Ultralytics' own official images — uses **separate images/tags**, not one universal image with runtime detection. This is because the *PyTorch wheel itself* differs between CPU and CUDA builds (different binary, different size — CUDA wheels bundle CUDA/cuDNN runtime libraries and are dramatically larger), so "one image, detect at runtime" doesn't actually work for the torch install step; detection only helps *after* the correct build is already installed.

Verified directly from Ultralytics' GitHub (`ultralytics/ultralytics`, `docker/` directory, fetched live):
- **`docker/Dockerfile`** (GPU/full image) — `FROM pytorch/pytorch:2.14.0-cuda13.2-cudnn9-runtime`. This is the primary image for GPU-accelerated single/multi-GPU training and inference. Example run commands in the file use `--device nvidia.com/gpu=all` (CDI) at container-start time.
- **`docker/Dockerfile-cpu`** — `FROM ultralytics/ultralytics:latest-python` (their own slim Python base, no CUDA), described as a "Lightweight CPU image optimized for inference."
- They also publish a Jetson-specific image (`VERSION-jetson-jetpack6` tags) for NVIDIA embedded boards, and tags follow the pattern `VERSION`, `VERSION-cpu`, `VERSION-jetson-jetpack6` on both Docker Hub and `ghcr.io/ultralytics/ultralytics`.

So the pattern real projects use is: **build-time image variant selection (cpu vs cuda tag) + run-time device detection inside whichever image is running** (Q3's `torch.cuda.is_available()` still matters even in the GPU image, e.g., to handle "GPU image running on a machine where `--gpus`/`--device` wasn't passed").

**Recommendation**

For this project, mirror the Ultralytics pattern rather than inventing something novel:
- Maintain **two Dockerfiles / two tags**: `app:cpu` (base on a slim Python image, `pip install torch --index-url https://download.pytorch.org/whl/cpu`) and `app:gpu` (base on `pytorch/pytorch:<ver>-cuda<ver>-cudnn<ver>-runtime`, or install the CUDA wheel via the matching `--index-url`).
- Use a **single Compose file with an override** (`docker-compose.gpu.yml`) or a build ARG that selects the Dockerfile/tag, so the user picks GPU or CPU at `docker compose up` time based on their hardware — consistent with the Q1 recommendation.
- Keep the *application code* identical between both images (same FastAPI/backend source); only the base image + torch wheel differ. Runtime `torch.cuda.is_available()` detection (Q3) remains inside the app regardless of which image is running, both to confirm the GPU image actually got GPU access and to let users explicitly force CPU mode even on the GPU image.
- Do not attempt a single "fat" image bundling both CPU and CUDA torch and switching between them dynamically — nobody in the ecosystem does this (it roughly doubles image size for no runtime benefit, since the CUDA wheel works fine on GPU-less hosts anyway *except* it's needlessly large — the real reason for separate images is size/pull-time and avoiding requiring the NVIDIA toolkit on CPU-only hosts, not functional necessity).

**Sources/evidence**
- Live fetch of `ultralytics/ultralytics` `docker/Dockerfile` and `docker/Dockerfile-cpu` from GitHub main branch (2026-09-22).
- [Docker Quickstart Guide — Ultralytics Docs](https://docs.ultralytics.com/guides/docker-quickstart)
- [ultralytics/ultralytics Docker Hub tags](https://hub.docker.com/r/ultralytics/ultralytics/tags)
- [ultralytics/ultralytics#19114 — GHCR images PR](https://github.com/ultralytics/ultralytics/pull/19114)

**Confidence:** HIGH — verified directly against live upstream source, not secondhand summary.

---

## 5. Same container as web backend, or separate worker/training container(s)?

**Finding**

Comparable OSS annotation/ML-ops tools consistently separate the **web/API tier** from the **model execution tier**, even in self-hosted single-server deployments:

- **CVAT** runs its web/API stack via Compose, and offloads all model execution (auto-annotation, training-adjacent inference) to **Nuclio serverless function containers**, deployed as a separate Compose overlay (`docker-compose.serverless.yml`). GPU access is requested per-function (`--resource-limit nvidia.com/gpu=1`), and CVAT's own docs explicitly warn that running multiple GPU functions concurrently on one GPU "often won't work out of the box" without manual scheduling — i.e., even a well-funded OSS project treats GPU-bearing work as something to isolate and serialize carefully, not something to run inline in the main app process.
- **Label Studio's ML backend** has an explicit dev-mode vs production-mode split: in dev mode, training and inference share one process (and the server can't serve predictions while training runs — a known, called-out limitation). In production mode, training is offloaded to **RQ background jobs backed by Redis**, running in a separate worker, precisely so the API/inference path stays responsive during training.

Both projects converge on the same lesson: running a long, resource-heavy training job **inside the same process as the request-serving web backend** causes the app to become unresponsive during training and creates resource-contention/isolation problems. Both use a **separate worker process/container** pattern, not full Kubernetes-style microservices — appropriate for single-server scale.

**Recommendation**

- Run the **web backend** (FastAPI/API + serving the frontend) and the **training execution** in **separate containers** in the same Compose stack — not separate processes bolted onto the same container, and not a full distributed job platform.
- The training container(s) should be the *only* container(s) requesting GPU access (`deploy.resources.reservations.devices` / `--device nvidia.com/gpu=all`) — the web backend container does not need GPU access at all, which also reduces the blast radius of GPU/driver misconfiguration.
- For a single-server app with one GPU, plan for **one training job at a time** (serialize via the job queue, see Q6) rather than attempting concurrent GPU sharing (MPS/time-slicing/MIG) — those are legitimate techniques (see below) but are operationally complex and are overkill until there's a real need for concurrent GPU workloads on one card.
- This separation also directly enables the "survive backend restarts" requirement from Q6: if training runs in its own container/process, restarting the web backend doesn't kill or orphan an in-flight training run.

**On GPU sharing across containers (supplementary finding):** if concurrent GPU jobs are ever needed, the documented mechanisms are NVIDIA **MPS** (Multi-Process Service — software time-slicing/context-sharing, lower overhead than naive time-slicing) and **MIG** (Multi-Instance GPU — true hardware partitioning, only available on datacenter-class GPUs like A100/H100, not consumer cards). For a single-server, likely-single-consumer-GPU app, neither is worth the added operational complexity at v1 — simple serialization (one training job at a time, queued) is the right scope.

**Sources/evidence**
- [Semi-automatic and Automatic Annotation — CVAT Docs](https://docs.cvat.ai/docs/administration/community/advanced/installation_automatic_annotation/)
- [Serverless tutorial — CVAT Docs](https://docs.cvat.ai/docs/guides/serverless-tutorial/)
- [Write your own ML backend — Label Studio Docs](https://labelstud.io/guide/ml_create)
- [GitHub — HumanSignal/label-studio-ml-backend](https://github.com/HumanSignal/label-studio-ml-backend)
- [CUDA Multi-Process Service — Lei Mao's Log Book](https://leimao.github.io/blog/CUDA-Multi-Process-Service/)
- [About GPU sharing strategies in GKE — Google Cloud Docs](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/timesharing-gpus) (used only for the general MPS/MIG conceptual explanation, not as a self-hosted single-server reference)

**Confidence:** HIGH for the "separate the training workload from the web backend process" conclusion (directly corroborated by two independent, comparable OSS projects). MEDIUM for MPS/MIG specifics since those sources are largely Kubernetes/datacenter-context, included here only as background, not as an implementation recommendation for this project.

---

## 6. How should a long-running training subprocess be managed from the web backend?

**Finding**

For a **single-server app** that needs: start jobs, stream logs/progress to the browser, cancel jobs, and survive backend restarts — the current (2025-2026) community consensus explicitly says **Celery is overkill** for this scale, and the realistic choices are:

- **Celery** — battle-tested, multi-broker (Redis/RabbitMQ/SQS), but "may be overkill for smaller projects... requires dedicated worker processes... more complex setup." Its main value (distributed multi-node scaling, complex workflow primitives) isn't needed here.
- **arq** — async-first, built for asyncio (pairs naturally with FastAPI's `async def` routes), Redis-only backend, lower overhead than Celery, workers run inside the event loop. Recommended pattern from multiple 2026 sources: "arq for I/O-bound work... Celery only if you genuinely need its workflow primitives."
- **RQ (Redis Queue)** — simple, synchronous-task-oriented, lightweight; this is literally what Label Studio's own ML backend uses for its production training-job offload (see Q5), which is a strong precedent for exactly this use case (long-running training job triggered from a Python web app, single Redis instance, no multi-node scaling needed).
- **Raw subprocess/multiprocessing with a custom SQLite job table** — no external dependency at all (no Redis needed). Several 2026 examples show SQLite-backed durable job queues (job state, status, cancellation flags stored in a jobs table) as a legitimate lightweight alternative when you don't want to run Redis at all. This trades a little bit of "reinventing the wheel" for zero extra infrastructure.

None of the sources found a turnkey "job queue + SSE + cancel + restart-survival" library that's obviously the default choice — this had to be composed from patterns, so treat the following as a synthesized recommendation rather than a single authoritative source.

**Recommendation**

For this project's actual scale (single server, one or a few concurrent training jobs, PyTorch/YOLO training that's a **subprocess** by nature — Ultralytics training is CPU/GPU-bound and long-running, not I/O-bound):

- **Run each training job as a managed OS subprocess** (Python `subprocess.Popen`, not `multiprocessing`) launched from a lightweight job-management layer — training is fundamentally "run the `yolo train ...` / Ultralytics Python call as an isolated process" so its memory/GPU context is cleanly reclaimed on completion or cancellation (`process.terminate()`/`kill()`), which is hard to do cleanly with in-process `multiprocessing` if a training run misbehaves.
- **Persist job state (status, PID, start time, config, current epoch/metrics) in the app's own database** (SQLite is fine at this scale — matches the project's already-modest infra footprint) rather than standing up Redis purely for this. This directly satisfies "survive backend restarts": on backend startup, reconcile the jobs table against actually-running OS processes (check PID liveness) and mark orphaned "running" jobs as failed/interrupted.
- **Stream logs/progress via SSE**, not WebSockets — SSE is simpler (plain HTTP, auto-reconnect built into the browser's `EventSource`, one-directional which is all that's needed here) and is the pattern explicitly recommended for exactly this use case (log/progress streaming) in current FastAPI guidance. Implementation: the subprocess's stdout is read line-by-line by an async task, buffered/parsed for progress (Ultralytics prints per-epoch metrics to stdout, and YOLO also supports a Python callback API for structured progress if tighter integration is wanted), and re-emitted through `sse_starlette.EventSourceResponse` (FastAPI's own docs now have a dedicated SSE tutorial section) or FastAPI's native `StreamingResponse`.
- **Only introduce Redis + RQ/arq if/when** multi-job concurrency, retry semantics, or scheduled/delayed jobs become an actual requirement. Until then, a subprocess manager + SQLite job table is the right-sized solution and avoids adding a Redis dependency to what's meant to be a simple self-hosted app. If that threshold is crossed, **RQ** is the best next step (simple, precedented by Label Studio, no async rewrite required) over Celery or arq.

**Sources/evidence**
- [FastAPI Background Tasks: Celery vs ARQ vs RQ — Medium, 2026](https://medium.com/@rameshkannanyt0078/fastapi-background-tasks-celery-vs-arq-vs-rq-2026-benchmarks-decision-guide-f99598aa21eb)
- [FastAPI Background Tasks in 2026 — BackgroundTasks, ARQ, and When to Reach for Celery](https://blog.rajpoot.dev/posts/fastapi/fastapi-background-tasks-2026/)
- [Why I Chose arq and RQ Over Celery for LLM Workloads](https://dangquan1402.github.io/llm-engineering-notes/2026/04/02/lightweight-task-queues-for-llm-apps.html)
- [Server-Sent Events (SSE) — FastAPI official docs](https://fastapi.tiangolo.com/tutorial/server-sent-events/)
- [Realtime Log Streaming with FastAPI and Server-Sent Events](https://amittallapragada.github.io/docker/fastapi/python/2020/12/23/server-side-events.html)
- SQLite-backed durable job queue precedent: [litepacks/workmatic](https://github.com/litepacks/workmatic), [autumn-foundation/autumn PR #2566](https://github.com/autumn-foundation/autumn/pull/2566) (Node/Go ecosystem examples, used here only as evidence the pattern is established, not as a Python library recommendation)
- Label Studio's own production RQ+Redis precedent (see Q5 sources) as validation that a simple queue suffices for this exact problem shape.

**Confidence:** MEDIUM-HIGH on the overall recommendation (subprocess + SQLite job table + SSE) — the individual pieces (SSE for FastAPI, RQ as the "next step up," subprocess for isolating training) are each well-supported, but the specific *combination* as "the right architecture for this project" is a synthesis, not something one authoritative source states outright. Flag this as an area worth a second pass during phase-specific research if job orchestration turns out to be more complex than expected (e.g., multi-GPU, job priority, retries).

---

## 7. Persisting datasets/models outside the container; letting users point at existing host folders

**Finding**

Current best-practice guidance (multiple 2026 sources, consistent with long-standing Docker convention) draws a clear line:

- **Named volumes**: Docker-managed storage, decoupled from any specific host path, portable across OSes, easy to back up/inspect with `docker volume` commands. Recommended for **data the app itself generates or owns** — e.g., a database file, trained model artifacts the app writes out, cached intermediate files.
- **Bind mounts**: direct host-path-to-container-path mapping. Recommended for **code during development**, and — critically for this project — for **letting the user expose a specific, user-chosen folder on their own machine** (e.g., "my existing dataset lives at `D:\datasets\widgets`"). A bind mount is the *only* one of the two mechanisms that lets the user point at an arbitrary pre-existing host location; a named volume by design can't be "an existing host folder the user already has."

**Recommendation**

- Use a **named volume** for the app's own persistent state: the job/database SQLite file, and the directory where the app writes newly trained model weights/checkpoints it produces (so these survive `docker compose down`/image rebuilds without depending on the user's host layout).
- Use a **bind mount, explicitly configured by the user**, for dataset ingestion — e.g., a `DATASET_DIR` environment variable / `.env` setting that maps to a bind mount in `docker-compose.yml` (`- ${DATASET_DIR}:/data/datasets:ro` — mount **read-only** by default is a reasonable safe default so the app can't accidentally mutate the user's source dataset; make it explicitly writable only if the workflow requires writing back, e.g. augmented copies). Document clearly that `DATASET_DIR` must be an absolute host path.
- Similarly, allow an optional bind mount for "point at an existing model file" (e.g., to resume/fine-tune from a `.pt` the user already has) via a dedicated `MODELS_DIR` bind mount, again read-only by default unless the workflow needs to overwrite in place.
- Safety notes specific to "letting a user point the app at an arbitrary host folder": validate the path exists and is a directory before wiring it into Compose; avoid mounting the user's entire home directory or drive root (require they name a specific subfolder); if the web UI ever lets a user *type* a path to mount, treat that as a security-sensitive operation — bind-mount targets are decided at `docker compose up` time from the `.env`/Compose file, not dynamically from unauthenticated user input at runtime, since Compose doesn't support mounting arbitrary paths chosen live by an HTTP request without a restart. If in-app "browse to a folder" UX is wanted, the practical pattern is: the user sets `DATASET_DIR` once (host path) and the app then only ever browses *within* that already-mounted `/data/datasets` tree inside the container.

**Sources/evidence**
- [Docker Volumes vs Bind Mounts: What Matters in Production](https://rafftechnologies.com/learn/guides/docker-volumes-vs-bind-mounts-production)
- [Bind Mounts vs Volumes for ML Data — apxml.com](https://apxml.com/courses/docker-for-ml-projects/chapter-3-managing-ml-data-containers/bind-mounts-vs-volumes)
- [Persistent Storage: Docker Bind Mounts and Named Volumes — Portainer](https://www.portainer.io/blog/persistent-storage-docker-bind-mounts-and-named-volumes)
- [How to Choose Between Docker Bind Mounts and Named Volumes](https://oneuptime.com/blog/post/2026-01-16-docker-bind-mounts-vs-volumes/view)

**Confidence:** HIGH for the volumes-vs-bind-mounts split itself (well-established, uncontroversial Docker convention, consistent across all sources). MEDIUM for the specific "read-only by default, user sets env var, no live-typed path" security recommendation — that's this researcher's synthesis applying general Docker security hygiene to the stated requirement, not a claim sourced from a specific article about this exact scenario.

---

## 8. Python version compatibility: PyTorch and Ultralytics, and implications for the base image

**Finding**

Verified directly against live PyPI/GitHub sources (not summarized from blogs):

- **PyTorch** (checked `torch` 2.12.1 / 2.14.0 on PyPI): `requires-python = ">=3.10"`, with classifiers for **Python 3.10, 3.11, 3.12, 3.13, 3.14**. So current PyTorch has dropped support for Python 3.8/3.9 and has already added 3.14 support (including experimental free-threaded 3.14t, though note upstream `manylinux` dropped free-threaded 3.13t wheels as of 2026-05-07, so free-threaded builds are a moving target — avoid them entirely for this project).
- **Ultralytics** (checked `pyproject.toml` on `ultralytics/ultralytics` main branch directly): `requires-python = ">=3.8"`, with classifiers through **Python 3.13** (3.8, 3.9, 3.10, 3.11, 3.12, 3.13). No 3.14 classifier present yet as of this check.
- **Ultralytics' own official GPU Dockerfile** uses `pytorch/pytorch:2.14.0-cuda13.2-cudnn9-runtime` as its base — meaning Ultralytics' own reference deployment is already relying on a PyTorch base image, whose Python version is whatever that upstream PyTorch image ships (typically 3.11 or 3.12 in recent `pytorch/pytorch` tags).

**The overlap/mismatch that matters for base image selection:** PyTorch's floor is 3.10; Ultralytics' ceiling (as of this check) is 3.13. The **safe, fully-supported intersection is Python 3.10–3.13**, with **3.11 or 3.12 being the pragmatic sweet spot** (both are inside every current constraint, both are what upstream `pytorch/pytorch` CUDA images and most current ML tooling target, and both avoid being at either bleeding edge). **Python 3.14 should be avoided for this project's base image** — even though PyTorch now supports it, Ultralytics does not yet declare support for it, so picking 3.14 risks hitting an untested combination for no benefit. Python 3.8/3.9 should also be avoided going forward since PyTorch has already dropped them.

**Recommendation**

- Pin the Docker base image(s) to **Python 3.11** (or 3.12) explicitly rather than tracking "latest" — this sits safely inside both PyTorch's (≥3.10) and Ultralytics' (≤3.13) supported ranges, matches what Ultralytics' own official images effectively ship, and gives headroom before either project's constraints need re-checking.
- Re-verify both projects' supported ranges at implementation time (not just at research time) — Ultralytics is a fast-moving project (per its GitHub, weekly-ish releases) and may add 3.14 support before this project ships; PyTorch's range also shifts roughly twice a year. This is exactly the kind of fact that should be re-checked, not carried forward from memory, when the Dockerfile is actually written.

**Sources/evidence**
- Live fetch of `torch` 2.12.1 / 2.14.0 metadata from PyPI (pypi.org/project/torch/), 2026-09-22.
- Live fetch of `ultralytics/ultralytics/pyproject.toml` from GitHub main branch, 2026-09-22.
- Live fetch of `ultralytics/ultralytics/docker/Dockerfile`, confirming `pytorch/pytorch:2.14.0-cuda13.2-cudnn9-runtime` as the base.

**Confidence:** HIGH — both key facts (PyTorch's floor, Ultralytics' ceiling) were verified against primary sources (PyPI package metadata and the live pyproject.toml) rather than secondary summaries, and they were cross-checked against each other for the overlap. The one open question flagged below (exact Python version baked into current `pytorch/pytorch` CUDA tags) is LOW confidence since it wasn't directly inspected.

---

## Open Questions / Gaps

- **Exact Python version inside `pytorch/pytorch:2.14.0-cuda13.2-cudnn9-runtime`** was not directly verified (only inferred). Confirm at implementation time with `docker run --rm pytorch/pytorch:2.14.0-cuda13.2-cudnn9-runtime python --version`.
- **CDI (`--device nvidia.com/gpu=all`) vs Compose's `deploy.resources.reservations.devices`** compatibility on Windows/WSL2 Docker Desktop specifically was not directly verified — the CDI research was Linux/NVIDIA-toolkit-centric. Recommend testing both paths on the actual target Windows dev machine before committing to one as the documented default.
- **The "subprocess + SQLite job table + SSE" architecture (Q6)** is this researcher's synthesis of adjacent, well-sourced patterns rather than a single canonical reference implementation — worth a lighter-weight, phase-specific technical spike before building it, particularly around cleanly killing a PyTorch/CUDA subprocess mid-training (freeing GPU memory) and correctly reconciling "was this job actually still running" after an unclean backend restart.
- **GPU sharing (MPS/MIG)** was researched only as background/context since it was judged out of scope for v1 (single job at a time) — if concurrent training jobs on one GPU become a real requirement, this needs dedicated research at that time.
