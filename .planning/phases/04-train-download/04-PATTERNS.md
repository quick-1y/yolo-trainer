# Phase 4: Train & Download - Pattern Map

**Mapped:** 2026-10-05
**Files analyzed:** 41 (new/modified)
**Analogs found:** 38 / 41 (all analog paths verified git-tracked via `git ls-files`)

Note: `.planning/codebase/` is stale; analogs come from the live tree under `backend/src/`, `backend/tests/`, `frontend/src/`, `docker/`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/src/yolo_trainer_api/migrations/versions/0005_training.py` | migration | CRUD | `migrations/versions/0004_create_annotations.py` | exact |
| `backend/src/yolo_trainer_api/models.py` (+`Image.split`, `TrainingRun`, `TrainedModel`) | model | CRUD | same file (`Image`, `ProjectClass`) | exact |
| `backend/src/yolo_trainer_api/schemas.py` (+`ImageRead.split`, `SplitRequest`, `RunCreate`, ...) | model/schema | request-response | same file (`ImageDeleteRequest`, `ImageRead`, `ProjectRead`) | exact |
| `backend/src/yolo_trainer_api/splits.py` | utility | transform | `annotations.py` (pure helpers + SQL clauses) | role-match |
| `backend/src/yolo_trainer_api/routers/splits.py` | route | request-response | `routers/images.py` `delete_images` | exact |
| `backend/src/yolo_trainer_api/routers/runs.py` | route | CRUD / request-response | `routers/images.py`, `routers/projects.py` | role-match |
| `backend/src/yolo_trainer_api/routers/models.py` (download) | route | file-I/O | `routers/images.py` (`FileResponse`, `_IMMUTABLE_CACHE_CONTROL`) | role-match |
| `backend/src/yolo_trainer_api/routers/projects.py` (guarded delete, counts) | route | CRUD | same file `delete_project` | exact |
| `backend/src/yolo_trainer_api/training/catalog.py` | config | transform | none (static allow-list) | no analog |
| `backend/src/yolo_trainer_api/training/labels.py` | utility | transform | `annotations.py` pure helpers; RESEARCH "Label rows" | partial |
| `backend/src/yolo_trainer_api/training/snapshot.py` | service | file-I/O + batch | `storage.py` (`commit_files`, `remove_project_dir`) + `annotations.py` (UPDATE-first tx) | role-match |
| `backend/src/yolo_trainer_api/training/service.py` | service | CRUD | `annotations.py` (CAS transaction) | role-match |
| `backend/src/yolo_trainer_api/storage.py` (+runs/models dirs, reconcile) | utility | file-I/O | same file | exact |
| `backend/src/yolo_trainer_api/main.py` (include routers, startup reconcile) | config | event-driven | same file `_cleanup_orphans`, `include_router` | exact |
| `backend/src/yolo_trainer_common/quality.py` (+`quality_level`) | utility | transform | same file | exact |
| `backend/src/yolo_trainer_common/progress.py` | utility | transform | `yolo_trainer_common/device.py` | role-match |
| `backend/src/yolo_trainer_worker/main.py` (supervisor loop, heartbeat thread) | service | event-driven | same file | exact |
| `backend/src/yolo_trainer_worker/queue.py` | service | CRUD (sync) | `yolo_trainer_api/db.py` pragmas (sync variant) | partial |
| `backend/src/yolo_trainer_worker/supervisor.py` | service | streaming (JSONL tail) | `worker/main.py` (`write_heartbeat`, signal handling) | partial |
| `backend/src/yolo_trainer_worker/train_job.py` | service | event-driven | `spikes/train_worker_spike.py` (not tracked-checked; see Metadata), `train_yolo.py` | partial |
| `backend/tests/test_splits_api.py`, `test_runs_api.py`, `test_models_download.py`, `test_snapshot.py`, `test_auto_split.py` | test | request-response | `tests/test_images_delete_api.py` | exact |
| `backend/tests/test_worker.py` (+heartbeat key `active_run_id`) | test | unit | same file | exact |
| `backend/tests/test_migrations.py` (+`0004 -> head`) | test | unit | same file | exact |
| `docker-compose.yml` (worker `depends_on`, `shm_size`, env) | config | n/a | same file | exact |
| `frontend/src/api/splits.ts`, `training.ts`, `models.ts` | service (client) | request-response | `frontend/src/api/images.ts` | exact |
| `frontend/src/features/training/TrainingPage.tsx` | component | CRUD list | `features/classes/ClassesPage.tsx` | role-match |
| `frontend/src/features/training/NewRunPage.tsx` | component | request-response | `features/projects/CreateProjectModal.tsx` (form + submit lock) | role-match |
| `frontend/src/features/training/RunPage.tsx` | component | polling | `features/images/ImagesPage.tsx` + `useQuery` | partial |
| `frontend/src/features/training/ActiveRunIndicator.tsx` | component | polling | `features/editor/EditorTopBar.tsx` `SaveIndicator` | partial |
| `frontend/src/features/training/{RunStatusBadge,DatasetSummary}.tsx` | component | transform | `EditorTopBar.tsx` `STATUS_BADGE` | role-match |
| `frontend/src/features/images/{SplitMenu,SplitChip,AutoSplitDialog}.tsx` | component | request-response | `features/images/SelectionBar.tsx`, `DeleteImagesModal.tsx` | role-match |
| `frontend/src/features/images/SelectionBar.tsx`, `ImageTile.tsx`, `ImagesToolbar.tsx` (modify) | component | request-response | same files | exact |
| `frontend/src/features/editor/EditorTopBar.tsx` (modify: split selector, indicator) | component | request-response | same file | exact |
| `frontend/src/features/project/ProjectLayout.tsx` (modify `SECTIONS`) | component | n/a | same file | exact |
| `frontend/src/features/project/DeleteProjectModal.tsx` (modify) | component | request-response | same file | exact |
| `frontend/src/app/routes.tsx`, `AppLayout.tsx` (modify) | config | n/a | same files | exact |
| `frontend/src/i18n/locales/{en,ru}/training.json` (+additions) | config | n/a | `locales/en/images.json` | exact |
| frontend tests (`*.test.tsx`, stub helpers) | test | n/a | `features/images/ImagesSelection.test.tsx`, `src/test/editorApi.ts` | role-match |

## Pattern Assignments

### `0005_training.py` (migration, CRUD)

**Analog:** `backend/src/yolo_trainer_api/migrations/versions/0004_create_annotations.py`

Header and revision chain (lines 9-20):
```python
from __future__ import annotations
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
```
For 0005 use `revision = "0005"`, `down_revision = "0004"`.

Column add with check, table, FK cascade and index-per-FK-column (lines 27-72):
```python
op.add_column("images", sa.Column("is_background", sa.Boolean(), nullable=False, server_default=sa.false()))
op.create_table(
    "annotations",
    sa.Column("image_id", sa.Integer(), sa.ForeignKey("images.id", ondelete="CASCADE"), nullable=False),
    ...
    sa.CheckConstraint("kind IN ('box', 'polygon')", name="ck_annotations_kind"),
)
# SQLite does not index child FK columns on its own
op.create_index("ix_annotations_image_id", "annotations", ["image_id"])
```
Downgrade uses `batch_alter_table` to drop columns (lines 79-82). Use it for `images.split` and its CHECK. Follow RESEARCH "Migration 0005 shape" (status CHECK must include all 7 values incl. `cancelled`; `sqlite_autoincrement=True`; unique index `(project_id, normalized_name)`).

---

### `models.py` (model, CRUD)

**Analog:** same file, `Image` / `ProjectClass` (lines 64-130).

Column + CheckConstraint + Index + autoincrement style (lines 76-108):
```python
project_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
)
is_background: Mapped[bool] = mapped_column(
    Boolean, nullable=False, default=False, server_default=false()
)
__table_args__ = (
    CheckConstraint("ext IN ('jpg', 'png', 'webp', 'bmp')", name="ck_images_ext"),
    Index("ix_images_project_id_id", "project_id", "id"),
    Index("uq_images_project_sha256", "project_id", "sha256", unique=True),
    {"sqlite_autoincrement": True},
)
```
Rules to copy: no ORM `relationship()` (FK cascade removes rows), `DateTime(timezone=True)` with `default=utcnow`, `normalized_name` via `normalize_project_name` for run-name uniqueness (lines 28-30). `Image.split`: `Mapped[str | None] = mapped_column(String(5), nullable=True)` plus `CheckConstraint("split IN ('train','valid','test')", name="ck_images_split")` and `Index("ix_images_project_split", "project_id", "split")`.

---

### `routers/splits.py` (route, request-response)

**Analog:** `backend/src/yolo_trainer_api/routers/images.py` `delete_images` (lines 366-396) and its imports (lines 12-36).

Imports/router (lines 12-36):
```python
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from sqlalchemy import ColumnElement, Select, delete, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from yolo_trainer_api.db import get_session
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.security import require_xhr
router = APIRouter(prefix="/api/projects", tags=["images"])
```
Core pattern (lines 366-386): project-scoped id list, `dict.fromkeys` dedupe, scope tuple `(Image.project_id == project_id, Image.id.in_(ids))`, commit.
```python
@router.post("/{project_id}/images/delete", response_model=ImageDeleteResult)
async def delete_images(project_id: int, body: ImageDeleteRequest, request: Request,
                        session: AsyncSession = Depends(get_session)) -> ImageDeleteResult:
    await get_project_or_404(session, project_id)
    ids = list(dict.fromkeys(body.ids))
    scope = (Image.project_id == project_id, Image.id.in_(ids))
