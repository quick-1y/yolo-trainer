# Phase 2: Image Upload & Classes - Research

**Researched:** 2026-09-29
**Domain:** Browser multi-file/folder upload -> FastAPI multipart -> Pillow validation/EXIF/thumbnails -> disk + SQLite; keyset-paginated virtualized image grid; per-project class model
**Confidence:** HIGH for the backend (nearly every claim was executed this session against the pinned stack: Pillow 12.3.0, Starlette 1.7.0, FastAPI 0.141.1, SQLite 3.49.1, opencv-python 5.0.0.93, Ultralytics 8.4.159). MEDIUM for browser-side behavior (folder drop, Virtuoso layout): verified from library source and type definitions, but not driven in a real browser this session.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Carried forward from Phase 1 (still binding)
- Mantine, dark theme only, i18n en/ru with no hardcoded strings (P1 D-01..D-04); API errors are plain English (P1 D-05).
- All data lives in the bind-mounted `./data` folder (P1 D-13); migrations run on api start (P1 D-20).
- The opened project uses a sidebar shell. **Images** and **Classes** entries are added now that they exist (P1 D-11: no placeholders for unbuilt sections).
- Hard delete, no trash (P1 D-10). Case-insensitive unique names via a normalized-name column (P1 D-08 pattern).

### Upload rules
- **D-01:** Accepted formats are **JPG/JPEG, PNG, WEBP and BMP**. The server validates by decoding the file (Pillow), not by extension alone. Any other or corrupt file is rejected with a per-file reason.
- **D-02:** Duplicates are detected by **content hash (SHA-256) within the project**. A duplicate is not stored again and is reported as "already present". The same filename with different content is allowed.
- **D-03:** A per-file size limit of **50 MB**, configurable via `.env`. The nginx `client_max_body_size` (currently 1m) must be raised for the upload route accordingly.
- **D-04:** Progress UI is a **single overall progress panel** ("uploaded N of M"). At the end it shows a summary (added / duplicates / rejected) with an expandable list of rejected files and their reasons. It must stay light with thousands of files: no per-file row rendering during upload, and files are sent in batches or with limited concurrency rather than one giant request.
- **D-05:** Folder upload takes the image files found in the dropped or selected folder (including subfolders). Non-image files are rejected in the report, not silently dropped.

### Image grid
- **D-06:** The grid is virtualized (react-virtuoso per `docs/roadmap.md` §11.3) and backed by a **paginated / cursor-based list API** and **server-generated thumbnails**. Full-resolution images are fetched only in the viewer.
- **D-07:** Each tile shows a **square thumbnail and the truncated filename** (full name in a tooltip). Leave room on the tile for an annotation-status badge (Phase 3+).
- **D-08:** The default sort is **newest uploaded first**, with a toggle to **by filename**.
- **D-09:** Simple **filename search** above the grid, filtered on the server.
- **D-10:** Clicking a tile opens a **full-size viewer modal** with ←/→ navigation (keyboard too), showing filename and dimensions. In Phase 3 the click will open the annotation editor instead.
- **D-11:** **Multi-select** (checkboxes, Shift-click range) plus **delete with confirmation**. Deletion is hard (see D-17).

### Class model
- **D-12:** A class belongs to one project and has a name, a color and a position. Names are **unique per project, case-insensitive** (normalized-name column plus unique index, P1 D-08 pattern).
- **D-13:** Class indices are **always contiguous 0..N-1** in creation order and match the future `names:` list in `data.yaml`. Deleting a class **shifts** the indices of later classes. Future annotations must reference the **class id (primary key), never the index**; the index is computed at export and training time. The UI always shows each class's current index. — **Reversibility:** costly — annotation rows added in Phase 3 depend on referencing class ids; switching to index-based references later would need a data migration.
- **D-14:** **No reordering** in this phase. Classes keep their creation order. A reorder flow (with a warning that indices change) is deferred.
- **D-15:** A new class automatically gets the **next unused color from a fixed high-contrast palette**. The user can change it via presets or a color picker (Mantine ColorInput / ColorPicker).
- **D-16:** Deleting a class uses a confirmation dialog. Once annotations exist (Phase 3+), the dialog states "N objects will be deleted" and deletes them together with the class. In Phase 2 there are no annotations, so a plain confirmation is enough, but the API and schema must be designed so class deletion cascades to annotations later.

