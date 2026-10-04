---
phase: 03-box-annotation-editor
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 107
files_reviewed_list:
  - README.md
  - README.ru.md
  - backend/src/yolo_trainer_api/annotations.py
  - backend/src/yolo_trainer_api/main.py
  - backend/src/yolo_trainer_api/migrations/versions/0004_create_annotations.py
  - backend/src/yolo_trainer_api/models.py
  - backend/src/yolo_trainer_api/routers/annotations.py
  - backend/src/yolo_trainer_api/routers/classes.py
  - backend/src/yolo_trainer_api/routers/images.py
  - backend/src/yolo_trainer_api/schemas.py
  - backend/tests/test_annotations_api.py
  - backend/tests/test_annotations_concurrency.py
  - backend/tests/test_annotations_navigation.py
  - backend/tests/test_annotations_status.py
  - backend/tests/test_classes_api.py
  - backend/tests/test_images_api.py
  - backend/tests/test_migrations.py
  - frontend/package.json
  - frontend/src/api/annotations.test.ts
  - frontend/src/api/annotations.ts
  - frontend/src/api/classes.ts
  - frontend/src/api/images.test.ts
  - frontend/src/api/images.ts
  - frontend/src/app/routes.tsx
  - frontend/src/features/classes/AddClassForm.tsx
  - frontend/src/features/classes/ClassRow.test.tsx
  - frontend/src/features/classes/DeleteClassModal.test.tsx
  - frontend/src/features/classes/DeleteClassModal.tsx
  - frontend/src/features/editor/ClassPanel.module.css
  - frontend/src/features/editor/ClassPanel.test.tsx
  - frontend/src/features/editor/ClassPanel.tsx
  - frontend/src/features/editor/ConflictBanner.tsx
  - frontend/src/features/editor/EditorKeyboard.test.tsx
  - frontend/src/features/editor/EditorLeave.test.tsx
  - frontend/src/features/editor/EditorLoadErrors.test.tsx
  - frontend/src/features/editor/EditorNavigation.test.tsx
  - frontend/src/features/editor/EditorNextUnannotated.test.tsx
  - frontend/src/features/editor/EditorPage.test.tsx
  - frontend/src/features/editor/EditorPage.tsx
  - frontend/src/features/editor/EditorSaving.test.tsx
  - frontend/src/features/editor/EditorStatus.test.tsx
  - frontend/src/features/editor/EditorTopBar.tsx
  - frontend/src/features/editor/LeaveDialog.tsx
  - frontend/src/features/editor/ObjectList.test.tsx
  - frontend/src/features/editor/ObjectList.tsx
  - frontend/src/features/editor/ShortcutsModal.test.tsx
  - frontend/src/features/editor/ShortcutsModal.tsx
  - frontend/src/features/editor/ToolBar.tsx
  - frontend/src/features/editor/canvas/AnnotationCanvas.test.tsx
  - frontend/src/features/editor/canvas/AnnotationCanvas.tsx
  - frontend/src/features/editor/canvas/BoxShape.tsx
  - frontend/src/features/editor/canvas/Crosshair.tsx
  - frontend/src/features/editor/canvas/ZoomOverlay.tsx
  - frontend/src/features/editor/canvas/useLoadedImage.ts
  - frontend/src/features/editor/canvas/useStageViewport.test.ts
  - frontend/src/features/editor/canvas/useStageViewport.ts
  - frontend/src/features/editor/icons.tsx
  - frontend/src/features/editor/lib/geometry.test.ts
  - frontend/src/features/editor/lib/geometry.ts
  - frontend/src/features/editor/lib/ids.test.ts
  - frontend/src/features/editor/lib/ids.ts
  - frontend/src/features/editor/lib/shortcuts.test.ts
  - frontend/src/features/editor/lib/shortcuts.ts
  - frontend/src/features/editor/lib/urls.ts
  - frontend/src/features/editor/lib/viewport.test.ts
  - frontend/src/features/editor/lib/viewport.ts
  - frontend/src/features/editor/store/annotationSaver.test.ts
  - frontend/src/features/editor/store/annotationSaver.ts
  - frontend/src/features/editor/store/annotationStore.test.ts
  - frontend/src/features/editor/store/annotationStore.ts
  - frontend/src/features/editor/store/editorUiStore.ts
  - frontend/src/features/editor/store/storeRegistry.test.ts
  - frontend/src/features/editor/store/storeRegistry.ts
  - frontend/src/features/editor/useEditorHotkeys.ts
  - frontend/src/features/editor/useEditorNavigation.ts
  - frontend/src/features/editor/useNextUnannotated.ts
  - frontend/src/features/images/AnnotateNext.test.tsx
  - frontend/src/features/images/AnnotateNextButton.tsx
  - frontend/src/features/images/DeleteImagesModal.test.tsx
  - frontend/src/features/images/ImageGrid.test.tsx
  - frontend/src/features/images/ImageTile.module.css
  - frontend/src/features/images/ImageTile.test.tsx
  - frontend/src/features/images/ImageTile.tsx
  - frontend/src/features/images/ImagesDeletePaging.test.tsx
  - frontend/src/features/images/ImagesPage.test.tsx
  - frontend/src/features/images/ImagesPage.tsx
  - frontend/src/features/images/ImagesSearch.test.tsx
  - frontend/src/features/images/ImagesSelection.test.tsx
  - frontend/src/features/images/ImagesUrlState.test.tsx
  - frontend/src/features/images/StatusSummary.test.tsx
  - frontend/src/features/images/StatusSummary.tsx
  - frontend/src/features/images/UploadButtons.tsx
  - frontend/src/features/images/UploadContext.tsx
  - frontend/src/features/images/UploadDropzone.test.tsx
  - frontend/src/features/images/UploadFlow.test.tsx
  - frontend/src/i18n/locales/en/classes.json
  - frontend/src/i18n/locales/en/editor.json
  - frontend/src/i18n/locales/en/images.json
  - frontend/src/i18n/locales/ru/classes.json
  - frontend/src/i18n/locales/ru/editor.json
  - frontend/src/i18n/locales/ru/images.json
  - frontend/src/test-setup.ts
  - frontend/src/test/canvas.ts
  - frontend/src/test/editorApi.ts
  - frontend/src/test/fixtures.ts
  - frontend/src/test/stubImagesApi.ts
  - scripts/compose_smoke_test.sh
