# Phase 2: Image Upload & Classes - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 46 (new/modified)
**Analogs found:** 38 / 46 (all analog paths verified git-tracked via `git ls-files`)

Note: the project `.claude/CLAUDE.md` "Conventions" block describes the legacy root scripts only. The Phase 1 platform code (backend/src/yolo_trainer_api, backend/tests, frontend/src, docker/) is the real analog source. New backend code: English comments, type hints, `from __future__ import annotations`, ruff. New UI strings go through i18n (en + ru), no hardcoded text. API errors are plain English `{"detail": str}`.

## File Classification

### Backend

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/pyproject.toml` (+pillow, +python-multipart) | config | - | itself | modify |
| `backend/src/yolo_trainer_api/settings.py` (+max_upload_mb, max_image_megapixels, thumbnail_size) | config | - | itself (modify) | exact |
| `backend/src/yolo_trainer_api/models.py` (+Image, +Class) | model | CRUD | `models.py::Project` | exact |
| `backend/src/yolo_trainer_api/migrations/versions/0002_create_images_and_classes.py` | migration | batch | `migrations/versions/0001_create_projects.py` | exact |
| `backend/src/yolo_trainer_api/schemas.py` (+Class*, Image*, Upload*, ConfigRead) | schema | request-response | `schemas.py::Project*` | exact |
| `backend/src/yolo_trainer_api/routers/classes.py` | router | CRUD | `routers/projects.py` | exact |
| `backend/src/yolo_trainer_api/routers/images.py` | router | file-I/O + CRUD + request-response | `routers/projects.py` (CRUD/409/404 part only) | role-match |
| `backend/src/yolo_trainer_api/routers/config.py` | router | request-response | `main.py::health` + `routers/projects.py` | partial |
| `backend/src/yolo_trainer_api/routers/projects.py` (delete also removes project dir) | router | CRUD + file-I/O | itself (modify `delete_project`, L102-106) | exact |
| `backend/src/yolo_trainer_api/main.py` (include routers, `app.state.settings`, orphan reconcile in lifespan) | config | event-driven | itself | exact |
| `backend/src/yolo_trainer_api/storage.py` | utility | file-I/O | `settings.py::validate_data_dir` (L63-86) | partial |
| `backend/src/yolo_trainer_api/image_processing.py` | utility | transform | `yolo_trainer_common/quality.py` (pure function style) | partial |
| `backend/src/yolo_trainer_api/palette.py` | utility | transform | `yolo_trainer_common/quality.py` | partial |
| `backend/src/yolo_trainer_api/security.py` (`require_xhr` dependency) | middleware | request-response | `db.py::get_session` (FastAPI dependency shape) + `errors.py` (plain-English detail) | partial |
| `backend/tests/test_classes_api.py`, `test_images_api.py`, `test_images_list_api.py` | test | request-response | `tests/test_projects_api.py` | exact |
| `backend/tests/test_image_processing.py`, `test_storage_cleanup.py` | test | transform / file-I/O | `tests/test_quality.py`, `tests/test_persistence.py` | role-match |
| `backend/tests/test_migrations.py` (bump `"0001"` to `"0002"`, assert new tables) | test | batch | itself L35 | exact |
| `scripts/seed_images.py` | utility | batch | none | none |

### Infra

| File | Role | Data Flow | Analog | Match |
|---|---|---|---|---|
| `docker/nginx.conf` -> `docker/nginx.conf.template` | config | request-response | `docker/nginx.conf` | exact |
| `docker/Dockerfile.frontend` (COPY to `/etc/nginx/templates/default.conf.template`, `ENV MAX_UPLOAD_MB=50`) | config | - | itself L11 | exact |
| `docker-compose.yml` (`web.environment.MAX_UPLOAD_MB`, `api.environment.MAX_UPLOAD_MB`) | config | - | `api.environment` block L12-15 | exact |

### Frontend

| File | Role | Data Flow | Analog | Match |
|---|---|---|---|---|
| `frontend/src/api/client.ts` (FormData fix + `X-Requested-With`) | utility | request-response | itself L19-28 | exact |
| `frontend/src/api/classes.ts` | service (query hooks) | CRUD | `api/projects.ts` | exact |
| `frontend/src/api/images.ts` (useInfiniteQuery list, upload, delete) | service (query hooks) | CRUD + file-I/O | `api/projects.ts` | role-match |
| `frontend/src/api/config.ts` | service | request-response | `api/projects.ts::useProjects` | exact |
| `frontend/src/features/project/ProjectLayout.tsx` (add Images, Classes; fix active logic) | component | request-response | itself | exact |
| `frontend/src/app/routes.tsx` (add `images`, `classes` routes) | config | - | itself L16-19 | exact |
| `frontend/src/features/classes/ClassesPage.tsx` | component | CRUD | `features/project/ProjectSettingsPage.tsx` | role-match |
| `frontend/src/features/classes/{ClassRow,AddClassForm}.tsx` | component | CRUD | `ProjectSettingsPage.tsx` (form/validation/ApiError) | role-match |
| `frontend/src/features/classes/DeleteClassModal.tsx`, `features/images/DeleteImagesModal.tsx` | component | CRUD | `features/project/DeleteProjectModal.tsx` | exact |
| `frontend/src/features/images/{ImagesPage,UploadPanel,UploadReport,ImageGrid,ImageTile,ImageViewerModal}.tsx` | component | streaming / file-I/O | `ProjectSettingsPage.tsx` (page shell, outlet context, Alert) | partial |
| `frontend/src/lib/{imageFiles,uploadQueue}.ts` | utility | transform / batch | `frontend/src/lib/relativeTime.ts` (+ `.test.ts`) | partial |
| `frontend/src/i18n/locales/{en,ru}/{images,classes}.json`, `project.json` (+nav.images, nav.classes) | config | - | `i18n/locales/en/project.json` | exact |
| `*.test.tsx` for new components | test | request-response | `features/project/DeleteProjectModal.test.tsx` | exact |

## Pattern Assignments

### `models.py` additions: `Image`, `Class` (model, CRUD)

**Analog:** `backend/src/yolo_trainer_api/models.py` (`Project`, L14-47).

**Normalization + column style** (L14-16, L23-41):
```python
def normalize_project_name(name: str) -> str:
    return unicodedata.normalize("NFKC", name).strip().casefold()

