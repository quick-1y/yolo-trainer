# Phase 3: Box Annotation Editor - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 46 (new + modified)
**Analogs found:** 38 / 46 (8 frontend canvas/store/saver files have no in-repo analog; use 03-RESEARCH.md Patterns 4-7)

All analog paths below were listed by `git ls-files` (tracked source). None is a gitignored mirror.

## File Classification

### Backend

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/src/yolo_trainer_api/migrations/versions/0004_create_annotations.py` | migration | schema | `migrations/versions/0003_create_classes.py` | exact |
| `backend/src/yolo_trainer_api/models.py` (+`Annotation`, 3 `Image` cols, `Image.box_count`, `ProjectClass.object_count`) | model | CRUD | same file (`ProjectClass`, `Project.image_count`) | exact |
| `backend/src/yolo_trainer_api/schemas.py` (+Box/AnnotationSave/SaveResult/Neighbors/StatusCounts; extend `ImageRead`, `ClassRead`) | schema | request-response | same file (`ClassCreate`, `ImageRead`, `ImageDeleteRequest`) | exact |
| `backend/src/yolo_trainer_api/annotations.py` (apply_save CAS, derive_status) | service | CRUD/transform | `routers/classes.py` (create_class transaction + IntegrityError handling) | role-match |
| `backend/src/yolo_trainer_api/routers/annotations.py` | route | request-response | `routers/classes.py` + `routers/images.py` | exact |
| `backend/src/yolo_trainer_api/routers/images.py` (extract keyset predicate; ImageRead box_count; `refresh` before validate) | route | request-response | same file (`build_page_query`, `_scoped`) | exact |
| `backend/src/yolo_trainer_api/routers/classes.py` (`delete_class` demotion, `object_count`) | route | CRUD | same file (`delete_class`) | exact |
| `backend/src/yolo_trainer_api/main.py` (register router) | config | - | existing router includes in same file | exact |
| `backend/tests/test_annotations_api.py`, `test_annotations_status.py`, `test_annotations_concurrency.py` | test | request-response | `backend/tests/test_classes_api.py` | exact |
| `backend/tests/test_classes_api.py` (+cascade/count) | test | CRUD | same file | exact |

### Frontend

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `frontend/src/api/annotations.ts` | api client | request-response | `frontend/src/api/classes.ts` + `api/images.ts` | exact |
| `frontend/src/api/images.ts` (ImageItem fields, `patchImageInListCache`, neighbors/next/status-counts) | api client | request-response | same file (`pruneDeletedImages`, `listImages`) | exact |
| `frontend/src/api/classes.ts` (`object_count`) | api client | CRUD | same file | exact |
| `frontend/src/app/routes.tsx` (lazy editor route outside `AppLayout`) | route | - | same file | exact |
| `frontend/src/features/editor/EditorPage.tsx` | page | request-response | `features/project/ProjectLayout.tsx` (id parse + `useProject` + not-found) | role-match |
| `features/editor/EditorTopBar.tsx`, `ToolBar.tsx`, `ObjectList.tsx`, `ShortcutsModal.tsx` | component | event-driven | `features/images/ImageViewerModal.tsx` (Mantine + `useHotkeys` + i18n) | role-match |
| `features/editor/ClassPanel.tsx` | component | CRUD | `features/classes/AddClassForm.tsx` + `ClassRow.tsx` | role-match |
| `features/editor/canvas/AnnotationCanvas.tsx`, `BoxShape.tsx`, `Crosshair.tsx`, `useStageViewport.ts`, `useLoadedImage.ts` | component/hook | event-driven | `ImageViewerModal.tsx` `Stage` (load state only) | partial |
| `features/editor/store/annotationStore.ts`, `storeRegistry.ts` | store | event-driven | none | none |
| `features/editor/store/annotationSaver.ts` | service | request-response + retry | `lib/uploadQueue.ts` (+ `.test.ts`) pure queue + injected fn | partial |
| `features/editor/lib/geometry.ts`, `viewport.ts`, `shortcuts.ts`, `ids.ts` | utility | transform | `lib/classPalette.ts`, `lib/imageFiles.ts` (+tests) | role-match |
| `features/images/ImagesPage.tsx` (sort/q to `useSearchParams`, drop viewer) | page | request-response | same file | exact |
| `features/images/ImageTile.tsx` (status badge in `badgeSlot`) | component | - | same file lines 88 | exact |
| `features/images/StatusSummary.tsx`, `AnnotateNextButton.tsx` | component | request-response | `features/images/SelectionBar.tsx`, `ImagesToolbar.tsx` | role-match |
| `features/images/ImageViewerModal.tsx` (+css/test) | REMOVED | - | - | - |
| `features/classes/DeleteClassModal.tsx` | component | - | same file lines 68-73 | exact |
| `i18n/locales/{en,ru}/editor.json` (+`images.json`, `classes.json`) | config | - | `locales/en/classes.json` | exact |
| Tests (`*.test.tsx`) for the above | test | - | `features/classes/DeleteClassModal.test.tsx`, `test/render.tsx` | exact |

## Pattern Assignments

### `0004_create_annotations.py` (migration)

**Analog:** `backend/src/yolo_trainer_api/migrations/versions/0003_create_classes.py`

Header, revision chain, `from __future__`, `op.create_table` + explicit named indexes (lines 1-58):
```python
from __future__ import annotations
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "0003"          # new: "0004", down_revision "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

