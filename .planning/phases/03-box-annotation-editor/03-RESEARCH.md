# Phase 3: Box Annotation Editor - Research

**Researched:** 2026-10-03
**Domain:** react-konva box-annotation canvas (zoom/pan, draw, Transformer edit) + Zustand/zundo snapshot-per-gesture undo + autosave with optimistic concurrency + FastAPI/SQLAlchemy annotation persistence and derived per-image status
**Confidence:** HIGH for the backend design and for every Konva/browser behavior that was executed this session (real Edge 154 via puppeteer-core, Konva 10.7.0, SQLite 3.49.1, SQLAlchemy async prototypes, vitest 5 + jsdom 30). MEDIUM for Firefox/Safari behavior (only Chromium/Edge was driven) and for UX tuning numbers (debounce, backoff, history caps are recommendations).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
- Filtering the grid by annotation status or class belongs to Phase 10 (filters).
- A per-box "ask class after drawing" popup was considered and not chosen. It could become an optional setting later.
- A localStorage draft for unsaved changes was considered and not chosen, because retry plus `beforeunload` is enough for a local server.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANNO-02 | Open an image in an annotation editor with zoom/pan and navigate to next/previous | Separate full-screen route (Pattern 1), Konva stage viewport math + custom pan (Pattern 5), `neighbors` endpoint for grid-order prev/next/"N of M" that survives a reload (Pattern 3), URL-param `sort`/`q` (Pitfall 11) |
| ANNO-03 | Draw, select, move, resize, delete boxes and assign a class | Stage-level draw with pointer capture (verified), `Transformer` with `flipEnabled={false}` and scale-reset normalization (verified), pure `geometry.ts` (Pattern 6), tool-mode `listening` switch (Pitfall 7) |
| ANNO-06 | Change an existing annotation's class | `setBoxClass` store action = one history entry; digit key / panel click / per-object dropdown (D-06); dropdown focus-return pitfall (Pitfall 9) |
| ANNO-07 | Auto-save surviving reload; undo/redo | Whole-set replace + compare-and-swap version (verified prototype, Pattern 2), serial coalescing saver with retry (Pattern 4), zundo per-image store with `equality` (verified, Pattern 7) |
| ANNO-08 | Keyboard shortcuts for tools, classes, save, navigation | Mantine `useHotkeys` with `usePhysicalKeys` (RU layout!), modal-open gating, `event.repeat` guard (Pitfalls 8-10), shortcut table + reference modal |
| ANNO-09 | Per-image status; jump to next unannotated | Derived status via correlated count (benchmarked at 200k images, Pattern 3), `next-unannotated` + `status-counts` endpoints, grid badge/summary (Pattern 8) |
| ANNO-10 | Mark an image as background | `is_background` column + server invariants (background xor boxes), exported later as empty label file (forward note for Phase 4/9) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `./.claude/CLAUDE.md` (its "Conventions"/"Architecture" blocks describe only the legacy root scripts; Phase 2 research already records that new backend code follows English comments + type hints + ruff, P1 D-24):

- **GSD workflow enforcement:** no repo edits outside a GSD command; this phase is executed through `/gsd-execute-phase`.
- **Stack pins:** Python 3.12, Ultralytics 8.4.159, PyTorch 2.14.0 (untouched by this phase). FastAPI + SQLAlchemy/Alembic + SQLite (WAL), Postgres-ready data layer; React + Vite SPA with a **react-konva canvas**.
- **Deployment:** Docker Compose; the API image stays torch-free (no new backend dependency is needed here); must run on CPU-only hosts.
- **Data model:** one task type per project; **classes and tags are distinct** (tags are Phase 10).
- **Security:** new write routes must extend, not weaken, the Phase 1/2 mitigations (CSP, body-size limits, Host allow-list, custom header / JSON-preflight CSRF stance).
- **Job execution / hardware:** not touched by this phase.

## Summary

Phase 3 is two coupled slices. The **backend** adds an `annotations` table, three image-level columns (`is_background`, `is_reviewed`, `annotation_version`) and five read/write routes. The recommended save contract is a **whole-image annotation-set replace guarded by a compare-and-swap version**: the first statement of the transaction is `UPDATE images SET annotation_version = annotation_version + 1 WHERE id = :id AND annotation_version = :base`; `rowcount == 0` means 409. This was prototyped against the real SQLite pragmas (WAL, `busy_timeout`, `foreign_keys=ON`): a stale save gets 409, two concurrent saves with the same base version yield exactly one winner, a bad class id rolls the whole save back (version and rows unchanged), and deleting a class cascades to its annotations. Status ("annotated") is **derived** (box count via a correlated subquery, plus the background flag), never stored, because a class delete cascades annotations at DB level and a stored count would silently go stale; the derived queries were benchmarked at 200k images / 680k annotations (list page 0.2-0.3 ms, next-unannotated 0.03 ms, status counts 88 ms, neighbor position 14 ms).

The **frontend** is a lazy-loaded full-screen route outside `AppLayout`. Everything that can be pure is pure (box geometry/clamping, viewport zoom math, history store, save queue, shortcut map) and unit-tested; the Konva layer is thin. Real-browser experiments (Edge 154 via puppeteer-core) established four non-obvious facts the plan must encode: (1) `Transformer` anchors keep a constant 11 px screen size under stage zoom and `boundBoxFunc` receives **absolute screen-space** boxes, so the robust approach is to normalize and clamp in `transformend`; (2) without `setPointerCapture`, releasing the mouse outside the canvas never fires `pointerup` (a stuck draft box), with capture it fires with out-of-bounds coordinates that must be clamped; (3) Chromium applies EXIF orientation to JPEG and PNG but **not to WebP**, so stored dimensions (Pillow-transposed, P2 D-17) can disagree with what the browser draws, and the editor must compare `naturalWidth/Height` to the DB dimensions and refuse to annotate on mismatch; (4) `crypto.randomUUID` is `undefined` on an insecure LAN origin (`http://192.168.x.x`, the P2 D-14 opt-in), so client-generated box ids need a `getRandomValues` fallback. Zustand + zundo works as the CONTEXT asks, with one trap verified: without a custom `equality`, a metadata-only `set` creates a history entry.

**Primary recommendation:** Build the backend contract first (migration `0004`, derived status, CAS replace-set save, neighbors/next-unannotated/status-counts, class-delete demotion), then the pure frontend modules and the per-image zundo store + serial saver with tests, then the thin Konva canvas, then the grid/class-dialog integration; verify gestures that jsdom cannot hit-test (shape selection, Transformer, pointer capture, EXIF/WebP mismatch, RU keyboard layout) in the end-of-phase manual UAT.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Box drawing/selection/move/resize, zoom/pan, crosshair | Browser / Client | — | Pure interaction over a canvas; Konva owns hit-testing and handles |
| Undo/redo history (per image, in memory, ~100 steps) | Browser / Client | — | D-10: session-only; snapshots are plain serializable data |
| Autosave queue, retry/backoff, dirty tracking, `beforeunload` | Browser / Client | API | The client decides when to send; the API only validates and applies |
| Persisted annotation set, version counter, invariants (background xor boxes, class belongs to project, size caps) | API / Backend | Database | Server is the trust boundary; the CAS `UPDATE` is the concurrency control |
| Derived status (`unannotated`/`annotated`/`reviewed`), box count | Database / Storage | API | Correlated subquery over `annotations`; never stored, so cascades cannot desync it |
| Grid-order navigation (prev/next/position/total, next-unannotated) | API / Backend | Database | Keyset predicates must match the grid's own ordering and work after a reload; the client cannot hold all pages |
| Class "N objects" count, class-delete demotion of reviewed images | API / Backend | Database | Cascade deletes annotations at DB level; the route must bump versions/demote in the same transaction |
| Original image delivery (`/file`, immutable cache) | API / Backend | Browser cache | Already built in Phase 2; the editor only consumes it |
| Image orientation sanity (DB dims vs decoded dims) | Browser / Client | API | Only the browser knows how it decoded the file; the DB holds the oriented dimensions |
| Route/shell (full-screen editor outside `AppLayout`), URL-carried sort/search | Browser / Client | CDN / Static (nginx SPA fallback) | `try_files ... /index.html` already serves deep links |
| Shortcut handling and on-screen reference | Browser / Client | — | Pure UI; must be layout-independent (physical keys) for the RU locale |