findings:
  critical: 0
  warning: 6
  info: 6
  total: 12
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-10-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 107
**Status:** issues_found

## Summary

Reviewed the whole phase 03 scope: the backend annotation layer (compare-and-swap save, neighbors, next-unannotated, status counts, class-delete version bump, migration 0004) and the frontend editor (zustand/zundo store, serial debounced saver, store registry, react-konva canvas, hotkeys, navigation guard, images grid changes), plus the tests, i18n files and smoke script.

The core save contract holds up. The CAS `UPDATE` is the first write statement and takes the SQLite write lock. Every failure path rolls back. The idempotent-retry path and the class-delete version bump are correct and covered by tests. SQL status derivation, client `docStatus` and server `derive_status` agree. en/ru locale key parity holds, and every `t()` key used by the editor and the images feature exists. No security vulnerabilities were found (no injection or path-handling issues; the PUT is protected by `require_xhr`; box ids and classes are validated per project).

No blockers. The six warnings are edge-case data-consistency, robustness and accessibility defects. The most visible one for users is stale box counts and statuses in the grid after a class is deleted. The rest are described below.

## Warnings

### WR-01: Deleting a class leaves the image grid cache stale for 5 minutes

**File:** `frontend/src/api/classes.ts:98-105`
**Issue:** The server cascades a class's boxes away and bumps `annotation_version` / clears `is_reviewed` on every affected image (`routers/classes.py:166-171`). `useDeleteClass.onSuccess` only invalidates the class list and project queries. The images list is an infinite query with `staleTime = 5 min` (`api/images.ts:223`). After deleting a class on the Classes page and returning to Images, the grid shows the old `box_count`, status chip and the "reviewed" state of every affected image. The tiles contradict the server until the cache expires. The `["imageSummary"]` query refetches (staleTime 0), so the status summary row and the grid disagree on screen. The annotation and detail caches refetch on mount, so the editor itself is fine.
**Fix:** Mark the project's image lists stale without refetching visible pages, and refresh the summary, in `useDeleteClass.onSuccess`:
```ts
void queryClient.invalidateQueries({ queryKey: imageKeys.project(projectId), refetchType: "none" });
void queryClient.invalidateQueries({ queryKey: imageKeys.summary(projectId) });
void queryClient.invalidateQueries({ queryKey: ["annotations", projectId], refetchType: "none" });
```
Import `imageKeys` from `./images`. Alternatively use `resetQueries` for `imageKeys.project`, as the upload flow does.