class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (
        CheckConstraint("task_type IN ('detect', 'segment')", name="ck_projects_task_type"),
        Index("uq_projects_normalized_name", "normalized_name", unique=True),
    )
    def set_name(self, raw: str) -> None:
        self.name = unicodedata.normalize("NFC", raw).strip()
        self.normalized_name = normalize_project_name(raw)
```
Adaptations for Class/Image:
- Reuse `normalize_project_name` for `Class.normalized_name`; add `Class.set_name` mirroring `Project.set_name`. The unique index becomes composite `Index("uq_classes_project_normalized_name", "project_id", "normalized_name", unique=True)`.
- `project_id` FK: `ForeignKey("projects.id", ondelete="CASCADE")`. FKs are enforced (`db.py` L35 `PRAGMA foreign_keys=ON`), so project delete cascades to classes/images rows.
- `Image` and `Class` need AUTOINCREMENT (RESEARCH Pitfall 1): `__table_args__` include `{"sqlite_autoincrement": True}` (as the last tuple element, a dict). Project does NOT have it, do not copy that part.
- Class color: `CheckConstraint("length(color) = 7", name="ck_classes_color")`; non-unique `Index("ix_classes_project_position", "project_id", "position")` (NO unique on position, RESEARCH Pattern 4).
- Image indexes: `(project_id, id)`, `(project_id, filename_key, id)`, unique `uq_images_project_sha (project_id, sha256)`.
- Phase 3 hook: future `annotations.class_id` references `classes.id ON DELETE CASCADE` (D-13/D-16); never store index.

### `migrations/versions/0002_create_images_and_classes.py` (migration)

**Analog:** `migrations/versions/0001_create_projects.py` (L1-45).

**Header / revision chain** (L9-20):
```python
from __future__ import annotations
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "0001"          # new file: "0002"
down_revision: str | None = None  # new file: "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
```
**Core** (L23-45): `op.create_table(... sa.CheckConstraint(..., name=...))`, then `op.create_index(name, table, cols, unique=True)`; `downgrade()` drops indexes then tables in reverse. For 0002 pass `sqlite_autoincrement=True` to `op.create_table` for `images` and `classes`; use `sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE")`. Migrations only, never `create_all`. Keep schema Postgres-portable.

### `schemas.py` additions (schema, request-response)