```
For split: `update(Image).where(*scope).values(split=body.split)` only; never touch `annotation_version`/`is_reviewed`/`is_background` (D-02). Add `dependencies=[Depends(require_xhr)]` as at `images.py:259` and `annotations.py:199`. Auto-split 409 text: "The set of unassigned images changed. Review the split again."

Request schema analog (`schemas.py:318-323`):
```python
class ImageDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: list[int] = Field(min_length=1, max_length=1000)
```

---

### `training/snapshot.py` and `training/service.py` (service, file-I/O + CRUD)

**Analog 1 (consistent-read transaction):** `annotations.py` docstring (lines 1-13): the first statement of the transaction is a write so the SQLite lock is taken before any read. For snapshot: `INSERT` run row, `flush()`, then the three SELECTs, then `commit()`.
```python
UPDATE images SET annotation_version = annotation_version + 1
WHERE id = :image AND project_id = :project AND annotation_version = :base
```
Reuse `unannotated_clause()` (lines 41-51) for D-04 exclusions:
```python
def unannotated_clause() -> ColumnElement[bool]:
    return and_(Image.is_background.is_(False), Image.is_reviewed.is_(False),
                ~exists().where(Annotation.image_id == Image.id))
```
Error constants style (lines 31-34): module-level `*_DETAIL` strings, plain English.

**Analog 2 (file layout, safe paths):** `storage.py`.
- Id-only paths (lines 27-46): `settings.projects_dir / str(int(project_id))`, `image_path(...)` is the hard-link source.
- Atomic publish (line 110): `os.replace(staged, final_image)`.
- Safe recursive delete (lines 119-132), copy for `remove_run_dir`:
```python
target = project_dir(settings, project_id)
if target.parent != settings.projects_dir:
    raise ValueError(f"Refusing to remove {target}: not a direct child of the projects root")