op.create_table("classes", sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    ..., sa.CheckConstraint("length(color) = 7", name="ck_classes_color"), sqlite_autoincrement=True)
op.create_index("ix_classes_project_position", "classes", ["project_id", "position"])
# downgrade: drop_index then drop_table
```
Copy: `ck_` / `ix_` naming, `ondelete="CASCADE"` FKs, symmetrical downgrade. Body of upgrade is in 03-RESEARCH.md "Migration 0004 (shape)"; `add_column` for `images` (SQLite `ADD COLUMN` with `server_default`) goes first, downgrade drops indexes, table, then the 3 columns (use `op.batch_alter_table` for the column drops on SQLite). The annotations PK is a client UUID `String(36)` (no autoincrement).

### `models.py` (model)

**Analog:** same file.

Style: `Mapped[...] = mapped_column(...)`, `CheckConstraint`/`Index` in `__table_args__`, NO ORM `relationship` (docstrings lines 61-69, 97-105). Add `Annotation` next to `ProjectClass` with FKs `ondelete="CASCADE"` to `images.id` and `classes.id`. Timestamps:
```python
created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
```
Derived counts: copy the `column_property` block at lines 135-148 (attached after all classes exist):
```python
Project.image_count = column_property(
    select(func.count(Image.id)).where(Image.project_id == Project.id)
    .correlate_except(Image).scalar_subquery())