## Standard Stack

### Core (new frontend dependencies; no new backend dependency)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| konva | 10.7.0 (published 2026-09-23) | 2D canvas scene graph: stage, shapes, `Transformer` | Roadmap §11.2 lock; 3.4M weekly downloads; frequent releases (10.3.3 -> 10.7.0 in a month), so pin via lockfile [VERIFIED: npm view konva; gsd-tools package-legitimacy] |
| react-konva | 19.3.0 (published 2026-09-15) | React bindings for Konva | Roadmap §11.2 lock; peer `react ^19.3.0` matches the frontend's `react ^19.3.0`; peer `konva ^8 ... ^10` includes 10.7.0 [VERIFIED: npm view react-konva] |
| zustand | 5.0.15 | Per-image editor stores (vanilla `createStore` + `useStore`) | Roadmap §11.1 lock [VERIFIED: npm view zustand; checker OK] |
| zundo | 2.3.0 (published 2024-11-17) | `temporal` middleware: `undo/redo/clear/pause/resume`, `limit`, `partialize`, `equality` | Roadmap §11.1 lock; peer `zustand ^4.3.0 \|\| ^5.0.0`; API read from `dist/index.d.ts` and executed this session [VERIFIED: npm view zundo; checker OK; behavior executed] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest-canvas-mock (devDependency) | 1.2.0 | Makes Konva render in jsdom (stage events, `getRelativePointerPosition`) | Component tests of the canvas; peer `vitest ^3 \|\| ^4 \|\| ^5` [ASSUMED name provenance; executed OK in a scratch project with vitest 5.0.3 + jsdom 30] `vitest-canvas-mock` [WARNING: flagged as suspicious (too-new) — verify before using.] |
| @mantine/hooks `useHotkeys` | 9.6.3 (installed) | Keyboard shortcuts | Already in the project; supports `usePhysicalKeys` per hotkey [VERIFIED: frontend/node_modules/@mantine/hooks/esm/use-hotkeys/use-hotkeys.mjs:19] |
| @mantine/core `Kbd`, `Modal`, `SegmentedControl`, `Select` | 9.6.3 (installed) | Shortcut reference, tool/class UI | No icon package exists (Phase 2 UI-SPEC: text glyphs / inline SVG) |
| @tanstack/react-query | 5.104.0 (installed) | `useQuery` for annotations/neighbors/summary; `setQueriesData` patching of the grid cache | Same patterns as Phase 2 `pruneDeletedImages` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Konva `Transformer` | Eight hand-built handle rects | Full control of clamping, but re-implements cursors/anchor hit areas; Transformer is already the roadmap §7.3 shared model and works with zoom (verified). Use Transformer + normalize/clamp in `transformend` |
| Whole-set replace save | Per-object CRUD | CRUD needs temp-id remapping (breaks undo snapshots) and many requests per gesture burst; replace-set is idempotent and trivially retried |
| Client-generated UUID primary key | Server int ids returned in a response | Server ids would force remapping ids inside already-recorded undo snapshots; client UUIDs stay stable forever |
| `use-image` package | A 15-line `useLoadedImage` hook | Not worth a dependency (needs the dimension-mismatch guard anyway) |
| `react-konva/lib/ReactKonvaCore` custom build | Full `react-konva` | Core-only saves ~14 KB gzip of 108 KB but risks missing shape registration; skip, lazy-load the route instead |

**Installation:**
```bash
npm --prefix frontend install konva react-konva zustand zundo
npm --prefix frontend install -D vitest-canvas-mock
# Dockerfile.frontend already uses `npm ci --maxsockets=1` (02 decision); update package-lock.json in the same commit.
```
No backend dependency changes (`uv.lock` untouched).

**Version verification:** `npm view konva version` -> 10.7.0; `react-konva` -> 19.3.0; `zustand` -> 5.0.15; `zundo` -> 2.3.0; `vitest-canvas-mock` -> 1.2.0 (all run 2026-10-03). Bundle impact measured with esbuild (minified, prod): react+react-dom 68.8 KB gzip; adding react-konva+konva 107.9 KB gzip (about +39 KB) -> lazy-load the editor route with `React.lazy`.

## Package Legitimacy Audit

Run with `gsd-tools query package-legitimacy check --ecosystem npm konva react-konva zustand zundo vitest-canvas-mock` (2026-10-03). As in Phase 2, `SUS` here is only the `too-new` freshness signal on a package that shipped a release inside the freshness window; every package has a real source repo, millions of weekly downloads and no postinstall.

| Package | Registry | Latest release | Downloads | Source Repo | Verdict (checker) | Disposition |
|---------|----------|----------------|-----------|-------------|-------------------|-------------|
| konva | npm | 2026-09-23 | 3.37M/wk | github.com/konvajs/konva | SUS (too-new) | Approved by roadmap §11.2; planner adds ONE `checkpoint:human-verify` before the install commit (lockfile diff: names, versions, no postinstall) |
| react-konva | npm | 2026-09-15 | 2.57M/wk | github.com/konvajs/react-konva | SUS (too-new) | Same single install checkpoint |
| zustand | npm | 2026-08-13 | 69.4M/wk | github.com/pmndrs/zustand | OK | Approved |
| zundo | npm | 2024-11-17 | 509K/wk | github.com/charkour/zundo | OK | Approved (stable, no recent releases; peer includes zustand 5) |
| vitest-canvas-mock | npm | 2026-09-05 | 1.30M/wk | github.com/wobsoriano/vitest-canvas-mock | SUS (too-new) | Dev-only; name found via training knowledge -> `[ASSUMED]`; include in the same install checkpoint |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** konva, react-konva, vitest-canvas-mock (freshness only). Installs go through `package-lock.json` with `npm ci` (T-01-SC).

## Architecture Patterns

### System Architecture Diagram

```
 Images grid (/projects/:id/images?sort=&q=)            Editor (/projects/:id/annotate/:imageId?sort=&q=)  [outside AppLayout, lazy]
 ┌───────────────────────────────┐  click tile /           ┌────────────────────────────────────────────────────────────────────────┐
 │ tiles + status badge + count  │  "Annotate next"        │ TopBar: name · status · Saved/Saving/Error · ← → · "N of M" · ?        │
 │ summary "annotated N of M"    ├────────────────────────►│ ToolBar │ AnnotationCanvas (react-konva)  │ ClassPanel + ObjectList  │
 └──────────────▲────────────────┘                         └──────────┬───────────────┬────────────────────────▲──────────────────────┘
                │ setQueriesData patch on save                         │ pointer/wheel │ keyboard (useHotkeys,  │ class click / digit
                │                                                      ▼               ▼  physical keys)        │
                │                                      per-image zustand+zundo store (registry Map, LRU ~30)────┘
                │                                      doc{boxes,isBackground,isReviewed} tracked │ meta{serverVersion,saveState} untracked
                │                                                      │ subscribe(doc) → dirty
                │                                                      ▼
                │                                      Saver (module-level, serial, coalescing): debounce ~400 ms → PUT; backoff on 5xx/network;
                │                                      409 → "Changed elsewhere — reload"; flush() awaited before any navigation
                │                                                      │ JSON PUT + X-Requested-With
                │                                                      ▼
        ┌───────┴───────────────────── nginx (/api/ 1m body limit, unchanged) ─────────────────────┐
        │ api (FastAPI)                                                                            │
        │  GET  /api/projects/{p}/images/{i}                       → ImageRead (+status, box_count)│
        │  GET  /api/projects/{p}/images/{i}/annotations           → {version, flags, boxes}       │
        │  PUT  /api/projects/{p}/images/{i}/annotations           → CAS UPDATE first (rowcount)   │
        │         → validate (class ∈ project, invariants) → diff upsert/delete → commit → {version,status}
        │  GET  /api/projects/{p}/images/{i}/neighbors?sort&q      → {prev_id,next_id,position,total}
        │  GET  /api/projects/{p}/images/next-unannotated?sort&q&after → {image_id|null}  (declare BEFORE /{image_id})
        │  GET  /api/projects/{p}/images/status-counts             → {total,unannotated,annotated,reviewed,background}
        │  DELETE class → UPDATE images (bump version, demote reviewed) for affected images, THEN delete (FK cascade)
        └───────────────────────────────────────────┬──────────────────────────────────────────────┘
                                                    ▼
                         SQLite (WAL, foreign_keys=ON): images(+is_background,is_reviewed,annotation_version)
                                                         annotations(id uuid PK, image_id↓CASCADE, class_id↓CASCADE, kind, x,y,w,h, position)
```