if target.is_symlink():
    raise ValueError(f"Refusing to remove {target}: it is a symbolic link")
if not target.exists():
    return
shutil.rmtree(target)
```
Hard link with copy fallback: `try: os.link(src, dst) except OSError: shutil.copy2(src, dst)` (no existing analog, from RESEARCH Pattern 3). Blocking I/O goes through `asyncio.to_thread` as in `images.py:391`.

---

### `storage.py` additions (utility, file-I/O)

**Analog:** same file. Add `runs_dir/run_dir/models_dir/model_path/weights_dir` next to `project_dir` (lines 27-32). Extend orphan reconcile (`scan_projects_root`, `find_orphans`, `_remove_orphan`, `reconcile_orphans`, lines 170-296), keeping its canonical-id regexes (lines 203-213) and the empty-table safety valve (lines 277-287):
```python
if not project_ids and numbered:
    logger.error("Skipping orphan cleanup: ...")
    return 0
```
Wire into `main.py::_cleanup_orphans` (lines 28-37), which swallows exceptions so startup never blocks.

---

### `routers/projects.py` (modify: guarded delete, counts)

**Analog:** same file `delete_project` (lines 108-121):
```python
project = await get_project_or_404(session, project_id)
await session.delete(project)
await session.commit()
try:
    await asyncio.to_thread(remove_project_dir, request.app.state.settings, project_id)