### WR-02: A conflicted store-registry entry reports "not dirty" and can be silently evicted

**File:** `frontend/src/features/editor/store/annotationSaver.ts:124-139` (root cause), `storeRegistry.ts:75-89` (symptom)
**Issue:** `loop()` sets `dirty = false` before `send`. On a 409 it sets `conflicted = true` and returns without restoring `dirty = true`, although the comment says "Keep the doc pending". After a conflict `isDirty()` is `false`. `evictIfNeeded()` relies only on `saver.isDirty()` ("Only a CLEAN entry may go"), so once the registry exceeds `MAX_ENTRIES` (30) it disposes and deletes the oldest conflicted entry. That entry holds the user's un-reloaded edits, which the comment on the function promises are "never dropped". `anyUnsaved()` is unaffected because it also checks `saveState === "conflict"`, which is why the existing tests do not catch this.
**Fix:** Keep the doc pending on a 409, or make the registry check state too:
```ts
// annotationSaver.ts, in the catch block
if (error instanceof ApiError && error.status === 409) {
  conflicted = true;
  dirty = true; // the edits are still not on the server
  report("conflict");
  return;
}
```
`schedule`/`flush` already guard on `conflicted`, so this has no other effect. Alternatively add `|| entry.store.getState().meta.saveState === "conflict"` to the `evictIfNeeded` check. Add a registry test with more than 30 entries, one of them conflicted.

### WR-03: Every 4xx except 404/409 discards the user's unsaved edits, including transient ones (408, 429)

**File:** `frontend/src/features/editor/store/annotationSaver.ts:142-148`, `frontend/src/features/editor/EditorPage.tsx:186-190`
**Issue:** The saver classifies any `status < 500` other than 404/409 as "rejected: do not retry". `EditorPage` answers `onRejected` with `resyncAnnotations()`, which calls `discardEditor` (history and pending doc dropped) and refetches the server copy. That is correct for a 422 (the same body would fail forever). It is data loss for 408 Request Timeout and 429 Too Many Requests, or a 4xx returned by a reverse proxy or interposed gateway. Those errors are transient or environmental, and the user's work is thrown away instead of retried on the backoff.
**Fix:** Treat 408 and 429 (and, if desired, any status without a JSON `detail`) as retriable:
```ts
} else if (error instanceof ApiError && error.status < 500 && error.status !== 408 && error.status !== 429) {
  onRejected?.(error);
} else if (!disposed) {
  scheduleRetry();
}
```
Alternatively limit the destructive resync to 422 and show a retry-able error for other 4xx.

### WR-04: The global Space handler breaks keyboard activation of every focused button in the editor

