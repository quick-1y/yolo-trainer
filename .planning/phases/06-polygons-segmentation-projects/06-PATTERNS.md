# Phase 6: Polygons & Segmentation Projects - Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 30 (new + modified)
**Analogs found:** 28 / 30

All analog paths are git-tracked (verified via `git ls-files` listing). Line numbers refer to the files as of this mapping.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/yolo_trainer_api/migrations/versions/0010_polygon_points.py` (new) | migration | batch (data rewrite) | `migrations/versions/0009_last_map50_95.py` | role-match (add column + batch downgrade); data rewrite sketch is in RESEARCH |
| `backend/src/yolo_trainer_api/models.py` (mod: `points` JSON column) | model | CRUD | `models.py:190` (`ck_annotations_kind` Annotation) | exact |
| `backend/src/yolo_trainer_api/schemas.py` (mod: `PolygonIn/Read`, `polygons[]`) | model/schema | request-response | `schemas.py` `BoxIn`, `BoxRead`, `AnnotationSave`, `AnnotationSetRead` (L190-262) | exact |
| `backend/src/yolo_trainer_api/annotations.py` (mod: kind check, polygon diff-apply, `same_content`) | service | CRUD (CAS replace) | itself (`apply_save`, `same_content`) | exact |
| `backend/src/yolo_trainer_api/routers/annotations.py` (mod: pass `task_type`) | controller | request-response | itself, PUT route L202-215 | exact |
| `backend/src/yolo_trainer_api/routers/segmentation.py` (new) | controller | request-response (proxy) | `routers/annotations.py` + `routers/runs.py` (`/training/active`) | role-match |
| `backend/src/yolo_trainer_api/segmenter_client.py` (new) | service | request-response (HTTP) | none in api (see No Analog) | none |
| `backend/src/yolo_trainer_api/main.py` (mod: include router) | config | - | `main.py:89-96` | exact |
| `backend/src/yolo_trainer_api/training/snapshot.py` (mod: shapes carry points) | service | batch | itself L108-150 | exact |
| `backend/src/yolo_trainer_api/training/labels.py` (mod: polygon rows, manifest) | utility | transform | itself (`label_rows`, `manifest_dict`) | exact |
| `backend/src/yolo_trainer_common/progress.py` (mod: `secondary_metrics`, `enrich_event`) | utility | transform | itself (`primary_metrics`, `enrich_event` L129-165) | exact |
| `backend/src/yolo_trainer_common/layout.py` (mod: `sam_weights_file`, SEGMENTER_* consts) | utility/config | file-I/O | itself `weights_file` L56-64 | exact |
| `backend/src/yolo_trainer_worker/segmenter/app.py` (new) | controller (worker-side FastAPI) | request-response | `yolo_trainer_api/main.py` app factory (FastAPI) | role-match |
| `backend/src/yolo_trainer_worker/segmenter/engine.py` (new) | service | request-response (SAM) | `yolo_trainer_worker/train_job.py` (weights resolve, hash, download error) | partial |
| `backend/src/yolo_trainer_worker/segmenter/contour.py` (new) | utility | transform | RESEARCH "Largest outer contour" sketch; style of `training/labels.py` (pure) | partial |
| `backend/src/yolo_trainer_worker/segmenter_host.py` (new) | service | event-driven (child process supervision) | `yolo_trainer_worker/supervisor.py` Popen block L255-290 | role-match |
| `backend/src/yolo_trainer_worker/main.py` (mod: settings + start host thread) | config/entrypoint | event-driven | itself (`WorkerSettings`, heartbeat thread L190-215) | exact |
| `docker-compose.yml` (mod: `SEGMENTER_URL`, worker env) | config | - | itself `worker:` L33-62 | exact |
| `backend/tests/*` (mod/new: 422 test, helpers, migration, labels, progress) | test | - | `test_annotations_api.py:556`, `training_helpers.py`, `test_migrations.py`, `test_training_labels.py`, `test_progress.py` | exact |
| `frontend/src/api/annotations.ts` (mod: Polygon types) | model/api | request-response | itself L10-60 | exact |
| `frontend/src/features/editor/canvas/PolygonShape.tsx` (new) | component | event-driven (Konva) | `canvas/BoxShape.tsx` | exact |
| `frontend/src/features/editor/canvas/PolygonDraft.tsx` (new) | component | event-driven | `canvas/Crosshair.tsx` (imperative handle) + draft `Rect` in `AnnotationCanvas.tsx` L519-528 | role-match |
| `frontend/src/features/editor/canvas/SegmentOverlay.tsx` (new) | component | request-response | `canvas/BoxShape.tsx` (colors/chips) | partial |
| `frontend/src/features/editor/canvas/AnnotationCanvas.tsx` (mod: route by tool) | component | event-driven | itself L330-400, L495-545 | exact |
| `frontend/src/features/editor/lib/polygon.ts` (new, pure) | utility | transform | `lib/geometry.ts` (+ `geometry.test.ts`) | role-match |
| `frontend/src/features/editor/store/annotationStore.ts` (mod) | store | CRUD | itself (`createBox/updateBox/deleteBox/setBoxClass`) | exact |
| `frontend/src/features/editor/store/editorUiStore.ts` (mod: tool union, segment state) | store | event-driven | itself | exact |
| `frontend/src/features/editor/lib/shortcuts.ts` (mod) | config | event-driven | itself (`SHORTCUTS`, `POINTER_GESTURES`) | exact |
| `frontend/src/features/editor/ToolBar.tsx`, `icons.tsx`, `ObjectList.tsx`, `EditorPage.tsx` (mod) | component | event-driven | themselves (`ToolButton`, `Icon`, row layout) | exact |
| `frontend/src/features/training/progress/foldProgress.ts`, `RunCharts.tsx`, `FinalResultsCard`/`RunMetrics.tsx` (mod) | component/util | transform | themselves (`series` with `dashed`, `lossComponents`) | exact |

## Pattern Assignments

### `0010_polygon_points.py` (migration, batch)

**Analog:** `backend/src/yolo_trainer_api/migrations/versions/0009_last_map50_95.py`

**Header and revision chain** (lines 1-20):
```python
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
```
New file: `revision = "0010"`, `down_revision = "0009"`.

**upgrade add_column + downgrade batch** (lines 23-35). Copy the batch downgrade verbatim, including the autoincrement note; for `annotations` check migration 0004 for its table kwargs before copying:
```python
op.add_column("training_runs", sa.Column("last_map50_95", sa.Float(), nullable=True))
...
with op.batch_alter_table("training_runs", table_kwargs={"sqlite_autoincrement": True}) as batch:
    batch.drop_column("last_map50_95")
```
The data rewrite (segment-project box rows to `kind='polygon'`, `points`, bump `images.annotation_version`) follows the sketch in 06-RESEARCH.md "Alembic 0010 sketch". `test_migrations.py` asserts `version_num == migration_head()`, so no head constant needs editing. Add a data-migration test next to it (seed rows at 0009 via `command.upgrade`, then upgrade to head).

---

### `schemas.py` (schema, request-response)

**Analog:** same file, L190-262.

**Box model to mirror for `PolygonIn`** (L190-205):
```python
Unit = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
UUID_V4_PATTERN = r"^[0-9a-f]{8}-..."

class BoxIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Annotated[str, Field(pattern=UUID_V4_PATTERN)]
    class_id: Annotated[int, Field(ge=1)]
    x: Unit
    ...
```
`PolygonIn`: same `id`/`class_id`, `points: Annotated[list[tuple[Unit, Unit]], Field(min_length=3, max_length=1000)]`, plus a `model_validator(mode="after")` for bbox w/h > 0.

**Structure validator to extend** (L231-239): the `_structure` validator in `AnnotationSave` enforces unique ids, background excludes boxes, reviewed needs content. Add `polygons: list[PolygonIn] = []` and make all three rules count both arrays; cap total points (20000) and `MAX_BOXES` over the sum. Add `polygons` to `AnnotationSetRead` (L242-247) and a `PolygonRead` with `points: list[list[float]]`. Keep `SaveResult.box_count` name (counts all objects).

---

### `annotations.py` (service, CAS whole-set replace)

**Analog:** itself.

**Ordering rule:** the 422 kind check goes BEFORE the CAS `update(Image)` (L121-133), so a refused request never bumps the version. Pass `task_type` in from the route (look it up from `get_project_or_404`, which already returns the project at routers L214-215).
```python
if task_type == "detect" and payload.polygons:
    raise HTTPException(status_code=422, detail="This is a detect project: it stores boxes only.")
if task_type == "segment" and payload.boxes:
    raise HTTPException(status_code=422, detail="This is a segment project: it stores polygons only.")
```

**Diff-apply to extend** (L151-201): the same loop handles polygons; for new rows set `kind="polygon"`, `points=[list(p) for p in polygon.points]`, and x/y/w/h from a pure-Python `polygon_bbox(points)` rounded to `_PRECISION`. Collect `class_ids` and `payload_ids` over `boxes + polygons`. Class check, foreign-id check, and the final IntegrityError handling (L134-149, L213-218) stay unchanged.

**Idempotent retry** (L71-87 `same_content`): add a polygon branch comparing id, class_id, and `round(c, _PRECISION)` for every point; update `load_annotation_set` (L54-68) to split rows by `kind` into `boxes` and `polygons`, and `derive_status(len(boxes) + len(polygons), ...)`.

**Error constants style** (L31-34): add `KIND_DETECT_DETAIL` / `KIND_SEGMENT_DETAIL` as module constants (plain English, P1 D-05).

`unannotated_clause()` (L41-51) is `exists(Annotation)` and needs no change.

---

### `training/snapshot.py` + `training/labels.py` (service/utility)

**Analog:** themselves.

**snapshot.py** (L111-130): the annotation select currently reads `x, y, w, h`; add `Annotation.kind` and `Annotation.points`, and append a shape tuple instead of the box tuple. Keep `labels.Box` accepted by `label_rows` so existing tests in `test_training_labels.py` keep passing (RESEARCH Pitfall 13).

**labels.py `label_rows`** (L28-47): the segment branch writes the 4-corner winding `left top, right top, right bottom, left bottom`. Polygon rows must write the stored points with the same clamping and formatting:
```python
rows.append(f"{index} " + " ".join(f"{_unit(px):.6f} {_unit(py):.6f}" for px, py in points))
```
Never emit a 5-column row in a segment project. `manifest_dict` (L85-100) lists `boxes` per image; add `polygons` (or `points`) and bump `MANIFEST_SCHEMA_VERSION` for new runs only (readers stay tolerant of 1).

---

### `progress.py` (utility, transform)

**Analog:** itself, L116-165.
```python
def _suffix(task_type: str) -> str:
    return "M" if task_type == "segment" else "B"

def primary_metrics(task_type, metrics) -> dict[str, float | None]:
    suffix = _suffix(task_type)
    source = metrics or {}
    return {"precision": _number(source.get(f"metrics/precision({suffix})")), ...}

def enrich_event(task_type, event):
    enriched = dict(event)
    if event.get("event") == EVENT_FIT_EPOCH_END:
        enriched["primary"] = primary_metrics(task_type, metrics if isinstance(metrics, dict) else None)
    return enriched
```
Add `secondary_metrics(task_type, metrics)`: for `segment` call the same lookup with suffix `"B"`; return `None` for detect. `enrich_event` adds `enriched["secondary"]` only when it is not `None`. Keep key names out of the browser (P5 D-01). Extend `test_progress.py` with a segment fixture built from the captured keys in RESEARCH ("Captured segment-run metric keys").

---

### `layout.py` (utility, file-I/O)

**Analog:** itself, L56-64.
```python
def weights_root(data_dir: Path) -> Path:
    return data_dir / "weights"

def weights_file(data_dir: Path, name: str) -> Path:
    if not _OFFICIAL_WEIGHTS.fullmatch(name):
        raise ValueError(f"Not an official weights name: {name!r}")
    return weights_root(data_dir) / f"{name}.pt"
```
Add `sam_weights_file(data_dir) -> weights_root(data_dir) / "mobile_sam.pt"` as a fixed path (no caller-supplied name, so no path injection), plus `SEGMENTER_PORT` / env-name constants.

---

### `segmenter_host.py` (service, process supervision)

**Analog:** `backend/src/yolo_trainer_worker/supervisor.py` L255-290.
```python
env = {
    **os.environ,
    "PYTHONUNBUFFERED": "1",
    "PYTHONUTF8": "1",
    "YOLO_AUTOINSTALL": "false",
    "YOLO_CONFIG_DIR": str(layout.ultralytics_config_dir(data_dir)),
}
popen_options: dict[str, object] = {}
if os.name == "posix":
    popen_options["start_new_session"] = True
else:
    popen_options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
process = subprocess.Popen(cmd, cwd=..., stdout=log, stderr=subprocess.STDOUT, env=env, **popen_options)
```
Argument-list Popen only, no shell. Wrap in a thread that restarts with backoff and terminates the child on `stop_event`.

### `worker/main.py` (entrypoint)

**Analog:** itself. Add settings in the same style as the existing fields (L36-70):
```python
poll_interval_seconds: int = Field(default=2, ge=1, validation_alias="WORKER_POLL_INTERVAL_SECONDS")
```
-> `segmenter_port: int = Field(default=8001, validation_alias="SEGMENTER_PORT")`, `segmenter_bind: str = Field(default="127.0.0.1", validation_alias="SEGMENTER_BIND")`. Start the host thread next to the heartbeat thread (L190-205: `threading.Thread(..., daemon=True)`, `stop_event.set()` + `join(timeout=5)` in `finally`).

### `segmenter/engine.py`

**Analog:** `train_job.py` (module docstring L1-8, `WeightsDownloadError` L40-41, `_HASH_CHUNK` L38, `_resolve_weights`). Copy: the dedicated error class for a failed download with an actionable message, chunked sha256 helper, path built from integers and the allow-listed `ext` only. SAM calls follow RESEARCH "SAM engine core" (nested `points=[[[x, y], ...]]`, Pitfall 1). `configure_ultralytics(data_dir)`-equivalent settings (analytics off) must run before the model is built.

### `segmenter/app.py`

**Analog:** `yolo_trainer_api/main.py` (FastAPI app factory; routers included L89-96). Use a factory with an injectable engine so tests use a fake predictor (RESEARCH Pitfall 1 test). Endpoints: `GET /status`, `POST /prepare` (202, idempotent), `POST /segment`.

### `routers/segmentation.py` + `segmenter_client.py`

**Analog for the route:** `routers/annotations.py` (router prefix, `get_project_or_404`, `get_image_or_404` at L48-58, `require_xhr` dependency on the PUT at L202-206):
```python
router = APIRouter(prefix="/api/projects", tags=["annotations"])

@router.put("/{project_id}/images/{image_id}/annotations", response_model=SaveResult,
            dependencies=[Depends(require_xhr)])
```
Use `POST /{project_id}/images/{image_id}/segment` with `require_xhr`, project-scoped 404, forward ints + `ext` + `width/height` only (never paths). `/training/active` already exists (`routers/runs.py:65`) for the "training running" note. The api-to-worker call has no analog (api never calls the worker over HTTP): see No Analog. Register in `main.py:89-96`.

---

### `PolygonShape.tsx` (component, event-driven)

**Analog:** `frontend/src/features/editor/canvas/BoxShape.tsx`

**Imports and helper reuse** (L1-6, L9-39). Do not copy these helpers; import `withAlpha`, `labelTextColor`, `truncateLabel` from `./BoxShape`:
```tsx
import type Konva from "konva";
import { memo, useRef } from "react";
import { Group, Label, Rect, Tag, Text } from "react-konva";
```
**Props contract to mirror** (L46-66): `color`, `label`, `fontFamily`, `scale`, `interactive`, `selected`, `hovered`, `onSelect`, `onHover`, `onChange(id, geometry)` fired only on release.

**Shape element pattern** (L145-172): `strokeScaleEnabled={false}`, `hitStrokeWidth={8}`, `fill={withAlpha(color, hovered || selected ? 0.3 : 0.18)}`, `listening={interactive}`, `draggable={interactive}`, and select on all three of `onClick`, `onPointerClick`, `onTap`. Use `Line` with `closed` and `points` flattened (`lineJoin="round"`).

**Label chip** (L173-185): same `Label`/`Tag`/`Text` block with `CHIP_HEIGHT/CHIP_PADDING/CHIP_FONT` sizes divided by `scale`; anchor at the topmost vertex per UI-SPEC.

**Hover cursor** (L134-141): copy `enter`/`leave` (`stage.content.style.setProperty("cursor", "move")`).

**Drag commit** (L105-122): box clamps with `clampMove` and commits `onChange` in `dragend`. For a polygon bake the node offset into the points on `dragend`, clamp the translation to the image, reset node `x/y` to 0, commit once (RESEARCH Pitfall 6). Vertex `Circle` handles (radius `5/scale`, midpoint `4/scale`) keep local points in a ref and commit once on `dragend`.

---

### `AnnotationCanvas.tsx` (component, modify)

**Analog:** itself.

- `AnnotationCanvasHandle` (L58-69) already exposes `cancelDraft`, `isDrawing`, `focus`, `fit`: extend with `popDraftPoint`, `isDrafting` (Esc and Backspace branch on it, the same way `deselect` asks `isDrawing`).
- `handlePointerDown` (L330-352): route by `tool` after the pan checks. Keep the pan precedence block intact:
```tsx
if (button === 1 || (button === 0 && spaceRef.current)) { startPan(event); return; }
if (!canDraw || button !== 0) { return; }
```
Polygon and segment tools need `button === 2` and shift handling, so loosen the `button !== 0` guard for those tools only and add `onContextMenu` `preventDefault`.
- Shape rendering (L504-530): `boxes.map(<BoxShape ... interactive={selectTool && !panBlocked && !readOnly} />)`: add a parallel `polygons.map(<PolygonShape .../>)`.
- Transformer (L532-546) stays boxes-only; selected polygon uses its own vertex handles.
- Draft rect (L519-528, imperative `draftRef` + `showDraft/hideDraft`): in a segment project the box-tool release converts to a 4-point polygon through a new `onCreatePolygon` prop (corner order TL, TR, BR, BL; matches `labels.py` L40-43).
- Crosshair: `crosshairRef.current?.show(point)` at L376-378 is gated by `canDraw`; show it for box and polygon tools only.

### `PolygonDraft.tsx`

**Analog:** `canvas/Crosshair.tsx` (imperative ref-driven Konva node, `show(point)`), draft in AnnotationCanvas L519-528. Points are ephemeral refs, never in zundo; close hit radius 8/scale; one `createPolygon` on close.

### `lib/polygon.ts` (pure utility)

**Analog:** `lib/geometry.ts` (pure, normalized-coordinates helpers, `round6`, `clamp`, `Point`) with a sibling `geometry.test.ts`. Reuse `round6` and `Point`. Provide `insertVertex`, `removeVertex` (min 3), `polygonBbox`, `selfIntersects`, `simplifyClosed` (RDP), `boxToPolygon`. Co-locate `polygon.test.ts` in vitest style of `geometry.test.ts`.

---

### `annotationStore.ts` (store, CRUD)

**Analog:** itself.

**Doc shape** (L8-12): add `polygons: Polygon[]`; `docStatus` (L21-29) and the `toggleBackground/toggleReviewed` guards (L152-174) must count `boxes.length + polygons.length`.

**One gesture = one `set`, no-op returns `state`** (L79-118):
```ts
createBox: (box) => set((state) => {
  if (state.doc.boxes.length >= MAX_BOXES) { return state; }
  return { doc: { boxes: [...state.doc.boxes, box], isBackground: false, isReviewed: false } };
}),
updateBox: (id, geometry) => set((state) => {
  const current = state.doc.boxes.find((box) => box.id === id);
  if (current === undefined || /* nothing moved */) { return state; }
  return { doc: { ...state.doc, boxes: ..., isReviewed: false } };
}),
```
Mirror as `createPolygon`, `updatePolygon(id, points)`, `deletePolygon`, `setPolygonClass` (or generalize with a shared id lookup). Enforce `MAX_BOXES` over the sum and the 1000/20000 point caps; reviewed demotion and background clearing in the same entry. Keep the `partialize` / `equality` block (L177-181) unchanged.

**API mapping** (L189-205): extend `docFromSet` and `payloadFromDoc` with `polygons`.

### `editorUiStore.ts` (store)

**Analog:** itself. `EditorTool` (L3) becomes `"select" | "box" | "polygon" | "segment"`; the segment prompt/preview state follows the existing module-level `create<EditorUiState>()` shape with `INITIAL` / `resetEditorUi` for tests. `setTool` already clears selection when leaving select (L40-47): add draft/preview reset there.

### `shortcuts.ts`

**Analog:** itself. Row shape (L40-47):
```ts
{ id: "box", group: "tools", labelKey: "shortcuts.box", hotkeys: ["b"], caps: [["B"]], allowRepeat: false, editing: false },
```
Add `polygon` (`p`), `segment` (`s`), `confirm` (`Enter`, `editing: true`); add the `"shapes"` group to the `ShortcutGroup` union (L3). Pointer-only rows go into `POINTER_GESTURES` (L83-98, `captionKeys`). `Backspace`/`Escape` stay single rows; their handlers branch on draft state (do not add duplicate hotkeys). Update `shortcuts.test.ts`.

### `ToolBar.tsx`, `icons.tsx`

**Analog:** themselves. Add `ToolButton` entries (L41-72) filtered by `project.task_type`; icons follow the `Icon` wrapper (icons.tsx L7-27: 24x24 viewBox, 20px, stroke 2, `aria-hidden`) for `PolygonIcon`, `SegmentIcon`, `WarningIcon`.

### `ObjectList.tsx`

**Analog:** itself row anatomy: eye `ActionIcon` (L75-87), class `Select` (L91-110), delete `ActionIcon` (L120-132). Insert the 24px warning cell between `Select` and delete; use `title`, not `Tooltip`.

---

### `foldProgress.ts`, `RunCharts.tsx`, `FinalResultsCard` / `RunMetrics.tsx`

**Analog:** themselves.
- `ChartRow` (foldProgress.ts L8-25): add nullable `boxMap50`, `boxMap50_95`, `boxPrecision`, `boxRecall` filled from `frame.secondary` (all optional, D-05); `PrimaryMetrics` (L28-33) gets a sibling type.
- Loss components are discovered dynamically (`withComponents`, L238/L280): exclude `sem` in one place (a deny-list used by `sum(...)` at L236 and the tooltip) with a test built from the captured events (RESEARCH Pitfall 14).
- `RunCharts.tsx` series are an array with a `dashed` flag (L312-368, rendered at L198-206 via `strokeDasharray={item.dashed ? DASH : undefined}`; legend swatch L58, L131). For segment runs build four series per chart (mask solid, box dashed, same color) per UI-SPEC; detect runs keep the existing arrays.
- `RunMetrics.tsx:72` renders `t("metrics.maskNote")`: remove it (UI-SPEC) and add the `metrics.boxLine` second line.
- i18n: add keys to both `i18n/locales/en/*.json` and `ru/*.json` (`locales.test.ts` compares flattened keys).

## Shared Patterns

### Whole-set CAS save
**Source:** `backend/src/yolo_trainer_api/annotations.py` L116-133
**Apply to:** every change to the annotation contract. First statement of the transaction is the `UPDATE images SET annotation_version = annotation_version + 1 WHERE ... annotation_version = :base`; any refusal path calls `session.rollback()` before raising so the version is unchanged. The new 422 kind check precedes it and needs no DB.

### Normalized geometry, 6 decimals, client UUID
**Source:** `annotations.py` L36-38 (`_PRECISION = 6`), `lib/geometry.ts` `round6`, `schemas.py` `UUID_V4_PATTERN`, `lib/ids.ts`
**Apply to:** polygon points on client and server, `same_content`, migration 0010.

### One history entry per gesture, ephemeral drafts
**Source:** `annotationStore.ts` L79-118; `AnnotationCanvas.tsx` draft ref pattern
**Apply to:** vertex drag, midpoint add, vertex delete, polygon move, class change, accept-mask. Drafts, segment prompts and previews never enter zundo or the autosave.

### Plain-English API errors, shown as received
**Source:** `annotations.py` L31-34 constants; UI-SPEC copy contract
**Apply to:** 422 kind refusals, 502/503/504 from the segmenter proxy.

### Torch-free api
**Source:** `progress.py` docstring L1-7 (pure, duck-typed); `labels.py` docstring L1-5
**Apply to:** everything under `yolo_trainer_api` and `yolo_trainer_common`: no `numpy`, `cv2`, `ultralytics`, `torch` imports. `ultralytics.utils.ops.segments2boxes` only as a test oracle behind `pytest.importorskip`.

### Subprocess launch in the worker
**Source:** `supervisor.py` L265-290 (env keys, `start_new_session` / `CREATE_NEW_PROCESS_GROUP`, argument-list Popen)
**Apply to:** `segmenter_host.py`.

### Tracked-test updates forced by D-12
**Source:** `backend/tests/test_annotations_api.py:556` (`test_boxes_save_and_load_the_same_way_in_a_segment_project` becomes the 422 test), `backend/tests/training_helpers.py` (`setup_project(... task_type=...)` / `_put_boxes` must write polygons for segment), `test_training_snapshot.py:197`, `test_training_pipeline.py:218-221`, `frontend/src/test/editorApi.ts` (segment stub). See RESEARCH Pitfall 13.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/yolo_trainer_api/segmenter_client.py` | service | request-response (HTTP, api to worker) | The api never calls another service over HTTP. Use RESEARCH Pattern 2 (stdlib `urllib.request` inside `asyncio.to_thread`, explicit 30 s timeout, map connection refused/timeouts to 503/504, weights failure to 502). |
| `backend/src/yolo_trainer_worker/segmenter/contour.py` | utility | transform (mask to contour) | No cv2 code exists in the repo. Use the `dense_contour` sketch in RESEARCH "Largest outer contour"; keep it pure (numpy/cv2 in, lists out) so it is testable like `labels.py`. |

## Metadata

**Analog search scope:** `backend/src/yolo_trainer_api`, `backend/src/yolo_trainer_common`, `backend/src/yolo_trainer_worker`, `backend/tests`, `frontend/src/features/editor`, `frontend/src/features/training/progress`, `frontend/src/api`, `docker-compose.yml`
**Files scanned:** about 45 (tracked listing) with 20 read in detail
**Pattern extraction date:** 2026-10-20