**Analog:** `backend/src/yolo_trainer_api/schemas.py`.

**Name validator reuse** (L18-31, L47): `_validate_project_name` + `ProjectName = Annotated[str, AfterValidator(...)]` is exactly the NFC/trim/no-control-chars/<=100 rule from RESEARCH Pattern 4 for class names. Reuse `ProjectName` directly (or alias `ClassName = ProjectName`).

**Request model + partial update** (L51-81):
```python
class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ProjectName
class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ProjectName | None = None
    @model_validator(mode="before")
    @classmethod
    def _reject_task_type_and_null_name(cls, data): ...
```
Copy for `ClassCreate` (name, optional color) and `ClassUpdate` (name/color optional; reject explicit null name via same before-validator; router uses `model_fields_set`). Color: `Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")]` + AfterValidator uppercase.

**Read model + UTC serializer** (L84-98): `ConfigDict(from_attributes=True)` and `@field_serializer("created_at", ...)` returning `...isoformat().replace("+00:00","Z")`. Copy to `ImageRead` / `ClassRead`. `ClassRead` exposes `index` (stored `position`): use `Field(validation_alias="position")` or build via explicit mapping.

### `routers/classes.py` (router, CRUD)

**Analog:** `backend/src/yolo_trainer_api/routers/projects.py`.

**Imports + router** (L5-14):
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from yolo_trainer_api.db import get_session
router = APIRouter(prefix="/api/projects", tags=["projects"])   # classes: tags=["classes"], routes /{project_id}/classes
```
**404 helper to reuse, do not duplicate** (L24-33): `from yolo_trainer_api.routers.projects import get_project_or_404` (detail "Project not found."). For class lookups add a `get_class_or_404(session, project_id, class_id)` with detail `"Class not found."` in the same style.

**409 on duplicate with already-stored name** (L48-62):
```python
session.add(project)
try:
    await session.commit()
except IntegrityError:
    await session.rollback()
    existing = await session.execute(select(Project.name).where(Project.normalized_name == project.normalized_name))
    existing_name = existing.scalar_one_or_none() or project.name
    raise HTTPException(status_code=409, detail=f'A project named "{existing_name}" already exists.') from None