**File:** `frontend/src/features/editor/canvas/AnnotationCanvas.tsx:194-229`
**Issue:** While no modal is open, a window-level `keydown` and `keyup` listener calls `event.preventDefault()` for every Space press whose target is not an INPUT, TEXTAREA, SELECT or contenteditable. A `<button>` fires its click on Space keyup, so with focus on Back, Previous/Next, the toolbar tools, Undo/Redo, the class rows, the Reviewed/Background toggles, the zoom pill, Fit, the object-row eye and delete buttons, or the `?` button, Space does nothing. Keyboard-only users can use only Enter. The code comment justifies the `preventDefault` ("a focused tool button would otherwise be clicked by Space"), but that is also the standard way these controls are used. `role="application"` on the canvas makes it worse.
**Fix:** Take Space for panning only when the canvas container, or `document.body`, is the focus target. Otherwise leave focused interactive elements alone:
```ts
const onKeyDown = (event: KeyboardEvent) => {
  if (event.code !== "Space" || isTextField(event.target) || isInteractive(event.target)) return;
  ...
};
// isInteractive: target instanceof HTMLElement && target.closest("button, a, [role='button'], [role='option'], summary") !== null
```
Add the same check to the `keyup` branch so the listeners stay symmetric.

### WR-05: Out-of-range integers in the save body and the `after` query parameter raise an unhandled `OverflowError` (HTTP 500)

**File:** `backend/src/yolo_trainer_api/schemas.py:218,247` and `backend/src/yolo_trainer_api/routers/annotations.py:63`
**Issue:** `base_version` (`Field(ge=0)`), `BoxIn.class_id` (`Field(ge=1)`) and the `after` query parameter have no upper bound. Python and Pydantic accept any size, and SQLite binds only 64-bit integers. I reproduced this against the app: `PUT .../annotations` with `base_version = 10**30`, the same PUT with a box `class_id = 10**30`, and `GET .../next-unannotated?after=10**30` all raise `OverflowError: Python int too large to convert to SQLite INTEGER`, which surfaces as an uncaught 500 with a traceback in the logs. Other integer path parameters have the same exposure. This is input validation, not a security hole, but the API contract is "422 for invalid payloads".
**Fix:** Bound the integers to the signed 64-bit range:
```python
SQLITE_MAX_INT = 2**63 - 1
base_version: Annotated[int, Field(ge=0, le=SQLITE_MAX_INT)]
class_id: Annotated[int, Field(ge=1, le=SQLITE_MAX_INT)]
after: Annotated[int | None, Query(ge=1, le=SQLITE_MAX_INT)] = None
```
Add a regression test for each of the three inputs.

### WR-06: Migration 0004 downgrade silently drops `AUTOINCREMENT` from `images`

**File:** `backend/src/yolo_trainer_api/migrations/versions/0004_create_annotations.py:79-82`
**Issue:** `downgrade()` uses `op.batch_alter_table("images")`, which on SQLite recreates the table. SQLAlchemy does not reflect `sqlite_autoincrement`, so the recreated table has no `AUTOINCREMENT` (the `ck_images_ext` check and the other indexes survive). I verified this by running `upgrade head` and then `downgrade 0003` on a temp database: `AUTOINCREMENT` is present at head and absent after the downgrade. The model and migration 0002 document that image ids must never be reused because thumbnail and original URLs are cached `immutable` for a year. After a downgrade followed by an upgrade, a deleted image's id can be re-issued and browsers will show the old cached pixels for a different image. This is a downgrade-only path, but it breaks a stated invariant without any warning.
**Fix:** Preserve the table option, or avoid the rebuild:
```python
with op.batch_alter_table("images", table_kwargs={"sqlite_autoincrement": True}) as batch:
    batch.drop_column("annotation_version")
    batch.drop_column("is_reviewed")
    batch.drop_column("is_background")
```
Add a downgrade test that asserts `AUTOINCREMENT` in `sqlite_master.sql`.

## Info

### IN-01: A draft in progress is not abandoned on pointer cancel and is committed even after the editor turned read-only

**File:** `frontend/src/features/editor/canvas/AnnotationCanvas.tsx:496`, `frontend/src/features/editor/EditorPage.tsx:440-451`
**Issue:** `onPointerCancel={endPan}` returns immediately when no pan is active, so a cancelled pointer (touch interruption, alt-tab, OS gesture) mid-draw leaves `startRef` set and the dashed draft visible until the next press. Separately, `handlePointerUp` commits the draft without re-checking `canDraw`, and `handleCreate` does not check `readOnly`. If a 409 arrives mid-drag, a box is added to a read-only editor. The saver ignores it (conflicted), so the local doc silently diverges until Reload.
**Fix:** On pointer cancel call `cancelDraft()` when `startRef.current !== null`. In `handleCreate`, return early when `readOnly`.

