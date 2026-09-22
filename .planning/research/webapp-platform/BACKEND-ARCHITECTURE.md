# Backend Architecture Research: Self-Hosted ML Training/Annotation Web App

**Scope:** Dockerized, single-server, self-hosted Python web app for dataset/model/project management, PyTorch/Ultralytics YOLO training, image annotation CRUD, and real-time training progress streaming.

**Researched:** 2026-09-22

---

## 1. Web Framework — FastAPI vs Flask vs Django/DRF vs Litestar

**Finding:**

- **FastAPI** is the dominant choice for Python ML-serving backends in 2025-2026. It has native `async`/`await` support, built-in `StreamingResponse` (used for SSE), native WebSocket support via Starlette, Pydantic-based request/response validation (which maps cleanly onto job/dataset/annotation schemas), and automatic OpenAPI docs. Ecosystem fit with ML tooling is strong — notably, **Ultralytics' own commercial cloud product (Ultralytics Platform, formerly HUB) is itself built on FastAPI** (with GCP, MongoDB, and Redis), which is a strong same-domain validation signal.
- **Flask** is simpler and has a bigger legacy footprint, but async support is bolted-on (ASGI via Flask 2.x is partial) and native WebSocket/SSE support requires extensions (`Flask-SocketIO`, `flask-sse`). It's a fine choice for small synchronous APIs but is not the natural fit for concurrent streaming + background job orchestration.
- **Django + DRF** brings a batteries-included ORM, admin panel, auth, and migrations — genuinely valuable for a data-heavy app with many entities (projects, datasets, images, labels, models, jobs). Django 6.0 (Dec 2025) added native async views, narrowing the async gap, and DRF's serializer/viewset pattern is proven for CRUD-heavy annotation APIs (this is what CVAT uses, see §6). The cost is heavier boilerplate and a less natural fit for ad hoc streaming endpoints compared to FastAPI/Starlette.
- **Litestar** is a credible, more modern technical alternative to FastAPI (msgspec-based serialization, cleaner DI, comparable async/WebSocket support) but has a materially smaller ecosystem, fewer examples, and lower hiring/community surface area. Not worth the ecosystem risk for a project that will need lots of copy-adjacent tutorials (auth, file upload, SSE, background jobs).

**Recommendation:**

Use **FastAPI**. Reasoning specific to this project:
1. Real-time SSE/WebSocket streaming of training logs is a first-class requirement — FastAPI/Starlette handles both natively without extensions.
2. Async endpoints let the web server stay responsive while long training subprocesses run in the background (see §2) — critical since training and annotation traffic will share one process.
3. Pydantic models double as validation for annotation payloads (bounding boxes, class lists) and job configs (hyperparameters), reducing bugs.
4. It is the same framework the YOLO ecosystem's own commercial platform uses, meaning tutorials/patterns for "FastAPI + YOLO" are unusually well-trodden.
5. If the CRUD/entity-modeling burden (projects, datasets, images, annotations, tags, models, jobs) grows large enough that a hand-rolled ORM layer becomes painful, pair FastAPI with **SQLAlchemy 2.0 (async) + Alembic** rather than switching to Django — this keeps the async story intact while giving migrations and a mature ORM.

Real tradeoff to note honestly: Django/DRF would reduce boilerplate for the CRUD parts of this app (annotation projects/classes/tags look exactly like a DRF viewset app, and CVAT proves this pattern works well at scale). If the team already knows Django well and CRUD volume dominates over streaming/async complexity, Django+DRF+Channels (for WS) is a legitimate second choice. But given the explicit real-time streaming requirement and ML-callback integration, FastAPI is the better default.