except Exception:
    logger.exception("Could not remove the folder of deleted project %s", project_id)
```
Change to the guarded `DELETE ... AND NOT EXISTS (active runs)`, 409 if `rowcount == 0`; collect run/model ids before deleting. 409 style: `HTTPException(status_code=409, detail="...")` (lines 65-68). `ProjectRead` (schemas.py:92-101) gains `run_count`, `model_count`, `active_run_count` the same way `image_count`/`class_count` are derived (`column_property` in `models.py`, imports `column_property, select, func` already there).

---

### `routers/models.py` (download route, file-I/O)

**Analog:** `routers/images.py` (imports `FileResponse`, `_IMMUTABLE_CACHE_CONTROL` at line 43; file/thumbnail routes). Path derived from integer id only (`storage.model_path`), `FileResponse(path, filename=safe_name, media_type="application/octet-stream")`. Sanitizing function per RESEARCH Pattern 8 (NFKC, `[^\w.-]` -> `_`, strip leading dots, 120 chars).

---

### `yolo_trainer_worker/main.py` (modify: supervisor loop)

**Analog:** same file.
- `WorkerSettings` (lines 34-51): pydantic-settings, `populate_by_name=True`, `Field(validation_alias=...)`. Add `db_path`, `sqlite_journal_mode`, poll interval here, not by importing api `Settings`.
- Atomic JSON write (lines 83-93): reuse for `job.json`/`result.json`/`error.json`:
```python
tmp_path = path.with_name(f".{path.name}.tmp-{os.getpid()}")
tmp_path.write_text(json.dumps(payload), encoding="utf-8")
os.replace(tmp_path, path)
```
- `build_heartbeat` (lines 63-80): exact key set; add `active_run_id` (update `test_worker.py:39-48` set assertion).
- `run(settings, stop_event, device_probe, versions)` (lines 117-136): `stop_event.wait(interval)` loop; move to a thread, main thread runs the supervisor.
- Signals (lines 139-145): SIGTERM/SIGINT set `stop_event`; supervisor must terminate the process group and mark `interrupted` within `stop_grace_period: 20s`.
- `--healthcheck` path avoids importing torch (lines 158-159); keep it.
- Staleness check `is_heartbeat_fresh(path, 60)` (lines 96-114): reuse in the api for the "stale heartbeat -> interrupted" rule and the device options.

---

### `worker/queue.py`, `worker/supervisor.py`, `worker/train_job.py`

No tracked in-repo analog for the DB-poll queue or subprocess supervisor. Use RESEARCH Patterns 5-7 (claim SQL, `Popen(..., start_new_session=True)`, JSONL tail by byte offset consuming only `\n`-terminated lines, `jsonable()` recursive serializer, `pending` flag for the final `on_fit_epoch_end`). For the engine pragmas copy `yolo_trainer_api/db.py:22-36` (`journal_mode`, `synchronous=NORMAL`, `busy_timeout=30000`, `foreign_keys=ON` via `apply_sqlite_pragmas`) on a sync engine. `train_job` is a new subprocess entry; it must never open the DB. Legacy orchestration reference: root `train_yolo.py` / `finetune_yolo.py` (device parsing, model existence check raising `FileNotFoundError`).

---

### `yolo_trainer_common/quality.py` (modify)

**Analog:** same file (thresholds 0.90 / 0.75 / 0.60, lines 13-20). Add `quality_level(map50) -> "excellent|good|fair|poor"` and rebuild `quality_assessment` on top of it, keeping its Russian strings (existing `tests/test_quality.py`).

---

### Backend tests

**Analog:** `backend/tests/test_images_delete_api.py` (lines 1-50): real app, real SQLite file, `TestClient` and `Settings` fixtures from `conftest.py`, helpers imported from `.test_images_api` (`create_project`, `make_png`, `upload`), small `_delete(client, project_id, payload)` wrappers, assert on status and JSON, check files via `storage.*_path(...).exists()`. Worker tests: `test_worker.py` (fixed `ComputeDevice`, fixed timestamps, no real torch, no sleeping).

---

### Frontend: `api/splits.ts`, `api/training.ts`, `api/models.ts`

**Analog:** `frontend/src/api/images.ts`.
- Imports (lines 1-10): TanStack Query hooks, `apiRequest` from `./client`, `projectKeys` from `./projects`.
- Key factory (lines 105-115): `imageKeys`-style objects; give `trainingKeys` their own roots so list-cache helpers don't touch them.
- Hook pattern (lines 177-188): `useQuery({ queryKey, queryFn, enabled })`. For polling use `refetchInterval: (q) => active(q.state.data?.status) ? 3000 : false`.
- Mutation + cache sync (lines 329-379): JSON `apiRequest(path, { method: "POST", body: JSON.stringify(...) })`; use `setQueriesData` to patch cached image lists for a bulk split (do not invalidate loaded infinite pages); invalidate `imageKeys.summary(projectId)`, `projectKeys.all`, `projectKeys.detail(projectId)`.
- Batch constant mirrors backend bound (lines 325-327): add `SPLIT_BATCH_SIZE = 1000` with the same comment.
- Types: extend `ImageItem` (lines 13-20) with `split: "train" | "valid" | "test" | null`. Download is a plain `<a href="/api/models/{id}/download" download>`, URL helper like `thumbnailUrl` (lines 248-255).

---

### `SelectionBar.tsx` (modify: split action) and `SplitMenu/SplitChip/AutoSplitDialog`

**Analog:** `frontend/src/features/images/SelectionBar.tsx` (whole file, 24 lines):
```tsx
import { Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
interface SelectionBarProps { count: number; onClear: () => void; onDelete: () => void; }
export function SelectionBar({ count, onClear, onDelete }: SelectionBarProps) {
  const { t } = useTranslation("images");
  return (
    <Group gap={8} mb="md" mih={36}>
      <Text fw={500}>{t("selection.count", { count })}</Text>
      <Button variant="subtle" onClick={onClear}>{t("selection.clear")}</Button>
      <Button variant="light" color="red" onClick={onDelete}>{t("selection.delete")}</Button>
    </Group>
  );
}
```
Add an `onSplit(split)` prop and a Mantine `Menu` button. Confirm dialog analog: `DeleteImagesModal.tsx` (counts dialog); `AutoSplitDialog` follows it (preview counts, confirm, 409 handling). No hardcoded strings; keys in `locales/{en,ru}/images.json`.

---

### `EditorTopBar.tsx` (modify: split selector + indicator)

**Analog:** same file. Badge map (lines 19-24) for color/glyph per state; fixed-width status slot pattern `SaveIndicator` (lines 29-70) with `role="status"`, `aria-live`. Split selector must not touch the annotation store/saver (no `annotation_version` bump); mutate via the split API and patch the cached `imageKeys.detail`. `ActiveRunIndicator` is mounted here as well as in `AppLayout` because the editor route is outside `AppLayout` (`routes.tsx:40-47`).

---

### `ProjectLayout.tsx`, `routes.tsx`, `DeleteProjectModal.tsx` (modify)

- `ProjectLayout.tsx` lines 18-23: insert `{ key: "training", to: "training", labelKey: "project:nav.training" }` before `settings`. Active matching (lines 57-60) already handles prefix paths for `training/new` and `training/:runId`.
- `routes.tsx` lines 51-56: add `<Route path="training" .../>`, `training/new`, `training/:runId` inside the `ProjectLayout` route. Lazy-loading pattern at lines 15-17 is only needed for heavy pages.
- `DeleteProjectModal.tsx`: add warning text with `run_count`/`model_count` (line 81 area) and show the 409 message through the existing `apiErrorMessage` Alert (lines 75-93).

---

### Frontend forms and pages (`NewRunPage`, `TrainingPage`, `RunPage`)

**Analogs:** `features/projects/CreateProjectModal.tsx` (submit-lock ref pattern, as used in `DeleteProjectModal.tsx:27-48`: `isSubmittingRef` blocks rapid repeat submit), `features/classes/ClassesPage.tsx` (list page with query states: `isPending` -> `common:loading`, `isError` -> red `Alert` with `ApiError.message`, as in `ProjectLayout.tsx:37-50`). Visual design is governed by `04-UI-SPEC.md`.

---

### Frontend tests

**Analog:** `features/images/ImagesSelection.test.tsx`, `src/test/editorApi.ts`, `src/test/render.tsx`, `src/test/fixtures.ts`. Strict fetch stubs throw on unknown URLs: add `GET /training/active` to the shared stub helpers in the same plan as `ActiveRunIndicator`.

## Shared Patterns

### Project-scoped route guard and 404
**Source:** `routers/projects.py:30-39`
**Apply to:** all new project-scoped routes
```python
async def get_project_or_404(session, project_id):
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project
```

### Write-route CSRF defense in depth
**Source:** `security.py` `require_xhr`, applied as `dependencies=[Depends(require_xhr)]` (`images.py:259`, `annotations.py:199`)
**Apply to:** split, auto-split, run create, run delete routes. JSON bodies use `ConfigDict(extra="forbid")`.

### Plain-English errors, constants for details
**Source:** `annotations.py:31-34`, `routers/projects.py:65-68`
**Apply to:** all new `HTTPException`s (409 conflicts, 422 for task-type mismatch, "No GPU is available.").

### Rows first, files after, errors logged not raised
**Source:** `images.py:373-396`, `projects.py:114-121`
**Apply to:** project delete with runs/models, run removal, snapshot cleanup. Blocking I/O via `asyncio.to_thread`; a failed file removal is logged and left to the startup reconcile.

### Safe filesystem paths
**Source:** `storage.py:27-46, 119-132, 248-265`
**Apply to:** `data/runs/<id>`, `data/models/<id>.pt`, `data/weights/`. Paths from integers only; refuse symlinks/junctions and non-direct children; never take a path from the client.

### Atomic file writes
**Source:** `worker/main.py:83-93`
**Apply to:** `job.json`, `manifest.json`, `result.json`, `error.json`, `data.yaml`.

### SQLite pragmas
**Source:** `yolo_trainer_api/db.py:22-36`
**Apply to:** the worker's sync engine (`busy_timeout=30000`, `foreign_keys=ON`, WAL, `synchronous=NORMAL`).

### Frontend cache sync and i18n
**Source:** `api/images.ts:329-379`, `useTranslation("images")` usage in `SelectionBar.tsx`
**Apply to:** all new components: patch caches in place, invalidate summary/project keys, every string through i18n in both `en` and `ru`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/src/yolo_trainer_api/training/catalog.py` | config | static allow-list | Nothing similar; 20 official names per RESEARCH Standard Stack |
| `backend/src/yolo_trainer_worker/queue.py` | service | DB-polled FIFO claim | No queue exists; use RESEARCH claim SQL |
| `backend/src/yolo_trainer_worker/supervisor.py` | service | subprocess + JSONL tail | No subprocess management exists; use RESEARCH Patterns 5/6 and `docs/phase-0-decisions.md` |
| `backend/src/yolo_trainer_worker/train_job.py` | service | Ultralytics callbacks | Only the legacy root scripts and the Phase 0 spike exist; use RESEARCH Pattern 6 |
| `backend/src/yolo_trainer_api/training/labels.py` | utility | transform | Pure, new; use RESEARCH "Label rows" and "data.yaml" excerpts |

## Metadata

**Analog search scope:** `backend/src/yolo_trainer_api`, `backend/src/yolo_trainer_common`, `backend/src/yolo_trainer_worker`, `backend/tests`, `frontend/src/{api,app,features,test}`, `docker/`
**Tracked-source gate:** every analog path above appears in `git ls-files backend frontend/src docker`; none is a gitignored mirror. `spikes/train_worker_spike.py` and root `train_yolo.py` were not opened and not verified; confirm with `git ls-files` before citing.
**Files scanned:** about 20 read, about 200 listed
**Pattern extraction date:** 2026-10-05
