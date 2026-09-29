# Phase 2: Image Upload & Classes - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can fill a project with images from the browser (multiple files or a whole folder, drag & drop or file dialog) and browse them in a virtualized thumbnail grid that stays smooth with several thousand images. The user can also define the project's class list: create, rename, recolor and delete classes, each with an index and a color. Uploaded images and classes survive a service restart. Requirements: DATA-01, ANNO-01, PROJ-03.

Out of this phase: annotation (Phase 3), YOLO dataset import, mounted-folder import and export (Phase 9), splits (Phase 4), tags, and dataset statistics (Phase 10).

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data model & format constraints
- `docs/roadmap.md` §7.1 — Classes vs. tags; class index = position in `names:`; reorder/delete is a re-indexing operation.
- `docs/roadmap.md` §7.2 — Per-project task type; relevant to how classes relate to future labels.

### Image browser
- `docs/roadmap.md` §11.3 — react-virtuoso grid, server-generated thumbnails, paginated/cursor listing API.

### Project-level
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria and notes.
- `.planning/REQUIREMENTS.md` — DATA-01, ANNO-01, PROJ-03.
- `.planning/phases/01-runnable-skeleton-projects/01-CONTEXT.md` — Phase 1 decisions carried forward (UI stack, data dir, delete semantics, naming uniqueness).
- `.planning/phases/01-runnable-skeleton-projects/01-SECURITY.md` — Existing threat mitigations (CSP, body-size limit, Host allow-list) that upload handling must extend, not weaken.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/yolo_trainer_api/routers/projects.py`: the CRUD router pattern (get_project_or_404, 409 conflict handling via normalized name) to mirror for classes and images.
- `backend/src/yolo_trainer_api/models.py`: the `normalize_project_name` (NFKC + casefold) approach, reusable for class-name uniqueness.
- `backend/src/yolo_trainer_api/schemas.py`: Pydantic `extra="forbid"` and the name validation rules (NFC, trim, control characters).
- `backend/src/yolo_trainer_api/settings.py`: `DATA_DIR` handling and `validate_data_dir`, the base for the `projects/<id>/` storage root and the new upload-size setting.
- `frontend/src/api/client.ts` and `projects.ts`: the fetch client and TanStack Query hooks pattern for new images and classes hooks.
- `frontend/src/features/project/ProjectLayout.tsx`: the sidebar sections, where Images and Classes are added.
- `frontend/src/features/project/DeleteProjectModal.tsx`: the confirmation modal pattern.
- i18n namespaces in `frontend/src/i18n/locales/{en,ru}/`: add new namespaces (for example `images`, `classes`).

### Established Patterns
- Alembic migrations only (no `create_all`), ORM-only queries, and a Postgres-portable schema.
- The React text-only rendering and CSP (`img-src 'self' data: blob:` already allows local object URLs and previews).
- pytest tests against a temp-file SQLite, Vitest + Testing Library for components, and a compose smoke test that should be extended with an upload + restart persistence check.

### Integration Points
- nginx `docker/nginx.conf`: `client_max_body_size 1m` must be raised (at least for the upload location) to match D-03.
- The project delete endpoint must also remove the project's data folder (D-19).
- The API image stays torch-free. Use Pillow for decode, EXIF handling and thumbnails (a new backend dependency, and it must go through the supply-chain check like other deps).

</code_context>

<specifics>
## Specific Ideas

- Roboflow-like feel for the grid and upload flow (the owner's reference tool). The success criterion requires smooth scrolling on a seeded project with several thousand images, so a seeding script or fixture is needed for verification.

</specifics>

<deferred>
## Deferred Ideas

- Class reordering (drag & drop with an index-change warning), which belongs with dataset import and model/class compatibility (Phase 9 / model phases).
- Grid filters by tag, annotation status or split, which belong to the later phases that introduce those concepts.

</deferred>

---

*Phase: 02-image-upload-classes*
*Context gathered: 2026-09-29*