await session.refresh(project)
```
Adapt: filter also by `Class.project_id`; message `'A class named "{existing_name}" already exists.'`.

**PATCH pattern** (L67-99): `fields = payload.model_fields_set`, capture `attempted_normalized_name` BEFORE rollback (comment L85-89 explains why). Renaming to a case-variant of own name must succeed.

**DELETE** (L102-106) with additions: in ONE transaction delete the row then `UPDATE classes SET position = position - 1 WHERE project_id=:p AND position > :deleted` (D-13). Create: assign position inside the INSERT via scalar subquery `COALESCE(MAX(position), -1) + 1 WHERE project_id=:p` (RESEARCH Pattern 4); color from `palette.next_color(used_colors)`.

### `routers/images.py` (router, file-I/O + keyset CRUD)

**Analog:** `routers/projects.py` (structure, `get_project_or_404`, `get_session`, plain-English HTTPException). The upload pipeline itself has no codebase analog: follow RESEARCH Pattern 1 (ingest_one), Pattern 2, Pattern 3.

Copy from analog: `router = APIRouter(prefix="/api/projects", tags=["images"])`, `session: AsyncSession = Depends(get_session)`, `await get_project_or_404(session, project_id)` first line of each handler, `IntegrityError` -> `rollback()` handling shape (L49-62). Settings access: `request.app.state.settings`, so `main.py` must set `app.state.settings = settings` (not currently set; see `main.py` L30-32 where `engine`/`sessionmaker` are put on `app.state`).

Upload route adds `dependencies=[Depends(require_xhr)]`. Invalid cursor -> `HTTPException(422, "Invalid cursor.")`. Dedup race: `IntegrityError` on `uq_images_project_sha` -> report "duplicate", not 409.
Serve routes: `FileResponse` with `Cache-Control: public, max-age=31536000, immutable`; paths built only from integer ids via `storage.py` (D-18).

### `routers/config.py` (router, request-response)

**Analog:** `main.py` L49-51:
```python
@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```
Plus the router header from `routers/projects.py` L14. Return a Pydantic `ConfigRead` (`max_upload_mb`, `max_upload_bytes`, accepted extensions) from `request.app.state.settings`.

### `main.py` (modify)

**Analog:** itself. Add after L14: `from yolo_trainer_api.routers.classes import router as classes_router` etc., and `app.include_router(...)` after L53. In `lifespan` after `run_migrations` (L28) and engine setup (L30-32), set `app.state.settings = settings` and run `await asyncio.to_thread(reconcile_orphans, ...)` wrapped in try/except that logs and never blocks startup. Update the L23-25 comment ("no file deletion (D-20)"), which becomes false (RESEARCH Pattern 6; safety valve when `projects` table empty but dirs exist).

### `routers/projects.py::delete_project` (modify)

**Analog:** itself L102-106:
```python
project = await get_project_or_404(session, project_id)
await session.delete(project)
await session.commit()
```
Extend: commit first (DB row, FK cascade removes images/classes), THEN `await asyncio.to_thread(storage.remove_project_dir, settings, project_id)` (D-19: DB first, files after). Needs `request: Request` for settings.

### `settings.py` (modify)

**Analog:** itself. Add fields in the style of L23-33: `max_upload_mb: int = 50`, `max_image_megapixels`, `thumbnail_size: int = 256`; derived `@property max_upload_bytes -> self.max_upload_mb * 1_000_000` next to `db_path` (L50-52). Env names map automatically (`env_prefix=""`, so `MAX_UPLOAD_MB`). Add storage root property: `data_dir / "projects"`.

### `storage.py` (utility, file-I/O)

**Analog:** `settings.py::validate_data_dir` (L63-86): resolve, `mkdir(parents=True, exist_ok=True)`, wrap `OSError` in `RuntimeError` naming the path. Path builders accept ints only (`project_dir(settings, project_id: int)`, `image_path(..., image_id: int, ext: str)` with ext from a fixed allow-list). Orphan reconcile follows RESEARCH Pattern 6 (strict regexes, skip symlinks, pure `find_orphans`).

### `image_processing.py` (utility, transform)

**Analog:** `yolo_trainer_common/quality.py` (pure function, no I/O beyond input). Copy the code from RESEARCH Pattern 2 verbatim (validated against 17 cases). Pillow and numpy deps: note numpy is only used for 16-bit modes; confirm numpy is in the api image's dependency set or avoid it (the API image is torch-free; torch brings numpy transitively in worker only). Planner: check `backend/pyproject.toml` deps before relying on numpy.

### `security.py` (`require_xhr`)

**Analog:** `db.py::get_session` (L72-76) for the FastAPI-dependency shape; `errors.py` for the plain-English detail rule. Sketch:
```python
async def require_xhr(request: Request) -> None:
    if request.headers.get("x-requested-with") != "yolo-trainer":
        raise HTTPException(status_code=403, detail="Missing required request header.")