### IN-02: Image tile role="button" does not respond to Space

**File:** `frontend/src/features/images/ImageTile.tsx:57-66`
**Issue:** The tile declares `role="button"` and `tabIndex={0}` but only handles Enter. A button role is expected to activate on Space as well, so assistive-technology users who press Space get no response.
**Fix:** Handle `event.key === " "` as well as Enter (still guarded by `event.target === event.currentTarget` so the checkbox keeps its own Space).

### IN-03: The editor reads an unclamped `q` from the URL while the Images page clamps to 255

**File:** `frontend/src/features/editor/lib/urls.ts:10-13`
**Issue:** `ImagesPage` slices the search to 255 characters (the server rejects longer values), but `readGridParams`, which the editor uses for neighbors and next-unannotated, only trims. A hand-edited or pasted editor URL with a `q` longer than 255 characters makes `/neighbors` and `/next-unannotated` answer 422. Prev/Next stay disabled and `N` shows the raw message without any explanation.
**Fix:** Move the `MAX_QUERY_LENGTH` clamp into `readGridParams` and drop the duplicate `normalizeQuery` slice in `ImagesPage`.

### IN-04: Status derivation is implemented in three places, and a router imports a private helper

**File:** `backend/src/yolo_trainer_api/annotations.py:41-51`, `backend/src/yolo_trainer_api/schemas.py:169-175`, `frontend/src/features/editor/store/annotationStore.ts:21-29`, `frontend/src/api/images.ts:64-72`, `backend/src/yolo_trainer_api/routers/annotations.py:24-31`
**Issue:** The "reviewed > background > annotated > unannotated" rule exists as an SQL clause, `derive_status`, `docStatus` and `displayStatus`. The server `status` additionally folds background into "annotated", so the clients rederive from the flags. Any later change (for example a polygon-only state) has to be made in four places, and the tests compare them only indirectly. `routers/annotations.py` also imports the underscore-private `_scoped` from `routers/images.py`.
**Fix:** Consolidate the client functions into one module, keep a single comment that points to the SQL clause, and rename `_scoped` to `scoped_images` (or move it next to `grid_order`) so the import is intentional.

### IN-05: Several tests assert "nothing happens" with fixed real-time sleeps

**File:** `frontend/src/features/editor/EditorStatus.test.tsx:198,247`, `frontend/src/features/editor/EditorNextUnannotated.test.tsx:150`, `frontend/src/features/editor/EditorSaving.test.tsx:205,220,290`
**Issue:** Negative assertions such as "G does nothing while the image has boxes" wait 900 ms of real time. They slow the suite, and under load they can pass vacuously (the debounce timer may not have fired yet, though 900 ms is more than twice the 400 ms window). `test-setup.ts` already documents full-suite load flakes.
**Fix:** Use `vi.useFakeTimers({ shouldAdvanceTime: true })` and `advanceTimersByTimeAsync(500)` (the pattern already used in `EditorSaving.test.tsx`) or assert on the store state (`saver.isDirty()`) instead of waiting.

### IN-06: Misleading `IntegrityError` handling window in `apply_save`

**File:** `backend/src/yolo_trainer_api/annotations.py:206-218`
**Issue:** Pending `Annotation` inserts are autoflushed at the step-5 `session.execute(update(Image)...)`, not at `commit()`. The `try/except IntegrityError` around `commit()` therefore catches almost nothing, and its comment ("a class deleted mid-save surfaces as an FK violation here") is wrong. Today the case cannot occur, because the write lock taken at step 1 blocks a concurrent class delete. Any future change that weakens that lock would turn a rare FK failure into an unhandled 500 instead of the intended 422.
**Fix:** Either `await session.flush()` inside the existing `try` before the commit, or wrap steps 4-6 in the `try` and correct the comment.

---

_Reviewed: 2026-10-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
