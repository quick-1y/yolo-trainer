# Phase 6: Polygons & Segmentation Projects - Context

**Gathered:** 2026-10-19
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can annotate `segment` projects with polygons, either drawn vertex by vertex or generated with a click (click-to-segment, SAM-style), and can edit them like any other shape. Annotation tools and the server follow the project task type. A segment project annotated in the UI trains end-to-end, and its live charts and results show mask metrics. Requirements: ANNO-04, ANNO-05, ANNO-11.

Not in this phase: AI-assisted annotation from a trained model (Phase 8), the model library (Phase 7), and dataset import/export with mixed-format validation (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Carried forward from earlier phases (still binding)
- Mantine, dark theme only, i18n en/ru with no hardcoded strings (P1 D-01..D-04). API errors are plain English (P1 D-05).
- Saving replaces an image's whole annotation set and is guarded by `annotation_version` compare-and-swap, with 409 on a stale save (P3 D-12). Polygons go through the same contract. `annotations.kind` already allows `'polygon'` (migration 0004).
- Autosave on every completed gesture, undo/redo with one snapshot per gesture, an always-active class (digits 1–9), and a tool that stays active after drawing all apply to polygons too (P3 D-05..D-11). Any change on a reviewed image demotes it (P3 D-15).
- Geometry is normalized to the EXIF-oriented image (P2 D-17). Annotations reference the class id, and the class index is computed at export time (P2 D-13).
- The api image stays torch-free. torch and ultralytics live only in the worker image (P1 D-17).
- Snapshot labels for segment projects are polygons. `training/labels.py` already converts boxes to 4-point polygons (P3 D-18, P4 D-19).
- Charts and history are rebuilt from `progress.jsonl`. The B/M metric-key mapping stays in Python (P5 D-01, D-05). `yolo_trainer_common/progress.py` already selects the `(M)` suffix for segment.

### Polygon drawing & editing (ANNO-04)
- **D-01:** Draw by clicking vertices. **Close** by clicking the first vertex, which highlights on hover, or by pressing **Enter**. Both need at least 3 points. **Esc** cancels the unfinished contour, and **Backspace** removes the last placed point. Double-click does not close a polygon.
- **D-02:** Edit a selected polygon by **dragging its vertices**. A faded **midpoint handle** on each edge creates a new vertex when dragged. **Alt+click or right-click** on a vertex deletes it, and a polygon never drops below 3 vertices. The whole polygon can be moved and its class changed the same way as a box. All of these actions appear in the shortcut reference.
- **D-03:** **Self-intersecting polygons are allowed** and saved as drawn. The object list shows a warning icon ("contour crosses itself"). Nothing is blocked.
- **D-04:** **One polygon is one instance.** An occluded object is annotated as separate polygons of the same class. There are no holes and no multi-part instances. This matches YOLO's one-row-one-contour label format.

### Click-to-segment (ANNO-05)
- **D-05:** The interaction uses **positive and negative points with a live preview**. A click adds an "object" point, and Shift-click or right-click adds a "not object" point. The mask preview updates after each point. **Enter** accepts the result with the active class, and **Esc** discards it. The reference is Roboflow Smart Polygon. Box prompts are not included.
- **D-06:** **One fixed, lightweight SAM variant** supported by Ultralytics 8.4.159, chosen for **CPU latency** (target: a mask within a few seconds on the CPU dev machine, per success criterion 2). There is no model picker in the UI. Research picks the model (for example SAM 2.1-tiny vs MobileSAM vs FastSAM) and measures its latency.
- **D-07:** Click-to-segment **works while a training run is active**. It runs outside the training queue and must not wait behind it. When a training run is active, the tool shows a note that segmentation may be slower.
- **D-08:** The mask is converted into a **simplified polygon**. The default lands at roughly 20–60 vertices, which is comfortable to hand-edit. A **detail slider** in the tool panel recomputes the preview from the cached mask without running SAM again. The accepted result is an ordinary polygon (or box in a detect project) that can be edited like a hand-drawn shape.

### Project task type rules (ANNO-11)
- **D-09:** Existing **boxes in segment projects are migrated to 4-point polygons** by a one-time Alembic migration. After it runs, a segment project stores only polygons. — **Reversibility:** one-way — the migration rewrites stored geometry. The original box rows are not kept.
- **D-10:** A **detect project** offers the **box tool and click-to-segment**. Click-to-segment there produces the mask's **bounding box**. A detect project has no polygon tool.
- **D-11:** A **segment project** keeps the **box tool**. Releasing the mouse turns the drawn box into a **4-point polygon** with editable vertices. The segment toolbar has select, box, polygon, and click-to-segment.
- **D-12:** The **server refuses geometry of the wrong kind** for the project's task type with a 422: polygons in a detect project, and boxes in a segment project once D-09 has run. — **Reversibility:** costly — the save API contract and Phase 8's accept path depend on it.

### Segmentation metrics (success criterion 4)
- **D-13:** Segment runs use the **same three charts**. On the mAP and P/R charts, **mask metrics (M) are solid lines** and **box metrics (B) are dashed lines**. The loss chart adds **seg_loss**. The exact metric keys must be **captured from the first real segment run**, as Phase 0 §2 left them open. Do not guess them.
- **D-14:** In the **Final results card, the history table, and the quality verdict**, mask metrics are primary. The mAP50 and mAP50-95 columns and the verdict use (M), and labels say "(masks)". The final card shows the box metrics as a second line. Detect runs are unchanged.

### Claude's Discretion
- The polygon geometry storage (a JSON point list column vs. a separate points table, and what happens to x/y/w/h for polygons, e.g. keeping the bounding box for cheap queries). It must not block Phase 8's AI-suggested flag. Export uses the stored points directly.
- How the SAM service is hosted: a long-lived inference process or endpoint in the worker container (the api stays torch-free), how it is kept warm, the request path from api to worker, image-embedding caching per image (so extra points are fast), and timeouts. SAM weights are cached under `DATA_DIR` the same way base weights are. A download failure shows a clear message on the tool.
- The mask → polygon simplification algorithm (for example Douglas–Peucker on the largest contour) and the slider range.
- The shortcut keys for the polygon and click-to-segment tools (suggested: P polygon, S or M segment). They must not conflict with the existing table in `lib/shortcuts.ts`.
- The exact wording and placement of the self-intersection warning and the "training is running" note.
- How grid thumbnails or tile counts show polygons, if at all. The tile count should cover all shapes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` § Phase 6 — goal and 4 success criteria
- `.planning/REQUIREMENTS.md` — ANNO-04, ANNO-05, ANNO-11
- `.planning/STATE.md` § Blockers — "Prior research does not cover click-to-segment (SAM). Needs phase research on model choice and CPU latency"

### Geometry, formats, and conversion
- `docs/roadmap.md` §7.2–7.5 — task-type homogeneity is an Ultralytics hard constraint, the polygon tool, box↔polygon conversion (`segments2boxes()` for polygon→box)
- `docs/phase-0-decisions.md` §2, §3 — detect metric keys captured, segment keys still to capture; why a segment dataset with box rows fails
- `.planning/research/webapp-platform/YOLO-FORMAT-AND-API.md` — segment label row format
- `.planning/research/webapp-platform/FRONTEND-ANNOTATION-UI.md` — react-konva polygon patterns (Label Studio reference)

### Prior phase decisions
- `.planning/phases/03-box-annotation-editor/03-CONTEXT.md` — editor layout, saving, undo, status, and D-18 (boxes in segment projects)
- `.planning/phases/04-train-download/04-CONTEXT.md` — snapshot, labels, and worker job model
- `.planning/phases/05-live-training-monitoring-control/05-CONTEXT.md` — charts, `progress.jsonl` schema, and final results card

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/editor/canvas/AnnotationCanvas.tsx`, `BoxShape.tsx`, `Crosshair.tsx`, `useStageViewport.ts`: the canvas, the box shape, and zoom/pan. A new `PolygonShape` goes next to `BoxShape`.
- `frontend/src/features/editor/store/annotationStore.ts` (Zustand + zundo), `annotationSaver.ts` (debounce/retry/409), `storeRegistry.ts`: shape-agnostic save and undo plumbing to extend with polygon geometry.
- `frontend/src/features/editor/lib/shortcuts.ts`: the single shortcut table that also drives the on-screen reference.
- `frontend/src/features/editor/ToolBar.tsx`, `ObjectList.tsx`, `ClassPanel.tsx`: the tool list, the object list (where the self-intersection warning goes), and the class panel.
- `backend/src/yolo_trainer_api/annotations.py` + `schemas.py` (`AnnotationSave`, `BoxRead`): the whole-set replace with CAS. It needs a polygon variant and task-type validation.
- `backend/src/yolo_trainer_api/training/labels.py`: `label_rows` already branches on task type. Polygons should be written from their stored points.
- `backend/src/yolo_trainer_common/progress.py`: the B/M suffix mapping per task type already exists. Extend it for secondary (box) metrics and seg_loss.
- `frontend/src/features/training/progress/RunCharts.tsx`, `foldProgress.ts`, `FinalResultsCard.tsx`: the charts and final card to extend with dashed box series.

### Established Patterns
- Geometry is normalized to [0,1] and rounded to 6 decimals on both client and server (`_PRECISION`).
- Annotation ids are client UUID v4 from `getRandomValues`.
- Schema changes go through Alembic migrations that apply on startup (latest: `0009_last_map50_95.py`).
- The worker is the only container with torch. It polls the DB, and the supervisor writes run state.

### Integration Points
- The annotation save API (`routers/annotations.py`) needs geometry-kind validation against `project.task_type`.
- The new click-to-segment request path goes from the browser to the api to the worker inference process, which has to coexist with the training subprocess.
- The training snapshot and labels feed segment training, which is already wired for the `-seg` base models (P4 D-07).

</code_context>

<specifics>
## Specific Ideas

- Click-to-segment should feel like **Roboflow Smart Polygon**: +/− points, a live mask preview, and Enter to accept.
- Polygon editing should behave like **Label Studio / CVAT**: draggable vertices, midpoint handles to add vertices, and a quick gesture to delete a vertex.

</specifics>

<deferred>
## Deferred Ideas

- Box or rectangle prompts for SAM, and a user-selectable larger SAM model (for example for GPU hosts). Possible follow-ups to Phase 6 or Phase 12.
- Multi-part instances and polygons with holes. Not supported by the YOLO one-row-one-contour format, so out of scope.

</deferred>

---

*Phase: 06-polygons-segmentation-projects*
*Context gathered: 2026-10-19*