### Recommended Project Structure
```
backend/src/yolo_trainer_api/
├── models.py                    # + Annotation; Image gets 3 columns + box_count column_property; ProjectClass.object_count
├── schemas.py                   # + BoxIn/BoxRead/AnnotationSave/AnnotationSetRead/SaveResult/Neighbors/NextUnannotated/StatusCounts; ImageRead/ClassRead extended
├── annotations.py               # NEW: apply_save (CAS), derive_status, payload equality (pure + one async fn)
├── routers/annotations.py       # NEW: the five routes above (literal routes registered before parametrized ones)
├── routers/images.py            # extract the keyset predicate so list/neighbors/next-unannotated share it
├── routers/classes.py           # delete_class demotes/bumps affected images; ClassRead.object_count
└── migrations/versions/0004_create_annotations.py
backend/tests/                   # test_annotations_api, test_annotations_status, test_annotations_concurrency, test_classes_api (+cascade/count)
frontend/src/
├── api/annotations.ts           # types, hooks, saveAnnotations, patchImageInListCache
├── features/editor/
│   ├── EditorPage.tsx           # route target (React.lazy), not-found + dimension-mismatch states
│   ├── EditorTopBar.tsx  ToolBar.tsx  ClassPanel.tsx  ObjectList.tsx  ShortcutsModal.tsx
│   ├── canvas/AnnotationCanvas.tsx  BoxShape.tsx  Crosshair.tsx  useStageViewport.ts  useLoadedImage.ts
│   ├── store/annotationStore.ts  storeRegistry.ts  annotationSaver.ts
│   └── lib/geometry.ts  viewport.ts  shortcuts.ts  ids.ts
├── features/images/             # ImagesPage (URL params), ImageTile badge, StatusSummary, AnnotateNextButton; ImageViewerModal REMOVED
└── i18n/locales/{en,ru}/editor.json   # + images.json / classes.json additions (locales.test auto-checks parity)
```

### Pattern 1: Route outside the shell, state in the URL
**What:** Add the editor as a **sibling** of the layout route, not a child of `AppLayout`/`ProjectLayout`. React Router ranks by specificity, so it does not collide with the `*` catch-all.
**Existing code to change** [VERIFIED: frontend/src/app/routes.tsx:15-25]:
```tsx
<Route element={<AppLayout />}>
  <Route path="/" element={<Navigate to="/projects" replace />} />
  <Route path="/projects" element={<ProjectsPage />} />
  <Route path="/projects/:projectId" element={<ProjectLayout />}>
```
Add `<Route path="/projects/:projectId/annotate/:imageId" element={<Suspense …><EditorPage /></Suspense>} />` next to (not inside) that `<Route element={<AppLayout />}>`.
- `ImagesPage` keeps `sort`/`search` in React state today [VERIFIED: ImagesPage.tsx:49-50 `const [sort, setSort] = useState<ImageSort>("newest");` / `const [search, setSearch] = useState("");`]. Move both to `useSearchParams` (writes with `{ replace: true }`). The app uses `<BrowserRouter>` [VERIFIED: App.tsx `<BrowserRouter>`], which is **not** a data router, so `useBlocker` is unavailable: navigation guarding is done by awaiting `saver.flush()` inside the editor's own navigate helpers plus `beforeunload` (Pitfall 12).
- The editor validates the project itself (`useProject`) and reuses `ProjectNotFound`/`NotFoundPage` for unknown project or image ids.
- Remove `ImageViewerModal` and its paging code (`advancePending`, `viewerIndex`) from `ImagesPage`; tile click navigates to the editor with the current `sort`/`q` (D-03, P2 D-10).

