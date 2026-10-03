# Phase 3: Box Annotation Editor - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A user opens an image from the grid in a full-screen annotation editor and labels it with bounding boxes. They can zoom and pan, draw, select, move, resize and delete boxes, assign or change each box's class, and move between images without going back to the grid. Every change autosaves and survives a reload. Undo/redo, keyboard shortcuts with an on-screen reference, per-image status (unannotated / annotated / reviewed), "next unannotated", and marking an image as background are all included. Requirements: ANNO-02, ANNO-03, ANNO-06, ANNO-07, ANNO-08, ANNO-09, ANNO-10.

Out of this phase: polygons, click-to-segment and segment-project tools (Phase 6), AI-assisted proposals (Phase 8), YOLO label export and import (Phase 4 at training time / Phase 9), splits (Phase 4), tags and grid filters by status/class (Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Carried forward from earlier phases (still binding)
- Mantine, dark theme only, i18n en/ru with no hardcoded strings (P1 D-01..D-04). API errors are plain English (P1 D-05).
- Annotations reference the **class id (primary key), never the class index**. The index is computed at export and training time (P2 D-13). Deleting a class cascades to its annotations, and the class-delete dialog must now show "N objects will be deleted" (P2 D-16). This phase adds that count.
- Image width and height are stored with EXIF orientation applied (P2 D-17). Box coordinates are relative to that oriented image, so they match what Ultralytics trains on.
- Clicking a grid tile now opens the editor instead of the viewer modal (P2 D-10). The tile already has room for a status badge (P2 D-07).
- The DB is the live source of truth, and YOLO `.txt` files are derived artifacts (`docs/roadmap.md` §6.2, §7.5). The canvas uses react-konva, with Zustand + zundo snapshot-per-gesture undo (§7.5, §11.1–11.2). This phase validates the react-konva choice before polygons build on it.
- Hard delete, no trash (P1 D-10).

### Editor layout
- **D-01:** The editor is a **separate full-screen route** (e.g. `/projects/:projectId/annotate/:imageId`) without the project sidebar. The URL is reloadable and shareable. "Back" returns to the Images grid.
- **D-02:** The layout has a **narrow tool bar on the left** (select, box, and later polygon), the **canvas in the center**, and a **right panel** with the class list on top and the current image's object list below. A **top bar** shows the filename, status badge, save indicator, ←/→ prev/next and an "N of M" counter.
- **D-03:** Prev/next follows **the same order as the grid**: the same sort (newest / by filename) and the same filename search the grid had when the editor opened. These are carried in URL query params, and Back returns to the grid with the same sort and search.
- **D-04:** **Mouse wheel zooms toward the cursor.** Holding space and dragging, or dragging with the middle mouse button, pans. Each image opens **fit to window**, and a shortcut resets to fit.

### Drawing & class assignment
- **D-05:** One class is always **active** (digit keys 1–9 switch it, or click in the class panel). A newly drawn box gets the active class and is saved immediately. There is no class popup after drawing.
- **D-06:** With a box **selected**, a digit key or a click on a class in the panel **changes that box's class** instead of the active class. The object list also has a per-object class dropdown.
- **D-07:** If the project has no classes, the class panel lets the user **create a class inline** using the same classes API and validation as the Classes page. Drawing is disabled until at least one class exists.
- **D-08:** The box tool **stays active** after a box is drawn, so boxes can be drawn one after another. It shows **full-canvas crosshair guides**. Boxes are **clamped to the image bounds**, and **tiny accidental boxes** (a click or a few-pixel drag) are discarded.

### Saving & undo
- **D-09:** **Autosave on every completed gesture**: create, move-release, resize-release, class change, delete, and background/reviewed toggles. A short debounce or batching is allowed. The top bar shows a **Saved / Saving… / Error** indicator. Ctrl+S flushes pending changes immediately. There is no separate manual-save workflow. This **overrides** `docs/roadmap.md` §7.5's "manual save primary" recommendation, per the phase success criterion.
- **D-10:** Undo/redo history is **per image and held in memory for the browser session** (around 100 steps). Returning to an image in the same tab keeps its history. After a reload the history is empty, but the data is already saved. Undo and redo themselves are saved like any other change.
- **D-11:** On a save failure, changes **stay queued and retry with backoff**, and the indicator turns red. **Navigating to another image waits** until pending saves succeed, or warns the user. Closing or reloading the tab with unsaved changes triggers the browser's `beforeunload` warning. There is no localStorage draft.
- **D-12:** **Optimistic concurrency per image**: each image's annotation set carries a version counter. A save from a stale tab gets **409**, and the UI shows "Changed elsewhere — reload" instead of silently overwriting. — **Reversibility:** costly — the version column and the 409 contract are part of the annotation save API that later phases (AI accept/reject in Phase 8, polygons in Phase 6) build on.

### Status & navigation
- **D-13:** **Annotated is derived automatically**: an image with at least one box, or marked as background, is *annotated*. An image with no boxes and no background flag is *unannotated*. **Reviewed** is set only by an explicit button or shortcut.
- **D-14:** **Background is a flag** that can only be set when the image has no boxes. Drawing a box on a background image **clears the flag**. Background images export as an empty label file (ANNO-10, at export/training time).
- **D-15:** **Any annotation change on a reviewed image demotes it back to annotated**, so "reviewed" always means "reviewed as it is now".
- **D-16:** **"Next unannotated"** searches in grid order (D-03) starting **after the current image**, wraps around to the start, and shows an "All images are annotated" message when there is nothing left. It is also available from the Images grid as an "Annotate next" entry point.
- **D-17:** The grid shows a **status badge on each tile** (unannotated / annotated / reviewed / background) plus the box count, and a summary above the grid ("annotated N of M") with the "Annotate next" button. Filtering the grid by status stays in Phase 10.

### Data model notes for the planner (from the decisions above)
- Image-level state needed: background flag, reviewed flag (or status enum), and the annotation version (D-12). "Annotated" can be derived or stored, but it must stay consistent with the box count and background flag.
- Box geometry is stored normalized to [0,1] relative to the oriented image (§7.5). Whether geometry is a polymorphic column or separate tables (`docs/roadmap.md` §13.4) is the planner's call, but it must not block Phase 6 polygons or Phase 8's AI-suggested flag.

### Claude's Discretion
- The exact shortcut map (suggested: V select, B box, 1–9 classes, Del/Backspace delete, Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y, A/D or ←/→ prev/next, N next unannotated, R reviewed, Ctrl+S save, F or 0 fit, Esc deselect, `?` shortcut reference). It must not conflict with browser or OS defaults, and it must be shown in an on-screen shortcut reference (ANNO-08).
- Box rendering details: stroke in the class color, a light fill, a class-name label, highlighting of the selected or hovered box, and hide/show toggles in the object list.
- The save API shape (per-object CRUD or whole-image annotation set replace), debounce and batching numbers, and retry backoff.
- How the editor prefetches the neighboring images and how it loads the original (the existing `/file` route).
- The minimum box size threshold, and whether moving and resizing use Konva `Transformer`.
- Whether the editor lazily loads react-konva so the rest of the app bundle stays small.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Annotation architecture
- `docs/roadmap.md` §7.1 — Classes vs. tags; class index = position in `names:`.
- `docs/roadmap.md` §7.2 — Per-project task type (detect vs. segment homogeneity). This phase is box-only for `detect` projects; segment projects get polygons in Phase 6.
- `docs/roadmap.md` §7.3 — Manual box tool; react-konva with a shared `Transformer`-based edit model.
- `docs/roadmap.md` §7.4 — Box↔polygon conversion (relevant to keeping the geometry model Phase 6-ready).
- `docs/roadmap.md` §7.5 — Normalized coordinates, snapshot-per-gesture undo storing plain serializable data. Its "manual save primary" recommendation is **overridden by D-09**.
- `docs/roadmap.md` §6.2 — DB as source of truth; YOLO label files are derived.
- `docs/roadmap.md` §13.3–13.4 — AnnotationInstance entity shape; polymorphic geometry is an open implementation choice.

### Frontend architecture
- `docs/roadmap.md` §11.1 — Zustand + zundo.
- `docs/roadmap.md` §11.2 — react-konva; study Label Studio Frontend's `Rectangle`/`ImageView`.

### Project-level
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria and notes.
- `.planning/REQUIREMENTS.md` — ANNO-02, ANNO-03, ANNO-06..ANNO-10.
- `.planning/phases/02-image-upload-classes/02-CONTEXT.md` — Class model (D-12..D-16), EXIF semantics (D-17), storage layout (D-18), grid and viewer (D-06..D-11).
- `.planning/phases/01-runnable-skeleton-projects/01-CONTEXT.md` — UI stack, i18n, error conventions.
- `.planning/phases/02-image-upload-classes/02-SECURITY.md` and `.planning/phases/01-runnable-skeleton-projects/01-SECURITY.md` — Existing mitigations (CSP, body limits, Host allow-list, JSON-preflight CSRF stance) that new annotation write routes must follow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/images/ImageViewerModal.tsx` and `ImagesPage.tsx`: the existing prev/next across cursor pages (pending-advance flag after `fetchNextPage`), and the keyboard ←/→ handling. They are the base for editor navigation in grid order.
- `frontend/src/api/images.ts` (`useImagesInfinite`) and `frontend/src/api/classes.ts`: TanStack Query hooks for image listing and classes. The editor's class panel and inline create reuse the classes hooks.
- `frontend/src/features/images/ImageTile.tsx`: the tile that gets the status badge and box count (D-17).
- `frontend/src/features/classes/AddClassForm.tsx`: reusable for inline class creation in the editor (D-07).
- `frontend/src/features/classes/DeleteClassModal.tsx`: needs the "N objects will be deleted" count (P2 D-16).
- `backend/src/yolo_trainer_api/routers/images.py` (`/file` route, keyset paging, search normalization) and `routers/classes.py`: patterns for the new annotation routes.
- `backend/src/yolo_trainer_api/models.py`: `Image` and `ProjectClass` with `ondelete="CASCADE"` FKs and no ORM relationships. Follow the same style for annotation rows (FK to image and class, both cascading).

### Established Patterns
- Alembic migrations only, ORM-only queries, Postgres-portable schema, and pydantic `extra="forbid"`.
- Write routes rely on the JSON CORS preflight for CSRF (T-02-13-05). New annotation write routes should be JSON too.
- Vitest + Testing Library for components, and pytest against a temp-file SQLite.

### Integration Points
- `frontend/src/app/routes.tsx`: add the editor route **outside** `ProjectLayout`'s sidebar (or as a full-screen child), per D-01.
- `ImagesPage.tsx` currently keeps `sort` and `query` in React state. They must move to **URL search params** so the editor and Back share them (D-03).
- `frontend/package.json` has no react-konva, konva, zustand or zundo yet. They are new dependencies and must go through the supply-chain check like earlier deps.
- The image list API must expose per-image status and box count for the grid badge (D-17) and support "next unannotated after X in this sort/search" (D-16), either server-side or via a dedicated endpoint.

</code_context>

<specifics>
## Specific Ideas

- The editor should feel like Roboflow's or CVAT's annotate view (the owner's reference tool is Roboflow): tools on the left, classes and objects on the right, fast keyboard-driven box drawing with an active class.
- The primary workflow is to draw many same-class boxes in a row, then press "next". The editor is optimized for that loop.

</specifics>

<deferred>
## Deferred Ideas

- Filtering the grid by annotation status or class belongs to Phase 10 (filters).
- A per-box "ask class after drawing" popup was considered and not chosen. It could become an optional setting later.
- A localStorage draft for unsaved changes was considered and not chosen, because retry plus `beforeunload` is enough for a local server.

</deferred>

---

*Phase: 03-box-annotation-editor*
*Context gathered: 2026-10-03*
