# Phase 6: Polygons & Segmentation Projects - Research

**Researched:** 2026-10-19
**Domain:** Konva polygon editing, SAM-style click-to-segment on CPU (Ultralytics 8.4.159), task-type-aware annotation contract, segmentation metrics in the progress schema
**Confidence:** HIGH for the contract, training and SAM mechanics (measured in this session, on the dev machine and inside the worker container); MEDIUM for UX details that rest on training knowledge (flagged `[ASSUMED]`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward from earlier phases (still binding)**
- Mantine, dark theme only, i18n en/ru with no hardcoded strings (P1 D-01..D-04). API errors are plain English (P1 D-05).
- Saving replaces an image's whole annotation set and is guarded by `annotation_version` compare-and-swap, with 409 on a stale save (P3 D-12). Polygons go through the same contract. `annotations.kind` already allows `'polygon'` (migration 0004).
- Autosave on every completed gesture, undo/redo with one snapshot per gesture, an always-active class (digits 1–9), and a tool that stays active after drawing all apply to polygons too (P3 D-05..D-11). Any change on a reviewed image demotes it (P3 D-15).
- Geometry is normalized to the EXIF-oriented image (P2 D-17). Annotations reference the class id, and the class index is computed at export time (P2 D-13).
- The api image stays torch-free. torch and ultralytics live only in the worker image (P1 D-17).
- Snapshot labels for segment projects are polygons. `training/labels.py` already converts boxes to 4-point polygons (P3 D-18, P4 D-19).
- Charts and history are rebuilt from `progress.jsonl`. The B/M metric-key mapping stays in Python (P5 D-01, D-05). `yolo_trainer_common/progress.py` already selects the `(M)` suffix for segment.

**Polygon drawing & editing (ANNO-04)**
- **D-01:** Draw by clicking vertices. **Close** by clicking the first vertex, which highlights on hover, or by pressing **Enter**. Both need at least 3 points. **Esc** cancels the unfinished contour, and **Backspace** removes the last placed point. Double-click does not close a polygon.
- **D-02:** Edit a selected polygon by **dragging its vertices**. A faded **midpoint handle** on each edge creates a new vertex when dragged. **Alt+click or right-click** on a vertex deletes it, and a polygon never drops below 3 vertices. The whole polygon can be moved and its class changed the same way as a box. All of these actions appear in the shortcut reference.
- **D-03:** **Self-intersecting polygons are allowed** and saved as drawn. The object list shows a warning icon ("contour crosses itself"). Nothing is blocked.
- **D-04:** **One polygon is one instance.** An occluded object is annotated as separate polygons of the same class. There are no holes and no multi-part instances. This matches YOLO's one-row-one-contour label format.

**Click-to-segment (ANNO-05)**
- **D-05:** The interaction uses **positive and negative points with a live preview**. A click adds an "object" point, and Shift-click or right-click adds a "not object" point. The mask preview updates after each point. **Enter** accepts the result with the active class, and **Esc** discards it. The reference is Roboflow Smart Polygon. Box prompts are not included.
- **D-06:** **One fixed, lightweight SAM variant** supported by Ultralytics 8.4.159, chosen for **CPU latency** (target: a mask within a few seconds on the CPU dev machine, per success criterion 2). There is no model picker in the UI. Research picks the model (for example SAM 2.1-tiny vs MobileSAM vs FastSAM) and measures its latency.
- **D-07:** Click-to-segment **works while a training run is active**. It runs outside the training queue and must not wait behind it. When a training run is active, the tool shows a note that segmentation may be slower.
- **D-08:** The mask is converted into a **simplified polygon**. The default lands at roughly 20–60 vertices, which is comfortable to hand-edit. A **detail slider** in the tool panel recomputes the preview from the cached mask without running SAM again. The accepted result is an ordinary polygon (or box in a detect project) that can be edited like a hand-drawn shape.

**Project task type rules (ANNO-11)**
- **D-09:** Existing **boxes in segment projects are migrated to 4-point polygons** by a one-time Alembic migration. After it runs, a segment project stores only polygons. — **Reversibility:** one-way — the migration rewrites stored geometry. The original box rows are not kept.
- **D-10:** A **detect project** offers the **box tool and click-to-segment**. Click-to-segment there produces the mask's **bounding box**. A detect project has no polygon tool.
- **D-11:** A **segment project** keeps the **box tool**. Releasing the mouse turns the drawn box into a **4-point polygon** with editable vertices. The segment toolbar has select, box, polygon, and click-to-segment.
- **D-12:** The **server refuses geometry of the wrong kind** for the project's task type with a 422: polygons in a detect project, and boxes in a segment project once D-09 has run. — **Reversibility:** costly — the save API contract and Phase 8's accept path depend on it.

**Segmentation metrics (success criterion 4)**
- **D-13:** Segment runs use the **same three charts**. On the mAP and P/R charts, **mask metrics (M) are solid lines** and **box metrics (B) are dashed lines**. The loss chart adds **seg_loss**. The exact metric keys must be **captured from the first real segment run**, as Phase 0 §2 left them open. Do not guess them.
- **D-14:** In the **Final results card, the history table, and the quality verdict**, mask metrics are primary. The mAP50 and mAP50-95 columns and the verdict use (M), and labels say "(masks)". The final card shows the box metrics as a second line. Detect runs are unchanged.

### Claude's Discretion
- The polygon geometry storage (a JSON point list column vs. a separate points table, and what happens to x/y/w/h for polygons, e.g. keeping the bounding box for cheap queries). It must not block Phase 8's AI-suggested flag. Export uses the stored points directly.
- How the SAM service is hosted: a long-lived inference process or endpoint in the worker container (the api stays torch-free), how it is kept warm, the request path from api to worker, image-embedding caching per image (so extra points are fast), and timeouts. SAM weights are cached under `DATA_DIR` the same way base weights are. A download failure shows a clear message on the tool.
- The mask → polygon simplification algorithm (for example Douglas–Peucker on the largest contour) and the slider range.
- The shortcut keys for the polygon and click-to-segment tools (suggested: P polygon, S or M segment). They must not conflict with the existing table in `lib/shortcuts.ts`.
- The exact wording and placement of the self-intersection warning and the "training is running" note.
- How grid thumbnails or tile counts show polygons, if at all. The tile count should cover all shapes.

### Deferred Ideas (OUT OF SCOPE)
- Box or rectangle prompts for SAM, and a user-selectable larger SAM model (for example for GPU hosts). Possible follow-ups to Phase 6 or Phase 12.
- Multi-part instances and polygons with holes. Not supported by the YOLO one-row-one-contour format, so out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANNO-04 | User can draw polygons and edit them (add, move, delete vertices), and assign a class to each | Storage/contract design (Pattern 1), Konva polygon editing state machine (Pattern 4), self-intersection check, Pitfalls 6-9, Ultralytics label-row rules (Pitfall 5) |
| ANNO-05 | User can click on an object to get an auto-generated polygon/box (click-to-segment, SAM-style) as a drawing tool | Measured model choice (MobileSAM), segmenter service in the worker container (Pattern 2), contour extraction and client-side simplification (Pattern 3), Pitfalls 1-4, 10-12 |
| ANNO-11 | Annotation tools respect the project task type (detect stores boxes; segment stores polygons, boxes convertible) | Task-type validation in `apply_save` (Pattern 1), Alembic 0010 box-to-polygon data migration, list of existing tests that D-12 breaks (Pitfall 13), tool availability per task type |
| (success criterion 4) | A segment project trains end-to-end and its live charts show mask metrics with exact keys | Captured real segment-run keys (section "Captured segment-run metric keys"), progress schema extension (Pattern 5), `sem_loss` finding (Pitfall 14) |
</phase_requirements>

## Summary

Phase 6 has three independent work streams: (1) a task-type-aware annotation contract plus polygon editing, (2) a click-to-segment service that lives in the worker container and answers the api over HTTP, and (3) segment metrics in the progress schema, charts and final card. Most of the plumbing already exists. The save contract, the CAS version, the `(M)` suffix mapping, `label_rows` for segment, and the mask note in `RunMetrics` are in place, so the work is extension, not invention.

The SAM question is answered with measurements, not opinion. On the dev machine and inside the running worker container (Linux, 16 CPUs visible), **MobileSAM** (`mobile_sam.pt`, 40.7 MB) encodes an image in about 1.3–1.6 s and answers each further point in about 0.1 s when the image embedding is cached; peak RSS is about 430 MB. SAM2.1-tiny is about 2x slower and 2x larger for a modest quality gain. FastSAM is fastest but cannot refine with negative points (it only selects among pre-generated "everything" masks), so it cannot deliver D-05. Under a saturating CPU load (a stand-in for a CPU training run) the first click grows to about 3.4–5.6 s, which still meets "a few seconds" but justifies the D-07 "may be slower" note.

Two findings change the picture compared with the CONTEXT notes. First, the roadmap note "Use Ultralytics `segments2boxes`" cannot be applied literally in the api: the api image is torch-free and numpy-free (P1 D-17), so polygon-to-box is a 4-line pure-Python min/max in the api, with `segments2boxes` used only as a test oracle. Second, the first real segment run was captured now (YOLO26-seg, CPU, 2 epochs): masks add `(M)` keys and `val/seg_loss`, but YOLO26-seg also emits an auxiliary `sem_loss` that is about 7.7 in training and exactly 0.0 in validation, which would distort the summed train-vs-val loss chart unless it is excluded from the totals.

**Primary recommendation:** Keep `x/y/w/h` as the polygon bounding box and add one nullable JSON `points` column (migration 0010, which also converts segment-project boxes to 4-point polygons and bumps their `annotation_version`); add a `polygons` array next to `boxes` in the save/read contract with server-side task-type validation before the CAS; host MobileSAM in a child process of the worker that serves a small FastAPI app on port 8001, proxied by an api route; return a dense normalized contour and do the detail-slider simplification client-side.

## Project Constraints (from CLAUDE.md)

- Stack is pinned: Python 3.12, Ultralytics 8.4.159, PyTorch 2.14.0 (verified in `.venv`: `8.4.159 2.14.0+cpu`). FastAPI + SQLAlchemy/Alembic + SQLite (WAL), React + Vite SPA with react-konva. Do not introduce Redis/Celery. No new heavy dependencies.
- Jobs run as subprocesses tracked in DB; progress via Ultralytics callbacks -> JSONL -> SSE.
- One task type per project (Ultralytics hard constraint); classes and tags are distinct.
- Docker Compose with separate CPU and GPU images; must run CPU-only. No NVIDIA GPU on the dev machine.
- Security: uploaded or downloaded `.pt` files are pickle-based and can execute code; mounted paths must be validated. This applies directly to the SAM weights (pin a hash, Pitfall 12).
- The api image must stay torch-free (P1 D-17): no `numpy`/`cv2`/`ultralytics` import in `yolo_trainer_api`.
- GSD workflow: all repo edits go through a GSD command. After a phase completes: commit remaining planning files, make sure the branch is `dev`, `git push origin dev`, report the pushed range. Do not merge to `main`.
- Backend style: ruff, line length 100 (`backend/pyproject.toml`). Backend tests: `uv run pytest backend/tests`; frontend: vitest. CI runs both plus `ruff check` and `ruff format --check`.
- The legacy-script conventions in CLAUDE.md (Russian comments, no type hints) describe the root scripts, not the `backend/` and `frontend/` code, which is typed and English. Follow the existing style of the package being edited.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Draw / edit polygon vertices, midpoint handles, vertex delete | Browser (react-konva) | — | Pure canvas interaction; one history entry per completed gesture |
| Self-intersection warning | Browser | — | Pure geometry on the points already in the store |
| Box drawn in a segment project -> 4-point polygon | Browser | API (validates) | Conversion at write time on the client; the server refuses boxes in segment projects |
| Task-type rules (422 on wrong kind) | API | — | Authoritative server-side check before the CAS statement (D-12) |
| Polygon storage, bbox columns, CAS save | API / Database | — | Extends the existing whole-set replace |
| Box-to-polygon data migration (D-09) | Database (Alembic) | — | One-time, runs on api start |
| Image decode (EXIF-oriented), downscale, SAM encode + decode | Worker container (child process) | — | Only the worker has torch/ultralytics (P1 D-17) |
| Mask -> dense contour (largest outer contour) | Worker container | — | Needs cv2, which exists only in the worker image |
| Contour -> simplified polygon (detail slider) | Browser | — | Instant, no server state, no extra requests |
| Click-to-segment request routing, project/image scoping, error mapping | API | Worker (HTTP) | The browser only talks to `/api`; the api resolves ids and forwards ints, never paths |
| SAM weights download, hash pin, cache under `DATA_DIR/weights` | Worker container | — | Same cache the base weights use |
| Polygon -> YOLO label rows, manifest | API (`training/labels.py`) | — | Pure builders; points written straight from storage |
| Mask/box metric mapping and `secondary` numbers | API/common (`progress.py`) | Browser (renders) | Key mapping stays in Python (P5 D-01) |
| Dashed box series, final-card second line, "(masks)" labels | Browser | — | Presentation only |

## Standard Stack

No new packages are needed. Everything below is already pinned in `uv.lock` / `package.json`.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ultralytics | 8.4.159 | SAM `Predictor` (MobileSAM), YOLO segment training | Pinned; `ultralytics.models.sam.Predictor` caches the image embedding in `set_image` [VERIFIED: .venv/Lib/site-packages/ultralytics/models/sam/predict.py:565-595] |
| torch | 2.14.0 (CPU build) | SAM inference | Pinned [VERIFIED: `.venv` import printed `8.4.159 2.14.0+cpu`] |
| opencv-python (cv2) | 5.0.0.93 (via ultralytics; present in worker image) | `findContours`, `contourArea`, `approxPolyDP` for the mask -> contour step | Already a transitive dependency; verified importable inside the worker container (`cv2 5.0.0`) [VERIFIED: docker exec output `5.0.0`; uv.lock line 463-469] |
| fastapi + uvicorn | already in `backend/pyproject.toml` | Segmenter HTTP app inside the worker image | Same deps as the api; the worker image is built from the same package [VERIFIED: backend/pyproject.toml dependencies] |
| react-konva / konva | 19.3.0 / 10.7.0 | `Line` (closed polygon), `Circle` vertex handles | Already used for boxes; Label Studio uses the same stack for polygons [CITED: konvajs.org/docs/shapes/Line_-_Polygon.html] |
| recharts | 3.10.1 | Existing charts, extended with dashed box series | Already in use |
| zustand + zundo | 5.x / 2.x | Existing store and history | Extend, do not replace |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Python stdlib `urllib.request` | 3.12 | api -> segmenter HTTP call | Run it in `asyncio.to_thread` with an explicit timeout; avoids moving `httpx` (dev-only today) into runtime deps |
| `pytest.importorskip("ultralytics")` | pytest 9.1 | Oracle test of the pure-Python polygon bbox against `segments2boxes` | Backend tests only; never in api code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff (measured, 640x640 image, native Windows, torch 2.14.0+cpu) |
|------------|-----------|----------|
| MobileSAM (`mobile_sam.pt`) | SAM2.1-tiny (`sam2.1_t.pt`, `SAM2Predictor`) | encode 2.13–2.54 s vs 1.26–1.33 s; RSS 939 MB vs 424 MB; weights 78.1 MB vs 40.7 MB; bbox IoU mean 0.679 vs 0.623 (1 click, multimask) on a 19-image proxy. Same `set_image` / `predictor(points=...)` API, so it is a one-constant swap if quality disappoints |
| MobileSAM | FastSAM-s (`FastSAM-s.pt`) | 0.19–0.43 s per call, 23.9 MB, IoU mean 0.68 on the proxy, but points only select among pre-generated proposals: each positive point turns masks containing it on, each negative point turns them off [VERIFIED: ultralytics/models/fastsam/predict.py:124-131]. It cannot refine a boundary, so it cannot deliver the D-05 interaction |
| MobileSAM | `sam_b.pt` / `sam_l.pt` (ViT) | Not benchmarked; far heavier by design. Deferred by D-06 (no model picker) |
| In-process thread | Separate compose service | Discretion allows "in the worker container"; a child process keeps an OOM or crash away from the training supervisor and heartbeat |
| `urllib` + `to_thread` | `httpx` as runtime dep | `httpx>=0.28` is a dev-group dependency today; moving it needs a `uv lock` change. Stdlib is enough for four small JSON calls |

**Installation:** none. Frontend: none. Weights (runtime download by the worker, not a package): `mobile_sam.pt` from `https://github.com/ultralytics/assets/releases/download/v8.4.0/mobile_sam.pt`.

**Version verification:** `ultralytics 8.4.159`, `torch 2.14.0+cpu` read from the project venv; `mobile_sam.pt`, `sam2.1_t.pt`, `FastSAM-s.pt` and `sam_b.pt`/`sam_l.pt` are listed in `GITHUB_ASSETS_NAMES` [VERIFIED: ultralytics/utils/downloads.py:40-45]. `sam3` weights are not in that list (gated) and are out of scope.

## Package Legitimacy Audit

No new external packages are installed in this phase (backend, frontend, or worker image). `package-legitimacy check` was therefore not run. The only new external artifact is a model weights file, covered by the hash-pin recommendation (Pitfall 12) rather than a registry check.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

If the planner decides to move `httpx` to runtime dependencies instead of using `urllib`, it is already resolved in `uv.lock` (dev group) and needs only a `pyproject.toml` move plus `uv lock`.

## Architecture Patterns

### System Architecture Diagram

```
 BROWSER (react-konva editor)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ Tools by task type:  detect: select · box · segment                       │
 │                      segment: select · box(->4-pt polygon) · polygon · segment │
 │                                                                          │
 │ polygon draft (ephemeral, not in history) ──close──► store.createPolygon │
 │ vertex/midpoint/move gesture ──release──► store.updatePolygon (1 entry)  │
 │ segment tool: prompts[] ──debounce/coalesce──► POST …/segment            │
 │        ◄── dense contour + bbox ── client Douglas-Peucker(detail slider) │
 │        Enter ──► createPolygon(simplified) | createBox(bbox in detect)   │
 │ store.doc ──debounced PUT (CAS base_version)──────────────┐              │
 └───────────────────────────────┬──────────────────────────┼──────────────┘
                                 │ /api (nginx, 1 MiB body)  │
 ┌───────────────────────────────▼──────────────────────────▼──────────────┐
 │ API container (torch-free)                                               │
 │  PUT annotations: validate kind vs project.task_type (422) ─► CAS UPDATE │
 │        ─► diff-apply boxes | polygons(points JSON + bbox x/y/w/h)        │
 │  POST segment: project+image scoping ─► forward ints+ext+size ──┐        │
 │  GET/POST segmentation status/prepare ─────────────────────────┤        │
 │  training/snapshot+labels: polygon rows from stored points      │ HTTP   │
 └─────────────────────────────────────────────────────────────────┼────────┘
                                                                   │ worker:8001 (compose network only)
 ┌─────────────────────────────────────────────────────────────────▼────────┐
 │ WORKER container                                                         │
 │  main(): heartbeat thread · Supervisor (DB poll -> train_job subprocess) │
 │          SegmenterHost thread ─► child: python -m yolo_trainer_worker.segmenter │
 │  segmenter child: FastAPI · lock · lazy model (weights download + sha256)│
 │     image path from ints ► PIL exif-transpose ► cap long side 1024       │
 │     Predictor.set_image (single-slot embedding cache) ► predictor(points)│
 │     mask ► largest outer contour (cv2) ► normalized dense contour        │
 │  DATA_DIR/weights/mobile_sam.pt   DATA_DIR/projects/<p>/images/<i>.<ext> │
 └──────────────────────────────────────────────────────────────────────────┘
 Training path (unchanged shape): snapshot ► label rows (polygon points) ► train_job
   ► progress.jsonl (+ (M) and (B) keys) ► supervisor ► SSE enrich_event(primary, secondary) ► charts
```

### Recommended Project Structure
```
backend/src/yolo_trainer_api/
├── migrations/versions/0010_polygon_points.py   # add points JSON; box->polygon in segment projects; bump version
├── annotations.py          # apply_save(task_type=...): kind validation first, polygons diff-apply
├── schemas.py              # PolygonIn/PolygonRead, polygons[] in AnnotationSave/AnnotationSetRead, limits
├── routers/segmentation.py # POST …/images/{id}/segment, GET/POST /api/segmentation[/prepare]
├── segmenter_client.py     # urllib call in to_thread, error mapping (503/502/504), no secrets
└── training/{snapshot,labels}.py   # shapes carry points; label_rows writes polygon points
backend/src/yolo_trainer_common/
├── layout.py               # + sam_weights_file(data_dir), SEGMENTER_* constants
└── progress.py             # + secondary_metrics, enrich_event adds "secondary" for segment
backend/src/yolo_trainer_worker/
├── segmenter/              # app.py (FastAPI factory, injectable engine), engine.py (SAM), contour.py (pure cv2/numpy)
├── segmenter_host.py       # starts/restarts the child, stops it on stop_event
└── main.py                 # WorkerSettings: segmenter_port/bind; start host thread
frontend/src/features/editor/
├── canvas/PolygonShape.tsx, PolygonDraft.tsx, SegmentOverlay.tsx
├── lib/polygon.ts          # pure: close/insert/delete vertex, bbox, selfIntersects, simplifyClosed (RDP)
├── store/annotationStore.ts, editorUiStore.ts   # polygons in doc; tool union; segment prompt state
└── lib/shortcuts.ts        # + polygon (p), segment (s), confirm (Enter); Backspace/Esc gain draft semantics
frontend/src/features/training/progress/{foldProgress,RunCharts}.tsx, FinalResultsCard.tsx, RunMetrics.tsx
```

### Pattern 1: Contract and storage (recommended, within the stated discretion)
**What:** Keep `annotations.x/y/w/h` for every row (for a polygon they are the bounding box, computed by the server from `points`) and add one nullable JSON column `points` holding `[[x, y], ...]` normalized to [0, 1]. `kind` already allows both values [VERIFIED: backend/src/yolo_trainer_api/models.py:190, `CheckConstraint("kind IN ('box', 'polygon')", name="ck_annotations_kind")`].
**Why this and not a points table:** all existing queries (`unannotated_clause`, status counts, class cascade, snapshot joins, `box_count`) are `exists/count` over `annotations` rows and stay correct untouched; the CAS and diff-apply stay one table; the bbox gives Phase 8 a cheap box for IoU/overlap tests; export reads `points` directly; downgrade is trivial (`UPDATE ... SET kind='box'`, because x/y/w/h are always valid). A separate table would force joins into every count.
**Wire contract:** add `polygons: list[PolygonIn]` (default `[]`) next to `boxes` in `AnnotationSave` and `AnnotationSetRead`. Because projects are homogeneous (D-12), exactly one of the two arrays is ever non-empty; defaults keep every existing detect test and client payload valid. `SaveResult.box_count` keeps its name and counts all objects (renaming it is blast radius for no gain; the tile and status code already treat it as "object count").
**Validation (all server-side, plain English per P1 D-05):**
- Before the CAS statement and without any DB read: `task_type == "detect" and payload.polygons` -> 422 "This is a detect project: it stores boxes only."; `task_type == "segment" and payload.boxes` -> 422 "This is a segment project: it stores polygons only." (exact wording is the planner's; the order matters, so a refused request never bumps the version.)
- `PolygonIn`: `id` UUID v4 pattern (reuse `UUID_V4_PATTERN`), `class_id >= 1`, `points: list[tuple[Unit, Unit]]` with `min_length=3`, `max_length=1000`, every coordinate in [0, 1] and finite (reuse `Unit`), bbox width and height > 0.
- `AnnotationSave`: unique ids across both arrays; `MAX_BOXES = 2000` applies to the sum of objects; total points per image <= 20000 (see Pitfall 8 for the arithmetic); `is_background` and `polygons` exclusive like boxes; `is_reviewed` rule counts both arrays.
**Server derives the bbox** from the points with a pure-Python min/max (xyxy -> top-left x/y, w, h), rounded to 6 decimals like everything else (`_PRECISION`). Test equivalence against `ultralytics.utils.ops.segments2boxes` (which returns xywh with a *center*, so convert) using `pytest.importorskip`.
**Idempotent retry:** extend `same_content` to compare polygon ids, classes and rounded points; an unchanged retry must still be a 200, not a 409.

### Pattern 2: Segmenter service in the worker container
**What:** The worker `main()` starts a `SegmenterHost` thread that spawns and supervises `python -m yolo_trainer_worker.segmenter` (Popen with an argument list, `YOLO_CONFIG_DIR` set like the training child [VERIFIED: supervisor.py:269-273 builds env with `"YOLO_CONFIG_DIR": str(layout.ultralytics_config_dir(data_dir))`]; restart with backoff; terminate on `stop_event`). The child runs a FastAPI app on `SEGMENTER_PORT` (default 8001), bound to `127.0.0.1` natively and `0.0.0.0` when compose sets `SEGMENTER_BIND`. No `ports:` mapping in compose; the api reaches it at `http://worker:8001` through `SEGMENTER_URL` (default `http://127.0.0.1:8001` for native dev).
**Endpoints (worker side):**
- `GET /status` -> `{state: "idle"|"downloading"|"loading"|"ready"|"error", message}`.
- `POST /prepare` -> 202, idempotent; starts a background thread that downloads `mobile_sam.pt` (if absent), verifies its SHA-256, builds the predictor and warms it.
- `POST /segment` -> `{project_id, image_id, ext, width, height, points:[[x,y,label],...]}`; 503 with the status body while not ready. `points: []` means "encode only" (lets the client pre-warm the embedding when the tool is selected on an image).
**Engine behavior (all verified, see Code Examples):** serialize with one `threading.Lock` (the predictor is stateful); single-slot embedding cache keyed by `(project_id, image_id, file mtime)`; decode the original with PIL + EXIF transpose, check the decoded size equals the stored `width/height` (else 409 "image orientation mismatch"), downscale so the long side is at most 1024 (never upscale), convert RGB -> BGR, `set_image`, then `predictor(points=[[[x, y], ...]], labels=[[l, ...]])`. First click (one point): `multimask_output=True` and pick the highest score; two or more points: single mask. Build the path from integers and the allow-listed `ext` only, as `train_job._resolve_weights` and `storage.image_file` do.
**Request path from the browser:** `POST /api/projects/{pid}/images/{iid}/segment` (JSON body of normalized points and labels; `require_xhr` like the PUT route). The api looks up the image row (project-scoped 404), and forwards ints, `ext`, `width`, `height`. Errors: connection refused or timeout -> 503 "The segmentation service is not running." ; weights failure -> 502 with the plain message; contour empty -> 200 with `contour: []`.
**Timeouts:** api -> segmenter `/segment` 30 s (measured worst case under heavy contention is about 6.5 s); `/prepare` is fire-and-poll, so no long blocking request is needed even though the 40.7 MB download took 47 s on this machine's connection.
**Training coexistence (D-07):** the segmenter is a separate process, so it never waits for the DB queue or the training child. CPU contention is the only cost (measured, Standard Stack). Show the "may be slower" note when the existing `/training/active` query reports an active run [VERIFIED: backend/src/yolo_trainer_api/routers/runs.py:65 `@router.get("/training/active", response_model=ActiveRun | None)`; frontend `ActiveRunIndicator` already consumes it].

### Pattern 3: Mask -> polygon, with the detail slider fully client-side
**What:** The worker returns the *largest outer contour by area* (`cv2.RETR_EXTERNAL`, `max(key=cv2.contourArea)`), computed on the ≤1024 px working mask, normalized to [0,1], rounded to 6 decimals, and thinned with `approxPolyDP(0.5 px)` only if it exceeds about 600 points. Also return the bbox (for detect projects) and the SAM score.
The browser runs a Ramer–Douglas–Peucker simplification of that dense closed contour. The slider maps to the tolerance as a fraction of the contour perimeter on a log scale; the default targets 20–60 vertices. Measured on real masks (a 640 px car mask): tolerance 0.001 x perimeter -> 66 (MobileSAM) / 56 (SAM2.1-t) vertices, 0.002 -> 23 / 18, 0.004 -> 5 / 7. A sensible slider range is 0.0005–0.006 x perimeter with default about 0.0015; clamp the result to >= 3 vertices (fall back to the bbox corners if RDP collapses below 3). This satisfies D-08 ("recomputes from the cached mask without running SAM again") with zero server state and instant feedback.
**Why not return the mask or hold it server-side:** a mask is up to 1 MP of data; server-held masks need cache keys, eviction and a second endpoint. The contour is about 10–20 KB.

### Pattern 4: Editor interaction state (frontend)
- `EditorTool = "select" | "box" | "polygon" | "segment"`; the toolbar offers a task-type-dependent subset (detect: select, box, segment; segment: select, box, polygon, segment). The editor already loads the project (`useProject`), so `task_type` is available; the stale comment "Neither the editor nor the API looks at the project's task type (D-18)" in `EditorPage.tsx` must be replaced.
- **Polygon draft** is ephemeral (never in zundo history): `points[]` in a ref plus a rubber-band segment to the pointer. Close = click on the first vertex (hit radius about 8 screen px divided by stage scale, highlighted on hover) or Enter, both only with >= 3 points; Esc cancels; Backspace pops the last point. Only the close produces one `createPolygon` (one history entry, one autosave). Konva `Line` with `closed` renders the polygon [CITED: konvajs.org/docs/shapes/Line_-_Polygon.html]; vertex handles are draggable `Circle`s whose radius is `r / scale`, like the box chips.
- **Vertex edit gesture:** keep the in-flight points in a local ref while a handle is dragged; commit with one `updatePolygon(id, points)` on `dragend` (one entry). Midpoint handle: on `dragstart`, insert the vertex into the local points and continue the same drag, so adding-and-placing is one gesture. Delete vertex: Alt+click or `contextmenu` on a vertex (call `preventDefault` on the stage content so no browser menu opens) -> `updatePolygon` with the vertex removed, refused when it would leave fewer than 3. Whole-polygon move: drag the `Line`; Konva moves the node by an x/y offset, so on `dragend` bake the offset into the points, clamp the translation so every point stays in [0, 1], reset node x/y to 0, commit once.
- **Key conflicts to resolve in `lib/shortcuts.ts` (verified table):** existing hotkeys are `v b Delete Backspace mod+z mod+shift+z mod+y Escape digit1..9 a ArrowLeft d ArrowRight r g n f digit0 mod+s shift+slash` [VERIFIED: frontend/src/features/editor/lib/shortcuts.ts, read this session]. `p` and `s` are free (Mantine matches modifiers exactly, so plain `s` does not clash with `mod+s`); `Enter` is free. `Backspace` is already bound to "delete selected": while a polygon draft is active the handler must pop the last point instead (guard in the handler with a canvas-handle `isDrafting()`, exactly how `deselect` already asks `isDrawing()`). `Escape` must cancel, in priority order: polygon draft, segment prompts/preview, then deselect. Add the new rows plus the pointer-gesture rows (Alt+click / right-click delete vertex, Shift+click / right-click negative point, drag midpoint) to `SHORTCUTS` and `POINTER_GESTURES` so the on-screen reference stays complete (D-02).
- **Box in a segment project (D-11):** the existing draft rectangle stays; on release call `createPolygon` with the four corners in the same winding the server writes today: top-left, top-right, bottom-right, bottom-left [VERIFIED: backend/src/yolo_trainer_api/training/labels.py:39-43 builds `left top, right top, right bottom, left bottom`].
- **Segment tool state:** `prompts[]` (normalized x, y, positive), `preview`, `status`, detail slider. At most one request in flight; when prompts change meanwhile, send only the latest after the response (coalesce), and ignore responses for a stale sequence number. Reset on image change, tool change, accept and Esc. Accept converts the preview with the active class: polygon (simplified at the current detail) in a segment project, box from the contour bbox in a detect project (D-10).
- **Self-intersection (D-03):** pure `selfIntersects(points)` doing a pairwise proper-crossing test of non-adjacent edges; evaluate per visible object-list row (memoized by points identity). A polygon with 1000 points is 500k pair checks, fine on demand, so never run it in the store on every drag tick.

### Pattern 5: Segment metrics in the progress schema
- Keep the `(B)`/`(M)` mapping in `yolo_trainer_common/progress.py`. Add `secondary_metrics(task_type, metrics)` returning the **box** numbers for segment (and `None`/omitted for detect), and have `enrich_event` add `secondary` next to `primary` on every `fit_epoch_end` (live and replay use the same function). The supervisor already stores mask numbers as the run's headline (`map50_key(task_type)` and `primary_metrics` in `supervisor.py`), so history table and verdict are mask-primary today; D-14 is mostly labels.
- Add the same `secondary` block to the run detail (`RunDetail.box_metrics`, built where `primary_metrics(run.task_type, run.metrics)` is called in `training/service.py`) for the Final results card's second line.
- `foldProgress`: extend `ChartRow` with nullable box fields (`boxMap50`, `boxMap50_95`, `boxPrecision`, `boxRecall`), filled from `frame.secondary`; older files and detect runs leave them null (D-05 "every field optional"). `lossComponents` is discovered dynamically, so `seg` appears without code, but see Pitfall 14 for `sem`.
- `RunCharts`: for a segment run render both families. **UI conflict to settle in the UI-SPEC:** today dashed already means "the second metric" (mAP50-95 and Recall are dashed). D-13 reuses dashed for box. Recommended encoding for segment runs: color = metric, solid = mask, dashed = box; the second metric of each pair is then also solid (mask) or dashed (box), distinguished by color and legend text. Detect charts stay unchanged. Because the phase carries "UI hint: yes", run `/gsd-ui-phase 6` before planning so the UI-SPEC fixes this and the polygon/segment panel visuals.

### Anti-Patterns to Avoid
- **Calling the high-level `SAM(...)` model per click:** it re-encodes the image every call. Use `Predictor.set_image` once, then call the predictor with prompts (measured decode about 0.1 s vs encode about 1.3 s).
- **`results[0].masks.xy` for the polygon:** it uses `masks2segments(self.data)` with the default strategy `"all"`, which concatenates multiple contours with bridge segments [VERIFIED: ultralytics/engine/results.py:1182 and ultralytics/utils/ops.py:666-694]. Use your own `findContours` + largest area (D-04 one contour).
- **Importing `ultralytics`, `numpy` or `cv2` in `yolo_trainer_api`:** breaks the torch-free api image and the compose smoke assertion.
- **Putting vertex-drag ticks into the zustand/zundo store:** one history entry per completed gesture only (P3 D-10).
- **Streaming draft points to the server or autosaving a half-drawn polygon.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Promptable segmentation | Any custom model or classical segmentation | Ultralytics `Predictor` + `mobile_sam.pt` | Prompt encoder/decoder, letterbox, point scaling are handled |
| Image embedding cache | A custom feature cache | `Predictor.set_image()` (stores `self.features`) | Built in; subsequent `predictor(points=...)` reuse it [CITED: docs.ultralytics.com/models/sam] |
| Contour extraction | Marching squares / flood fill | `cv2.findContours` + `cv2.contourArea` (worker) | Already installed; handles the edge cases |
| Weights download | `requests` loop | `ultralytics.utils.downloads.attempt_download_asset` into `DATA_DIR/weights` | Same path the base weights use (`train_job._resolve_weights`); add a SHA-256 verify |
| Polygon vs label format | Own YOLO segment writer | Extend `labels.label_rows` (clamp with `_unit`, `.6f`) | Existing tests and the segment hard-fail rules already encode the format |
| Atomic JSON/text writes | Ad-hoc temp files | `layout.write_text_atomic` / `write_json_atomic` | Existing, tested |
| Ramer–Douglas–Peucker | An npm package | A ~30-line pure function in `lib/polygon.ts` with unit tests | A package adds supply-chain surface for a textbook algorithm; the closed-contour variant (split at the two farthest points) is trivial to test |

**Key insight:** the genuinely custom parts are small and pure (polygon bbox, vertex ops, RDP, self-intersection, contour ladder). Everything heavy (SAM, contours, training, label validation) already exists in a pinned dependency. Keep the custom code pure so it is unit-testable without torch or Konva.

## Runtime State Inventory

Not a rename phase, but D-09 rewrites stored geometry, so the five categories are answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `annotations` rows of `kind='box'` in projects with `task_type='segment'`. The dev DB currently has project 2 (`segment`) with 0 annotations and project 1 (`detect`) with 218 [VERIFIED: read-only query of `data/app.db`: `[(1, ..., 'detect', 218), (2, 'cars2', 'segment', 0)]`, `alembic_version 0009`]. Users may have more. `images.annotation_version` of every touched image | Data migration in 0010: rewrite those rows to `kind='polygon'` with `points=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]` (round to 6 decimals, clamp to [0,1]; same winding as `label_rows`), and bump `annotation_version` of each affected image so a stale open editor gets a 409 instead of a 422 loop. Keep `is_reviewed` (content is equivalent). Detect projects untouched |
| Live service config | None. The segmenter is new, not renamed; nothing external stores the old contract | None |
| OS-registered state | None. No scheduled tasks or services reference annotation kinds | None |
| Secrets/env vars | New plain settings only: `SEGMENTER_URL` (api), `SEGMENTER_PORT`/`SEGMENTER_BIND` (worker). Add `SEGMENTER_URL: http://worker:8001` to the `api` service env in `docker-compose.yml` | Code + compose edit; document in README/.env docs |
| Build artifacts | The worker image must be rebuilt (new module, nothing new installed). The frontend bundle must be rebuilt. Existing run folders `data/runs/<id>/` hold the old manifest (`MANIFEST_SCHEMA_VERSION = 1`) and are immutable history | Rebuild images; bump the manifest schema for new runs only and keep readers tolerant of version 1 |

**Nothing found in:** Live service config, OS-registered state (verified by inspection of `docker-compose.yml`, `supervisor.py`, and `data/`).

## Common Pitfalls

### Pitfall 1: Point prompts without the extra nesting create N objects
**What goes wrong:** `predictor(points=[[x1,y1],[x2,y2]], labels=[1,0])` is read as two separate objects with one point each and returns two masks.
**Why:** Ultralytics treats a 2-D `points` as `(N, 2)` -> `(N, 1, 2)`. [VERIFIED: ran it: flat -> `(2, 640, 640)`, nested `points=[[[x,y],[x,y]]], labels=[[1,1]]` -> `(1, 640, 640)`; code at predict.py:288-312 and docs example `predictor(points=[[[400, 370], [900, 370]]], labels=[[1, 0]])`]
**How to avoid:** always send one nested group per object: `points=[[[x, y], ...]]`, `labels=[[l, ...]]`. Unit-test the engine wrapper with a fake predictor that records its arguments.
**Warning signs:** the preview shows two overlapping masks, or the negative point acts as a second object.

### Pitfall 2: Re-encoding on every click
**What goes wrong:** each click costs the 1.3–1.6 s encode.
**Why:** the high-level `SAM()` call or a `set_image` per request.
**How to avoid:** server keeps a single-slot cache keyed by `(project_id, image_id, mtime)`; `set_image` only on a key change. Measured: encode 1.26–1.33 s once, then decode 0.099–0.147 s per prompt set.

### Pitfall 3: Big originals blow up post-processing
**What goes wrong:** with `retina_masks=True` the mask is scaled to the original size. Measured on MobileSAM: 4000x3000 -> `masks.xy` had 19174 points; 10000x10000 -> decode 0.75 s and RSS 880 MB (vs 0.11–0.12 s and about 700 MB when the image is first downscaled). The app accepts up to 100 MP (`max_image_megapixels: int = Field(default=100, ge=1)`).
**How to avoid:** cap the long side at 1024 before `set_image` (SAM's encoder input is 1024 anyway; its mask head is 256x256) and normalize the contour by the working size.

### Pitfall 4: EXIF orientation and color order
**What goes wrong:** stored files are raw; `images.width/height` are post-orientation (P2 D-17). A contour computed on an un-rotated image lands in the wrong place. `set_image(np.ndarray)` expects BGR; PIL gives RGB.
**How to avoid:** use `ImageOps.exif_transpose`-equivalent decoding (the api already has an explicit transpose table in `image_processing.py`), convert to BGR, and compare the decoded size with the `width/height` the api forwards; mismatch -> 409. 16-bit and palette modes need the same 8-bit normalization the thumbnailer uses (`_scale_to_8bit`); at minimum convert with `convert("RGB")` and accept the limitation for exotic modes.

### Pitfall 5: Ultralytics label-row rules for polygons
**What goes wrong:** a row is classed as segment only if some row has more than 6 columns; a 2-point polygon (5 columns) is read as a box; mixed rows abort with "labels mix segment and detection rows"; coordinates above 1.01 abort the image; duplicate rows are silently removed. [VERIFIED: ultralytics/data/utils.py:326-369]
**How to avoid:** the server enforces `>= 3` points and `[0,1]` coordinates; segment projects never emit 5-column rows (D-09/D-12 guarantee it); keep `_unit` clamping and `.6f` in `label_rows`.

### Pitfall 6: Konva drag moves the node, not the points
**What goes wrong:** dragging a `Line` changes node x/y; if the points are not rebaked the polygon snaps back or the stored geometry is stale.
**How to avoid:** on `dragend` add the offset to every point, clamp translation to the image, reset node position to 0, commit once. Same for vertex `Circle`s (use `dragmove` only to update local points, commit on `dragend`).

### Pitfall 7: Hit testing and gesture precedence on the shared stage
**What goes wrong:** `handlePointerDown` currently starts a box draft for any left press when `canDraw`; polygon clicks must instead add vertices, Alt/right-click must delete a vertex, Shift/right-click must add a negative point, and the browser context menu must not open. Pan (middle button, Space+left) must still win.
**How to avoid:** route by `tool` at the top of `handlePointerDown`; call `preventDefault()` on `contextmenu` for the stage content in polygon/segment tools and over vertex handles; keep handles inert while `panBlocked` like boxes. Treat Konva `pointerclick` vs `click` as the box code does (both are attached).

### Pitfall 8: nginx 1 MiB body limit on `/api/`
**What goes wrong:** polygons are much larger than boxes. `schemas.py` documents the budget: "About 170 JSON bytes per box keeps a full set under nginx's unchanged 1 MiB /api/ body limit." [VERIFIED: schemas.py:173-175; nginx `client_max_body_size 1m;` at docker/nginx.conf.template:4]. A pair `[0.123456,0.123456],` is about 20 bytes, so 2000 polygons x 50 points = 2 MB would be refused with 413 *before* reaching the app, and autosave would loop on an error.
**How to avoid:** cap `points` per polygon (1000) and total points per image (recommended 20000 = about 400 KB, plus about 80 B x 2000 for ids/classes = about 560 KB). Mirror the limits in the client store like `MAX_BOXES`, with a plain message. Do not raise the nginx limit for this route.

### Pitfall 9: Idempotent retry and CAS with a new array
**What goes wrong:** `same_content` only compares boxes; a lost-response retry of a polygon save would be reported as 409.
**How to avoid:** extend `same_content`; add a test that saves the same polygon payload twice and expects 200 the second time.

### Pitfall 10: First use downloads weights and loads a model
**What goes wrong:** the 40.7 MB download took 47 s here (about 0.9 MB/s); the container may be offline; the Ultralytics settings file and analytics must be configured before the first model touches the network.
**How to avoid:** `prepare/status` states instead of one long blocking request; call `configure_ultralytics(data_dir)` equivalent (`sync: False`, `weights_dir`) in the segmenter before building the model (the Phase 1 note "analytics must be disabled in the worker" applies to this new process too); error text mirrors the training one: "Could not download mobile_sam.pt. Check the internet access of the worker container, or place the file in …/weights/." Do not set `YOLO_OFFLINE` (it also disables the download).

### Pitfall 11: Concurrency and abandoned requests
**What goes wrong:** the predictor is stateful; two concurrent requests corrupt prompts/features. A browser abort does not cancel server work, so rapid clicking queues encodes.
**How to avoid:** one lock in the engine; client-side coalescing (one in flight, latest wins); a stale-sequence guard on the response. A bounded wait (return 429/503 "busy" if the lock is held longer than the timeout) keeps the UI honest.

### Pitfall 12: Pickle-based weights from a mutable cache
**What goes wrong:** `mobile_sam.pt` is a torch pickle loaded from a folder shared with the host. Anyone able to write `DATA_DIR/weights/` gets code execution in the worker (project constraint: `.pt` files are trusted-input only).
**How to avoid:** pin the SHA-256 of the official asset and verify before loading; delete and refuse on mismatch. The hash of the file downloaded from `ultralytics/assets` release `v8.4.0` this session was `6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f` (40,728,226 bytes). It is a single observation from the official release URL, not an independently published checksum; the executor should re-download once and confirm it matches before hard-coding it (Assumption A3).

### Pitfall 13: D-12 breaks existing tests and helpers
**What goes wrong:** several tests save *boxes* into segment projects, which is now a 422. Found by grep: `backend/tests/test_annotations_api.py:556` (`test_boxes_save_and_load_the_same_way_in_a_segment_project`), `backend/tests/training_helpers.py` `setup_project(... task_type=...)` -> `_put_boxes` (used by `test_training_snapshot.py:197` `test_a_segment_project_writes_polygon_rows_only` and `test_training_pipeline.py:218-221`), and the `label_rows(..., "segment")` box tests in `test_training_labels.py` (these still pass if `label_rows` keeps accepting box tuples, which is the recommended compatible path).
**How to avoid:** list these in the plan as explicit "update" tasks: the first becomes the 422 test; the helper writes polygons for segment; keep `label_rows` backward compatible. The frontend `src/test/editorApi.ts` stub defaults to `task_type: "detect"`; segment editor tests need their own stub (RESEARCH Pitfall 13 of Phase 3: new requests must not break unrelated strict stubs, via `handleImagesSideRequest`).

### Pitfall 14: `sem_loss` distorts the loss chart
**What goes wrong:** the first real YOLO26-seg run (below) emits `sem_loss`: about 7.67 in training and exactly 0.0 in validation. `foldProgress` sums every component into `trainLoss`/`valLoss`, so a segment run would show a train total about 7.7 higher than the validation total for no real reason, and the two lines would not be comparable.
**How to avoid:** exclude `sem` from the summed totals (and ideally from the tooltip component list), or render it as its own component only where both sides exist. Make it a one-place rule in `foldProgress` (an allow-list or deny-list of component names) with a test built from the captured events. Needs a user/UI decision (Open Question 1). Detect runs have `box, cls, l1` only [VERIFIED: `data/runs/1/progress.jsonl` first events], so they are unaffected.

### Pitfall 15: `sam3`/other variants are not auto-downloadable
`ultralytics.models.sam` exports `SAM3Predictor` in 8.4.159 but no `sam3` weights appear in `GITHUB_ASSETS_NAMES`; do not plan around it.

## Code Examples

### SAM engine core (verified by running in the project venv and in the worker container)
```python
# Source: ultralytics/models/sam/predict.py (set_image / __call__), measured this session
import cv2
import numpy as np
from ultralytics.models.sam import Predictor

predictor = Predictor(
    overrides=dict(conf=0.0, task="segment", mode="predict", imgsz=1024,
                   model=str(weights_path), device="cpu", verbose=False, save=False)
)
predictor.setup_model(model=None, verbose=False)      # ~0.4-0.6 s

predictor.set_image(bgr_image)                        # encode once: ~1.3-1.6 s (MobileSAM, CPU)
# one object, several points: NOTE the double nesting (Pitfall 1)
one = predictor(points=[[[x1, y1]]], labels=[[1]], multimask_output=True)   # 3 masks
best = int(one[0].boxes.conf.argmax())                # scores e.g. [0.934, 0.965, 0.98]
many = predictor(points=[[[x1, y1], [x2, y2]]], labels=[[1, 0]])            # 1 mask, ~0.1 s
mask = many[0].masks.data[0].cpu().numpy().astype(np.uint8)
```

### Largest outer contour, normalized (worker `contour.py`; cv2/numpy only)
```python
def dense_contour(mask: np.ndarray, max_points: int = 600) -> list[list[float]]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return []
    largest = max(contours, key=cv2.contourArea)        # NOT masks.xy (Anti-pattern)
    if len(largest) > max_points:
        largest = cv2.approxPolyDP(largest, 0.5, True)
    height, width = mask.shape
    return [[round(float(x) / width, 6), round(float(y) / height, 6)] for [[x, y]] in largest]
```
Measured on a real MobileSAM mask of a 640 px image: 384 raw points -> 66 / 23 / 5 vertices at tolerance 0.001 / 0.002 / 0.004 x perimeter.

### Server-side kind check and polygon bbox (api; pure Python)
```python
# before the CAS statement in apply_save(...), no DB access
if task_type == "detect" and payload.polygons:
    raise HTTPException(status_code=422, detail="This is a detect project: it stores boxes only.")
if task_type == "segment" and payload.boxes:
    raise HTTPException(status_code=422, detail="This is a segment project: it stores polygons only.")

def polygon_bbox(points: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x, y = min(xs), min(ys)
    return round(x, 6), round(y, 6), round(max(xs) - x, 6), round(max(ys) - y, 6)
```
Oracle test: `ultralytics.utils.ops.segments2boxes([np.array(points)])` returns `xywh` with a **center** origin [VERIFIED: ops.py:451-464, `xyxy2xywh`]; compare after converting center to top-left.

### Alembic 0010 sketch
```python
def upgrade() -> None:
    op.add_column("annotations", sa.Column("points", sa.JSON(), nullable=True))
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT a.id, a.image_id, a.x, a.y, a.w, a.h FROM annotations a "
        "JOIN images i ON i.id = a.image_id JOIN projects p ON p.id = i.project_id "
        "WHERE p.task_type = 'segment' AND a.kind = 'box'")).all()
    touched = set()
    for id_, image_id, x, y, w, h in rows:
        r, b = min(1.0, round(x + w, 6)), min(1.0, round(y + h, 6))
        pts = [[x, y], [r, y], [r, b], [x, b]]
        bind.execute(sa.text("UPDATE annotations SET kind='polygon', points=:p WHERE id=:id"),
                     {"p": json.dumps(pts), "id": id_})
        touched.add(image_id)
    for image_id in touched:
        bind.execute(sa.text(
            "UPDATE images SET annotation_version = annotation_version + 1 WHERE id=:i"), {"i": image_id})
def downgrade() -> None:
    op.execute("UPDATE annotations SET kind='box' WHERE kind='polygon'")  # x/y/w/h always valid
    with op.batch_alter_table("annotations") as batch:
        batch.drop_column("points")
```
(Reference style: `0009_last_map50_95.py` uses `op.add_column` on SQLite without a rebuild; test it like `test_a_database_at_0003_upgrades_to_head...` in `backend/tests/test_migrations.py` by upgrading a DB to `0009`, inserting a segment project with box rows and a detect project, then upgrading to head. SQLite here is 3.49.1 [VERIFIED: python sqlite3.sqlite_version].)

### Client closed-contour Douglas-Peucker (pure TS, `lib/polygon.ts`)
Split the closed ring at its two mutually farthest points (or at index 0 and the point farthest from it), run the standard recursive RDP on both halves with tolerance `epsilon`, join, and guarantee >= 3 vertices. Unit tests: a square with extra collinear points -> 4; tolerance 0 -> unchanged; a circle of 400 points -> monotone vertex count as epsilon falls; result never below 3.

## Captured segment-run metric keys (success criterion 4, Phase 0 follow-up #3)

Produced this session by a genuine 2-epoch CPU run of `yolo26n-seg.pt` (Ultralytics 8.4.159, torch 2.14.0+cpu, `imgsz=320`, `batch=8`, `workers=0`, `plots=False`) on a 24/8-image subset of `example_ready_dataset/` whose box rows were converted to 4-point polygons (any genuine polygon rows inside the subset were kept as they were). `trainer.task` printed `segment`. Raw output was captured from `on_fit_epoch_end` and `on_train_epoch_end` callbacks written exactly like `train_job.make_callbacks`. [VERIFIED: local run, output saved in the session scratchpad `seg_train.out`]

`trainer.metrics` after a real epoch (verbatim):
```
{"metrics/precision(B)": 0.00076, "metrics/recall(B)": 0.15, "metrics/mAP50(B)": 0.00026, "metrics/mAP50-95(B)": 0.00018, "metrics/precision(M)": 0.00076, "metrics/recall(M)": 0.15, "metrics/mAP50(M)": 0.00026, "metrics/mAP50-95(M)": 0.0001, "val/box_loss": 1.36288, "val/seg_loss": 2.47647, "val/cls_loss": 4.9596, "val/l1_loss": 0.01116, "val/sem_loss": 0.0}
```
The extra `on_fit_epoch_end` after the loop (final validation of `best.pt`) carried only the eight `metrics/*` keys, full float precision, no `val/*` keys:
```
{"metrics/precision(B)": 0.000754906894816306, "metrics/recall(B)": 0.15, "metrics/mAP50(B)": 0.0002559282822440717, "metrics/mAP50-95(B)": 0.00017499803942712058, "metrics/precision(M)": 0.000754906894816306, "metrics/recall(M)": 0.15, "metrics/mAP50(M)": 0.0002559282822440717, "metrics/mAP50-95(M)": 9.961085123494283e-05}
```
`trainer.tloss` (a dict of tensors) and `loss_names` per epoch:
```
{'box_loss': tensor(1.7166), 'seg_loss': tensor(3.8814), 'cls_loss': tensor(4.8971), 'l1_loss': tensor(0.0221), 'sem_loss': tensor(7.6668)}
loss_names = ["box_loss", "seg_loss", "cls_loss", "l1_loss", "sem_loss"]
```
For comparison a detect run of this repo emits only `{"box_loss", "cls_loss", "l1_loss"}` train and `val/box_loss`, `val/cls_loss`, `val/l1_loss` [VERIFIED: `data/runs/1/progress.jsonl`, first `train_epoch_end` and `fit_epoch_end` lines].

Consequences for the plan: (1) `primary_metrics("segment", ...)` already reads the four `(M)` keys correctly, so the headline mapping needs no change; (2) add the `(B)` mapping as `secondary` (box numbers, same four names); (3) `seg` and `sem` appear as new loss components (Pitfall 14); (4) the first real **end-to-end UI** segment run is still the phase gate: the executor must repeat the capture through the app (segment project -> polygons -> Start training) and store the result as a test fixture (`backend/tests/fixtures/segment_progress.jsonl`) and as a note replacing the "segment deferred" text in `docs/phase-0-decisions.md` §2 and follow-up #3. In this proxy run B and M numbers are identical only because the labels are boxes-as-polygons; real polygons will differ.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SAM ViT (`sam_b/sam_l`) for interactive use on CPU | MobileSAM / SAM2.1-tiny / FastSAM | in Ultralytics asset list for 8.4.x | Interactive CPU latency is feasible (1–3 s) |
| `Results.masks.xy` for polygons | own contour extraction | — | `masks.xy` merges multi-part masks with `strategy="all"` |
| Box-only annotation (Phases 3–5) | task-type-homogeneous geometry | this phase (D-09, D-12) | Reverses Phase 3 D-18 ("boxes in segment projects stay boxes") |

**Deprecated/outdated:** the Phase 3 comment "Neither the editor nor the API looks at the project's task type (D-18)" in `EditorPage.tsx`; the Phase 0 note that segment keys are unknown (now captured).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MobileSAM is the better fixed choice than SAM2.1-tiny for this project. Evidence is a 19-image single-click proxy (bbox IoU vs ground-truth boxes) plus latency/RSS; SAM2.1-t was somewhat more accurate (mean 0.679 vs 0.623) | Standard Stack | Users may find masks too rough; mitigation is a one-constant swap to `SAM2Predictor` + `sam2.1_t.pt` (about 2.3 s encode) |
| A2 | A polygon with zero bounding-box width or height is useless for training, so refusing it server-side is safe; zero-area self-cancelling shapes were not tested against a real training run | Pattern 1 | A few edge-case shapes accepted or refused differently from Ultralytics' behavior |
| A3 | The SHA-256 of `mobile_sam.pt` observed from the official release URL is the canonical hash to pin | Pitfall 12 | A wrong pin makes the tool unusable (fails closed) until corrected; re-verify with a second download before committing |
| A4 | Konva hit-testing on a filled closed `Line` selects the polygon by its interior (as Label Studio relies on); `hitStrokeWidth` helps for thin shapes | Pattern 4 | Selection by clicking inside may need a fill-enabled hit area; a jsdom/Konva test in the plan should confirm |
| A5 | Right-click handling via `contextmenu` `preventDefault` on the Konva stage content suppresses the browser menu in all supported browsers | Pattern 4 | Some browsers could still show a menu; needs a manual UAT check |
| A6 | Budget numbers for payload size (about 20 B per point, 20000 points per image) are derived from JSON formatting arithmetic, not measured through nginx | Pitfall 8 | Limits may be too tight or too loose; measure once with a real max-size PUT through the compose stack |
| A7 | The Ultralytics docs CPU table value for MobileSAM (23802 ms/im) refers to a different pipeline (segment-everything) than the single-prompt path measured here (1.3–1.6 s encode + 0.1 s decode) | Summary | Only matters if someone compares the numbers; the measured values are authoritative for this feature |
| A8 | Pinned-weights download from GitHub works in the target user's network; offline users must place `mobile_sam.pt` manually | Pitfall 10 | A clear message on the tool covers it (D discretion) |

## Open Questions

1. **Should `sem_loss` count toward the summed loss lines?**
   - What we know: it is a YOLO26-seg training-only auxiliary loss, about 7.7 in training and exactly 0.0 in validation [VERIFIED: captured run].
   - What's unclear: whether to hide it entirely, show it only in the tooltip, or keep it in the total.
   - Recommendation: exclude it from `trainLoss`/`valLoss` and from the legend/tooltip components; settle in the UI-SPEC (D-13 only names `seg_loss`).
2. **Chart line encoding for segment runs.**
   - What we know: dashed already encodes the second metric of each pair; D-13 wants solid = mask, dashed = box.
   - Recommendation: color = metric, dash = family for segment runs; detect unchanged; fix in `/gsd-ui-phase 6`.
3. **`httpx` vs stdlib `urllib` for the api -> segmenter call.**
   - Recommendation: stdlib in `asyncio.to_thread`; revisit only if streaming or connection pooling is needed.
4. **Warm-up policy.** Recommendation: lazy start on first tool activation (`POST /prepare` from the tool), keep the model loaded afterwards (about 430 MB); optional idle unload after about 30 minutes is a later optimization.
5. **Does the user want the first-use download visible as a progress bar or just a spinner with text?** Recommendation: state text only ("Downloading the model...", "Loading...") in v1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (Desktop) | compose stack, worker benchmark | yes | 29.7.2; stack `api`, `web`, `worker` all healthy | — |
| uv | backend env, CI parity | yes | 0.12.19 | — |
| Python (project venv) | backend tests | yes | 3.12.10, ultralytics 8.4.159, torch 2.14.0+cpu, sqlite 3.49.1 | — |
| Node / npm | frontend tests and build | yes | v24.19.0 / 11.17.0 (`engines: ^24.15.0`) | — |
| cv2 in worker image | contour extraction | yes | 5.0.0 | — |
| Internet to GitHub releases | first-use `mobile_sam.pt` download | yes here | 40.7 MB in 47 s | place the file in `DATA_DIR/weights/` by hand |
| NVIDIA GPU | not needed (SAM runs on CPU by design, D-06) | no | — | CPU path is the target |
| Worker container resources | SAM + training together | yes | 16 CPUs visible, 7.8 GB RAM (`MemTotal 7786136 kB`) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** offline hosts need a manually placed `mobile_sam.pt` (documented message).

Benchmark record (so the planner can cite it): MobileSAM encode 1.26–1.33 s native (16 threads; 2 and 4 threads gave 1.24–1.37 s, i.e. thread count is not the lever), 1.40–1.63 s in the worker container; decode 0.099–0.147 s. SAM2.1-t encode 2.13–2.54 s native, 2.17–2.32 s in the container. Under a saturating 16-thread matmul loop: MobileSAM encode 3.39–5.63 s and decode 0.32–0.61 s; SAM2.1-t encode 5.75–6.47 s and decode 0.40–1.08 s. FastSAM-s 0.19–0.20 s per call after a 3.56 s first call. All on a 640x640 image; larger images are capped to 1024 on the long side so encode time is size-independent (1.28 s for a 4000x3000 original after downscale). [VERIFIED: measured this session]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | pytest 9.1 (`backend/pyproject.toml`: `testpaths = ["tests"]`, `addopts = "-ra -m 'not training'"`) |
| Frontend framework | vitest 5 + jsdom + vitest-canvas-mock (`frontend/vite.config.ts`, `testTimeout: 15000`) |
| Config files | `backend/pyproject.toml`, `frontend/vite.config.ts`, `.github/workflows/*.yml` (backend `uv run pytest backend/tests` + `ruff check backend` + format check; frontend `npm test` + build) |
| Quick run (backend) | `uv run pytest backend/tests/test_annotations_api.py backend/tests/test_training_labels.py backend/tests/test_progress.py -q` (76 tests passed in about 19 s this session) |
| Quick run (frontend) | `cd frontend && npx vitest run src/features/editor` |
| Full suite | `uv run pytest backend/tests` and `cd frontend && npm test -- --run && npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANNO-04 | Polygon save/load round trip, ids, class, order, bbox derived | integration (api) | `uv run pytest backend/tests/test_annotations_polygons.py -x` | no, Wave 0 |
| ANNO-04 | Validation: <3 points, out-of-range, degenerate bbox, duplicate ids, point cap, idempotent retry | unit/integration | same file | no, Wave 0 |
| ANNO-04 | Polygon bbox equals `segments2boxes` | unit (importorskip) | `uv run pytest backend/tests/test_polygon_bbox.py` | no, Wave 0 |
| ANNO-04 | draw/close/cancel/backspace, vertex move/add/delete (>=3), whole-move clamp, one history entry per gesture | unit (store + pure lib) | `npx vitest run src/features/editor/lib/polygon.test.ts src/features/editor/store/annotationStore.test.ts` | partly (store test exists), Wave 0 for polygon lib |
| ANNO-04 | self-intersection detection and the object-list warning | unit | `npx vitest run src/features/editor/ObjectList.test.tsx` | exists, extend |
| ANNO-04 | Canvas polygon gestures (draft, handles, context menu suppression) | component (canvas mock) | `npx vitest run src/features/editor/canvas/AnnotationCanvas.test.tsx` | exists, extend |
| ANNO-05 | Engine wrapper passes nested points/labels, multimask only for one point, caches embedding per image key | unit with fake predictor | `uv run pytest backend/tests/test_segmenter_engine.py` | no, Wave 0 |
| ANNO-05 | Contour: largest outer contour, normalization, max points, empty mask | unit (cv2 on synthetic masks) | `uv run pytest backend/tests/test_segmenter_contour.py` | no, Wave 0 |
| ANNO-05 | Segmenter app: status/prepare/segment, 503 while not ready, lock, orientation mismatch 409, path from ints | integration (TestClient + fake engine) | `uv run pytest backend/tests/test_segmenter_app.py` | no, Wave 0 |
| ANNO-05 | api route scoping (project/image 404s), error mapping 503/502, forwards ints only | integration with a stub HTTP server | `uv run pytest backend/tests/test_segmentation_api.py` | no, Wave 0 |
| ANNO-05 | Real MobileSAM: latency under 5 s and mask IoU > 0.5 on a fixture image | slow, marked (new marker, e.g. `segmenter`, excluded by default like `training`) | `uv run pytest backend/tests/test_segmenter_real.py -m segmenter` | no, Wave 0 |
| ANNO-05 | Client: prompt state machine (+/- points, coalescing, stale guard, Enter/Esc), RDP simplification, detect -> bbox, segment -> polygon | unit/component | `npx vitest run src/features/editor/lib/polygon.test.ts src/features/editor/SegmentTool.test.tsx` | no, Wave 0 |
| ANNO-11 | 422 for polygons in detect and boxes in segment, before the CAS (version unchanged) | integration | `uv run pytest backend/tests/test_annotations_api.py -k task_type` | exists, extend (and fix line 556 test) |
| ANNO-11 | Migration 0010: segment boxes -> 4-pt polygons (winding), detect untouched, version bumped, downgrade | migration | `uv run pytest backend/tests/test_migrations.py -k 0010` | exists, extend |
| ANNO-11 | Toolbar tools per task type; box in segment creates a 4-point polygon | component | `npx vitest run src/features/editor/EditorPage.test.tsx` | exists, extend |
| SC4 | Snapshot/labels write polygon points; manifest records points; background and empty cases | unit/integration | `uv run pytest backend/tests/test_training_labels.py backend/tests/test_training_snapshot.py backend/tests/test_training_pipeline.py` | exist, extend |
| SC4 | `secondary_metrics`, `enrich_event`, run detail `box_metrics`, supervisor stores mask headline | unit | `uv run pytest backend/tests/test_progress.py backend/tests/test_runs_api.py` | exist, extend |
| SC4 | Charts/foldProgress/final card: dashed box series, `(masks)` labels, `sem` excluded, fixture from real events | unit/component | `npx vitest run src/features/training` | exist, extend |
| SC4 | Real segment training with polygons through the app; capture fixture | slow `training` marker + manual UAT | `uv run pytest backend/tests/test_training_segment_real.py -m training` | no, Wave 0 |

### Sampling Rate
- **Per task commit:** the quick run of the touched side (backend files or `vitest run <dir>`).
- **Per wave merge:** `uv run pytest backend/tests` and `cd frontend && npm test -- --run`.
- **Phase gate:** full backend and frontend suites, `ruff check backend`, `ruff format --check backend`, `npm run build`, plus the manual UAT below, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `backend/tests/test_annotations_polygons.py`, `test_polygon_bbox.py` — polygon contract and oracle
- [ ] `backend/tests/test_segmenter_{engine,contour,app,real}.py`, `test_segmentation_api.py` — segmenter and api route (fake engine and fake predictor; the real one under a new marker; register the marker in `backend/pyproject.toml`)
- [ ] `backend/tests/training_helpers.py` — polygon-aware `setup_project` for segment projects (Pitfall 13)
- [ ] `backend/tests/fixtures/segment_progress.jsonl` — events captured from the real segment run
- [ ] `frontend/src/features/editor/lib/polygon.ts` + `polygon.test.ts` — pure geometry; a segment-capable `src/test/editorApi.ts` stub
- Framework install: none (pytest, vitest already present).

**Manual UAT items (cannot be automated here):** draw/edit polygons with a real mouse including right-click deletion and midpoint drag; click-to-segment feel on the dev machine with and without a training run; end-to-end segment training from the UI showing mask lines solid and box lines dashed; first-use weights download message with the network blocked.

## Security Domain

`security_enforcement` is enabled (key absent in `.planning/config.json` workflow block means enabled; `security_asvs_level: 1`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (single-operator, no auth by project decision) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (project/image scoping) | Every new route resolves the project and the image within the project (404 otherwise) before anything else; the api forwards integers only |
| V5 Input Validation | yes | Pydantic models with `extra="forbid"`, `Unit`/UUID patterns, point count and total caps, prompt count cap (about 20) on `/segment`; the segmenter re-validates ints, `ext` allow-list, size |
| V6 Cryptography | partial | SHA-256 verification of the pinned weights (stdlib `hashlib`); never hand-roll anything else |
| V12 Files and Resources | yes | Paths built from integers and the allow-listed extension (`storage.image_file` rule); weights only under `DATA_DIR/weights/`; decode limits via the existing 100 MP cap and the 1024 px working size |
| V13 API and Web Service | yes | `require_xhr` on the new POST routes like the PUT route; unauthenticated internal segmenter reachable only on the compose network (no `ports:` mapping), bound to loopback natively |
| V14 Configuration | yes | `SEGMENTER_URL` comes from environment, never from request data (no SSRF); analytics off in the new process |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pickle code execution through a replaced `mobile_sam.pt` | Tampering / Elevation | Pin and verify SHA-256 before load; fail closed; document trusted-input rule |
| Path traversal via image id or extension | Tampering | Build the path from `int()` ids and an allow-listed `ext` only |
| CPU exhaustion by rapid click-to-segment requests | Denial of service | Single lock, bounded wait, prompt-count cap, client-side coalescing |
| Oversized PUT bodies / polygon bombs | Denial of service | Caps on points per polygon and per image (below nginx's 1 MiB), `max_length` on arrays |
| SSRF through the segmenter URL | Spoofing | URL from env only |
| Decompression bomb in the segmenter | Denial of service | Reuse the upload-time 100 MP cap; decode then downscale; reject mismatched size |
| Stale editor saves wrong-kind geometry after the migration | Tampering (integrity) | Migration bumps `annotation_version`; server refuses wrong kinds with 422 before the CAS |

## Sources

### Primary (HIGH confidence)
- Local measurements in this session: SAM/MobileSAM/SAM2.1-t/FastSAM latency, memory, IoU proxy, big-image behavior, nested-points behavior, a real 2-epoch YOLO26-seg run (scripts and outputs in the session scratchpad); worker-container benchmark via `docker exec`.
- Source files read this session: `backend/src/yolo_trainer_api/{annotations,models,schemas,storage,image_processing}.py`, `routers/annotations.py`, `training/{labels,snapshot}.py`, `backend/src/yolo_trainer_common/{layout,progress,quality}.py`, `backend/src/yolo_trainer_worker/{main,supervisor,train_job}.py`, `migrations/versions/0004,0009`, `docker-compose.yml`, `docker/Dockerfile.backend`, `docker/nginx.conf.template`, frontend editor store/canvas/shortcuts/ToolBar/EditorPage, `foldProgress.ts`, `RunCharts.tsx`, `FinalResultsCard.tsx`, `RunMetrics.tsx`, `docs/phase-0-decisions.md`, `docs/roadmap.md` §7.2–7.5.
- Installed Ultralytics 8.4.159 source: `models/sam/{predict,build}.py`, `models/fastsam/predict.py`, `utils/{ops,downloads}.py`, `data/utils.py`, `engine/results.py`.
- https://docs.ultralytics.com/models/sam/ — `set_image` once then multiple prompts; negative-point nested example.
- https://konvajs.org/docs/shapes/Line_-_Polygon.html — closed polygon via `Line` with `closed: true`.
- https://konvajs.org/docs/sandbox/Modify_Curves_with_Anchor_Points.html — draggable `Circle` anchors with `dragmove`.

### Secondary (MEDIUM confidence)
- `.planning/research/webapp-platform/FRONTEND-ANNOTATION-UI.md` — Label Studio uses react-konva for polygons (prior phase research).

### Tertiary (LOW confidence)
- None used as the basis of a recommendation; training-knowledge items are in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is already pinned; SAM numbers measured on target-like environments.
- Architecture: HIGH for contract, migration, service split and metrics; MEDIUM for Konva interaction details (A4, A5) which need a component test and manual UAT.
- Pitfalls: HIGH — most were reproduced or read in source this session.

**Research date:** 2026-10-19
**Valid until:** 2026-11-18 (Ultralytics is pinned; re-check the `mobile_sam.pt` hash and the asset list if the pin is bumped)