### File storage
- **D-17:** Originals are stored **byte-for-byte as uploaded**. Width, height and thumbnails are computed **with EXIF orientation applied** (matching Ultralytics' `exif_size` / `exif_transpose` behavior), so what the user sees and annotates matches what training sees.
- **D-18:** The on-disk layout uses **app-generated ids**: `data/projects/<project_id>/images/<image_id>.<ext>` and `data/projects/<project_id>/thumbs/<image_id>.webp`. The original filename is stored in the DB (for display, search and later export). No user-supplied names appear in filesystem paths. — **Reversibility:** costly — changing the layout later means migrating every stored file on existing installs.
- **D-19:** Deletion is immediate and hard. The DB row is deleted first, then the files. Orphaned files (for example after a crash between the two steps) are cleaned up on startup. **Deleting a project also removes its `data/projects/<id>/` folder**, which extends the Phase 1 project delete.

### Claude's Discretion
- Thumbnail size and format details (a WEBP thumbnail of about 256px on the long side is the expected default), and whether thumbnails are generated synchronously during upload or lazily.
- The exact palette values, and the upload batching and concurrency numbers.
- The API route shapes for images and classes, the cursor format, and the page size.
- Whether image count is shown on the project card and overview now (P1 D-06 left room for it). Include it if cheap.
- Empty states for the Images and Classes sections, and sidebar ordering (suggested: Overview, Images, Classes, Settings).

### Deferred Ideas (OUT OF SCOPE)
- Class reordering (drag & drop with an index-change warning), which belongs with dataset import and model/class compatibility (Phase 9 / model phases).
- Grid filters by tag, annotation status or split, which belong to the later phases that introduce those concepts.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | User can upload images into a project from the browser (multiple files / folder, drag & drop) | Upload pipeline (stage -> hash -> dedup -> Pillow decode -> short txn + rename), FastAPI/Starlette multipart limits, nginx upload location template, `@mantine/dropzone` (file-selector folder traversal) + `webkitdirectory` input, client batching queue |
| ANNO-01 | User can browse project images in a virtualized thumbnail grid that stays responsive with thousands of images | Keyset (cursor) pagination with verified index plans (0.1 ms at 200k rows), server WEBP thumbnails (9 ms/image), `VirtuosoGrid` + `useInfiniteQuery`, immutable caching, `VirtuosoGridMockContext` for tests, seeding script |
| PROJ-03 | User can create, rename, recolor, and delete classes in a project | Class table with stored contiguous `position` exposed as `index`, atomic position assignment, shift-on-delete, id-based FK design for Phase 3 cascade, server-assigned palette color |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `./.claude/CLAUDE.md` (the file's "Conventions" block describes only the legacy root scripts; P1 D-24 already scopes new backend code to English comments + type hints + ruff):

- **GSD workflow enforcement:** do not edit repo files outside a GSD command (`/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`); plans are executed through `/gsd-execute-phase`.
- **Stack pins:** Python 3.12, Ultralytics 8.4.159, PyTorch 2.14.0 (unchanged by this phase). FastAPI + SQLAlchemy/Alembic + SQLite (WAL) backend, Postgres-ready data layer. React + Vite SPA.
- **Deployment:** Docker Compose; the API image must stay torch-free (Pillow is fine); must run on CPU-only hosts.
- **Job execution:** no Redis/Celery in v1 (not touched here; thumbnail generation is done inline in the upload request).
- **Data model:** classes and tags are distinct concepts; one task type per project.
- **Security:** uploaded `.pt` pickle files are trusted-user input only (not a Phase 2 surface); mounted paths must be validated (Phase 9). Image uploads are a new untrusted-bytes surface and must extend, not weaken, the Phase 1 mitigations (CSP, body-size limit, Host allow-list).
- **Hardware:** no NVIDIA GPU on the dev machine (irrelevant to this phase).

## Summary

Phase 2 adds two independent vertical slices on top of the Phase 1 skeleton: **classes** (small, pure CRUD with one subtle invariant: contiguous indices that shift on delete) and **images** (the real engineering: an untrusted-bytes upload pipeline, a disk layout keyed by generated ids, and a grid that stays smooth at thousands of items). Almost every product choice is locked in CONTEXT.md; the research work was proving the mechanics work on the pinned stack and finding the traps that would otherwise surface at execution time.

The backend recommendation is a **stage -> hash -> dedup -> decode -> short-transaction-plus-rename** pipeline: stream each upload once into `data/projects/<pid>/.incoming/` while hashing (so what Pillow validates is exactly the bytes stored), skip decoding for duplicates, decode with `load()` (never rely on `verify()`, which was shown to miss truncated JPEGs), generate a 256px WEBP thumbnail in the same pass, then take the SQLite write lock only for `INSERT` + two `os.replace` renames + `COMMIT`. Ids must be `AUTOINCREMENT` (verified: plain `INTEGER PRIMARY KEY` reuses the max id after delete, which would make an immutable-cached thumbnail URL point at a different image). EXIF handling was verified end-to-end: Pillow's `exif_transpose` size equals the shape that Ultralytics' actual dataloader (`imread` -> OpenCV 5.0.0.93, the version in `uv.lock`) produces for all 8 orientations across JPEG/PNG/WEBP, while Ultralytics' own `exif_size()` helper does not (it only handles JPEG orientations 6 and 8); D-17's "Pillow `exif_transpose` semantics" is the correct target, and the parenthetical "matching `exif_size`" in D-17 is only partially true.

The frontend recommendation is `@mantine/dropzone` (its `file-selector` dependency already implements recursive folder traversal, the 100-entry `readEntries` loop and the synchronous `webkitGetAsEntry` requirement) plus a plain hidden `<input webkitdirectory>` for the folder dialog, a batch queue (<=10 files and <= the byte limit per request, concurrency 3, counts-only progress state), and `VirtuosoGrid` (flex-wrap layout with fixed-size tiles) fed by `useInfiniteQuery` over a keyset cursor API. Two Phase 1 artifacts will silently break the new features and must be fixed first: `apiRequest` forces `Content-Type: application/json` whenever a body exists (breaks `FormData`), and `ProjectLayout`'s active-link logic only understands two sections. A **new CSRF exposure** also appears: `multipart/form-data` is a CORS "simple request" (no preflight), so any web page in the user's browser could POST files to `localhost:8080`; Phase 1's "no CORS middleware" mitigation only covered JSON/PATCH/DELETE. Require a custom request header on the upload route.

**Primary recommendation:** Build classes first (small, proves the migration + router pattern), then the image pipeline backend behind `POST/GET /api/projects/{id}/images` with a required `X-Requested-With` header, then the nginx `envsubst` upload location, then the frontend (fix `client.ts` and `ProjectLayout` first); verify SC2 with a seeded 5000-image project created through the real API by a `scripts/seed_images.py` plus automated keyset/EXPLAIN tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Folder/file selection, drag & drop, extension pre-filter | Browser / Client | — | Only the browser can enumerate a dropped folder (`webkitGetAsEntry`); pre-filtering by extension avoids uploading thousands of non-image files (D-05 report entries are generated client-side) |
| Batching, concurrency, progress, cancel | Browser / Client | — | D-04: counts-only progress, no per-file rows; the client owns the queue |
| Request body cap (whole request) | CDN / Static (nginx) | API | nginx rejects oversize bodies before they reach Python; the API enforces the exact per-file limit |
| Per-file size limit, decode validation, format allow-list, pixel cap | API / Backend | — | D-01/D-03: server is the trust boundary; extension is never trusted |
| SHA-256 dedup | API / Backend | Database (unique index) | Check for speed, `UNIQUE(project_id, sha256)` as the race backstop |
| EXIF-aware width/height + thumbnails | API / Backend | — | D-17: must be computed with Pillow server-side so all clients/annotation see identical dimensions |
| Original + thumbnail storage, orphan cleanup | API / Backend | Database / Storage (`./data`) | D-18/D-19: paths built only from integer ids; startup reconciliation compares DB ids with filesystem |
| Image list (cursor, sort, search) | API / Backend | Database | Keyset queries hit composite indexes; the client never holds unbounded metadata beyond scrolled pages |
| Grid virtualization, selection, viewer modal | Browser / Client | — | Pure rendering concern (react-virtuoso) |
| Class CRUD, index computation, palette assignment | API / Backend | Database | Invariant (contiguous positions, case-insensitive uniqueness) enforced server-side; UI just displays `index` |
| Thumbnail/original delivery + caching | API / Backend | Browser cache | `FileResponse` + `Cache-Control: immutable` (safe only with AUTOINCREMENT ids) |
| CSRF defence for multipart POST | API / Backend | CDN / Static (nginx) | Custom-header requirement on the API; nginx already passes headers through |

## Standard Stack

### Core (new dependencies for this phase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pillow | 12.3.0 (already locked transitively) | Decode/validate, EXIF orientation, thumbnails, WEBP encode | Only mainstream pure-wheel image library; already in `uv.lock` at 12.3.0 with cp312 manylinux x86_64 + aarch64 wheels [VERIFIED: uv.lock lines 491-504]. Must be added as a **direct** dependency of `backend/pyproject.toml` so the torch-free `api` image (`uv sync --frozen --no-dev --package yolo-trainer-backend`) installs it |
| python-multipart | 0.0.32 (latest on PyPI) | FastAPI `UploadFile`/`File()` form parsing | Required by FastAPI for any form/file parameter; **absent from the current `.venv`** (no `python_multipart` in site-packages) and from `uv.lock` (no `name = "python-multipart"` entry) [VERIFIED: directory listing and grep this session]. Starlette imports `python_multipart` [VERIFIED: starlette/formparsers.py:13-20] |
| react-virtuoso | 4.18.15 (latest on npm) | `VirtuosoGrid` virtualized thumbnail grid | Locked by roadmap §11.3; peer deps `react >=16 ... >=19` [VERIFIED: npm view react-virtuoso]. Ships `VirtuosoGridMockContext` for jsdom tests [VERIFIED: package d.ts lines 1421-1433] |
| @mantine/dropzone | 9.6.3 (latest; matches installed `@mantine/core ^9.6.3`) | Drop area + file dialog; folder recursion via `react-dropzone` -> `file-selector` | Same vendor/version line as the rest of the UI; peer deps `react ^19.2.0`, `@mantine/core 9.6.3` [VERIFIED: npm view]. Needs `import "@mantine/dropzone/styles.css"` [VERIFIED: package contains `styles.css`] |

### Already present and reused (no new install)
| Library | Version | Use |
|---------|---------|-----|
| @tanstack/react-query | 5.104.0 | `useInfiniteQuery` for the grid; `useMutation` for classes/delete [VERIFIED: node_modules package.json] |
| @mantine/hooks | ^9.6.3 | `useHotkeys` (viewer ←/→), `useDebouncedValue` (search) [VERIFIED: `useHotkeys` exported in hooks index.d.ts] |
| react-router-dom | 7.18.4 | New `images`/`classes` child routes [VERIFIED] |
| httpx | >=0.28 (dev group) | Seeding script HTTP client and TestClient |
| sqlalchemy 2.0.54 / alembic 1.20 / aiosqlite | as locked | New models + migration `0002` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@mantine/dropzone` | Hand-written `drop` handler with `webkitGetAsEntry` | ~40 lines, no dependency, but you re-implement the `readEntries` 100-per-call loop and the "must call `webkitGetAsEntry` synchronously before any `await`" rule. file-selector already does both [VERIFIED: file-selector 5.0.0 dist/index.js lines 114-178]. Trade-off accepted: file-selector silently drops `.DS_Store` and `Thumbs.db` (`FILES_TO_IGNORE`, line 54) - a deliberate, documented exception to D-05's "not silently dropped" (OS metadata noise, not user content) |
| `VirtuosoGrid` | `react-window` grid / hand-rolled | Roadmap §11.3 locked Virtuoso |
| One request per file | Batches of <=10 files | Per-file requests are simpler but thousands of tiny images pay per-request overhead; batches keep D-04 satisfied. Both fit the same API (response is per file) |
| Stored `position` column | Derive index with `ROW_NUMBER() OVER (ORDER BY id)` | Derived is write-free on delete but D-12 says a class "has a position" and the deferred reorder flow needs a stored order; store it |

**Installation:**
```bash
# backend (from repo root; workspace lock lives at repo root)
# add to backend/pyproject.toml [project].dependencies:
#   "pillow>=12.3,<13", "python-multipart>=0.0.32"
uv lock && uv sync

# frontend
npm --prefix frontend install react-virtuoso @mantine/dropzone
```

**Version verification:** `pip index versions pillow` -> 12.3.0 latest; `pip index versions python-multipart` -> 0.0.32 latest; `npm view react-virtuoso version` -> 4.18.15; `npm view @mantine/dropzone version` -> 9.6.3 (all run 2026-09-29).

## Package Legitimacy Audit

Run with `gsd-tools query package-legitimacy check`. As in Phase 1, the automated checker flags well-known packages `SUS` only for `unknown-downloads` (PyPI exposes no download counts) or `too-new` (a fresh release inside the freshness window). Each was cross-checked: real source repos, multi-million weekly downloads on npm, no postinstall scripts.

| Package | Registry | Latest release | Downloads | Source Repo | Verdict (checker) | Disposition |
|---------|----------|----------------|-----------|-------------|-------------------|-------------|
| pillow | PyPI | 2026-07-01 | n/a (PyPI) | github.com/python-pillow/Pillow | SUS (unknown-downloads) | Approved - already locked at 12.3.0 in `uv.lock` via ultralytics/torchvision; only promoting to a direct dependency |
| python-multipart | PyPI | 2026-06-04 | n/a (PyPI) | github.com/Kludex/python-multipart | SUS (unknown-downloads) | Approved - FastAPI's own documented requirement; Starlette imports it by name |
| react-virtuoso | npm | 2026-09-22 | 3.85M/week | github.com/petyosi/react-virtuoso | SUS (too-new) | Approved - roadmap §11.3 choice; Phase 1 audit already approved; no postinstall |
| @mantine/dropzone | npm | 2026-09-26 | 636K/week | github.com/mantinedev/mantine | SUS (too-new) | Approved - same monorepo/version as installed Mantine packages; no postinstall |
| react-dropzone (transitive) | npm | 2026-09-14 | 15.0M/week | github.com/react-dropzone/react-dropzone | SUS (too-new) | Approved - transitive of `@mantine/dropzone` |
| file-selector (transitive) | npm | 5.0.1 latest (5.0.0 required) | n/a | react-dropzone org | not separately checked | Approved - transitive; source read this session |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged [SUS]:** all of the above by checker signal only (freshness/unknown downloads), each independently confirmed against registry metadata and source repos; no `checkpoint:human-verify` recommended (same posture as Phase 1's approved audit). Installs must go through the lockfiles (`uv.lock`, `package-lock.json`) with `uv sync --frozen` / `npm ci` (T-01-SC).

## Architecture Patterns

### System Architecture Diagram

```
                     ┌────────────────────────── Browser ──────────────────────────┐
 drop folder/files ─►│ Dropzone (file-selector flattens dirs) │ <input webkitdirectory>│
 or file dialog      └───────────────┬─────────────────────────────────────────────┘
                                     ▼
                       classify by extension (client)  ── non-image ─► "rejected" list (client i18n reason)
                                     │ images
                                     ▼
                       planBatches (<=10 files, <= MAX bytes) ─► pool of 3 fetch() workers
                                     │ POST multipart  + X-Requested-With
                                     ▼
              ┌──────────── nginx (web) ────────────────────────────────┐
              │ location ~ ^/api/projects/N/images/?$                   │
              │   client_max_body_size ${MAX_UPLOAD_MB}m  (envsubst)    │
              │   proxy_request_buffering off                           │
              │ other /api/*: client_max_body_size 1m (unchanged)       │
              └───────────────┬─────────────────────────────────────────┘
                              ▼
   ┌───────────────────── api (FastAPI, torch-free) ───────────────────────┐
   │ Starlette parses multipart -> SpooledTemporaryFile (disk if >1 MB)    │
   │ require_xhr header dep ─► 403 if missing                              │
   │ per file (sequential inside the request):                             │
   │   1 size check (>MAX -> rejected)                                     │
   │   2 stream -> data/projects/P/.incoming/<uuid>.tmp  + SHA-256         │
   │   3 SELECT dup by (project_id, sha256)   ── hit ─► "duplicate"        │
   │   4 thread: Pillow open/draft/load/thumbnail/EXIF -> WEBP bytes       │
   │        fail ─► "rejected" (plain-English reason), delete tmp          │
   │   5 write thumb tmp; BEGIN; INSERT image (AUTOINCREMENT id);          │
   │        os.replace(tmp -> images/<id>.<ext>, thumbs/<id>.webp); COMMIT │
   │        IntegrityError(dup race) ─► rollback, unlink, "duplicate"      │
   │ returns {results:[{filename,status,reason,image}]} (request order)    │
   │                                                                       │
   │ GET /images?sort&q&cursor&limit ──► keyset query ──► {items,next,total}│
   │ GET /images/{id}/thumbnail|file ──► FileResponse (immutable cache)    │
   │ POST /images/delete {ids} ─► DELETE rows, commit, then unlink files   │
   │ startup lifespan: migrate ─► reconcile orphans (files ∖ DB rows)      │
   └───────────────┬───────────────────────────────────────────────────────┘
                   ▼
     ./data/app.db (images, classes)   ./data/projects/<pid>/{images,thumbs,.incoming}/

 Grid: useInfiniteQuery(cursor) ─► flat items ─► VirtuosoGrid(endReached=fetchNextPage) ─► <img thumbnail>
 Viewer: Modal + useHotkeys(←/→) over the same flat items; loads /file only for the open image
```

### Recommended Project Structure
```
backend/src/yolo_trainer_api/
├── models.py                 # + Image, Class; Project.image_count/class_count column_property
├── schemas.py                # + ImageRead, ImagePage, UploadResult(s), ClassCreate/Update/Read, ConfigRead
├── settings.py               # + max_upload_mb, max_image_megapixels, thumbnail_size
├── storage.py                # NEW: path builders (ints only), staging, remove_project_dir, reconcile_orphans
├── image_processing.py       # NEW: pure functions, no I/O beyond the file passed in (unit-testable)
├── palette.py                # NEW: CLASS_PALETTE, next_color()
├── security.py               # NEW: require_xhr dependency
├── routers/
│   ├── projects.py           # delete_project also removes data/projects/<id>
│   ├── images.py             # NEW
│   ├── classes.py            # NEW
│   └── config.py             # NEW: GET /api/config
└── migrations/versions/0002_create_images_and_classes.py
backend/tests/                # test_image_processing, test_images_api, test_images_list_api,
                              # test_classes_api, test_storage_cleanup (+ bump "0001" -> "0002")
frontend/src/
├── api/{client.ts (FormData fix), images.ts, classes.ts, config.ts}
├── features/images/{ImagesPage, UploadPanel, UploadReport, ImageGrid, ImageTile, ImageViewerModal, DeleteImagesModal}.tsx
├── features/classes/{ClassesPage, ClassRow, AddClassForm, DeleteClassModal}.tsx
├── lib/{imageFiles.ts (extension classify), uploadQueue.ts (planBatches + runPool)}
└── i18n/locales/{en,ru}/{images,classes}.json   # + project.json nav.images / nav.classes
docker/nginx.conf -> docker/nginx.conf.template   # envsubst
scripts/seed_images.py                            # NEW: seed via the real API
```

### Suggested vertical slicing (mode: mvp; planner decides)
1. Backend foundation: deps + settings + migration `0002` + models + `storage.py` + bump migration-version tests.
2. Classes end-to-end (API + tests, then Classes page): closes PROJ-03 early and proves the router/migration pattern.
3. Image pipeline backend: `image_processing.py`, upload/list/serve/delete routes, project-delete extension, orphan reconcile + tests.
4. Infra: nginx template + compose/.env/Dockerfile.frontend + `client.ts` FormData fix + `require_xhr`.
5. Images UI: upload (dropzone/queue/report) then grid then viewer/select/delete.
6. Verification: `scripts/seed_images.py`, smoke-script extension, manual scroll check.

### Pattern 1: Upload pipeline (stage -> hash -> dedup -> decode -> short txn + rename)
**What:** Copy each `UploadFile` once into a staging file inside the project's `.incoming/` directory while hashing; decide dedup from the hash *before* any decode; decode the *staged file* (so validated bytes == stored bytes); then take the SQLite write lock only around `INSERT` + `os.replace` + `COMMIT`.
**Why the ordering matters:** (a) duplicates skip the decode cost; (b) the write lock is held for microseconds instead of the duration of a 50 MB copy on a slow Docker Desktop bind mount (`busy_timeout` is 30 s [VERIFIED: db.py:34 `PRAGMA busy_timeout=30000`], but concurrency 3 x slow I/O would still serialize); (c) a crash leaves only `.incoming/*` leftovers or an id-named file with no row - both are exactly what the startup reconcile removes (D-19).
**Sketch (assembled from separately verified pieces; not run end to end):**
```python
# routers/images.py (sketch)
@router.post("/{project_id}/images", response_model=UploadResponse, dependencies=[Depends(require_xhr)])
async def upload_images(project_id: int, request: Request, files: list[UploadFile] = File(...),
                        session: AsyncSession = Depends(get_session)) -> UploadResponse:
    await get_project_or_404(session, project_id)
    settings: Settings = request.app.state.settings          # NOTE: main.py must set app.state.settings
    results = []
    for upload in files:
        results.append(await ingest_one(session, settings, project_id, upload))
    return UploadResponse(results=results)

async def ingest_one(session, settings, project_id, upload) -> UploadResult:
    name = clean_filename(upload.filename or "")
    if upload.size == 0:
        return rejected(name, "The file is empty.")
    if upload.size is not None and upload.size > settings.max_upload_bytes:
        return rejected(name, f"The file is larger than {settings.max_upload_mb} MB.")
    staged, sha = await asyncio.to_thread(stage_and_hash, settings, project_id, upload.file)   # copy+sha256, 1 MiB chunks
    try:
        if await find_duplicate(session, project_id, sha):
            return duplicate(name)
        try:
            proc = await asyncio.to_thread(process_image, staged, settings)   # Pillow; raises Rejected
        except Rejected as exc:
            return rejected(name, exc.reason)
        thumb = await asyncio.to_thread(write_thumb_tmp, settings, project_id, proc.thumb)
        image = Image(project_id=project_id, original_filename=name, filename_key=filename_key(name),
                      ext=proc.ext, sha256=sha, size_bytes=upload.size, width=proc.width, height=proc.height)
        session.add(image)
        try:
            await session.flush()                                            # allocates AUTOINCREMENT id
            await asyncio.to_thread(commit_files, settings, project_id, image.id, image.ext, staged, thumb)
            await session.commit()
        except IntegrityError:
            await session.rollback()                                         # dup race OR project deleted mid-upload
            await asyncio.to_thread(discard, thumb)
            return duplicate(name) if await find_duplicate(session, project_id, sha) else project_gone()
        except BaseException:
            await session.rollback()
            await asyncio.to_thread(remove_final_files, settings, project_id, image.id, image.ext)
            raise
        staged = None                                                        # consumed by os.replace
        return added(name, image)
    finally:
        if staged is not None:
            await asyncio.to_thread(discard, staged)
```

### Pattern 2: Pillow processing (validated matrix)
**What:** One pure function: header checks, `draft()` for JPEG, `load()` as the corruption check, thumbnail, EXIF transpose on the *small* image only, WEBP encode. **This exact code was executed against 17 input cases** (RGB/CMYK JPEG, L/P/LA/RGBA/16-bit PNG, 1-bit and RGB BMP, animated WEBP, GIF and TIFF (rejected), 5x5 PNG (rejected), garbage and empty bytes (rejected), JPEG with EXIF orientation 6 (300x100 -> reported 100x300, thumbnail 85x256)).
```python
# image_processing.py - validated in scratchpad proc_test.py
import io
import numpy as np
from dataclasses import dataclass
from PIL import Image, ImageOps

FORMAT_EXT = {"JPEG": "jpg", "MPO": "jpg", "PNG": "png", "WEBP": "webp", "BMP": "bmp"}  # MPO: multi-picture JPEG
MIN_SIDE = 10          # Ultralytics check_image asserts both sides > 9

class Rejected(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason

@dataclass
class Processed:
    ext: str
    width: int      # AFTER EXIF orientation
    height: int
    thumb: bytes    # WEBP

def _webp_ready(im: Image.Image) -> Image.Image:
    if im.mode in ("RGB", "RGBA"):
        return im
    if im.mode in ("I;16", "I;16L", "I;16B", "I", "F"):     # plain convert("RGB") clips 16-bit data
        arr = np.asarray(im, dtype="float64")
        hi = 65535.0 if im.mode.startswith("I;16") else max(float(arr.max()), 1.0)
        return Image.fromarray((arr / hi * 255).clip(0, 255).astype("uint8"), "L").convert("RGB")
    if im.mode in ("LA", "PA") or im.has_transparency_data:
        return im.convert("RGBA")
    return im.convert("RGB")

def process_image(source, *, thumb_size: int, max_pixels: int) -> Processed:
    """`source` is a path or binary file object."""
    try:
        im = Image.open(source)
        fmt = im.format
        if fmt not in FORMAT_EXT:
            raise Rejected("Unsupported image format. Accepted: JPEG, PNG, WEBP, BMP.")
        w, h = im.size                                        # header only, no decode yet
        if min(w, h) < MIN_SIDE:
            raise Rejected(f"The image is too small (minimum {MIN_SIDE}x{MIN_SIDE} pixels).")
        if w * h > max_pixels:                                # deterministic cap; do not rely on Pillow's warning
            raise Rejected("The image has too many pixels.")
        orientation = im.getexif().get(0x0112, 1)
        if fmt in ("JPEG", "MPO"):
            im.draft("RGB", (thumb_size * 2, thumb_size * 2))  # still detects truncation (verified)
        im.load()                                             # FULL decode == corruption check
        if getattr(im, "n_frames", 1) > 1:
            im.seek(0)                                        # animated: first frame (what cv2 reads)
        im = _webp_ready(im)
        im.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS, reducing_gap=2.0)
        if orientation != 1:
            im = ImageOps.exif_transpose(im)                  # cheap: only the small image is transposed
    except Rejected:
        raise
    except Exception as exc:                                  # Pillow raises OSError, SyntaxError, ValueError, ...
        raise Rejected("The file is not a valid image or is corrupt.") from exc
    if orientation in (5, 6, 7, 8):
        w, h = h, w
    out = io.BytesIO()
    im.save(out, "WEBP", quality=80, method=4)
    return Processed(FORMAT_EXT[fmt], w, h, out.getvalue())
```
**Measured:** 640x480 JPEG -> full validate + thumbnail + WEBP encode = **9.2 ms/image**; 12 MP noisy JPEG (9 MB) decode+thumbnail 0.116 s full / 0.084 s with `draft`. Thumbnails of small images are not upscaled (64px stays 64px); the tile CSS uses `object-fit: cover`.

### Pattern 3: Keyset (cursor) pagination
**What:** `newest` = `ORDER BY id DESC` with `id < :cursor` (ids are monotonic thanks to AUTOINCREMENT); `name` = `ORDER BY filename_key, id` with row-value `(filename_key, id) > (:k, :i)`. Cursor is an opaque URL-safe base64 of `{"s": "newest|name", "k": <key>, "i": <id>}`; decode failures or sort mismatches -> `422 "Invalid cursor."`. Search is `filename_key LIKE '%q%' ESCAPE '/'` (SQLAlchemy: `Image.filename_key.contains(q_key, autoescape=True)`).
**Verified on SQLite 3.49.1 with 200,000 rows** (indexes `(project_id, id)`, `(project_id, filename_key, id)`, unique `(project_id, sha256)`):

| Query | Time | Plan |
|-------|------|------|
| newest page (100) | 0.1 ms | `SEARCH ... USING COVERING INDEX ix_images_project_id_id (project_id=? AND id<?)` |
| name-sorted page (100) | 0.1 ms | `SEARCH ... USING COVERING INDEX ix_images_project_name (project_id=? AND filename_key>?)` |
| search + newest | 11 ms | `SEARCH ... USING INDEX ix_images_project_id_id` (leading `%` cannot use an index; fine at this scale) |
| `count(*)` per project | 5.6 ms | covering index scan |
| duplicate lookup | ~0 ms | `uq_images_project_sha` |

Recommended response: `{"items": [...], "next_cursor": str | null, "total": int}`; page size default 100, max 500. `total` is computed each request (cheap; respects the search filter).

### Pattern 4: Class model (contiguous position, id-based references)
**What:** `classes(id AUTOINCREMENT PK, project_id FK ON DELETE CASCADE, name, normalized_name, color CHAR(7), position, created_at)`; **unique** `(project_id, normalized_name)`; **non-unique** index `(project_id, position)`. The API exposes `position` as `index`. Invariant: positions are exactly `0..N-1` within a project.
- **Create:** assign `position` atomically in the INSERT itself: `position = (SELECT COALESCE(MAX(position), -1) + 1 FROM classes WHERE project_id = :p)` (SQLAlchemy accepts a scalar-subquery expression as the attribute value). A separate "count then insert" leaves a race between two requests.
- **Delete:** in one transaction `DELETE` the row, then `UPDATE classes SET position = position - 1 WHERE project_id = :p AND position > :deleted_position`.
- **Do not put a UNIQUE constraint on `(project_id, position)`:** a shifting `UPDATE` violates it mid-statement depending on scan order. In the quick test it happened to work, but SQLite gives no order guarantee [VERIFIED: worked in scratchpad; ordering guarantee ASSUMED absent]. The invariant is enforced by service code + a test.
- **Phase 3 hook (D-13/D-16):** `annotations.class_id` must be `REFERENCES classes(id) ON DELETE CASCADE`; foreign keys are enforced because every connection runs `PRAGMA foreign_keys=ON` [VERIFIED: db.py:35 `cursor.execute("PRAGMA foreign_keys=ON")`]. Never store the index in annotation rows.
- **Color:** server picks the first palette color not currently used in the project (cycling if all used); stored `#RRGGBB` uppercase; Pydantic pattern `^#[0-9A-Fa-f]{6}$` normalized to uppercase; DB `CHECK (length(color) = 7)` (portable).
- **Name rules:** reuse `_validate_project_name` semantics (NFC, trim, no control characters, <=100) and `normalize_project_name` (NFKC + casefold) [VERIFIED: schemas.py:18-31 and models.py:14-16]. Rename to a case-variant of its own name must succeed (the unique index does not conflict with the row being updated).

### Pattern 5: nginx upload location via `envsubst` template
The official `nginx:alpine` image renders `/etc/nginx/templates/*.template` with `envsubst` at start. **Executed this session:** with `-e MAX_UPLOAD_MB=50`, `${MAX_UPLOAD_MB}` became `50m` while `$host` and `$proxy_add_x_forwarded_for` were left untouched and `nginx -T` reported "syntax is ok / test is successful".
```nginx
# docker/nginx.conf.template  (copied to /etc/nginx/templates/default.conf.template)
server {
    listen 80;
    server_tokens off;
    client_max_body_size 1m;            # unchanged default for every other route (T-01-03)
    # ... existing add_header lines (nosniff, X-Frame-Options, Referrer-Policy, CSP) unchanged ...

    # Upload + list collection route only (regex beats the prefix /api/ location)
    location ~ ^/api/projects/[0-9]+/images/?$ {
        client_max_body_size ${MAX_UPLOAD_MB}m;   # nginx "m" = MiB; API limit is MAX_UPLOAD_MB * 1,000,000 bytes
        proxy_request_buffering off;              # stream body to the API; needs proxy_http_version 1.1
        proxy_pass http://api:8000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
    location /api/ { ... unchanged ... }
    location / { ... unchanged ... }
}
```
Rules for the planner: (1) `proxy_set_header` and `add_header` are inherited only if the current level defines none [CITED: nginx.org ngx_http_proxy_module / ngx_http_headers_module], so the new `location` **must repeat every `proxy_set_header`** and **must not define any `add_header`** (it would drop the nosniff/CSP headers). (2) Compose must always pass `MAX_UPLOAD_MB` to the `web` service (`MAX_UPLOAD_MB: ${MAX_UPLOAD_MB:-50}`) and `Dockerfile.frontend` should also `ENV MAX_UPLOAD_MB=50`, otherwise the literal `${MAX_UPLOAD_MB}` reaches nginx and it refuses to start. (3) `Dockerfile.frontend` line 11 currently `COPY docker/nginx.conf /etc/nginx/conf.d/default.conf` must change to the templates path. (4) The API limit is **decimal MB** (`MAX_UPLOAD_MB * 1_000_000`) while nginx `m` is MiB (1,048,576) [ASSUMED: nginx size units; standard], leaving ~4.8% headroom so a file exactly at the limit plus multipart overhead never trips nginx's 413.

### Pattern 6: Startup orphan reconcile (D-19)
Runs in `lifespan` after `run_migrations`, wrapped in try/except (log, never block startup). Algorithm, all in a worker thread:
1. Load `{project_id: {(image_id, ext)}}` from the DB and the set of project ids.
2. For each directory under `data/projects/` whose name is `str(int)`: if the project id is not in the DB -> candidate for removal of the entire directory; else delete `.incoming/*` and any file in `images/` whose name is not `<id>.<ext>` for a DB row, and any file in `thumbs/` whose name is not `<id>.webp` for a DB row.
3. Only touch paths that match the strict patterns (`^\d+$`, `^\d+\.(jpg|png|webp|bmp)$`, `^\d+\.webp$`); never follow symlinks (`os.scandir` + `is_symlink()` skip); ignore everything else.
4. **Safety valve:** if the `projects` table is empty but `data/projects/` contains project directories, log an error and skip destructive cleanup (probable wrong/restored DB, not orphans). Also log counts of removed entries.
Factor the decision as a pure function `find_orphans(db_state, fs_listing) -> list[Path]` so it is unit-testable without touching disk. Note that Phase 1 wrote "no file deletion (D-20)" in the `lifespan` comment [VERIFIED: main.py:25 `# no metadata-level table creation/dropping, no file deletion (D-20).`]; this phase intentionally adds scoped file deletion, so update that comment and the T-02-05 reasoning.

### Pattern 7: Client upload queue (light state, limited concurrency)
```ts
// lib/uploadQueue.ts (sketch)
export function planBatches(files: File[], maxBytes: number, maxFiles = 10): File[][] {
  const batches: File[][] = []; let cur: File[] = []; let bytes = 0;
  for (const f of files) {
    if (cur.length && (cur.length >= maxFiles || bytes + f.size > maxBytes)) { batches.push(cur); cur = []; bytes = 0; }
    cur.push(f); bytes += f.size;
  }
  if (cur.length) batches.push(cur);
  return batches;
}
// runPool: N workers pull the next batch index; per batch build FormData ("files"), await post(),
// aggregate ONLY counters + the rejected[] list (never per-file rows); abort via AbortController.
```
Pre-filter before batching: files that fail the extension allow-list or exceed `max_upload_bytes` go straight to the client-side rejected list (translated reasons, no upload). The server still decodes everything it receives (D-01). Read limits from `GET /api/config` so the client and API cannot drift.

### Pattern 8: VirtuosoGrid + infinite query
```tsx
const q = useInfiniteQuery({
  queryKey: ["images", projectId, sort, search],
  initialPageParam: null as string | null,
  queryFn: ({ pageParam }) => listImages(projectId, { sort, q: search, cursor: pageParam, limit: 100 }),
  getNextPageParam: (last) => last.next_cursor,
});
const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

<VirtuosoGrid
  style={{ height: "calc(100dvh - 220px)" }}          // own scroller: sidebar and toolbar stay put
  data={items}
  computeItemKey={(_, img) => img.id}
  endReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
  increaseViewportBy={{ top: 400, bottom: 800 }}
  listClassName={classes.list}                        // display:flex; flex-wrap:wrap
  itemClassName={classes.item}                        // fixed width/height (e.g. 176x200), flex:none
  itemContent={(index, img) => <ImageTile image={img} ... />}
/>
```
- **Layout:** the official example uses `display: flex; flex-wrap: wrap` with fixed item widths and states items must be equal-sized [CITED: virtuoso.dev/react-virtuoso/virtuoso-grid/grid-responsive-columns]. CSS `grid-template-columns: repeat(auto-fill, minmax(...))` is not shown in the docs and would make the measured item width depend on the container, so avoid it [ASSUMED risk].
- **Scroller:** prefer Virtuoso's own scroller with a computed height (or `customScrollParent`) over `useWindowScroll`; the sidebar shell and sticky toolbar then need no extra CSS, and the modal viewer (an overlay) never unmounts the grid so scroll position is kept. Phase 3 will navigate to an editor route and will need `stateChanged`/`restoreStateFrom` (both exist on `VirtuosoGridProps` [VERIFIED: d.ts]).
- **Tiles:** `React.memo`, `<img src=".../thumbnail" width height decoding="async" style="object-fit:cover">`, native `title=` for the full filename (D-07 "tooltip") - 50+ Mantine `Tooltip` instances per viewport is needless cost. Reserve an absolutely-positioned slot for the Phase 3 status badge.
- **After upload completes:** call `queryClient.resetQueries({queryKey:["images", projectId]})` and scroll to top (invalidating would refetch *every* loaded page sequentially). **After delete:** filter deleted ids out of the cached pages with `setQueryData` and decrement `total`; this is safe because keyset cursors never point at "offset positions".
- **Viewer:** Mantine `Modal` + `useHotkeys([["ArrowLeft", prev], ["ArrowRight", next]])` over the same flat `items`; when `next` reaches the end of the loaded list call `fetchNextPage()`.

### Pattern 9: Seeding a large project (SC2 verification)
`scripts/seed_images.py --base-url http://127.0.0.1:8080 --count 5000 [--project-id N | --name "seed-5000"]` creates unique images with Pillow and uploads them through the **real** upload API (batches of 20, 4 threads). Measured: generating a unique 640x480 JPEG (random background + rectangles + text counter) costs 1.6 ms, average 8 KB, all SHA-256 distinct across 300 samples; server processing ~9 ms/image -> ~1 min for 5000 images. The script needs `httpx` (dev group) and Pillow only; run with `uv run python scripts/seed_images.py`. It doubles as a load test of dedup and the pipeline; run it twice to prove the "already present" path (second run should report 5000 duplicates).

### Anti-Patterns to Avoid
- **`Image.verify()` as the corruption check:** verified to report NO ERROR on a JPEG truncated to half its size; only `load()` raised `OSError: image file is truncated`.
- **Trusting `im.format` == "JPEG" only:** cameras produce multi-picture files that Pillow reports as `MPO`; Ultralytics lists `mpo` in `IMG_FORMATS` [VERIFIED: ultralytics/data/utils.py:36-50 - quote `"mpo",`]. Map MPO -> `.jpg`.
- **Deriving the stored extension from the user's filename:** derive it from the decoded `im.format` (`FORMAT_EXT`), so a PNG named `x.jpg` is stored as `<id>.png` and is loadable by Ultralytics' extension-based scan.
- **Letting Pillow's `DecompressionBombWarning` be the guard:** a 100 MP header opened with only a *warning*; only >179 MP raised. Use your own `w*h` cap before `load()`.
- **Holding the SQLite write lock while copying the original file** (see Pattern 1).
- **`INTEGER PRIMARY KEY` without AUTOINCREMENT for images:** ids get reused (Pitfall 1).
- **`invalidateQueries` on the infinite images query after upload:** refetches all pages.
- **Per-file React state/rows during upload** (violates D-04 and stalls at thousands of files).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Folder traversal from a drop event | Recursive `webkitGetAsEntry` walker | `@mantine/dropzone` (react-dropzone -> file-selector) | `readEntries` returns <=100 entries per call and the DataTransfer is invalidated after the first `await`; file-selector handles both |
| Multipart parsing | Custom body parser | FastAPI `UploadFile` / Starlette form parser (python-multipart) | Spools to disk above 1 MB [VERIFIED: 3 MB part reported `rolled: True`, small parts stayed in memory] |
| Image decoding/format sniffing | Magic-byte checks, extension checks | Pillow `Image.open` + `load()` | Detects truncation, wrong format, bombs; extension is not evidence |
| EXIF orientation | Manual rotate matrices | `ImageOps.exif_transpose` (applied to the small thumbnail) + swap w/h for orientations 5-8 | All 8 orientations verified equal to what the Ultralytics loader yields |
| Virtualization | Manual windowing | `VirtuosoGrid` | Roadmap §11.3 |
| Keyset cursor SQL | OFFSET pagination | `tuple_()` row comparison / `id < :cursor` | OFFSET is O(n) and unstable under concurrent inserts |
| Case-insensitive names | `COLLATE NOCASE` / check-then-insert | `normalized_name` + unique index + `IntegrityError -> 409` (existing Phase 1 pattern) | Postgres-portable, race-free |
| Env-driven nginx limits | sed at container start | nginx image `templates/*.template` envsubst (verified) | Built into `nginx:alpine`; leaves nginx `$vars` alone |
| Color picking UI | Custom picker | Mantine `ColorInput` (`swatches`, `disallowInput`, `onChangeEnd`) | `disallowInput` means only valid hex values can be emitted, removing the partial-hex-while-typing 422 [VERIFIED: `disallowInput` in ColorInput.d.ts; `onChangeEnd` in ColorPicker.d.ts - forwarding by ColorInput is ASSUMED] |

**Key insight:** every hard part of this phase already has a boring, well-tested answer; the risk is in the seams (proxy limits, form-vs-JSON client code, id reuse under caching, WAL write-lock scope), which is where this research spent its verification budget.

## Common Pitfalls

### Pitfall 1: Reused image ids + immutable caching show the wrong thumbnail
**What goes wrong:** delete the highest-id image, upload another, and the browser shows the old cached thumbnail (or a stale file if the delete's file removal failed).
**Why:** SQLAlchemy's `Integer primary_key=True` creates a plain SQLite rowid alias; **verified:** after deleting id 3 the next insert got 3 again, while `AUTOINCREMENT` gave 4.
**How to avoid:** `__table_args__ = {"sqlite_autoincrement": True}` on `Image` (and `Class`) and `sqlite_autoincrement=True` in the `op.create_table` kwargs. **Verified:** renders `id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT` on SQLite and no `AUTOINCREMENT` on the PostgreSQL dialect, so it stays portable. The Phase 1 `projects` table (revision 0001) does not have it; project-dir reuse is harmless because image ids are globally unique and the reconcile removes dirs without a project row.
**Warning signs:** a test that deletes the last image and re-uploads asserts a *new* id.

### Pitfall 2: `client.ts` breaks multipart uploads
**What goes wrong:** the upload POST 422s ("Field required") or the browser sends the wrong boundary.
**Why:** `apiRequest` sets `Content-Type: application/json` whenever a body exists [VERIFIED: client.ts:21-23 quote `if (init?.body !== undefined) {` / `headers["Content-Type"] = "application/json";`]; for `FormData` the browser must set the multipart boundary itself.
**How to avoid:** skip the JSON header when `init.body instanceof FormData` (and add `X-Requested-With` for the CSRF rule). Add a unit test asserting no `Content-Type` header is set for FormData.

### Pitfall 3: `multipart/form-data` POST is a CORS "simple request" (new CSRF path)
**What goes wrong:** any site open in the user's browser can POST arbitrary images to `http://localhost:8080/api/projects/1/images` without a preflight; the response is unreadable but the side effect (disk usage, junk images) happens. `Host` is `localhost`, so the Host allow-list does not block it.
**Why:** `multipart/form-data`, `application/x-www-form-urlencoded` and `text/plain` are the only Content-Types that skip preflight [CITED: developer.mozilla.org CORS guide]. Phase 1's T-09-03 mitigation ("no CORSMiddleware; Host allow-list") relied on JSON/PATCH/DELETE needing a preflight.
**How to avoid:** require a custom header, e.g. dependency `require_xhr` -> `403` unless `X-Requested-With` is present; a custom header forces a preflight that is then denied (no CORS middleware). Do **not** rely on `Sec-Fetch-Site`: it is only sent to "potentially trustworthy" URLs [CITED: developer.mozilla.org Sec-Fetch-Site], i.e. localhost but not a LAN `http://192.168.x.x` opt-in (D-14), which is precisely where exposure matters. JSON POSTs are not affected: FastAPI only parses a JSON body for `application/json`/`+json` Content-Types [VERIFIED: fastapi/routing.py:430-447].

### Pitfall 4: Existing tests hard-code migration head `"0001"`
**What goes wrong:** adding `0002` fails two existing tests.
**Where:** `backend/tests/test_migrations.py:35` (`assert version_row[0] == "0001"`) and `backend/tests/test_persistence.py:118` (`assert rows[0][0] == "0001"`) [VERIFIED by grep + read]. Bump both to `"0002"` (or better, compute the head from the script directory) in the same plan that adds the migration. Also check `scripts/compose_smoke_test.sh` for an alembic head assertion when extending it (grep found none for the literal `0001`).

### Pitfall 5: ProjectLayout's active-link logic supports exactly two sections
**What goes wrong:** with Images and Classes added, "Overview" stays highlighted on every non-settings route.
**Where:** `ProjectLayout.tsx:53` `const isSettingsRoute = location.pathname.endsWith("/settings");` and `:69` `active={section.key === "settings" ? isSettingsRoute : !isSettingsRoute}` [VERIFIED]. Replace with per-section matching (`overview` = exact base path; others = `startsWith(base + "/" + section.to)`), and add `images`, `classes` entries to `SECTIONS` (lines 17-20) with routes in `routes.tsx`.

### Pitfall 6: Starlette parses the *entire* multipart body before your handler runs
**What goes wrong:** an oversize file is fully spooled to `/tmp` before you can reject it; a 1001-file request fails with `400 {"detail":"Too many files. Maximum number of files is 1000."}` [VERIFIED: executed]. FastAPI calls `request.form()` with defaults (`max_files=1000`, `max_part_size=1 MiB` for non-file fields) [VERIFIED: fastapi/routing.py:430 `body = await request.form()`; starlette/requests.py:271-273].
**How to avoid:** nginx's whole-request cap is the real DoS bound; the API check on `upload.size` is the exact per-file rule (cheap: `size` is populated). Keep batches <=10 files so `max_files` is irrelevant. Spooled temp files live in the container's `/tmp`, bounded by concurrency x batch bytes.

### Pitfall 7: Filenames arrive raw and escaped
**What goes wrong:** `a/b\c.jpg` (path separators) reaches the server intact; a `"` in a browser-sent name arrives as the literal text `%22`.
**Verified:** UTF-8 names (`файл 猫.jpg`) round-trip; `a/b\c.jpg` is delivered verbatim; `we"ird.jpg` from the test client arrived as `we%22ird.jpg`; a raw browser-style body with `%22` was not unquoted.
**How to avoid:** `clean_filename()`: replace `%22`/`%0D`/`%0A` (the three sequences browsers percent-encode in multipart filenames [ASSUMED: WHATWG multipart encoding]), take the last path component after normalizing `\` to `/`, NFC-normalize, strip control characters, trim, cap at 255 chars (keep the extension), fall back to `"unnamed"`. The name is display/search data only - filesystem paths are built from integer ids (D-18), so this is hygiene, not the traversal defence. Note `filename_key` for search/sort = `normalize_project_name(name)` (NFKC + casefold).

### Pitfall 8: SQLite/WAL write-lock scope and read-then-write races
**What goes wrong:** (a) copying big files inside the transaction serializes concurrent uploads; (b) computing `position` with a separate SELECT can hand two concurrent creates the same position.
**How to avoid:** Pattern 1's short transaction; Pattern 4's single-statement `INSERT ... (SELECT MAX+1)`. In WAL mode a transaction that reads first and then tries to write can fail immediately with `SQLITE_BUSY_SNAPSHOT` if another writer committed in between (the busy handler does not retry that case) [ASSUMED: SQLite semantics; not reproduced]; Python's sqlite3 legacy mode issues `BEGIN` lazily before the first DML, which usually hides this, but do not depend on it. Add a concurrency test: 20 concurrent class creates -> positions exactly `0..19`, no duplicates.

### Pitfall 9: Ultralytics helpers disagree with the Ultralytics loader on EXIF
**Finding (executed, all 8 orientations x JPEG/PNG/WEBP):** Pillow `exif_transpose` size == the shape from `ultralytics.utils.patches.imread` (OpenCV 5.0.0.93, same version as `uv.lock`) in every case. `ultralytics.data.utils.exif_size` disagreed for JPEG orientations 5 and 7 and for every PNG/WEBP orientation 5-8 because it only swaps for `img.format == "JPEG"` and `rotation in {6, 8}` [VERIFIED: ultralytics/data/utils.py:200-211 - quote `if img.format == "JPEG":` ... `if rotation in {6, 8}:`].
**Implication:** implement D-17 as "Pillow `exif_transpose` semantics" (what training actually loads). Add a regression test that runs the same matrix against `cv2.imdecode` where OpenCV is available (guard with `pytest.importorskip("cv2")`, the API image does not ship it). Phase 9 export/training snapshot should not rely on `exif_size` for the same reason. Also note `check_image` re-saves JPEGs whose last two bytes are not `FFD9` (utils.py:234-239) - relevant only to exported copies, never to stored originals (D-17 byte-for-byte).

### Pitfall 10: Startup cleanup is the first destructive startup action
**Risk:** a wrong or restored `app.db` makes every project directory look orphaned. **Mitigation:** the safety valve and strict path patterns in Pattern 6, plus dry-run logging counts; unit-test `find_orphans` with hostile listings (symlink, odd names, nested dirs).

### Pitfall 11: Deleting a project mid-upload
`INSERT` fails with a foreign-key `IntegrityError` (FKs are on) -> the sketch distinguishes duplicate vs project-gone; `mkdir(parents=True)` may resurrect a just-removed project dir, which the next startup reconcile removes. `get_project_or_404` at request start covers the common case.

### Pitfall 12: Project delete must use settings and touch the disk
`delete_project` currently only does `session.delete(project)` + `commit` [VERIFIED: projects.py:102-106]. It needs `request.app.state.settings` (not currently set - `create_app` keeps `settings` only in its closure [VERIFIED: main.py:18-19,30]), and should `await asyncio.to_thread(shutil.rmtree, project_dir, ignore_errors=False)` **after** the commit inside try/except-log (DB is the source of truth; the reconcile finishes any leftover). DB-level `ON DELETE CASCADE` removes `images`/`classes` rows without ORM relationships.

### Pitfall 13 (forward note, Phase 9): class names in `data.yaml`
Names like `yes`, `no`, `null`, `123` or containing `: `/`#` change meaning if emitted unquoted; the export must use a real YAML dumper. Nothing to build now beyond keeping class-name rules (no control chars) aligned with project names.

## Code Examples

### Migration `0002` (shape; follows the 0001 style)
```python
# Source: pattern from backend/src/yolo_trainer_api/migrations/versions/0001_create_projects.py
def upgrade() -> None:
    op.create_table(
        "images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("filename_key", sa.Text(), nullable=False),
        sa.Column("ext", sa.String(length=4), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("ext IN ('jpg', 'png', 'webp', 'bmp')", name="ck_images_ext"),
        sqlite_autoincrement=True,
    )
    op.create_index("ix_images_project_id_id", "images", ["project_id", "id"])
    op.create_index("ix_images_project_filename_key", "images", ["project_id", "filename_key", "id"])
    op.create_index("uq_images_project_sha256", "images", ["project_id", "sha256"], unique=True)

    op.create_table(
        "classes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.Text(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(color) = 7", name="ck_classes_color_len"),
        sqlite_autoincrement=True,
    )
    op.create_index("uq_classes_project_normalized_name", "classes", ["project_id", "normalized_name"], unique=True)
    op.create_index("ix_classes_project_position", "classes", ["project_id", "position"])
```
Declare `sqlite_autoincrement` on the ORM models as well (`__table_args__ = (..., {"sqlite_autoincrement": True})`) so metadata matches the migration. `PRAGMA foreign_keys=ON` is already set per connection.

### Image count on the project (cheap, verified)
```python
# models.py, after Image is defined - verified: refresh() and plain select() both populate it
Project.image_count = column_property(
    select(func.count(Image.id)).where(Image.project_id == Project.id).correlate_except(Image).scalar_subquery()
)
# schemas.ProjectRead: image_count: int = 0 (and class_count likewise); update the TS `Project` type
```
`create_project`/`update_project` already call `session.refresh(project)` after commit [VERIFIED: projects.py:63, 98], which loads the column property, so `ProjectRead` stays consistent between list/get/create/patch (an existing test compares `fetched.json() == listed_project` [VERIFIED: test_projects_api.py:79]).

### Cursor keyset query
```python
# routers/images.py (sketch)
stmt = select(Image).where(Image.project_id == project_id)
if q_key:
    stmt = stmt.where(Image.filename_key.contains(q_key, autoescape=True))
if sort == "newest":
    if cur: stmt = stmt.where(Image.id < cur.i)
    stmt = stmt.order_by(Image.id.desc())
else:
    if cur: stmt = stmt.where(tuple_(Image.filename_key, Image.id) > tuple_(cur.k, cur.i))
    stmt = stmt.order_by(Image.filename_key, Image.id)
rows = (await session.execute(stmt.limit(limit + 1))).scalars().all()
next_cursor = encode(sort, rows[limit - 1]) if len(rows) > limit else None
```

### Serving files
```python
return FileResponse(path, media_type="image/webp",
                    headers={"Cache-Control": "private, max-age=31536000, immutable"})
# originals: media_type from EXT_MEDIA[ext] ("image/jpeg", "image/png", "image/webp", "image/bmp") - never from the client's name
```
Starlette `FileResponse` sets `last-modified`/`etag`/`accept-ranges` but the responses module contains no `If-None-Match` handling [VERIFIED: grep of starlette/responses.py], so rely on `immutable` (valid only with AUTOINCREMENT ids), not on 304s. Build paths only via `storage.image_path(settings, project_id, image_id, ext)` where `ext` comes from the DB CHECK-constrained column. Optionally regenerate a missing thumbnail from the original in the thumbnail route (self-healing if the size setting changes).

### Smoke-test fixture (verified valid; passes the pipeline)
A 16x16 PNG, 83 bytes, base64: `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGklEQVR42mM8oaHBQApgYiARjGoY1TB0NAAAjC0BOJDndDkAAAAASUVORK5CYII=` (decode with `base64 -d`; note images smaller than 10x10 are rejected, and a 5x5 PNG was verified rejected). Extend `scripts/compose_smoke_test.sh`: upload it with `curl -F "files=@tiny.png" -H "X-Requested-With: smoke"`, upload a text file named `x.jpg` and assert `rejected`, upload the PNG again and assert `duplicate`, `docker compose down/up`, then assert the list still returns 1 image, the thumbnail returns `200 image/webp`, and `data/projects/<id>/images/<id>.png` exists on the host.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Image.verify()` to test files | `load()` (or a full decode) | long-standing Pillow guidance; verified again here | verify() missed a truncated JPEG |
| OFFSET pagination | Keyset/cursor | n/a | 0.1 ms at 200k rows vs O(n) |
| Fixed nginx body size | `envsubst` templates in the official image | nginx image >=1.19 | one `.env` value drives both API and proxy |
| `react-dropzone-esm` | `@mantine/dropzone` 9.x depends on `react-dropzone` 20.1.1 | Mantine 9 | check transitive name if you see old docs |
| Starlette `TestClient` with httpx | Emits `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead` [VERIFIED: seen in prototype run] | Starlette 1.x | Warning only; existing Phase 1 tests already use it; do not act in this phase |

**Deprecated/outdated:** `Image.ANTIALIAS` (use `Image.Resampling.LANCZOS`); `exif_size()` from Ultralytics as an orientation oracle (see Pitfall 9).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | nginx size suffix `m` means MiB (1,048,576) so a decimal-MB API limit leaves headroom | Pattern 5 | A file just under the limit could get an nginx HTML 413; client must still treat a non-JSON 413 as "too large" |
| A2 | Browsers percent-encode only `"`, CR, LF as `%22 %0D %0A` in multipart filenames (WHATWG algorithm) | Pitfall 7 | Display names with literal `%22` would be altered; cosmetic |
| A3 | Folder drop/`webkitdirectory` behavior in Chrome/Firefox/Safari matches file-selector's code paths (library source read, not run in a browser) | Standard Stack | Folder upload edge cases may need a manual browser check |
| A4 | CSS `grid` (auto-fill) layout is unsafe for `VirtuosoGrid`; flex-wrap with fixed tiles is safe (docs example) | Pattern 8 | Grid column math jitter if a different layout is chosen |
| A5 | `ColorInput` forwards `onChangeEnd` from `ColorPicker` props | Don't Hand-Roll | Recolor may PATCH on every drag tick; fall back to firing on popover close |
| A6 | SQLite WAL read-then-write can raise `SQLITE_BUSY_SNAPSHOT` immediately | Pitfall 8 | Extra defensive code unnecessary; the single-statement design is safe either way |
| A7 | No ordering guarantee for `UPDATE ... SET position = position - 1` under a UNIQUE index | Pattern 4 | If actually ordered, a unique constraint would be safe; harmless to omit |
| A8 | The proposed high-contrast palette values are not contrast-validated against the dark theme | Palette below | Some colors may look similar; UI review can adjust the list |
| A9 | Pillow decoders remain an untrusted-input attack surface (keep Pillow current) | Security Domain | Low for a single-operator tool; pin range `>=12.3,<13` and refresh with `uv lock --upgrade-package pillow` |
| A10 | `useFsAccessApi={false}` on `Dropzone` gives uniform behavior across secure/insecure contexts (localhost vs LAN http) | Standard Stack | Dialog behavior may differ on LAN origins; harmless |

Suggested default palette (20 colors, `#RRGGBB`; assumption A8): `#E6194B #3CB44B #FFE119 #4363D8 #F58231 #911EB4 #46F0F0 #F032E6 #BCF60C #FABEBE #008080 #E6BEFF #9A6324 #FFFAC8 #800000 #AAFFC3 #808000 #FFD8B1 #000075 #A9A9A9` (Sasha Trubetskoy's widely used "20 distinct colors"; drop the dark `#000075` and grey `#A9A9A9` if they look weak on the dark theme).

## Open Questions

1. **Should Phase 2 store a relative path (`train/img1.jpg`) or only the basename for folder uploads?**
   - What we know: D-18 stores the original filename in the DB "for display, search and later export"; file-selector provides `file.path` for dropped folders; `webkitRelativePath` exists for the folder input.
   - What's unclear: whether Phase 9 export wants folder provenance (e.g., preserving `train/valid/test`).
   - Recommendation: store the basename only now (matches Roboflow); revisit at Phase 9 with an additive nullable column if needed.

2. **Startup cleanup safety valve wording** (skip cleanup when the `projects` table is empty but project dirs exist).
   - Recommendation: adopt as written (Pattern 6); it is a discretionary safety addition beyond D-19 and the user may prefer stricter/looser behavior.

3. **Bump `projects.updated_at` on uploads/class edits?** The list sorts by `updated_at` (D-12 of Phase 1). Not required by CONTEXT; recommendation: skip in Phase 2 (extra write per batch) unless the owner wants "recently active" ordering.

4. **Real-browser verification of folder drop and grid scrolling** is a manual (`human_verify_mode: end-of-phase`) item; nothing in this environment drives Chrome.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Engine (Desktop) | compose smoke test, nginx template verification | Yes (server running) | 29.7.2 | — |
| `nginx:alpine` image | template/`nginx -T` verification | Yes (pulled/run this session) | current | — |
| Node / npm | frontend build, Vitest | Yes | v24.19.0 / 11.17.0 | — |
| uv | lock/sync | Yes | 0.12.19 | — |
| Python (system) | not used directly | 3.14.7 (ambient) | — | use `uv run` (3.12 venv), as in Phase 1 |
| Pillow in `.venv` | tests | Yes | 12.3.0 (transitive today) | becomes a direct dependency |
| python-multipart in `.venv` | upload routes/tests | **No** | — | add dependency + `uv lock` (blocking until added) |
| OpenCV in `.venv` | EXIF regression test vs loader | Yes | 5.0.0.93 (worker extra) | `importorskip("cv2")`; API image lacks it |
| Ultralytics in `.venv` | source cross-check | Yes | 8.4.159 | — |
| A real browser | folder drop, scroll smoothness | Not drivable here | — | manual end-of-phase check |

**Missing dependencies with no fallback:** none (python-multipart is a pure dependency addition).
**Missing dependencies with fallback:** real-browser checks -> manual verification list.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend | pytest 9.1.1, TestClient over a real temp-file SQLite + real Alembic (fixtures in `backend/tests/conftest.py`: `settings`, `make_client`, `client`) |
| Frontend | Vitest 5 + Testing Library (`renderWithProviders` in `frontend/src/test/render.tsx`; jsdom stubs for `matchMedia`, `ResizeObserver`, `document.fonts` in `test-setup.ts`) |
| Config | `backend/pyproject.toml [tool.pytest.ini_options]`; `frontend/vite.config.ts` `test` block |
| Quick run | `uv run pytest backend/tests -x -q` ; `npm --prefix frontend run test -- --run` |
| Full suite | `bash scripts/run_full_suite.sh` (pytest, ruff check/format, Vitest, build, compose smoke, git-clean check) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | add / duplicate / rejected (corrupt, unsupported, empty, oversize, tiny, too many pixels) reported per file in request order | integration | `uv run pytest backend/tests/test_images_api.py -x` | Wave 0 |
| DATA-01 | decode matrix (modes, MPO, animated, truncated JPEG/PNG, EXIF 1-8 dims, bomb cap) | unit | `uv run pytest backend/tests/test_image_processing.py -x` | Wave 0 |
| DATA-01 | EXIF dims equal OpenCV loader shape | unit | `uv run pytest backend/tests/test_image_processing.py -k cv2 -x` | Wave 0 |
| DATA-01 | on-disk layout `projects/<pid>/images/<id>.<ext>` + `thumbs/<id>.webp`, original bytes identical, no user name in path | integration | `uv run pytest backend/tests/test_images_api.py -k layout -x` | Wave 0 |
| DATA-01 | CSRF header required; cross-origin-style POST without it -> 403 | integration | `uv run pytest backend/tests/test_images_api.py -k xhr -x` | Wave 0 |
| DATA-01 | delete removes rows then files; project delete removes folder; id never reused | integration | `uv run pytest backend/tests/test_images_api.py -k delete -x` | Wave 0 |
| DATA-01 | orphan reconcile (files without rows, `.incoming`, dirs without project, safety valve, symlink) | unit | `uv run pytest backend/tests/test_storage_cleanup.py -x` | Wave 0 |
| DATA-01 | queue batching/concurrency/abort/counters; extension pre-filter; FormData has no JSON Content-Type | unit | `npm --prefix frontend run test -- --run uploadQueue imageFiles client` | Wave 0 |
| DATA-01 | UploadPanel shows "N of M", summary and expandable rejected list | component | `npm --prefix frontend run test -- --run UploadPanel` | Wave 0 |
| ANNO-01 | keyset walk over 5000 seeded rows: no dup/skip in both sorts; search escaping (`%`, `_`); invalid cursor 422; `EXPLAIN QUERY PLAN` uses the composite indexes | integration | `uv run pytest backend/tests/test_images_list_api.py -x` | Wave 0 |
| ANNO-01 | grid renders far fewer DOM tiles than items (using `VirtuosoGridMockContext`), `endReached` fetches next page | component | `npm --prefix frontend run test -- --run ImageGrid` | Wave 0 |
| ANNO-01 | smooth scroll at several thousand images | manual + seed | `uv run python scripts/seed_images.py --count 5000` then scroll; DevTools shows few hundred `<img>` nodes | Wave 0 (script) |
| PROJ-03 | create (auto color, next index), rename (case-variant allowed, duplicate 409), recolor, delete (shift, contiguity), unknown/foreign ids 404 | integration | `uv run pytest backend/tests/test_classes_api.py -x` | Wave 0 |
| PROJ-03 | 20 concurrent creates -> positions 0..19 unique | integration | `uv run pytest backend/tests/test_classes_api.py -k concurrent -x` | Wave 0 |
| PROJ-03 | ClassesPage shows index + color, add/rename/recolor/delete confirm | component | `npm --prefix frontend run test -- --run ClassesPage` | Wave 0 |
| SC4 | images + classes survive app restart (same DATA_DIR); migration head `0002` | integration | `uv run pytest backend/tests/test_persistence.py backend/tests/test_migrations.py -x` | Exists (bump `0001`->`0002`, add restart cases) |
| SC4 | same across `docker compose down/up` | smoke | `bash scripts/compose_smoke_test.sh` | Exists (extend) |
| — | en/ru key parity for new `images`/`classes` namespaces | unit | `npm --prefix frontend run test -- --run locales` | Exists (auto-globs) |

### Sampling Rate
- **Per task commit:** the relevant quick command (`uv run pytest backend/tests/<file> -x -q` or the single Vitest file).
- **Per wave merge:** `uv run pytest backend/tests -q` + `uv run ruff check backend` + `npm --prefix frontend run test -- --run`.
- **Phase gate:** `bash scripts/run_full_suite.sh` green (includes the extended compose smoke), then the manual seeded-scroll and folder-drop checks, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `backend/tests/test_image_processing.py`, `test_images_api.py`, `test_images_list_api.py`, `test_classes_api.py`, `test_storage_cleanup.py`
- [ ] Shared pytest helpers: PNG/JPEG/BMP/WEBP generators with EXIF orientation, truncated-file helper, bulk-insert helper for 5000 rows (ORM `session.execute(insert(Image), rows)`), thread-pool concurrency helper
- [ ] Frontend: `lib/uploadQueue.test.ts`, `lib/imageFiles.test.ts`, `api/client.test.ts` (FormData), `ImageGrid.test.tsx`, `UploadPanel.test.tsx`, `ClassesPage.test.tsx`
- [ ] `scripts/seed_images.py`
- [ ] Framework installs: `uv lock && uv sync` (pillow, python-multipart), `npm --prefix frontend install react-virtuoso @mantine/dropzone`
- [ ] Update `"0001"` assertions (Pitfall 4)

## Security Domain

ASVS level 1, `security_block_on: high` (from `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-operator, no auth (Phase 0 decision) |
| V3 Session Management | no | no sessions |
| V4 Access Control | partial | no users; CSRF defence for the new simple-request POST (`X-Requested-With` dependency) |
| V5 Input Validation | yes | Pydantic (`extra="forbid"`, name rules), Pillow decode validation, allow-listed formats, pixel/size caps, cursor validation |
| V6 Cryptography | minimal | SHA-256 (stdlib `hashlib`) used for dedup only, not security |
| V12 Files & Resources | yes | decode-based validation, generated ids in paths (D-18), fixed served Content-Type + nosniff, size limits (nginx + API), decompression-bomb cap, staged writes + atomic rename |
| V13 API | yes | plain-English errors, method/route allow-list, custom header on multipart POST |
| V14 Configuration | yes | nginx limits per route, `MAX_UPLOAD_MB` from `.env`, existing CSP/Host allow-list untouched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-image / polyglot file disguised by extension | Tampering | Decode with Pillow, allow-list `im.format`, derive stored extension from format, serve with fixed `image/*` type + `X-Content-Type-Options: nosniff` (already set at server level in nginx; new location must not add `add_header`) |
| Decompression bomb (huge pixel dimensions) | Denial of Service | Header-size check `w*h <= max_pixels` before `load()`; global Pillow limit stays as backstop; bounded concurrency |
| Path traversal via filename | Tampering | Filesystem paths built only from integer ids and a CHECK-constrained extension; filename kept as display data and sanitized |
| Stored XSS via filename | Tampering | React text rendering only (existing T-01-04/T-03-03 controls); no `dangerouslySetInnerHTML`; CSP unchanged |
| Cross-site multipart POST to localhost (CORS simple request) | Spoofing / Tampering | Require `X-Requested-With` (forces preflight, denied because no CORS middleware); Host allow-list stays for DNS rebinding |
| Oversize body / disk fill | Denial of Service | nginx per-route `client_max_body_size`, batch caps, per-file API limit; **disk quota is accepted risk** (document in README, log in Accepted Risks) |
| Duplicate-insert race, orphaned file after crash | Integrity | `UNIQUE(project_id, sha256)`, staged write + rename, startup reconcile |
| Reconcile deleting real user data after DB loss | Tampering / DoS (data loss) | Strict path patterns, no symlink following, safety valve, unit tests on hostile listings |
| Unauthorized read of other origins' images | Information Disclosure | Cross-origin `<img>` can load but not read; Host allow-list blocks rebinding; LAN exposure remains governed by D-14 warning |
| Malicious `.pt` pickle | Elevation of Privilege | Not a Phase 2 surface (Phase 7); unchanged |

Add these to `02-SECURITY.md`/the plan threat models; T-01-03's mitigation text ("nginx `client_max_body_size 1m`") must be amended to "1m except the upload route" [VERIFIED: nginx.conf:4 quote `client_max_body_size 1m;`].

## Sources

### Primary (HIGH confidence)
- Repository files read this session: `docker/nginx.conf`, `docker/Dockerfile.{backend,frontend}`, `docker-compose.yml`, `.env.example`, `backend/pyproject.toml`, `uv.lock`, `backend/src/yolo_trainer_api/{models,db,main,settings,schemas,errors,migrate}.py`, `routers/projects.py`, `migrations/{env.py,versions/0001_create_projects.py}`, `backend/tests/{conftest,test_migrations,test_persistence,test_projects_api}.py`, `frontend/src/{main.tsx,api/client.ts,api/projects.ts,app/routes.tsx,features/project/*,i18n/*,test/*}`, `frontend/package.json`, `docs/roadmap.md` §7.1/§11.3, Phase 1 `01-RESEARCH.md`/`01-SECURITY.md`
- Executed experiments (scratchpad): Pillow decode/thumbnail/EXIF matrix, truncation and bomb behavior, OpenCV vs Pillow vs Ultralytics EXIF comparison, SQLite keyset plans at 200k rows, AUTOINCREMENT reuse, cascade delete, SQLAlchemy `sqlite_autoincrement` DDL and `column_property`, FastAPI 0.141.1 multipart behavior (UTF-8/escaped names, spooling, 1001-file limit), nginx `envsubst` template validation in `nginx:alpine`
- Installed package sources: `ultralytics/data/utils.py` (8.4.159), `starlette` 1.7.0 (`requests.py`, `formparsers.py`, `responses.py`), `fastapi` 0.141.1 (`routing.py`), `react-virtuoso@4.18.15` d.ts, `@mantine/dropzone@9.6.3` d.ts, `file-selector@5.0.0` dist
- nginx docs: ngx_http_headers_module, ngx_http_proxy_module (fetched)
- MDN: CORS simple-request Content-Types; `Sec-Fetch-Site` (fetched)
- virtuoso.dev grid responsive-columns page (fetched)

### Secondary (MEDIUM confidence)
- `gsd-tools query package-legitimacy check` output (signals only; supplemented by registry metadata)

### Tertiary (LOW confidence)
- Items in the Assumptions Log (A1-A10)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions and peer deps checked against registries; new packages pass the same audit posture as Phase 1.
- Architecture (backend): HIGH - pipeline pieces executed against the pinned stack; only the assembled endpoint is a sketch.
- Architecture (frontend): MEDIUM - library APIs verified from type definitions/source; layout and folder-drop behavior not driven in a browser.
- Pitfalls: HIGH for the executed ones (verify() truncation, id reuse, EXIF mismatch, filename delivery, multipart limits); MEDIUM for SQLite BUSY_SNAPSHOT and nginx unit semantics.

**Research date:** 2026-09-29
**Valid until:** 2026-10-29 (Ultralytics/Mantine/Virtuoso ship weekly; re-run `npm view`/`pip index versions` for the four new packages at implementation time)