### Pattern 2: Save contract = replace-set + compare-and-swap (prototype executed)
**What:** `PUT /api/projects/{project_id}/images/{image_id}/annotations` with body `{base_version, is_background, is_reviewed, boxes:[{id,class_id,x,y,w,h}]}`. Response `{version, box_count, status, is_background, is_reviewed}` (no box echo, so the client never remaps ids).
**Server order (each step verified in the prototype, 2026-10-03):**
1. `UPDATE images SET annotation_version = annotation_version + 1 WHERE id = :i AND project_id = :p AND annotation_version = :base` **first** (it takes the SQLite write lock before any read, which also sidesteps the Phase 2 Pitfall 8 read-then-write snapshot hazard). `rowcount != 1` -> rollback, then load the current set: if the payload is **content-equal** to the stored set, return 200 with the current version (a retry whose first attempt succeeded but whose response was lost must not 409); otherwise 409 `"These annotations were changed elsewhere. Reload the image to continue."`.
2. Validate classes: every `class_id` must exist **and belong to this project** (an FK alone does not catch a class of another project). Unknown -> 422 `"Unknown class."`.
3. Diff-apply: delete rows of this image whose id is not in the payload, update rows whose id exists (fields + `position`), insert the rest; an id that already exists under **another** image -> 422.
4. Persist `is_background`/`is_reviewed`; commit. Prototype results: stale base -> `('409', None)`; bad class FK -> rolled back with version unchanged and rows intact; two concurrent saves with base 1 -> `[('ok', 2), ('409', None)]`; `DELETE FROM classes` cascaded annotations to 0.
**Server invariants (422):** not (`is_background` and boxes); not (`is_reviewed` and neither boxes nor background); unique box ids; at most 2000 boxes (a box is about 130-170 bytes of JSON, so 2000 stay under nginx's unchanged 1 MiB `/api/` limit [ASSUMED arithmetic]); `x,y,w,h` finite in [0,1], `w,h > 0`, `x+w <= 1+1e-6`.
**D-15 (demote) lives in the client store**, not in the server: a payload may legitimately carry both an edit and a later explicit "reviewed" press inside one debounce window, so the server cannot infer intent. The server only enforces structure. The **class-delete route** is the one server-side demotion (Pitfall 5).

### Pattern 3: Derived status, grid-order navigation, summary
- `Image.box_count` as `column_property` with a correlated count, exactly like the existing `Project.image_count` [VERIFIED: models.py:137-142 `Project.image_count = column_property(` ... `.correlate_except(Image)` ... `.scalar_subquery()`]. Define it after `Annotation`. **Pitfall 3** (MissingGreenlet) applies to new rows.
- Status in Python: `reviewed` if `is_reviewed`; else `annotated` if `box_count > 0 or is_background`; else `unannotated`. Expose `is_background` separately so the badge can show "background".
- Predicate for SQL (next-unannotated, counts): `is_background = 0 AND NOT EXISTS (SELECT 1 FROM annotations a WHERE a.image_id = images.id)`.
- **Benchmarks** (SQLite 3.49.1, 200k images, 680k annotations, indexes `ix_annotations_image_id`, `ix_annotations_class_id`): list page of 101 with box_count 0.34 ms (newest) / 0.22 ms (name); next-unannotated 0.03 ms; status counts 88 ms; neighbor position count 14 ms; neighbor prev/next 0.03 ms; class object count 2.6 ms. Plans: `SEARCH images USING INDEX ix_images_project_id_id` + `CORRELATED SCALAR SUBQUERY` -> `SEARCH a USING COVERING INDEX ix_annotations_image_id`. A stored `box_count` is unnecessary and unsafe (cascade).
- **Neighbors:** `GET .../images/{image_id}/neighbors?sort=&q=` -> `{position, total, prev_id, next_id}`. Pivot on the current image's own `(filename_key, id)` (or `id`), reuse the Phase 2 keyset predicate and `_scoped` search, `position = count(before pivot) + 1`. Works after a hard reload (the editor cannot rely on the infinite-query cache).
- **Next unannotated:** `GET .../images/next-unannotated?sort=&q=&after=<id>`: first query = unannotated rows strictly after the pivot in grid order; if none, a wrap query = unannotated rows before the pivot (excluding the pivot) in grid order; else `{image_id: null}`. Without `after` (grid "Annotate next") it starts at the top. Edge: if the **current** image is the only unannotated one, the answer is `null`; the message "All images are annotated" is then slightly off (it means "no other") — use an i18n string that covers both.
- **Route order:** literal routes (`next-unannotated`, `status-counts`) must be registered **before** `/{image_id}` routes: executed, with the parametrized route first `GET /p/1/images/next-unannotated` returned **422**; literal first returned 200 and `/images/5` still resolved.
- **Summary:** `GET .../images/status-counts` -> `{total, unannotated, annotated, reviewed, background}`, project-wide (ignores `q`), separate query key `["imageSummary", projectId]`.

### Pattern 4: Saver (serial, coalescing, retrying)
One saver per image, held by the registry (module-level, so a route change does not cancel a pending save). Rules: at most one request in flight (two overlapping requests would carry the same base version and **409 each other**); a `dirty` flag + "latest snapshot wins" (after a success, if the doc changed again, send the latest with the new version); debounce ~400 ms; `flush()` resolves when clean and rejects/returns an error state if the last attempt failed non-retryably; retry only network errors and 5xx with backoff (1 s, 2 s, 4 s, 8 s, cap 15 s, jitter); **never retry 409/404/422**: 409 -> state `conflict` (banner "Changed elsewhere — reload"), 404 -> image deleted, 422 -> refetch classes/annotations and show the plain-English error. Ctrl+S calls `flush()` immediately. A `beforeunload` handler is active while any saver in the registry is dirty or in error. No localStorage draft (deferred idea).

### Pattern 5: Canvas viewport and pointer handling (all facts below executed in Edge 154 unless marked)
- **Coordinates:** image is drawn at natural size at layer origin; the **Stage** carries zoom/pan (`stage.scale`, `stage.position`). `stage.getRelativePointerPosition()` returns **image coordinates** under zoom (jsdom run: pointer (110,90) at scale 2 / offset 10 -> (50,40)).
- **Zoom toward cursor:** with `p = stage.getPointerPosition()`, `anchor = ((p.x - stage.x())/s, (p.y - stage.y())/s)`, new scale `s'`, new position `(p.x - anchor.x*s', p.y - anchor.y*s')`. Put this in a pure `zoomAt(view, pointer, factor, limits)` function and unit-test the invariant "the image point under the cursor does not move" (the Konva docs sandbox page was not reachable this session, so the math is derived, not cited).
- **Pan:** hand-rolled, not `Stage draggable` (left-drag draws; Konva's default drag buttons would fight shape drags). Start on `pointerdown` with `button === 1` or while Space is held; update `stage.position` on move. Call `preventDefault()` on middle-button down (Windows autoscroll) and keep the page non-scrollable (`overflow: hidden`, `100dvh`) [ASSUMED: autoscroll behavior not observable headless].
- **Fit:** `fitScale = min(containerW/imgW, containerH/imgH)`; guard zero-size containers (jsdom and the first ResizeObserver tick report 0 -> Infinity/NaN).
- **Pointer capture is mandatory for drawing:** executed: with no capture, a drag that leaves the stage never fires `pointerup` (log `["move","down"]`, up fired: false); with `stage.content.setPointerCapture(e.evt.pointerId)` on `pointerdown`, `pointerup` fires with coordinates outside the stage (`up@950,700`). Clamp the final point to the image bounds.
- **Transformer under zoom:** anchors stay **11x11 screen px at stage scale 2** (`anchorAbsScale` 1,1); `boundBoxFunc(oldBox,newBox)` receives **absolute screen-space** boxes (dragging the top-left anchor from (250,230) by +20,+10 reported new x=270,y=240); after `transformend` the node keeps `width()` and exposes the change as `scaleX/scaleY` (0.95). With `flipEnabled={false}`, dragging an anchor through the opposite edge yields positive scales (a normalized box on the other side), never negative. Therefore: do the real work in `transformend` (read `width()*scaleX()`, reset scale to 1, `normalizeBox` + clamp + min-size), and use `boundBoxFunc` only as an optional live guard.
- **Move clamp:** in `dragmove` clamp `node.x()/y()` in layer (image) coordinates (zoom-independent), not `dragBoundFunc` (absolute coordinates).
- **Stroke/handle sizes:** `strokeScaleEnabled={false}` on box rects; label `Text` font size = `12 / scale`; set `hitStrokeWidth` so thin borders are grabbable.
- **Layers:** image on its own `listening={false}` layer; boxes + Transformer on a second layer; crosshair guides updated imperatively (refs + `batchDraw`), never through React state per pointer-move.
- **Tool mode:** in the box tool set every `BoxShape` `listening={false}` and `draggable={false}` so a press inside an existing box starts a new draft (D-08); in the select tool restore both.

### Pattern 6: Geometry and coordinates
Store boxes **normalized top-left `x,y,w,h` in [0,1]** relative to the oriented image (matches Konva `Rect`, §7.5, and survives Phase 6 as the polygon's derived bounding rect). Convert at the canvas boundary (`px = n * imgW`). Round to 6 decimals (`normalizeBox`) so JSON round-trips exactly and the server's content-equality check is reliable. Pure functions (all unit-tested): `rectFromDrag(start,end,imgW,imgH)`, `clampBox`, `normalizeBox`, `isTiny(box, scale, minScreenPx)` (discard drags under ~4 screen px, D-08), `toPx/toNorm`, `hitTopmost`.

### Pattern 7: Per-image zundo store + registry
```ts
// Source: executed in scratchpad (zustand 5.0.15 + zundo 2.3.0); API from zundo dist/index.d.ts
import { createStore } from "zustand/vanilla";
import { temporal } from "zundo";

export const createEditorStore = (initial: Doc, serverVersion: number) =>
  createStore<EditorState>()(
    temporal(
      (set) => ({
        doc: initial,
        meta: { serverVersion, saveState: "saved" as const },
        createBox: (box: Box) =>
          set((s) => ({ doc: { ...s.doc, isBackground: false, isReviewed: false, boxes: [...s.doc.boxes, box] } })),
        // moveBox / resizeBox / setBoxClass / deleteBox / toggleBackground / toggleReviewed: ONE set() each = one history entry
        setMeta: (m: Partial<Meta>) => set((s) => ({ meta: { ...s.meta, ...m } })),
      }),
      { partialize: (s) => ({ doc: s.doc }), limit: 100, equality: (a, b) => a.doc === b.doc },
    ),
  );
```
Executed facts: with `partialize` + `equality` a `setMeta` produces **no** history entry (`past after 2 adds + meta change: 2`); **without `equality`, a metadata-only `set` added a history entry** (`no-equality ... 1`); `limit: 3` capped `pastStates` at 3; `undo()` restored the tracked slice and **kept** `meta`; a new action after undo cleared `futureStates`; subscribers fire on undo (so autosave sees undo/redo as ordinary changes, D-10); `pause()/resume()` exist. UI state (tool, selection, active class, hidden ids) lives in a separate untracked store. Registry: `Map<imageId, store>` with LRU (~30 images x 100 snapshots of tiny arrays is negligible). On re-visit compare the retained store's `meta.serverVersion` with the fetched version; if they differ (another tab saved, or a class was deleted) **discard the store and its history**. React 19 `useStore(store, selector)`: selectors must return stable references (Zustand 5) — use `useShallow` for object/array results [CITED: zustand.docs.pmnd.rs/migrations/migrating-to-v5].

### Pattern 8: Grid and class-dialog integration
- `ImageItem`/`ImageRead` gain `box_count`, `is_background`, `is_reviewed`, `status`; the tile fills the existing slot [VERIFIED: ImageTile.tsx:88 `<div className={classes.badgeSlot} data-testid="status-badge-slot" />`]. Summary + "Annotate next" button above the grid.
- After each successful save, patch the edited item in every cached list of the project (`queryClient.setQueriesData`, same pattern as `pruneDeletedImages` in `api/images.ts`) and invalidate `["imageSummary", projectId]`. Give the infinite list a `staleTime` (minutes) so **Back** does not refetch every loaded page (an `useInfiniteQuery` refetch re-requests all pages sequentially).
- `ClassRead.object_count` (correlated count on `ProjectClass`, loaded by the existing `list`/`refresh` calls [VERIFIED: classes.py:51 `return list(result.scalars().all())`, :100 and :146 `await session.refresh(project_class)`]) feeds `DeleteClassModal`, whose body is built in one place for exactly this purpose [VERIFIED: DeleteClassModal.tsx:68-69 comment `"N objects will be deleted" sentence`]. Editor saves invalidate `classKeys.list` lazily (ClassesPage refetches on mount under the default `staleTime` 0).

### Anti-Patterns to Avoid
- **Per-pointer-move React state or store writes** (crosshair, draft box, drag): imperative Konva updates; commit to the store only on release (one gesture = one history entry).
- **Storing `box_count`/"annotated" on `images`:** class deletion cascades annotations at DB level and desyncs it.
- **Server-assigned box ids** returned after save: invalidates ids inside undo snapshots.
- **`crypto.randomUUID()` without a fallback.**
- **Using `useBlocker`** (needs a data router; the app uses `<BrowserRouter>`).
- **Untracked-meta writes without zundo `equality`.**
- **Shortcut matching by `event.key`** (breaks on the RU layout).
- **Stage `draggable` for panning.**
- **Overlapping saves** with the same base version.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resize handles, anchor cursors, flip handling | Custom handle rects | Konva `Transformer` (`flipEnabled={false}`, `rotateEnabled={false}`) | Constant screen-size anchors under zoom and positive-scale normalization verified |
| Undo/redo stack | Custom history array | zundo `temporal` (`limit`, `partialize`, `equality`) | Redo-clearing, limit, pause/resume tested; ~60 KB |
| Concurrency control | Row locks / app-level mutex | `UPDATE ... WHERE annotation_version = :base` rowcount check | Atomic in SQLite and Postgres; prototype proved one winner |
| Status/count caches | Stored counters | Correlated count + `NOT EXISTS` | 0.2-0.3 ms per page at 200k images; cascade-safe |
| Keyset ordering for neighbors/next | New ordering logic | Extract the Phase 2 `(filename_key,id)` / `id` predicate | Must equal the grid order exactly (D-03) |
| Shortcut matching | `keydown` switch on `event.key` | `useHotkeys` with `usePhysicalKeys: true` (`mod+z`, `Digit1`, `KeyV`) | Layout-independent; modifier handling built in |
| Random ids | `Math.random` | `crypto.getRandomValues` (works on insecure origins) shaped as a UUIDv4 | `randomUUID` is secure-context only |
| Canvas in jsdom tests | A hand-written `getContext` stub | `vitest-canvas-mock` | Executed: stage pointer events and `getRelativePointerPosition` work |

**Key insight:** the risky parts are the seams — class-delete cascade vs status, retry vs version conflict, pointer release outside the canvas, browser image decode vs stored dimensions, keyboard layout — not the individual libraries.

## Common Pitfalls

### Pitfall 1: Retry after a lost response returns a false 409
**What goes wrong:** the first PUT succeeded (version N+1) but the response was lost; the retry still carries base N and gets 409 although nothing conflicts.
**How to avoid:** on `rowcount == 0` compare the payload with the stored set; equal -> 200 with the current version. Test it.
**Warning signs:** a "Changed elsewhere" banner appearing right after a network blip with only one tab open.

### Pitfall 2: Overlapping saves conflict with themselves
**What goes wrong:** a second debounce fires while the first request is in flight; both send the same base version.
**How to avoid:** serial saver with coalescing (Pattern 4); one in-flight request per image.

### Pitfall 3: `column_property` on a just-inserted `Image` raises `MissingGreenlet`
**Verified:** after `flush()`+`commit()` (sessionmaker has `expire_on_commit=False`) reading `Project.image_count` raised `MissingGreenlet: greenlet_spawn has not been called`; after `await session.refresh(obj)` it read `0`. The upload route's `ImageRead.model_validate(image)` (images.py around line 226) will now read `box_count`.
**How to avoid:** `await session.refresh(image)` before validating in `ingest_one`, or give the schema field a default and exclude it from attribute loading. Add an upload test asserting `box_count == 0` and `status == "unannotated"` in the response.

### Pitfall 4: Browsers do not agree with the DB about orientation (WebP)
**Verified in Edge 154 (Chromium) with 300x100 files carrying EXIF orientation 6:** JPEG -> `naturalWidth/Height` 100x300 and `drawImage` oriented; PNG -> 100x300 oriented; **WEBP -> 300x100 unrotated** (orientation 6 and 8 ignored). The DB stores Pillow-transposed dimensions for every format (P2 D-17, and Phase 2 verified OpenCV agrees), so for a WebP with orientation 5-8 boxes would be drawn on the wrong pixels. Firefox/Safari were not driven [ASSUMED].
**How to avoid:** in `useLoadedImage` compare `naturalWidth/naturalHeight` with `image.width/height`; on mismatch show a blocking inline error (i18n) and disable drawing. Orientation 3 (180 degrees) keeps the same dimensions and is undetectable this way; see Open Question 1.

### Pitfall 5: Class delete vs reviewed/version
**What goes wrong:** deleting a class cascades its annotations, but images stay `reviewed` and open editors keep a stale version, so a stale tab could silently re-insert boxes of the deleted class (or hit an FK error).
**How to avoid:** in `delete_class`, before deleting the class row: `UPDATE images SET annotation_version = annotation_version + 1, is_reviewed = 0 WHERE id IN (SELECT image_id FROM annotations WHERE class_id = :cid)` in the same transaction (D-15 + D-12). The client also clears all retained histories whose snapshots reference a class that no longer exists (or simply any 422 "Unknown class." -> refetch classes and rebuild the store).

### Pitfall 6: Missing indexes make cascades slow
SQLite does not index child FK columns automatically. Create `ix_annotations_image_id` and `ix_annotations_class_id` in migration `0004` (the plans above depend on them; the class count and class cascade use `class_id`).

### Pitfall 7: Shapes swallow the first press of the next box
In the box tool, a press inside an existing (filled) box is hit-tested by Konva and starts a drag/select instead of a draft. Switch `listening`/`draggable` by tool (Pattern 5).

### Pitfall 8: Russian keyboard layout breaks `event.key` shortcuts
`useHotkeys` matches `event.key` unless `usePhysicalKeys: true` is set per hotkey [VERIFIED: use-hotkeys.mjs:19 `const { preventDefault = true, usePhysicalKeys = false } = options || {};`]. On the RU layout the V key reports `м`. Use physical codes: `["KeyV", …, { usePhysicalKeys: true }]`, digits as `"Digit1"` (the matcher only strips `Key`, so write `digit1`), `mod+KeyZ`, `mod+shift+KeyZ`, `mod+KeyY`. `isExactHotkey` requires exact modifier equality, so redo needs two entries. `?` is Shift+7 on RU: register `shift+Slash` physically **and** a visible "?" button in the top bar.

### Pitfall 9: Focus traps shortcuts
`useHotkeys` ignores events whose target is `INPUT`/`TEXTAREA`/`SELECT` [VERIFIED: use-hotkeys.mjs:12-16 `tagsToIgnore = [` `"INPUT",` `"TEXTAREA",` `"SELECT"`]. A Mantine `Select` (class dropdown in the object list) keeps focus in an input after choosing, so every shortcut goes dead; blur it (or refocus the canvas container) in `onChange`. A focused toolbar/class **button** reacts to Space as a click: `preventDefault` on Space keydown (pan) when the target is not a text field. Guard held keys with `event.repeat` for navigation, delete and tool switches.

### Pitfall 10: Shortcuts fire behind modals
The hook binds on `document.documentElement`, so Delete/N/R keep working while the shortcuts modal, the conflict dialog or the class-create form is open. Pass an empty hotkey list while any modal is open (and stop Space/pan when a text field is focused).

### Pitfall 11: `crypto.randomUUID` missing on LAN http origins
**Verified (Edge, page served from `http://192.168.1.107`):** `isSecureContext: false`, `randomUUID: undefined`, `crypto.getRandomValues` works. MDN: randomUUID "is available only in secure contexts" [CITED: developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID]. Generate a v4 UUID from `getRandomValues` (set version/variant bits) in `lib/ids.ts`; the server pattern validates the shape.

### Pitfall 12: In-app navigation cannot be blocked with `useBlocker`
`BrowserRouter` is not a data router. Route all in-editor navigation (prev/next/N/Back/top-bar links) through one `goTo()` that awaits `saver.flush()` and, on failure, shows a dialog ("Changes could not be saved" with Retry / Leave anyway). The browser Back button cannot be intercepted: the module-level saver keeps retrying after unmount, and `beforeunload` covers tab close/reload.

### Pitfall 13: Existing Phase 2 tests use a strict fetch stub
`ImagesPage.test.tsx` builds `stubFetch` that **throws** on any unexpected path [VERIFIED: ImagesPage.test.tsx `throw new Error(\`Unexpected request: ${url.pathname}\`)`]. Every new request made by the grid (status-counts) breaks those tests until each stub handles it. Files containing the `Unexpected request` guard (grep, 2026-10-03): `ImagesPage.test.tsx`, `ImagesSearch.test.tsx`, `ImagesSelection.test.tsx`, `ImagesDeletePaging.test.tsx`, `UploadFlow.test.tsx`, `UploadDropzone.test.tsx`, `DeleteImagesModal.test.tsx`, `ImageViewerModal.test.tsx` (deleted with the modal), `api/images.test.ts`. Only the ones that render the Images page need the new fixture; consider one shared `stubImagesApi` helper. Budget this explicitly and add the `status-counts` fixture to the shared helper. Baseline this session: backend **314 passed**, frontend **176 passed in 27 files**.

### Pitfall 14: Retained history references stale server state
Returning to an image in the same tab reuses its store (D-10), but another tab may have saved or a class may have been deleted. Compare `serverVersion` on re-entry (Pattern 7) and drop the store when it differs.

### Pitfall 15: Zoom/resize with no container size in tests
`ResizeObserver` is stubbed in `test-setup.ts` (never fires) and jsdom reports 0x0 layout; `fitScale` must tolerate 0 and tests should inject the container size.

## Code Examples

### Verbatim in-repo values the examples rely on
- `backend/src/yolo_trainer_api/routers/images.py:36` — `router = APIRouter(prefix="/api/projects", tags=["images"])`
- `backend/src/yolo_trainer_api/db.py:34-35` — `cursor.execute("PRAGMA busy_timeout=30000")` / `cursor.execute("PRAGMA foreign_keys=ON")`
- `backend/src/yolo_trainer_api/security.py:16` — `if not request.headers.get("x-requested-with", "").strip():`
- `backend/src/yolo_trainer_api/models.py:93` — `{"sqlite_autoincrement": True},` (Image table args); `Image.__tablename__ = "images"` (line 71); `ProjectClass.__tablename__ = "classes"` (line 107)
- `backend/src/yolo_trainer_api/migrations/versions/0003_create_classes.py:17` — `revision: str = "0003"` (new migration is `0004`, `down_revision = "0003"`); head is computed (`migrate.migration_head()`), so `test_migrations.py`/`test_persistence.py` need no edit
- `frontend/src/api/client.ts:24-30` — `"X-Requested-With": "yolo-trainer",` and `if (init?.body !== undefined && !(init.body instanceof FormData)) {` / `headers["Content-Type"] = "application/json";` (so `PUT` JSON bodies already get both headers)
- `schemas.py:160-174` `ImageRead` fields `id, filename (alias original_filename), width, height, size_bytes, created_at`; `schemas.py:144-157` `ClassRead` fields `id, name, color, index (alias position), created_at`

### Migration 0004 (shape)
```python
# Source: style of 0002/0003 in backend/src/yolo_trainer_api/migrations/versions/
def upgrade() -> None:
    for name in ("is_background", "is_reviewed"):
        op.add_column("images", sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("images", sa.Column("annotation_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "annotations",
        sa.Column("id", sa.String(length=36), primary_key=True),          # client-generated UUID
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("images.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="box"),
        sa.Column("x", sa.Float(), nullable=False), sa.Column("y", sa.Float(), nullable=False),
        sa.Column("w", sa.Float(), nullable=False), sa.Column("h", sa.Float(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),               # list/z-order survives reload
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('box', 'polygon')", name="ck_annotations_kind"),
    )
    op.create_index("ix_annotations_image_id", "annotations", ["image_id"])
    op.create_index("ix_annotations_class_id", "annotations", ["class_id"])
```
`kind` already allows `'polygon'` so Phase 6 adds only a nullable `points` column (plain `ADD COLUMN`, no table rebuild); Phase 8's AI flag is likewise an additive nullable/defaulted column. `x,y,w,h` remain the (derived) bounding rect for polygons (§7.4).

### Request validation (verified: NaN -> 422 with the project's error handler)
```python
Unit = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
UUID_V4 = r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"

class BoxIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Annotated[str, Field(pattern=UUID_V4)]
    class_id: int
    x: Unit; y: Unit; w: Unit; h: Unit
# {"x": NaN} -> 422 {"detail":"x: Input should be a finite number"}; a text/plain body -> 422 (FastAPI parses JSON only for application/json)
```

### Compare-and-swap first (prototype shape)
```python
async with sessionmaker() as s:
    r = await s.execute(text("UPDATE images SET annotation_version = annotation_version + 1 "
                             "WHERE id = :i AND project_id = :p AND annotation_version = :base"), {...})
    if r.rowcount != 1:
        await s.rollback()
        # equal payload -> 200 (idempotent retry); else HTTPException(409, "These annotations were changed elsewhere. Reload the image to continue.")
```

### Pointer-captured drawing + zoom-safe normalization (Konva)
```ts
stage.on("pointerdown", (e) => {
  if (tool !== "box" || e.evt.button !== 0) return;
  stage.content.setPointerCapture(e.evt.pointerId);       // REQUIRED: pointerup otherwise lost outside the canvas
  start = stage.getRelativePointerPosition();             // image coordinates under zoom
});
// on pointerup: end = clamp(stage.getRelativePointerPosition()); if (!isTiny(rect, scale, 4)) createBox(...)

onTransformEnd={(e) => {                                   // flipEnabled={false}: scales are positive
  const n = e.target as Konva.Rect; const sx = n.scaleX(), sy = n.scaleY();
  n.scaleX(1); n.scaleY(1);
  commit(normalizeBox(clampBox({ x: n.x(), y: n.y(), w: n.width() * sx, h: n.height() * sy }, imgW, imgH), imgW, imgH));
}}
```

### Collision-free client id
```ts
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));      // randomUUID() is undefined on http://192.168.x.x
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
```

### Proposed shortcut map (planner may adjust; all physical keys)
| Action | Keys | Notes |
|--------|------|-------|
| Select / Box tool | V / B | physical `KeyV`, `KeyB` |
| Class 1-9 (active class, or class of the selected box) | 1-9 | `Digit1`-`Digit9`; >9 classes reachable only via panel/dropdown |
| Delete selected | Delete, Backspace | `preventDefault` stops legacy Backspace navigation |
| Undo / Redo | Mod+Z / Mod+Shift+Z, Mod+Y | two redo entries |
| Prev / Next image | A or ← / D or → | `event.repeat` guard |
| Next unannotated | N | |
| Toggle reviewed / background | R / G | G is a proposal (B is taken); disabled unless valid (reviewed needs annotated; background needs 0 boxes) |
| Save now | Mod+S | flush; `preventDefault` stops the browser save dialog |
| Fit | F or 0 | |
| Deselect / cancel draft | Esc | |
| Pan | hold Space + drag, middle-drag | not in `useHotkeys` (keydown/keyup state) |
| Shortcut reference | `?` (Shift+Slash) and a "?" button | RU layout puts `?` on Shift+7 |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zustand 4 selectors returning fresh objects | Zustand 5: new references loop forever; use `useShallow` | v5 | Selectors in `ObjectList`/`ClassPanel` must be stable |
| Manual-save-primary annotation tools (CVAT, roadmap §7.5) | Autosave per gesture with CAS versioning | D-09 override | Version column + 409 contract is the locked API surface for Phases 6/8 |
| `useBlocker` for unsaved-change guards | Not available under `BrowserRouter` | React Router 6.4+ data routers | Use `flush()`-before-navigate + `beforeunload` |

**Deprecated/outdated:** `react-image-annotate` (roadmap §11.2: do not build on it); `Image.verify()`-style assumptions about browsers honoring EXIF uniformly.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Firefox and Safari handle EXIF orientation for WebP differently from or the same as Chromium (only Edge 154 was driven); the dimension-mismatch guard is browser-agnostic | Pitfall 4 | A guard-less implementation misplaces boxes in some browsers; the guard covers all but orientation 3 |
| A2 | Middle-click autoscroll is prevented by `preventDefault` plus a non-scrollable page | Pattern 5 | Windows users see the autoscroll cursor while panning; fix with an `auxclick`/`mousedown` handler |
| A3 | `vitest-canvas-mock` is a legitimate package (name from training knowledge; executed OK) | Standard Stack | Supply-chain risk; gated by the install checkpoint |
| A4 | A box serializes to ~130-170 JSON bytes, so the 2000-box cap fits nginx's 1 MiB limit | Pattern 2 | Cap too high; lower it or raise `client_max_body_size` for the PUT route |
| A5 | Tuning numbers (debounce 400 ms, backoff 1-15 s, history 100, registry LRU 30, tiny-box threshold 4 screen px, 1 image px minimum) are good defaults | Patterns 4, 6, 7 | UX feel only; adjust in UAT |
| A6 | "Reviewed requires annotated" (server 422, UI disabled otherwise) is the intended semantic of D-13 | Pattern 2 | If an empty image may be marked reviewed, drop the invariant |
| A7 | `G` as the background shortcut and `Mod+Y` as redo do not collide with browser defaults the owner cares about | Shortcut table | Rebind; CONTEXT leaves the map to discretion |
| A8 | Pointer capture on `stage.content` behaves like Chromium in Firefox/Safari (Pointer Events standard) | Pattern 5 | Stuck draft box in a non-Chromium browser |
| A9 | Allowing the box tool in `segment` projects in this phase is acceptable (boxes become 4-point polygons at export per §7.4) | Open Question 2 | Needs a user decision before planning |

## Open Questions

1. **Orientation-3 and other orientation edge cases for WebP**
   - What we know: Chromium ignores EXIF orientation in WebP; dimension comparison detects 5-8 but not 3.
   - What's unclear: whether the owner ever uploads such files.
   - Recommendation: ship the dimension guard now; if it ever triggers, add a server-side oriented preview (re-encode with `exif_transpose`) as a follow-up. Not worth a column today.

2. **What does the editor do for `segment` projects before Phase 6?**
   - What we know: CONTEXT says "box-only for `detect` projects; segment projects get polygons in Phase 6"; §7.4 converts boxes to 4-point polygons at write/export time; ANNO-11 is Phase 6.
   - What's unclear: whether Phase 3 should block segment projects or allow boxes.
   - Recommendation: allow the box tool in all projects (the data model is geometry-agnostic and `kind` is future-proof); Phase 4/9 export must convert for `segment`. Confirm with the owner.

3. **Grid scroll position after Back**
   - Not required (D-01 only guarantees sort/search). Virtuoso supports `restoreStateFrom`; optional polish.

4. **Export forward-note (Phase 4/9):** unannotated images (no boxes, no background flag) must not be exported as empty-label background images; only `is_background` produces an empty `.txt` (ANNO-10).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm | frontend deps, Vitest | Yes | v24.19.0 / 11.17.0 | — |
| uv + Python 3.12 venv | backend tests/prototypes | Yes | 0.12.x / 3.12 | — |
| Docker Desktop | compose smoke (unchanged) | Yes | 29.7.2 | — |
| Microsoft Edge (Chromium 154) | real-browser verification used in this research (puppeteer-core, not a repo dependency) | Yes | 154.0 | manual UAT in any Chromium |
| Real browser automation in CI | gesture/hit-test tests | No | — | manual end-of-phase UAT (`human_verify_mode: end-of-phase`); jsdom + canvas mock for non-hit-test logic |
| Firefox/Safari | cross-browser checks | Not driven | — | manual spot check |

**Missing dependencies with no fallback:** none. Backend needs no new package.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend | pytest (314 tests green at baseline), TestClient over temp-file SQLite + real Alembic (`backend/tests/conftest.py`: `settings`, `make_client`, `client`); image generators in `backend/tests/imaging.py` |
| Frontend | Vitest 5.0.2 + jsdom 30 + Testing Library (176 tests / 27 files green at baseline); `renderWithProviders` in `frontend/src/test/render.tsx`; add `vitest-canvas-mock` import to `test-setup.ts` |
| Config | `backend/pyproject.toml [tool.pytest.ini_options]`; `frontend/vite.config.ts` `test` block |
| Quick run | `uv run pytest backend/tests/<file> -x -q` ; `npm --prefix frontend run test -- --run <pattern>` |
| Full suite | `bash scripts/run_full_suite.sh` |

jsdom + canvas mock capability (executed): react-konva renders; DOM `PointerEvent`s on `stage.content` reach Stage handlers and `getRelativePointerPosition()` returns image coordinates under zoom. **Shape hit-testing does not work** (`getIntersection` -> false, DOM events do not reach shape handlers): select/Transformer/pointer-capture behavior is covered by calling `node.fire(...)` in tests and by manual UAT.

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANNO-07 | PUT replace-set persists, GET returns same set in `position` order, survives app restart | integration | `uv run pytest backend/tests/test_annotations_api.py -x` | Wave 0 |
| ANNO-07 | stale `base_version` -> 409; equal-payload retry -> 200; concurrent same-base -> one winner; failed save leaves version/rows unchanged | integration | `uv run pytest backend/tests/test_annotations_concurrency.py -x` | Wave 0 |
| ANNO-03/07 | validation: NaN/inf, out-of-range, duplicate ids, >2000 boxes, class of another project, background with boxes, reviewed while empty, foreign image/project ids | integration | `uv run pytest backend/tests/test_annotations_api.py -k "invalid or foreign" -x` | Wave 0 |
| ANNO-09 | derived status/box_count in list+detail; upload response `box_count == 0` (MissingGreenlet guard); status-counts; literal-route-before-param ordering | integration | `uv run pytest backend/tests/test_annotations_status.py -x` | Wave 0 |
| ANNO-02/09 | neighbors (prev/next/position/total) and next-unannotated (after, wrap, none, only-current) equal grid order for both sorts and a search filter | integration | `uv run pytest backend/tests/test_annotations_navigation.py -x` | Wave 0 |
| ANNO-10 | background flag lifecycle (set only with no boxes; drawing clears it client-side; server rejects both) | integration | `uv run pytest backend/tests/test_annotations_api.py -k background -x` | Wave 0 |
| ANNO-06 / P2 D-16 | class delete cascades annotations, bumps versions, demotes reviewed images; `object_count` in class list/create/patch | integration | `uv run pytest backend/tests/test_classes_api.py -x` | Exists (extend) |
| ANNO-09 | migration `0004` upgrades a populated `0003` DB; head computed | integration | `uv run pytest backend/tests/test_migrations.py backend/tests/test_persistence.py -x` | Exists (extend) |
| ANNO-03 | geometry: `rectFromDrag`, `clampBox`, `normalizeBox`, `isTiny`, 6-decimal round-trip | unit | `npm --prefix frontend run test -- --run geometry` | Wave 0 |
| ANNO-02 | viewport: `zoomAt` keeps the pointer's image point fixed, limits, `fitScale` with 0-size container, pan | unit | `npm --prefix frontend run test -- --run viewport` | Wave 0 |
| ANNO-07 | store: one entry per action, meta writes add none, limit 100, undo/redo, D-14/D-15 transitions, re-entry version check | unit | `npm --prefix frontend run test -- --run annotationStore` | Wave 0 |
| ANNO-07 | saver: serial + coalescing, debounce, backoff schedule (fake timers), no retry on 409/422/404, flush, beforeunload dirty flag | unit | `npm --prefix frontend run test -- --run annotationSaver` | Wave 0 |
| ANNO-08 | shortcut table: physical-key bindings, modal gating, repeat guard, reference modal lists every binding | unit/component | `npm --prefix frontend run test -- --run shortcuts ShortcutsModal` | Wave 0 |
| ANNO-02/03 | canvas: draw via stage pointer events (incl. capture release outside, tiny discard, clamp), wheel zoom, space-pan (canvas mock) | component | `npm --prefix frontend run test -- --run AnnotationCanvas` | Wave 0 |
| ANNO-02/06/09 | EditorPage: loads set, prev/next awaits flush, N/"All annotated" message, class change, dimension-mismatch error, 409 banner | component | `npm --prefix frontend run test -- --run EditorPage` | Wave 0 |
| ANNO-09 | Grid: URL params for sort/q, badge + box count, summary, "Annotate next", Back preserves params; existing stubs updated | component | `npm --prefix frontend run test -- --run ImagesPage ImageTile` | Exists (update) |
| P2 D-16 | DeleteClassModal shows "N objects will be deleted" (plural en/ru) | component | `npm --prefix frontend run test -- --run DeleteClassModal` | Exists (update) |
| — | en/ru key parity for `editor`, `images`, `classes` | unit | `npm --prefix frontend run test -- --run locales` | Exists (auto) |
| ANNO-03/08 | real hit-testing, Transformer handles, pointer capture, pan feel, RU layout shortcuts, WebP-orientation mismatch, large-image zoom performance | manual UAT | list in VERIFICATION (Edge/Chrome + one other browser) | Manual |

### Sampling Rate
- **Per task commit:** the relevant quick command (one pytest file or one Vitest file).
- **Per wave merge:** `uv run pytest backend/tests -q`, `uv run ruff check backend`, `npm --prefix frontend run test -- --run`.
- **Phase gate:** `bash scripts/run_full_suite.sh` green (includes `npm run build` type-check and the compose smoke), then the manual UAT list, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `backend/tests/test_annotations_api.py`, `test_annotations_concurrency.py`, `test_annotations_status.py`, `test_annotations_navigation.py`; helper to bulk-insert images/annotations (ORM `insert(...)` lists, as in Phase 2's 5000-row helper)
- [ ] `frontend/src/features/editor/lib/{geometry,viewport,shortcuts,ids}.test.ts`, `store/{annotationStore,annotationSaver}.test.ts`, `canvas/AnnotationCanvas.test.tsx`, `EditorPage.test.tsx`
- [ ] `test-setup.ts`: `import "vitest-canvas-mock"`; shared `stubFetch` fixtures for `status-counts`, `neighbors`, `annotations`
- [ ] Framework install: `npm --prefix frontend install konva react-konva zustand zundo && npm --prefix frontend install -D vitest-canvas-mock`
- [ ] Update the existing Images-page tests whose strict fetch stubs throw on unknown paths (Pitfall 13) and delete `ImageViewerModal.test.tsx` with the modal

## Security Domain

ASVS level 1, `security_block_on: high` (from `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-operator, no auth (Phase 0 decision) |
| V3 Session Management | no | no sessions |
| V4 Access Control | partial | every route scopes by `project_id` AND `image_id`/`class_id` (T2-11-01 pattern); class must belong to the image's project; CSRF: JSON `PUT` needs a preflight, and add `Depends(require_xhr)` as defense in depth (cost-free: `apiRequest` always sends `X-Requested-With`) |
| V5 Input Validation | yes | Pydantic `extra="forbid"`, finite floats in [0,1], UUID pattern, list caps, invariants; `allow_inf_nan=False` verified |
| V6 Cryptography | no | UUIDs are identifiers, not secrets (`getRandomValues` fallback) |
| V13 API | yes | plain-English errors; 409 only for version conflict; no stack traces; route order tested |
| V14 Configuration | yes | no new nginx route; the default 1 MiB `/api/` body limit bounds the payload (cap boxes at 2000) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-project write (class or image id of another project) | Tampering / Elevation | Resolve image by `(id, project_id)`; verify every `class_id` belongs to the same project; box id existing under another image -> 422 |
| Lost update from a stale tab | Tampering (integrity) | CAS version; 409; content-equal retry returns 200 |
| Oversized/pathological payload (NaN, huge lists) | Denial of Service | `allow_inf_nan=False`, `max_length=2000`, nginx 1m limit |
| Cross-site JSON write to localhost | Spoofing | JSON `PUT` requires a preflight (no CORS middleware) + `require_xhr` on the new write route (T-02-13-05 posture otherwise unchanged) |
| Stored XSS via class names/filenames in the editor | Tampering | React text rendering only; Konva `Text` draws on canvas; no `dangerouslySetInnerHTML`; CSP unchanged (`img-src 'self'` permits same-origin canvas images) |
| Cascade surprises on class delete | Integrity | single-transaction bump/demote before delete; dialog states "N objects will be deleted" |
| Reused or guessable box ids | Information disclosure | random v4 UUIDs; ids are not secrets and are never authorization |

Add these to `03-SECURITY.md`/the plan threat models; no accepted-risk changes are needed.

## Sources

### Primary (HIGH confidence)
- Repository files read this session: `03-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `02-RESEARCH.md`, `02-SECURITY.md` (threat ids), `docs/roadmap.md` §7.1-7.5, §11.1-11.3, §13.3-13.4, §18; `backend/src/yolo_trainer_api/{models,schemas,main,db,security,errors,migrate}.py`, `routers/{images,classes}.py`, `migrations/{env.py,versions/0002,0003}`, `backend/tests/{conftest,imaging}.py`, `backend/pyproject.toml`; `frontend/package.json`, `tsconfig.json`, `vite.config.ts`, `src/{main,app/App,app/routes,app/AppLayout}.tsx`, `api/{client,images,classes}.ts`, `features/images/{ImagesPage,ImageTile,ImageViewerModal,ImagesToolbar,ImageGrid}.tsx`, `features/classes/{DeleteClassModal,AddClassForm}.tsx`, `features/project/ProjectLayout.tsx`, `test-setup.ts`, `test/render.tsx`, `ImagesPage.test.tsx`; `@mantine/hooks@9.6.3` `use-hotkeys.mjs`/`parse-hotkey.mjs`
- Executed experiments (scratchpad): Edge 154 via puppeteer-core — EXIF orientation across JPEG/PNG/WEBP (`drawImage`, `naturalWidth`, `createImageBitmap`), Konva 10.7.0 Transformer under stage scale 2 (anchor size, `boundBoxFunc` coordinates, `transformend` scale, flip-through drag), pointer-release outside the stage with/without `setPointerCapture`, insecure-origin `crypto` availability; Node — zundo 2.3.0 behavior; vitest 5.0.3 + jsdom 30 + `vitest-canvas-mock` 1.2.0 + react-konva 19.3.0 (pointer events, hit-testing limits); SQLite 3.49.1 benchmarks at 200k/680k rows; SQLAlchemy 2.x async prototypes (CAS update, FK rollback, concurrent saves, cascade, `column_property` MissingGreenlet); FastAPI route-order and pydantic NaN checks; esbuild bundle sizes; `uv run pytest backend/tests` (314 passed) and `vitest run` (176 passed)
- konvajs.org/docs/react/Transformer.html (scale-reset on `transformend`, `boundBoxFunc` contract)
- developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID (secure-context only)
- zustand.docs.pmnd.rs/migrations/migrating-to-v5 (new-reference selectors loop; `useShallow`)

### Secondary (MEDIUM confidence)
- `gsd-tools query package-legitimacy check` output (signals only)

### Tertiary (LOW confidence)
- Items in the Assumptions Log (A1-A9)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions/peer deps from the registry, behavior executed; one dev package name is `[ASSUMED]` and gated.
- Backend architecture: HIGH - the save contract, cascade, concurrency and query plans were prototyped/benchmarked on the pinned SQLite/SQLAlchemy.
- Frontend architecture: MEDIUM-HIGH - Konva/zundo/jsdom behavior executed; gestures that need real hit-testing and non-Chromium browsers are covered by manual UAT.
- Pitfalls: HIGH for the executed ones (WebP orientation, pointer capture, `randomUUID`, MissingGreenlet, route order, `equality`), MEDIUM for autoscroll and Firefox/Safari.

**Research date:** 2026-10-03
**Valid until:** 2026-10-17 (Konva ships roughly weekly: re-run `npm view konva version react-konva version` and re-verify the Transformer/pointer-capture checks at implementation time; the backend findings are stable for 30 days)