**Sources/evidence:**
- [FastAPI vs Litestar 2025](https://medium.com/@rameshkannanyt0078/fastapi-vs-litestar-2025-which-async-python-web-framework-should-you-choose-8dc05782a276) — MEDIUM (blog, but consistent with other sources)
- [Django vs FastAPI vs Flask 2025 decision matrix](https://buildsmartengineering.substack.com/p/django-vs-fastapi-vs-flask-the-2025) — MEDIUM
- Ultralytics Platform architecture (FastAPI + GCP + MongoDB + Redis) — [Ultralytics Platform docs](https://docs.ultralytics.com/platform/) / job listings referencing stack — MEDIUM (inferred from job postings + docs, not an explicit architecture doc)
- General FastAPI native async/WebSocket/StreamingResponse capability — HIGH (well-established, documented framework behavior; direct fetch of official docs failed due to a transient DNS error in this environment, but this is standard, widely-verified FastAPI functionality)

**Confidence:** HIGH (framework recommendation itself); MEDIUM (specific claim about Ultralytics Platform's internal stack, since it's inferred rather than from an official architecture doc).

---

## 2. Background Job Execution — Task Queue vs Native Python Process Management

**Finding:**

Three tiers exist:

1. **In-process (`FastAPI BackgroundTasks`, threads):** Fine only for sub-second work. No persistence — if the backend process restarts, in-flight task state is lost entirely. Not viable for multi-hour training jobs.
2. **OS-level process management (`subprocess.Popen` + DB row tracking):** Spawn each training run as its own OS process (`python train_worker.py --job-id X`), record the PID (and job config) in the database, and let the FastAPI process just supervise it (poll `.poll()`, send SIGTERM to cancel, read a progress channel). This is the simplest architecture that still supports queueing (a simple "max N concurrent" semaphore + DB-backed FIFO), cancellation (kill the PID/process group), and progress reporting (child writes structured progress to a file/DB/pipe; parent tails it). The known failure mode — orphaned processes surviving a backend crash/restart — is solved with a well-established **reconciliation-on-startup pattern**: on boot, the API queries the DB for jobs marked "running," checks whether the recorded PID is still alive, and either re-attaches (if a heartbeat/progress file confirms it's genuinely still training) or marks it "interrupted"/requeues it. This pattern shows up repeatedly in real-world job systems (see sources) and is well within reach for a single-server app.
3. **Task queue + broker (Celery/RQ/arq/Huey/Dramatiq + Redis):** Adds a durable, persistent queue, retries, scheduling, and a worker pool that survives API-process restarts independently. Genuinely useful once you need: multiple job types beyond training, distributed workers across machines, or built-in retry/backoff semantics. For a *single-server* app it is optional complexity, not a hard requirement — but it isn't overkill either, because it *directly solves* the "survive a backend restart" and "queueing" requirements with off-the-shelf durability instead of hand-rolled reconciliation logic.

Queue library comparison (assuming Redis is the broker):
- **Celery** — most features (retries, scheduling, routing, monitoring via Flower) but heaviest to configure and operate; mixes awkwardly with an async FastAPI app (Celery workers are sync by default).
- **RQ** — simplest setup (minutes, if Redis is already running), synchronous worker model, good enough for "one job = one long subprocess" use cases, but weaker on advanced retry/chaining.
- **arq** — asyncio-native, built specifically to pair with async frameworks like FastAPI; non-blocking enqueue from async request handlers; much lighter than Celery; considered by its own maintainers to be in low-maintenance/feature-freeze mode as of recent releases (stable, but not actively growing).
- **Huey** — lightweight, explicitly recommended by multiple sources for small/single-server apps; supports SQLite as a broker in addition to Redis, which is notable since it means you may not need Redis at all for the queue.
- **Dramatiq** — modern, simple, reliable, good middle ground between RQ and Celery, but Redis/RabbitMQ still required.

**Recommendation:**

For this project specifically, use **`subprocess.Popen` (or `multiprocessing.Process`) + DB-tracked job records + a startup reconciliation routine**, *without* a Redis broker, as the initial architecture:

- Training jobs are inherently CPU/GPU-bound, long-running (minutes to hours), and — critically — **Ultralytics' `model.train()` call is blocking and expects to own its process** (it isn't designed to be one lightweight task among thousands like a typical Celery task). A dedicated subprocess per training run is the natural fit, not an anti-pattern to route around.
- A queue's main value propositions — retries, distributed workers, complex routing — don't apply well to training jobs (you generally don't want to silently "retry" a failed training run; you want to surface the failure). The property you actually need — "survive backend restart, support cancellation, report progress" — is achievable with the reconciliation pattern above, and this keeps the deployment to one Docker service (the web app) instead of three (web, Redis, worker).
- Concurrency control ("max N concurrent training jobs," "queue the rest") is a small amount of code: a DB-backed FIFO table plus a semaphore the API checks before spawning a new subprocess.

**When to introduce Redis + a task queue later (documented upgrade path, not now):** if the app grows to support multiple simultaneous users submitting many small async jobs (e.g., auto-annotation inference calls, thumbnail generation, dataset exports) in addition to training, a lightweight queue (arq if staying async-native, or Huey if you want the option of SQLite-as-broker with zero new infra) is the natural next step. Don't add Celery unless multi-machine distribution becomes a real requirement — it's the heaviest of the group and least suited to a single-server deployment.

**Sources/evidence:**
- [Judoscale: Choosing the right Python task queue](https://judoscale.com/blog/choose-python-task-queue) — MEDIUM
- [RQ/Celery/Dramatiq/Huey/arq comparisons](https://markaicode.com/vs/celery-alternatives/) — MEDIUM (aggregator blog, cross-checked against multiple similar sources returning consistent conclusions → upgraded from LOW to MEDIUM)
- [arq GitHub — asyncio-native, Redis-based](https://github.com/python-arq/arq) — MEDIUM-HIGH (official repo)
- Reconciliation pattern for `subprocess.Popen` jobs tracked in DB with PID + startup sweep — MEDIUM (pattern corroborated by multiple independent real-world GitHub issues describing the same problem/solution shape, not a single canonical doc)
- [FastAPI BackgroundTasks limitations (no persistence across restart)](https://leapcell.io/blog/managing-background-tasks-and-long-running-operations-in-fastapi) — MEDIUM

**Confidence:** MEDIUM-HIGH. The general shape (subprocess + DB tracking + reconciliation, defer Redis) is well supported by convergent sources and sound first-principles reasoning about Ultralytics' blocking training API. The specific claim that arq is in "maintenance-only" mode should be double-checked against the arq repo's latest release notes before being treated as a hard blocker, since search snippets vary in how strongly they state this — flagged as an **open question**.

---

## 3. Real-Time Progress/Log Streaming — SSE vs WebSockets

**Finding:**

The data flow for training progress and logs is unidirectional: server (training subprocess, via the backend) → browser. The browser doesn't need to send data back over the same channel (cancellation is a normal REST `POST`, not a streamed message). Every source consulted converges on the same guidance: **SSE is the right default for server-to-client-only streams** (logs, metrics, progress bars, CI/build output — explicitly named as a canonical SSE use case in multiple sources). SSE runs over plain HTTP, auto-reconnects natively in the browser (`EventSource`), requires no special reverse-proxy/Docker networking configuration (unlike WebSocket upgrade handshakes, which can be finicky behind some proxies), and is simpler to implement and debug. WebSockets earn their extra complexity when true bidirectional, low-latency interaction is needed (chat, collaborative editing, multiplayer) — not the case for a training-progress dashboard.

**Recommendation:**

Use **SSE** (`StreamingResponse` with `media_type="text/event-stream"` in FastAPI) for training log/metric streaming. Concretely: the training subprocess writes structured progress (JSON lines: epoch, loss, mAP, ETA) to a per-job channel — either a log file the API tails, or (if a broker is later introduced per §2) a Redis pub/sub channel — and the SSE endpoint relays each new line to connected browser clients as an event.

Reserve WebSockets for a specific, justified future feature: if you later add live *interactive* annotation collaboration (multiple users editing the same image's labels simultaneously) or the ability to send commands mid-stream over the same channel, WebSockets become the right tool for *that* feature — but that's a different problem than progress streaming and shouldn't drive the choice for training logs.

**Sources/evidence:**
- [SSE beats WebSockets for 95% of real-time apps](https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l) — MEDIUM (opinionated blog, but conclusion matches consensus across all other sources returned)
- [Ably: WebSockets vs SSE 2026](https://ably.com/blog/websockets-vs-sse) — MEDIUM-HIGH (Ably is a real-time infra vendor with direct domain expertise, though has some incentive to be even-handed rather than pro-SSE)
- [RxDB: WebSockets vs SSE vs long-polling vs WebTransport](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html) — MEDIUM
- FastAPI's native `StreamingResponse` support for `text/event-stream` — HIGH (standard, widely-documented FastAPI/Starlette capability)

**Confidence:** HIGH. Strong, convergent agreement across independent sources, and the reasoning (unidirectional data flow) is a clean fit for the documented SSE use case.

---

## 4. Ultralytics YOLO Training Progress — Callbacks API

**Finding:**

Ultralytics YOLO **does** expose a first-class callback system — this is the correct integration point, not stdout/log-file parsing. Confirmed directly from official Ultralytics docs (`docs.ultralytics.com/usage/callbacks`):

- Register with `model.add_callback("<event_name>", callback_fn)` before calling `model.train(...)`.
- Relevant events for progress capture:
  - `on_train_epoch_end` — fires after each training epoch's batches complete, **before validation** (so validation metrics/mAP are not yet available here).
  - `on_fit_epoch_end` — fires after each full fit epoch (train + val), **after validation and checkpoint save** — this is the event that has `trainer.metrics` (including mAP) populated, so it's the right hook for a "full epoch summary" progress update.
  - `on_train_batch_end` — fires per-batch, useful for finer-grained progress (batch-level loss) if sub-epoch progress bars are wanted.
  - `on_model_save` — fires when a checkpoint is written.
- The callback receives the `trainer` object, exposing: `trainer.epoch` (current epoch index), `trainer.tloss` (total loss), `trainer.loss_names`, `trainer.metrics` (dict incl. mAP after validation), `trainer.best_fitness`/`trainer.fitness`, and `trainer.last` (path to latest checkpoint).

**Important architectural implication:** callbacks execute **inside the same Python process that calls `model.train()`**. Given the §2 recommendation to run training as a separate OS subprocess, this means the callback code (and its progress-emission logic — write JSON to a file, push to a queue, write to a DB row) must live in the **training worker script** that the subprocess runs, not in the main FastAPI process. The worker script is responsible for: importing `ultralytics`, registering callbacks that serialize `trainer.epoch`, `trainer.tloss`, `trainer.metrics` etc. to a per-job progress channel (a JSONL file or DB row is simplest, given the §2 no-Redis default), and the FastAPI process's SSE endpoint is responsible for tailing/polling that channel and forwarding new entries to the browser.

**Recommendation:**

Build a small `train_worker.py` entry point that: loads the YOLO model, registers `on_train_epoch_end`/`on_fit_epoch_end`/`on_train_batch_end` callbacks that append structured JSON progress lines to `runs/<job_id>/progress.jsonl` (or write to a `job_progress` DB table), then calls `model.train(...)`. The main FastAPI app spawns this script as a subprocess (§2) and its SSE endpoint tails the JSONL file (or polls the DB row) for that job ID. This avoids stdout parsing entirely and gives structured, typed progress data.

**Sources/evidence:**
- Official Ultralytics docs, fetched directly: [Training Callbacks Guide](https://docs.ultralytics.com/usage/callbacks/) — HIGH (primary/official source, fetched and read directly)
- [ultralytics/docs/en/usage/callbacks.md on GitHub](https://github.com/ultralytics/ultralytics/blob/main/docs/en/usage/callbacks.md) — HIGH (source of the official docs)

**Confidence:** HIGH. This is directly verified against official Ultralytics documentation, not inferred from secondary sources.

---

## 5. Database — SQLite vs PostgreSQL

**Finding:**

The consistent technical picture across sources: SQLite with WAL mode allows **unlimited concurrent readers** but **only one writer at a time** — WAL removes reader/writer blocking, it does not grant true concurrent writes. In WAL mode, a single Linux node can comfortably handle very high read throughput and a meaningful (thousands/sec) write rate for typical workloads, but write serialization is a hard architectural property, not a tunable. Sources consistently flag two migration triggers: (1) a **second application server/process** writing to the same DB, or (2) frequent `"database is locked"` errors appearing in logs under real write concurrency.

Applied to this app's actual workload: annotation CRUD (frequent small writes from possibly-simultaneous users saving labels) will coexist with training-job status/progress writes (if progress is persisted to the DB rather than a file, per §4). This is exactly the kind of "many small concurrent writers" pattern that stresses SQLite's single-writer model — not because the write *volume* is large, but because writes can be *bursty and concurrent* (a user saving an annotation at the same moment a training job's epoch-end callback writes a progress row). SQLite's writer serialization means one of those writes queues behind the other; with WAL and short transactions this is usually invisible, but it is a real and known failure mode ("database is locked") once concurrent writers increase.

**Recommendation:**

**Start with SQLite (WAL mode) for a single-user or lightly-concurrent early build — it is genuinely sufficient and dramatically simplifies deployment** (no separate DB container, no connection pool tuning, trivial backup = copy the file). This fits the project's explicit "avoid unnecessary distributed-systems complexity" instruction well.

However, given this app's specific combination of (a) multi-user annotation (concurrent small writes are a first-class use case, not an edge case) and (b) the explicit goal of "should not block reasonable future growth (multiple concurrent jobs, multiple users)," **PostgreSQL is worth adopting from the start if more than one person will use the app concurrently, or once training-job progress is persisted to the DB at high frequency (e.g., per-batch progress writes).** The operational cost is low in a Dockerized setup (one more `docker-compose` service, well-trodden pattern) and it removes the single-writer ceiling entirely, avoiding a migration later. If the app is genuinely single-user / single-operator with infrequent writes, SQLite remains a fully defensible choice and migration to Postgres later is mechanically simple (same SQLAlchemy models, swap the connection string, run Alembic against the new DB) — so this decision is not high-stakes either way, but should be made consciously based on expected concurrent users, not deferred by default.

**Mitigating factor:** if §2/§4's recommendation to write high-frequency training progress to a **file** (JSONL) rather than the DB is followed, this substantially reduces write pressure on the DB (progress writes become file I/O, not SQL writes), which tilts the calculus back toward SQLite being sufficient for longer — the DB only needs a write at job start/end/status-change, not per-epoch.

**Sources/evidence:**
- [MVP Factory: SQLite on the server — single-node architecture handling 100K req/s](https://mvpfactory.io/blog/sqlite-as-your-server-database-litestream-replication-wal-tuning-on-linux-and) — MEDIUM (detailed technical blog, numbers plausible but not independently verified)
- [Kyle.au: Database options for self-hosted applications](https://kyle.au/notes/technology/administration/database-options-for-self-hosted-applications) — MEDIUM
- [Botmonster: Self-hosted databases 2026 — Postgres vs SQLite vs MariaDB](https://botmonster.com/self-hosting/self-hosted-databases-postgres-sqlite-mariadb/) — MEDIUM
- SQLite official documentation on WAL mode concurrency semantics (single-writer, multi-reader) — HIGH (well-established, widely-verified SQLite behavior, consistent across every source returned)

**Confidence:** MEDIUM-HIGH on the general SQLite/Postgres tradeoff (strong technical consensus); MEDIUM on the specific recommendation for *this* app, since the right choice depends on an unresolved product question — **expected number of concurrent users** — flagged as an open question for the roadmap/requirements phase.

---

## 6. Comparable Open-Source Platforms — Architecture Patterns

**Finding:**

- **CVAT** (closest architectural analog — annotation + ML-assisted labeling): Django REST Framework backend (`cvat/apps/engine` holds core API endpoints for tasks/jobs/projects/annotations, using DRF ViewSets — `ProjectViewSet`, `TaskViewSet`, `JobViewSet`). Django ORM models every entity (Task, Job, Label, Annotation). **Redis Queue (RQ)** — not Celery — handles asynchronous job processing (import/export, annotation jobs) with specialized worker types. For automatic/AI-assisted annotation, CVAT integrates **Nuclio** (a serverless functions platform) to run model inference (including YOLO, SAM) as separate serverless functions rather than in the main API process — i.e., CVAT explicitly does NOT run ML inference inline in the web backend; it dispatches to isolated worker functions. Full self-hosted CVAT also adds PostgreSQL, two Redis instances, and ClickHouse for analytics — meaningfully heavier infrastructure than this project needs, but the *core* pattern (Django+DRF for CRUD, RQ for async jobs, isolated processes for ML work) validates the shape recommended above (§1, §2).
- **Label Studio**: supports pluggable storage backends (local filesystem, S3, GCS, Azure) for annotation data via a documented connector API, rather than only DB-stored files — relevant to this project's own file-storage design for images/datasets.
- **Ultralytics Platform** (formerly HUB): FastAPI-based backend (per job postings and docs), with cloud training jobs reporting "real-time metrics streaming" back to the platform — directly validates the FastAPI + streaming-training-metrics architecture recommended in §1/§3/§4, from the same company that built the YOLO training loop itself.

**Recommendation:** Treat CVAT as the closest real-world precedent for the annotation-CRUD half of this app (validates DRF-viewset-style resource modeling for projects/tasks/jobs/annotations, whether built in Django or replicated as FastAPI routers), and Ultralytics Platform as the precedent for the training/streaming half (validates FastAPI + real-time metrics streaming for YOLO specifically). Neither needs to be replicated wholesale — this project is explicitly single-server and doesn't need CVAT's Nuclio/ClickHouse/dual-Redis complexity — but the core job-queue-isolation pattern (never run model inference/training inline in the request-handling process) is worth adopting regardless of framework choice.

**Sources/evidence:**
- [DeepWiki: cvat-ai/cvat architecture](https://deepwiki.com/cvat-ai/cvat) — MEDIUM (third-party auto-generated architecture summary, not CVAT's own docs, but cross-checked against CVAT's GitHub repo structure)
- [CVAT GitHub repository](https://github.com/cvat-ai/cvat) — MEDIUM-HIGH (primary source repo, though specifics were read via secondary summarization rather than direct file inspection)
- [Label Studio integrations/storage guide](https://labelstud.io/blog/label-studio-integrations-guide/) — MEDIUM (official Label Studio blog)
- Ultralytics Platform stack (FastAPI/GCP/MongoDB/Redis) — MEDIUM (inferred from job postings and docs, not an explicit published architecture doc — flagged as **open question**, worth a direct follow-up if higher confidence is needed)

**Confidence:** MEDIUM. CVAT's architecture is reasonably well corroborated (DeepWiki summary + public repo structure); the Ultralytics Platform internal-stack claim is the weakest-sourced item in this document and should be treated as directional, not authoritative.

---

## 7. Large Model File Handling (.pt files, 100MB–1GB+)

**Finding:**

Multiple sources converge on the same guidance for Dockerized ML apps: **large model weight files should not flow through browser HTTP upload into the container's writable layer** as a default pattern — the consistent recommendation is to keep model weights outside the Docker image/container and use **bind mounts or named volumes** for filesystem-style access instead. Reasoning given: avoids bloating container images/rebuild times, avoids browser-upload size/timeout fragility for very large files, and gives the host direct control over where model files physically live (important for a self-hosted single-server tool where the operator already has files on disk from previous training runs, downloads, etc.).

That said, browser upload is not inherently unrealistic for this size range — 100MB–1GB uploads over HTTP are technically routine today (chunked/resumable upload is standard, e.g., via `tus` protocol or simple multipart with an adjusted reverse-proxy body-size limit) — but it adds meaningful complexity (upload progress UI, resumability, server-side streaming-to-disk to avoid buffering the whole file in memory, proxy timeout/size config) for a self-hosted tool where the "user" is typically the same person operating the Docker host.

**Recommendation:**

For this project, support **both**, but make **host-path reference via a mounted volume the primary/default path**, with browser upload as a secondary convenience option:
- Mount a host directory (e.g., `./models:/app/models`) into the container. Let users pick a model by browsing/selecting a path already inside that mounted directory (the backend lists files under the mount, the UI presents them as a picker) — this is the natural fit for a self-hosted single-server tool where the operator already has `.pt` files sitting on disk from prior training runs or downloads, and avoids re-uploading multi-hundred-MB files that already exist locally.
- Also support direct upload for convenience (e.g., a model downloaded from elsewhere) using **streamed multipart upload directly to disk** (never buffer the full file in memory; FastAPI's `UploadFile` already streams to a spooled temp file) with a reverse-proxy body-size limit raised accordingly (if Nginx/Traefik sits in front) — this covers the case where the file isn't already on the host.

This mirrors what comparable tools do: Docker/ML deployment guidance broadly treats "keep weights on a mounted volume, don't bake them into the app" as the default pattern, and CVAT/Label Studio-style tools similarly support both direct upload and referencing external/mounted storage rather than forcing one path.

**Sources/evidence:**
- [The Neural Base: Large model storage strategies for Docker ML apps](https://theneuralbase.com/docker-for-ml/learn/advanced/large-model-storage-strategies/) — MEDIUM (educational/course content, directionally consistent with general Docker best practice)
- [The Neural Base: Model weights and large files](https://theneuralbase.com/docker-for-ml/learn/beginner/model-weights-and-large-files/) — MEDIUM
- [Medium: Handling large model files in Dockerized LLM apps](https://leosiraj96.medium.com/handling-large-model-files-in-dockerized-llm-applications-43fd821cd00e) — MEDIUM
- FastAPI `UploadFile` streaming-to-temp-file behavior — HIGH (documented, standard FastAPI/Starlette behavior)

**Confidence:** MEDIUM. The "prefer mounted volume over browser upload" guidance is consistent across sources but drawn mostly from general Docker/ML-deployment blog content rather than an authoritative single source; the FastAPI streaming-upload mechanics are solidly verified.

---

## Synthesis — How These Answers Fit Together

The seven findings compose into one coherent architecture:

1. **FastAPI** app (async) serves CRUD (projects/datasets/annotations/models) and orchestrates jobs.
2. Training jobs run as **separate OS subprocesses** (`train_worker.py`), tracked by DB row (PID, status, config), with a **startup reconciliation sweep** — no Redis/Celery required initially.
3. The worker script registers **Ultralytics callbacks** (`on_train_epoch_end`, `on_fit_epoch_end`) that write structured JSON progress to a per-job file.
4. The FastAPI process exposes an **SSE endpoint** per job that tails that progress file and streams updates to the browser.
5. **SQLite (WAL)** is the default persistence layer; **PostgreSQL** is the recommended upgrade if multi-user concurrent annotation is a day-one requirement (open product question).
6. This mirrors CVAT's core pattern (DRF/queue/isolated-ML-process) and Ultralytics Platform's own choice of FastAPI + streamed metrics, scaled down to single-server needs.
7. Model weight files are referenced via a **mounted host volume** by default, with streamed browser upload as a secondary path.

## Open Questions (flagged for roadmap/requirements, not resolved here)

- **Expected concurrent users** for the annotation UI — directly determines whether SQLite is sufficient or Postgres should be adopted from phase 1 (§5).
- Whether arq is genuinely in "maintenance mode" (some sources implied this, not independently confirmed against the current changelog) — relevant only if/when a queue is introduced later (§2).
- Exact internal stack of Ultralytics Platform (FastAPI + MongoDB + Redis) — sourced from job postings/inference, not an official architecture document; treat as directional validation only, not a load-bearing fact (§1, §6).
- Whether the Ultralytics callback-import-across-processes caveat (mentioned in official docs re: checkpoint serialization) has any practical impact on the subprocess-worker pattern recommended here — worth a small spike/prototype before committing (§4).