```
Client side sends the same header in `client.ts`.

### `backend/tests/*` (tests)

**Analog:** `tests/test_projects_api.py` + `tests/conftest.py`.

**Imports + client fixture use** (test L3-12, conftest L19-50): tests take `client: TestClient` (real temp SQLite + real Alembic via lifespan). `make_client(settings)` for restart simulation (see `test_migrations.py` L40-53 `test_data_persists_across_app_restart`, copy for "images and classes survive restart", SC3).
```python
def test_duplicate_name_is_case_insensitive(client: TestClient) -> None:
    first = client.post("/api/projects", json={"name": "Cars", "task_type": "detect"})
    duplicate = client.post("/api/projects", json={"name": " cars ", "task_type": "detect"})
    assert duplicate.status_code == 409
    assert "already exists" in duplicate.json()["detail"]
```
Copy this shape for classes (409 case-insensitive, index shift on delete, contiguous 0..N-1, rename to case-variant of self OK). Upload tests: `client.post(url, files=[("files", (name, bytes, "image/jpeg"))], headers={"X-Requested-With": ...})`; generate fixture images with Pillow in-test. To inspect files use `settings.data_dir / "projects" / str(pid)`. Use `settings` fixture for orphan tests. `test_migrations.py` L35 `assert version_row[0] == "0001"` must become `"0002"`, and L31 assert the `images`, `classes` tables.

### `docker/nginx.conf.template` (config)

**Analog:** `docker/nginx.conf` (L1-26). Keep all existing directives. Add the regex upload `location ~ ^/api/projects/[0-9]+/images/?$` BEFORE/alongside `location /api/` per RESEARCH Pattern 5. It must repeat every `proxy_set_header` from L14-16 (`Connection ""`, `Host $host`, `X-Forwarded-For $proxy_add_x_forwarded_for`) plus `proxy_http_version 1.1; proxy_buffering off; proxy_cache off; proxy_read_timeout 3600s;` and MUST NOT define `add_header` (it would drop L6-9 headers incl. CSP). Server-level `client_max_body_size 1m` (L4) stays. Only `${MAX_UPLOAD_MB}` is envsubst'ed; nginx `$vars` pass through. Compose + Dockerfile must always provide `MAX_UPLOAD_MB` or nginx fails to start. Note the same `location` also serves `GET` list (same path) - acceptable.

`Dockerfile.frontend` L11 becomes `COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template` plus `ENV MAX_UPLOAD_MB=50`. `docker-compose.yml`: add under `web:` `environment: MAX_UPLOAD_MB: ${MAX_UPLOAD_MB:-50}` and under `api.environment` (L13-15 style) `MAX_UPLOAD_MB: ${MAX_UPLOAD_MB:-50}`.

Image serving (`/thumbnail`, `/file`) goes through the normal `/api/` location (GET, no body). Check that `proxy_buffering off` in `/api/` does not hurt `FileResponse` throughput for thumbnails (acceptable at this scale).

### `frontend/src/api/client.ts` (modify)

**Analog:** itself L19-28. Current code forces JSON content type whenever a body exists:
```typescript
const headers: Record<string, string> = { Accept: "application/json" };
if (init?.body !== undefined) {
  headers["Content-Type"] = "application/json";
}
```
Change to `if (init?.body !== undefined && !(init.body instanceof FormData))`. Add `"X-Requested-With": "yolo-trainer"` on every request (or at minimum non-GET). Add a unit test (new `client.test.ts`; no existing client test, follow `frontend/src/lib/relativeTime.test.ts` Vitest style) asserting no Content-Type for FormData. Binary endpoints (`/thumbnail`, `/file`) are consumed by `<img src>`, not `apiRequest`.

### `frontend/src/api/classes.ts`, `images.ts`, `config.ts` (service hooks)

**Analog:** `frontend/src/api/projects.ts`.

**Imports + keys** (L1-30):
```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "./client";
export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: number) => ["projects", id] as const,
};
```
**Query + mutation + invalidate** (L32-37, L47-59, L61-74): `useQuery({ queryKey, queryFn: () => apiRequest<T>(path) })`; mutations `apiRequest<T>(path, { method: "POST", body: JSON.stringify(input) })` with `onSuccess: () => void queryClient.invalidateQueries(...)`.
**Idempotent delete** (L76-97): treat `ApiError` 404 as success; copy for `useDeleteClass`.
Adaptations: `classKeys.list(projectId)`; class create/update/delete also invalidate project counts if shown. `images.ts`: `useInfiniteQuery` per RESEARCH Pattern 8 (`queryKey ["images", projectId, sort, search]`, `initialPageParam: null`, `getNextPageParam: last => last.next_cursor`); upload mutation builds `FormData` (field name `files`) and calls `apiRequest` (do NOT set Content-Type); after upload use `resetQueries`, NOT `invalidateQueries`; after delete use `setQueryData` to filter ids. Deletion endpoint is `POST /projects/{id}/images/delete {ids}`.

### `frontend/src/features/project/ProjectLayout.tsx` (modify)

**Analog:** itself. Current `SECTIONS` (L17-20) and the two-state active logic (L53, L69):
```typescript
const SECTIONS: SectionLink[] = [
  { key: "overview", to: ".", labelKey: "project:nav.overview" },
  { key: "settings", to: "settings", labelKey: "project:nav.settings" },
];
const isSettingsRoute = location.pathname.endsWith("/settings");
...
active={section.key === "settings" ? isSettingsRoute : !isSettingsRoute}
```
Insert `images` and `classes` between overview and settings. Replace the active logic with a per-section path check (exact match for overview at `/projects/:id`, `startsWith(`/projects/${id}/${section.to}`)` for others), as the L49-52 comment anticipates. Add `common`-style nav keys to `project.json` (en + ru): `nav.images`, `nav.classes`. The Outlet context `{ project }` (L75) is how pages receive the project (`useOutletContext<{project: Project}>()` as in ProjectSettingsPage L24-34).

### `frontend/src/app/routes.tsx` (modify)

**Analog:** itself L16-19: add `<Route path="images" element={<ImagesPage />} />` and `<Route path="classes" element={<ClassesPage />} />` as children of the `/projects/:projectId` route; import style as L3-7.

### `features/classes/*` (components, CRUD)

**Analog:** `features/project/ProjectSettingsPage.tsx`.
- Page shell + context (L24-35, L97-99): `useOutletContext<ProjectOutletContext>()`, `<Stack><Title order={2}>`, `useTranslation([...])`.
- Client validation mirrors server, server is authority (L28-30, L60-70); count code points with `Array.from(x).length`.
- Error display (L56-58, L126-130):
```tsx
const apiErrorMessage = updateProject.error instanceof ApiError ? updateProject.error.message : null;
{errorMessage ? (<Alert color="red" title={t("common:error.title")}>{errorMessage}</Alert>) : null}
```
- Submit: `Box component="form" onSubmit`, `Button type="submit" loading={mutation.isPending}` (L100, L137-143).
Color: Mantine `ColorInput` with `swatches` and `disallowInput` (RESEARCH). Index shown per row = `index` from API. Use `useDisclosure` for modal state (L36-37).

### `DeleteClassModal.tsx` / `DeleteImagesModal.tsx` (component)

**Analog:** `features/project/DeleteProjectModal.tsx` (L1-110). Copy: props `{ opened, onClose, ... }`; `isSubmittingRef` synchronous double-submit lock (L27-31, L44-49); `reset()`/`handleClose()` (L33-42); `mutate(undefined, { onSuccess: reset+onClose+notifications.show({color:"green", message: t(...)}), onError: () => { isSubmittingRef.current = false; } })` (L50-65); error `Alert` (L75-93); button row `Group justify="flex-end"` with `Button variant="default"` cancel (`t("projects:modal.cancel")`) and `Button color="red" loading={isPending}` (L94-106). Differences: NO typed-name input (D-11/D-16 want plain confirmation); drop `navigate`. Text for images: "Delete N images?"; classes: plain confirmation now, structure the props so Phase 3 can pass an object count.

### `features/images/*` (components)

**Analog:** page shell from `ProjectSettingsPage.tsx`; no analog for the grid/upload/viewer (see No Analog). Mandatory conventions: Mantine components, `useTranslation(["images","common"])`, notifications via `@mantine/notifications`, API error `Alert`. Use `useHotkeys` / `useDebouncedValue` from `@mantine/hooks` (already a dep; `useDisclosure` used at ProjectSettingsPage L14). Tile: `React.memo`, native `title=` tooltip, `<img>` from `/api/projects/{pid}/images/{id}/thumbnail`, reserved slot for status badge. CSP already allows `img-src 'self' data: blob:`; import `@mantine/dropzone/styles.css` where Mantine styles are imported (check `frontend/src/main.tsx`).

### `frontend/src/lib/{imageFiles,uploadQueue}.ts`

**Analog:** `frontend/src/lib/relativeTime.ts` + `relativeTime.test.ts` (pure helper + colocated Vitest). Implement `planBatches` / `runPool` per RESEARCH Pattern 7; unit-test `planBatches` and extension classification.

### `i18n/locales/{en,ru}/{images,classes}.json`

**Analog:** `i18n/locales/en/project.json` (nested keys, `{{name}}` interpolation). `i18n/index.ts` L9-21 auto-loads every `locales/*/*.json` via `import.meta.glob`, so adding the two files per language needs NO registration. Add `useTranslation` namespaces by name (`images:...`). There is a `locales.test.ts` (en/ru key parity check likely); keep both languages in lockstep.

### Frontend tests

**Analog:** `features/project/DeleteProjectModal.test.tsx`: `vi.stubGlobal("fetch", fetchMock)` with ordered `mockResolvedValueOnce(jsonResponse(...))` (L24-29, L63-65); `renderWithProviders(<AppRoutes />, { route })` from `../../test/render` (L13, L50); selectors via `i18n.t("ns:key")` (L53); `vi.mock("@mantine/notifications", ...)` hoisted before imports (L5-9). For the grid in jsdom use `VirtuosoGridMockContext` (RESEARCH). Note fetch mock call order matters: tests assert on queue order, so account for new calls (e.g. image list GET) when routing to project pages.

## Shared Patterns

### Plain-English API errors
**Source:** `backend/src/yolo_trainer_api/errors.py` L24-30 + `routers/projects.py` L32, L59-62.
All errors are `{"detail": "<English string>"}`; raise `HTTPException(status_code=..., detail="...")`, never return structured error objects. Upload per-file rejections are inside a 200 body (`results[].status/reason`), not HTTP errors.

### Project scoping and 404
**Source:** `routers/projects.py` L24-33 `get_project_or_404`. Every `/api/projects/{project_id}/...` handler calls it first.

### Session dependency
**Source:** `db.py` L72-76 / `routers/projects.py` L18: `session: AsyncSession = Depends(get_session)`. Sessions use `expire_on_commit=False` (db.py L69). FKs and busy_timeout are set per connection (db.py L31-36).

### Case-insensitive uniqueness via normalized column + IntegrityError -> 409
**Source:** `models.py` L14-16, L38-41, L43-47; `routers/projects.py` L48-62.

### i18n, no hardcoded strings
**Source:** `frontend/src/i18n/locales/en/project.json`; use `t("ns:key")` everywhere including aria-labels and tooltips; add both en and ru.

### Confirmation modal + mutation lock
**Source:** `features/project/DeleteProjectModal.tsx` L27-66.

### Query hooks + invalidation
**Source:** `frontend/src/api/projects.ts` L27-97.

### Tests against real SQLite + real migrations
**Source:** `backend/tests/conftest.py` L19-50 (`settings`, `make_client`, `client`). No DB mocking.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Upload pipeline in `routers/images.py` (multipart, staging, hash, Pillow, rename) | router | file-I/O | No file handling exists in Phase 1; use RESEARCH Patterns 1-3 |
| `storage.py::reconcile_orphans` / `find_orphans` | utility | batch | No filesystem reconciliation exists; use RESEARCH Pattern 6 |
| `features/images/ImageGrid.tsx`, `ImageTile.tsx` | component | streaming | No virtualized list; use RESEARCH Pattern 8 (`VirtuosoGrid` + `useInfiniteQuery`) |
| `UploadPanel.tsx`, `UploadReport.tsx`, `lib/uploadQueue.ts` | component/utility | batch | No uploads or dropzone yet; RESEARCH Pattern 7 + `@mantine/dropzone` |
| `ImageViewerModal.tsx` | component | request-response | Only modal analog is `DeleteProjectModal` (Mantine `Modal` usage L79); keyboard nav via `useHotkeys` |
| `scripts/seed_images.py` | utility | batch | No `scripts/` directory; use RESEARCH Pattern 9 (httpx + Pillow through the real API) |

## Gotchas for the Planner (found while reading analogs)

1. `main.py` does not set `app.state.settings`; router code needing settings requires it (add in lifespan or `create_app`). `get_session` reads `request.app.state.sessionmaker` the same way.
2. `client.ts` L21-23 breaks FormData (see above); fix before any upload UI work.
3. `ProjectLayout.tsx` L53/L69 active-link logic only handles two sections.
4. `test_migrations.py` L35 hard-codes `"0001"`.
5. `Project` has no AUTOINCREMENT and its migration is unchanged; only new tables get it.
6. `ProjectRead` has no image/class counts; adding `image_count` is optional (Claude's Discretion) and would touch `schemas.ProjectRead`, `models.Project` (column_property), `api/projects.ts::Project`, `ProjectCard.tsx`, `ProjectOverviewPage.tsx` (not read here; verify before planning that task). `en/project.json` `overview.emptyHint` ("doesn't have any images yet") is a Phase 1 placeholder worth revisiting.
7. Verify `numpy` availability in the torch-free api image before using the 16-bit branch of `_webp_ready`.

## Metadata

**Analog search scope:** `backend/src/yolo_trainer_api`, `backend/src/yolo_trainer_common`, `backend/tests`, `frontend/src`, `docker/`, `docker-compose.yml`
**Files read:** 22 (RESEARCH.md read through L516 of 802; remaining sections not needed for file mapping)
**Tracked-source gate:** all analog paths appear in `git ls-files`; no `.gsd/` mirror paths used
**Pattern extraction date:** 2026-10-03