```
Becomes `Image.box_count = column_property(select(func.count(Annotation.id)).where(Annotation.image_id == Image.id).correlate_except(Annotation).scalar_subquery())` and the same for `ProjectClass.object_count`. Pitfall 3: `await session.refresh(obj)` before `model_validate` for new rows (see `create_class` line 100).

### `schemas.py` (schema)

**Analog:** same file.

Strict body models use `ConfigDict(extra="forbid")` (`ClassCreate` lines 115-122, `ImageDeleteRequest` 183-188 with `Field(min_length, max_length)`). Read models use `from_attributes=True, populate_by_name=True` + `validation_alias` (`ImageRead` 160-174) and the UTC serializer:
```python
@field_serializer("created_at")
def _serialize_utc(self, value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat().replace("+00:00", "Z")
```
Extend `ImageRead` with `box_count: int`, `is_background`, `is_reviewed`, `status` (computed in Python from derive_status); extend `ClassRead` with `object_count: int = 0`. `BoxIn`/`Unit` validation shape is in RESEARCH "Request validation". Cap box list with `Field(max_length=2000)`.

### `routers/annotations.py` (route)

**Analogs:** `routers/classes.py` (project/entity guards, transaction + plain-English errors), `routers/images.py` (router prefix, sort/q query params, keyset helpers).

Router/imports/guard (classes.py lines 8-38):
```python
router = APIRouter(prefix="/api/projects", tags=["classes"])

async def get_class_or_404(session, project_id, class_id) -> ProjectClass:
    result = await session.execute(select(ProjectClass).where(
        ProjectClass.id == class_id, ProjectClass.project_id == project_id))
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    return obj
```
Do the same with `Image` ("Image not found."), always selecting by `id AND project_id`. Each handler starts `await get_project_or_404(session, project_id)`. Query-param style (images.py 256-264):
```python
sort: Literal["newest", "name"] = SORT_NEWEST,
q: Annotated[str, Query(max_length=MAX_SEARCH_LENGTH)] = "",
...
q_key = normalize_project_name(q)
```
Error handling: plain English `HTTPException` (409 `"These annotations were changed elsewhere. Reload the image to continue."`, 422 `"Unknown class."`); on `IntegrityError` rollback then re-check parents (classes.py 79-99). Literal routes (`next-unannotated`, `status-counts`) MUST be registered before `/{image_id}` routes; since `routers/images.py` defines `/{project_id}/images/{image_id}/thumbnail` only (no bare `/{image_id}`), include the annotations router in `main.py` so literals win, and test `GET .../images/next-unannotated` returns 200. Write routes: JSON PUT; `require_xhr` (security.py) is used on the multipart upload route (images.py lines ~230-236, decorator `dependencies=[Depends(require_xhr)]` style) - JSON PUT relies on the preflight (T-02-13-05), so do not add it unless the planner wants parity.

### `routers/images.py` (modify: keyset reuse)

**Analog:** same file `build_page_query` (lines 101-119) and `_scoped` (92-98). Extract a shared `grid_order_predicate(sort, key, id, direction)` so neighbors/next-unannotated reuse exactly:
```python
if sort == SORT_NAME:
    stmt = stmt.where(tuple_(Image.filename_key, Image.id) > tuple_(cursor.key, cursor.image_id))
    stmt.order_by(Image.filename_key, Image.id)
else:
    stmt = stmt.where(Image.id < cursor.image_id); stmt.order_by(Image.id.desc())
```
Note "next" in newest order means `id < pivot` ordered DESC; "prev" is the mirror. Total/position counts use `_scoped(select(func.count(Image.id)), project_id, q_key)` (lines 279-280).

### `routers/classes.py` (modify `delete_class`)

**Analog:** same file lines 150-172. Add, before `session.delete(project_class)`, an `update(Image).where(Image.id.in_(select(Annotation.image_id).where(Annotation.class_id == class_id))).values(annotation_version=Image.annotation_version + 1, is_reviewed=False).execution_options(synchronize_session=False)`, in the same transaction, using the existing style `update(ProjectClass).where(...).values(position=ProjectClass.position - 1).execution_options(synchronize_session=False)`. Update the comment at 161-162 (already anticipates this).

### Backend tests

**Analog:** `backend/tests/test_classes_api.py` (lines 1-60): `from .conftest import make_client`, `client: TestClient` fixture (real temp-file SQLite + real migration, conftest.py 22-60), helper `_project(client)` posting `{"name":..., "task_type":"detect"}`, assertions on `response.json()["detail"]` plain-English strings, `ThreadPoolExecutor` for concurrency (imports line 6) - reuse that for the two-saves-one-winner test. Use `backend/tests/imaging.py` for image fixtures (as in `test_images_api.py`).

### `frontend/src/api/annotations.ts`

**Analog:** `api/classes.ts` (hooks) and `api/images.ts` (key factories, URL builders).

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "./client";

export const classKeys = { list: (projectId: number) => ["classes", projectId] as const };
export function useClasses(projectId: number) {
  return useQuery({ queryKey: classKeys.list(projectId),
    queryFn: () => apiRequest<ProjectClassItem[]>(`/projects/${projectId}/classes`) });
}
// write: apiRequest<T>(url, { method: "PUT", body: JSON.stringify(input) })  // client adds X-Requested-With + JSON header (client.ts:24-30)
```
Copy `ApiError` branching (`error instanceof ApiError && error.status === 404`) from `useDeleteClass` (classes.ts 87-93) to map 409/404/422 in `saveAnnotations`. Key factory: `annotationKeys = { set: (p,i) => ["annotations", p, i] }`, `["imageSummary", projectId]`.

### `api/images.ts` (modify)

**Analog:** same file. Add `box_count`, `is_background`, `is_reviewed`, `status` to `ImageItem` (lines 11-18). `patchImageInListCache` copies `pruneDeletedImages` (121-143) and is applied with
```ts
queryClient.setQueriesData<InfiniteData<ImagePage, string | null>>(
  { queryKey: imageKeys.project(projectId) }, (data) => patch(data, ...));
void queryClient.invalidateQueries({ queryKey: imageKeys.project(projectId), refetchType: "none" });
```
(lines 157-166). `listImages` URLSearchParams building (66-73) is the pattern for `getNeighbors`/`nextUnannotated`. `fileUrl` (112-114) is the editor's original-image source.

### `routes.tsx` (modify)

**Analog:** same file lines 12-28. Add a sibling route (outside `<Route element={<AppLayout />}>`) wrapped in `Suspense` with `React.lazy(() => import("../features/editor/EditorPage"))` (named-export adapter: `.then(m => ({default: m.EditorPage}))`). Existing tests render `AppRoutes` via `renderWithProviders(..., {route})`, so Suspense needs a fallback `Loader`.

### `EditorPage.tsx`

**Analog:** `features/project/ProjectLayout.tsx` lines 1-40: id parsing and not-found:
```tsx
const params = useParams<{ projectId: string }>();
const parsedId = Number.parseInt(params.projectId ?? "", 10);
const isValidId = Number.isFinite(parsedId) && parsedId > 0;
const query = useProject(isValidId ? parsedId : null);
if (!isValidId) return <ProjectNotFound />;
if (query.isPending) return <Text c="dimmed">{t("common:loading")}</Text>;
```
Add the same for `:imageId`; reuse `ProjectNotFound`/`NotFoundPage`. Read `sort`/`q` from `useSearchParams`.

### Editor chrome components (TopBar, ToolBar, ObjectList, ShortcutsModal)

**Analog:** `features/images/ImageViewerModal.tsx` - Mantine components, `useTranslation("images")`, `useHotkeys`, load-status state, `useHotkeys([["ArrowLeft", goPrev], ["ArrowRight", goNext]])` (lines 89-92). Differences mandated by RESEARCH Pitfalls 8-10: pass `{ usePhysicalKeys: true }` (e.g. `["KeyV", fn, { usePhysicalKeys: true }]`), pass `[]` while a modal is open, blur Mantine `Select` in `onChange`, guard `event.repeat`.

### `ClassPanel.tsx`

**Analog:** `features/classes/AddClassForm.tsx` (inline create: ref-lock against double submit lines 23-25, trimmed/length validation 32-41 with `Array.from(trimmed).length > MAX_NAME_LENGTH`, `createClass.mutateAsync`, show `ApiError.message`). Embed `<AddClassForm projectId=.../>` directly when no classes exist (D-07); color swatches via `lib/classPalette.ts`. Class list from `useClasses`.

### `useLoadedImage.ts`

**Analog:** `ImageViewerModal.tsx` `Stage` (lines 22-56): `"loading" | "loaded" | "error"` with `onLoad`/`onError`, keyed by image id. Extend with `naturalWidth/naturalHeight` vs `image.width/height` check (Pitfall 4).

### `annotationSaver.ts`

**Analog (partial):** `lib/uploadQueue.ts` + `uploadQueue.test.ts`: a pure, dependency-injected module (`upload: (...) => Promise`, `AbortSignal`, `onBatchDone` callbacks) tested without React. Follow the same shape: `createSaver({ send, onState, now/timers injected })`, unit tested with fake timers. Debounce, serial coalescing, backoff per RESEARCH Pattern 4.

### `lib/geometry.ts`, `viewport.ts`, `shortcuts.ts`, `ids.ts`

**Analog:** `lib/classPalette.ts` (pure constants/functions, header comment explaining the server mirror) and `lib/uploadQueue.ts` (pure functions with JSDoc, co-located `.test.ts`). `ids.ts` and `geometry.ts` bodies: RESEARCH "Collision-free client id" and Pattern 6.

### `ImagesPage.tsx` (modify)

**Analog:** same file. Replace lines 49-50 `useState` for `sort`/`search` with `useSearchParams` (writes `{ replace: true }`); `query = search.trim()` (59) stays. Remove `viewerIndex`, `advancePending`, effects at 130-140, the `ImageViewerModal` import (13) and block (278-296); `onOpen` becomes `navigate(\`/projects/${project.id}/annotate/${items[index].id}?sort=${sort}&q=${query}\`)`. Keep selection/Esc logic (drop `viewerIndex !== null` from the effect guard at 118/128). Add `StatusSummary`/`AnnotateNextButton` in the header `Group` (178-188). `useImagesInfinite` gets a `staleTime` (RESEARCH Pattern 8). Existing test stubs throw on unexpected paths (RESEARCH Pitfall 13) - add one shared `stubImagesApi` handling `status-counts`.

### `ImageTile.tsx` (modify)

**Analog:** same file. Fill `<div className={classes.badgeSlot} data-testid="status-badge-slot" />` (line 88) with a Mantine `Badge` (text, i18n key `images:status.*`) plus box count; keep the `memo` shape and the `role="button"`/Enter handler (41-55). Tile is passed `image` so new fields flow through `ImageItem`.

### `DeleteClassModal.tsx` (modify)

**Analog:** same file lines 68-73: the sentences array is explicitly built for this:
```tsx
const sentences = [t("classes:delete.body", { name: projectClass.name })];
if (hasLaterClasses) sentences.push(t("classes:delete.shiftNote"));
```
Push `t("classes:delete.objects", { count: projectClass.object_count })` when `object_count > 0` (i18next plural keys in both locales).

### i18n

**Analog:** `i18n/locales/en/classes.json` (nested `page`/`add`/`columns`/`validation` groups, interpolation `{{count}}`); `i18n/locales.test.ts` auto-checks en/ru parity, so every key must exist in both `en/editor.json` and `ru/editor.json`. Register the new namespace in `i18n/index.ts`.

### Frontend tests

**Analog:** `features/classes/DeleteClassModal.test.tsx` lines 1-40: `vi.mock("@mantine/notifications")`, `renderWithProviders(<AppRoutes />, { route })` from `test/render.tsx` (MantineProvider dark + fresh QueryClient + MemoryRouter), `json()` Response helper and `stubFetch` routing by `url.pathname`. Canvas tests need `vitest-canvas-mock` (set up in `test-setup.ts`).

## Shared Patterns

### Error shape and strings
**Source:** `routers/classes.py` 36-38, 96-99; `schemas.py`. Plain-English `HTTPException(status_code, detail="...")`, never localized (P1 D-05). Frontend displays `ApiError.message` (`AddClassForm` 50).

### Scoping by project
**Source:** `get_class_or_404` (classes.py 24-38), `get_thumbnail` (images.py 295-301): always `WHERE id = :id AND project_id = :p`.

### CSRF / mutation headers
**Source:** `frontend/src/api/client.ts` 24-30 (adds `X-Requested-With: yolo-trainer` and JSON `Content-Type`), `backend/src/yolo_trainer_api/security.py` (`require_xhr`). New write routes are JSON (preflight stance, T-02-13-05).

### Cache patching after mutation
**Source:** `api/images.ts` 155-169 (`setQueriesData` + `invalidateQueries({refetchType:"none"})` + `projectKeys` invalidation). Apply to the saver's post-save success.

### Transaction style
**Source:** `routers/classes.py` 158-172: statements + one `await session.commit()`, `synchronize_session=False` on bulk updates, ORM-only queries, no raw SQL in app code (the RESEARCH `text(...)` CAS prototype should be rewritten as `update(Image).where(Image.id == i, Image.project_id == p, Image.annotation_version == base).values(annotation_version=Image.annotation_version + 1)` and `result.rowcount`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `features/editor/store/annotationStore.ts`, `storeRegistry.ts` | store | event-driven | No zustand/zundo in repo; use RESEARCH Pattern 7 |
| `features/editor/canvas/AnnotationCanvas.tsx`, `BoxShape.tsx`, `Crosshair.tsx`, `useStageViewport.ts` | component | event-driven | No canvas code exists; use RESEARCH Pattern 5 and "Pointer-captured drawing" |
| `features/editor/lib/shortcuts.ts` (physical-key map) | utility | - | Only `ArrowLeft/Right` hotkeys exist (ImageViewerModal); use RESEARCH shortcut table |
| `annotationSaver.ts` retry/backoff | service | - | Only the upload queue is analogous (shape only) |

## Metadata

**Analog search scope:** `backend/src/yolo_trainer_api/**`, `backend/tests/`, `frontend/src/{api,app,features,lib,i18n,test}`
**Files read:** models.py, schemas.py (100-210), routers/classes.py, routers/images.py (1-120, 236-373), migrations 0003, api/classes.ts, api/images.ts, routes.tsx, ImagesPage.tsx, ImageTile.tsx, ImageViewerModal.tsx, AddClassForm.tsx, DeleteClassModal.tsx (55-84), ProjectLayout.tsx, uploadQueue.ts, test_classes_api.py, conftest.py, test/render.tsx
**Pattern extraction date:** 2026-10-04
