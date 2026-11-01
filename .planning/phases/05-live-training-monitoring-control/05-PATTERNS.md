# Phase 5: Live Training Monitoring & Control - Pattern Map

**Mapped:** 2026-10-11
**Files analyzed:** 32 (new + modified)
**Analogs found:** 31 / 32 (all analogs are git-tracked; verified through `git ls-files`)

Phase 5 extends the Phase 4 pipeline, so most files are MODIFIED and the analog is the file itself (the excerpt shows the exact seam to extend). Brand-new files copy the closest sibling.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/yolo_trainer_api/migrations/versions/0006_training_control.py` (NEW) | migration | batch/DDL | `.../versions/0005_training.py` (+ its `images.split` ADD COLUMN) | role-match |
| `backend/src/yolo_trainer_api/models.py` (MOD `TrainingRun`) | model | CRUD | itself, lines 196-252 | exact |
| `backend/src/yolo_trainer_api/schemas.py` (MOD `RunSummary`/`RunRead`/`ActiveRun`) | model (pydantic) | request-response | itself, lines 543-599 | exact |
| `backend/src/yolo_trainer_api/routers/runs.py` (MOD: stream, cancel, resume, interim-best, widened DELETE) | controller | request-response + streaming | itself (lines 93-123) + `routers/models.py` (download) | exact / role-match |
| `backend/src/yolo_trainer_api/training/service.py` (MOD: cancel_run, resume_run, delete_run, summary fields) | service | CRUD (guarded UPDATE/DELETE) | `remove_queued_run` (lines 270-298), `_summary_fields` (323-344) | exact |
| `backend/src/yolo_trainer_api/training/reconcile.py` (MOD: honor cancel flag) | service | batch | itself, lines 33-80 | exact |
| `backend/src/yolo_trainer_api/routers/projects.py` (MOD: share file removal) | controller | CRUD/file-I/O | `_remove_project_files` (lines 119-142) | exact |
| `backend/src/yolo_trainer_api/storage.py` (reuse only) | utility | file-I/O | `remove_run_dir` / `remove_model_file` (156-168) | exact |
| `backend/src/yolo_trainer_common/progress.py` (MOD: new events, `enrich_event`, `compact_replay`, offset-returning tail) | utility | transform / streaming | itself (`ProgressTail`, `primary_metrics`) | exact |
| `backend/src/yolo_trainer_common/failures.py` (NEW) | utility | transform | `progress.py` (pure, torch-free, module constants + small pure funcs) | role-match |
| `backend/src/yolo_trainer_worker/train_job.py` (MOD: `train_start`, `batch_progress`, `--resume`, typed errors, category in error.json) | worker entry | event-driven (callbacks -> JSONL) | itself, lines 104-225 | exact |
| `backend/src/yolo_trainer_worker/supervisor.py` (MOD: cancel flag, resume cmd, duration, category) | service | event-driven / polling | itself, lines 187-342 | exact |
| `backend/src/yolo_trainer_worker/queue.py` (MOD: `mark_cancelled`, claim, record extras) | service | CRUD (guarded UPDATE) | itself, lines 48-161 | exact |
| `backend/tests/fake_train_job.py` + `training_helpers.py` (MOD: resume/batch/cancel modes, `fake_command` kwarg) | test helper | file-I/O | themselves | exact |
| `backend/tests/test_migrations.py` (MOD: 0005 -> 0006 test) | test | batch | `test_0005_downgrades_to_0004_and_back...` (186-210) | exact |
| `backend/tests/test_progress.py` (MOD) / `test_failures.py` (NEW) | test | transform | `test_progress.py` (pure table tests) | exact |
| `backend/tests/test_runs_cancel.py`, `test_runs_resume.py`, `test_runs_stream.py`, `test_runs_delete.py` (NEW) | test | request-response | `backend/tests/test_runs_remove.py` | exact |
| `docker/Dockerfile.backend` (MOD api CMD `--timeout-graceful-shutdown 5`) | config | n/a | itself, line 26 (per RESEARCH) | exact |
| `frontend/package.json` (MOD: `recharts@3.10.1`) | config | n/a | existing deps | n/a |
| `frontend/src/api/training.ts` (MOD: fields, mutations, stream hook) | service (client) | request-response + SSE | itself, lines 240-302 | exact |
| `frontend/src/features/training/progress/foldProgress.ts`, `eta.ts` (NEW) | utility (pure) | transform | `formatClock` in `RunPage.tsx` (pure, exported helper); `test/trainingApi.ts` for fixtures | partial |
| `frontend/src/features/training/progress/useRunStream.ts` (NEW) | hook | streaming (EventSource) | `useRun` in `api/training.ts` (query + invalidation) and `useElapsedSeconds` in `RunPage.tsx` (effect + cleanup) | role-match |
| `frontend/src/features/training/progress/RunCharts.tsx`, `BatchProgress.tsx` (NEW) | component | transform (render) | `RunPage.tsx` `RunningBody` (Progress.Root, `Intl.NumberFormat`), `RunMetrics.tsx` | role-match |
| `frontend/src/features/training/CancelRunModal.tsx`, `DeleteRunModal.tsx` (NEW) | component | request-response | `RemoveFromQueueModal.tsx` | exact |
| `frontend/src/features/training/ResumeButton.tsx`, `FailureCard.tsx`, `FinalResultsCard.tsx` (NEW) | component | request-response | `RunPage.tsx` `FailedAlert`/`InterruptedAlert`/`CompletedBody`, `RunMetrics.tsx`, `RunFailureLog.tsx` | role-match |
| `frontend/src/features/training/RunPage.tsx` (MOD) | component | request-response | itself | exact |
| `frontend/src/features/training/TrainingPage.tsx` + `TrainingPage.module.css` (MOD: sortable/filterable table) | component | CRUD (list) | itself + `ImagesPage.tsx` `useSearchParams` block (lines 75-125) | exact |
| `frontend/src/test/trainingApi.ts`, `frontend/src/test-setup.ts` (MOD: new `makeRun` fields, `FakeEventSource`, recharts size) | test helper | n/a | themselves | exact |
| `frontend/src/i18n/locales/{en,ru}/training.json` (MOD) | config (i18n) | n/a | itself | exact |
| `frontend/src/features/training/*.test.tsx` (MOD/NEW) | test | n/a | `RunPage.test.tsx`, `TrainingPage.test.tsx`, `ActiveRunIndicator.test.tsx` | exact |

## Pattern Assignments

### `backend/src/yolo_trainer_api/migrations/versions/0006_training_control.py` (migration, additive DDL)

**Analog:** `backend/src/yolo_trainer_api/migrations/versions/0005_training.py`

**Header / revision pattern** (lines 1-21):
```python
"""image splits, training runs and the model registry

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-05

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
```
Use `revision = "0006"`, `down_revision = "0005"`.

**ADD COLUMN pattern** (lines 30-34): 0005 used a single portable `op.execute("ALTER TABLE images ADD COLUMN ...")` because SQLite cannot add table-level constraints in place. For 0006 (no CHECK, RESEARCH Pattern 1) use `op.add_column("training_runs", sa.Column(...))` for the 7 columns (`error_category` String(32) NULL, `resume_count` Integer NOT NULL `server_default="0"`, `active_seconds` Float NOT NULL `server_default="0"`, `segment_started_at`/`cancel_requested_at` `DateTime(timezone=True)` NULL, `resume_epoch` Integer NULL, `last_map50_95` Float NULL). Do NOT touch `ck_training_runs_status` (lines 77-81).

**Downgrade pattern** (lines 146-149): use `with op.batch_alter_table("training_runs") as batch: batch.drop_column(...)` (the 0005 downgrade already uses `batch_alter_table` for `images`).

**Test analog:** `backend/tests/test_migrations.py:186-210` (`command.upgrade(config, "head")`, seed, `command.downgrade(config, "0004")`, inspect with `sqlite3`, upgrade again). Add a populated 0005 -> 0006 upgrade test that asserts old rows get `resume_count == 0`, `active_seconds == 0`, NULL for the rest.

---

### `backend/src/yolo_trainer_api/models.py` (model, `TrainingRun`)

**Analog:** itself, lines 196-252. New columns follow the existing typed `Mapped[...]` style:
```python
epoch: Mapped[int | None] = mapped_column(Integer, nullable=True)
last_map50: Mapped[float | None] = mapped_column(Float, nullable=True)
progress_updated_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), nullable=True
)
```
Add `resume_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")`, same for `active_seconds` (`Float`). Keep the `__table_args__` CHECK (lines 239-246) unchanged.

---

### `backend/src/yolo_trainer_api/schemas.py` (pydantic read models)

**Analog:** itself. `RunSummary` (lines 543-573) and `RunRead(RunSummary)` (592-599). Additive fields only (`error_category`, `resume_count`, `active_seconds`, `segment_started_at`, `cancelling`, `resume_epoch`, `can_resume`, `resume_blocked`, `map50_95`, `image_count`, `interim_best`, compact settings). Keep `model_config = ConfigDict(from_attributes=True)`, `@field_serializer("started_at") -> _utc_iso(value)` for every new datetime (copy `ActiveRun`, lines 576-589). New request bodies use `extra="forbid"` (established pattern).

---

### `backend/src/yolo_trainer_api/training/service.py` (service: cancel_run, resume_run, delete_run)

**Analog:** `remove_queued_run`, lines 270-298 (the guarded-statement + disambiguating re-select + 404/409 template to copy for all three actions):
```python
result = await session.execute(
    delete(TrainingRun).where(
        TrainingRun.id == run_id,
        TrainingRun.project_id == project_id,
        TrainingRun.status == "queued",
    )
)
await session.commit()
if result.rowcount == 0:
    exists = (
        await session.execute(
            select(TrainingRun.id).where(
                TrainingRun.id == run_id, TrainingRun.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail=RUN_NOT_FOUND_DETAIL)
    raise HTTPException(status_code=409, detail=RUN_NOT_QUEUED_DETAIL)
await _remove_folder(settings, run_id)
```
- `cancel_run`: swap `delete` for `update(TrainingRun).values(cancel_requested_at=utcnow()).where(..., status == "running", cancel_requested_at.is_(None))`. On rowcount 0 and `cancel_requested_at` already set while `running` return 200 (idempotent), else 409.
- `resume_run`: `update(...).values(status="queued", resume_count=TrainingRun.resume_count + 1, finished_at=None, cancel_requested_at=None, error_message=None, error_category=None, log_tail=None).where(status.in_(("interrupted","cancelled","failed")))` with no resume_epoch condition (D-10; RESEARCH Open Question 4 user-confirmed 2026-10-11: Phase 4 rows with a last.pt are resumable). Before it call `ensure_device_available(settings, run.settings["device"])` (imported in `routers/runs.py:18`) and run the read-only `resume_state(data_dir, run)` pre-check via `asyncio.to_thread` (last.pt exists; checkpoint not ended or refused; epoch from `resume_epoch` or derived from progress events), as specified in Plan 05-06.
- `delete_run`: widen the guard to `status.not_in(("preparing","running","queued"))` (queued stays on the queue action path or is allowed, see RESEARCH Pattern 7); collect `TrainedModel.id` where `source_run_id == run_id` before the DELETE (FK cascade removes model rows), then remove files via the shared helper below.
- Error constants live at the top (lines 54-65): add `RUN_NOT_CANCELLABLE_DETAIL`, `RUN_NOT_RESUMABLE_DETAIL`, `RUN_ACTIVE_DETAIL` as plain English (P1 D-05).

**File removal helper** (`_remove_folder`, lines 220-224): logs and swallows; reuse and extend it with model files:
```python
async def _remove_folder(settings: Settings, run_id: int) -> None:
    try:
        await asyncio.to_thread(storage.remove_run_dir, settings, run_id)
    except Exception:
        logger.exception("Could not remove the folder of run %s", run_id)
```

**Read model pattern** (lines 323-344 `_summary_fields`, 347-381 `run_summaries`, 384-407 `run_read`): extend `_summary_fields` with the new keys; `map50_95` from `primary_metrics(run.task_type, run.metrics)["map50_95"]` else `run.last_map50_95`. Any filesystem check (`can_resume`, `interim_best`) must be done in `asyncio.to_thread` and only for the single-run `run_read`, not per row in `run_summaries` (bind-mount cost, Phase 4 Pitfall 4); the list carries no resumability field (the UI-SPEC history list needs none, and a DB-only rule would be wrong for Phase 4 rows; Plans 05-06/05-07).

**Download name** (lines 301-311) `model_download_name(project_name, model_name)` -> reuse for interim best with `run.name + "_interim"`.

---

### `backend/src/yolo_trainer_api/routers/runs.py` (controller: stream, cancel, resume, interim-best, delete)

**Analog:** itself. Router/dependency conventions (lines 1-21, 93-123):
```python
router = APIRouter(prefix="/api", tags=["training"])

@router.delete(
    "/projects/{project_id}/runs/{run_id}",
    status_code=204,
    dependencies=[Depends(require_xhr)],
)
async def remove_run(project_id: int, run_id: int, request: Request,
                     session: AsyncSession = Depends(get_session)) -> Response:
    await get_project_or_404(session, project_id)
    await service.remove_queued_run(session, request.app.state.settings, project_id, run_id)
    return Response(status_code=204)
```
- Mutating POSTs (`/cancel`, `/resume`) copy this shape with `dependencies=[Depends(require_xhr)]` and `response_model=RunRead`, returning `await service.run_read(session, run)` like `start_run` (lines 47-48).
- `get_run` (lines 109-123) is the run-ownership-check template (`TrainingRun.id == run_id, TrainingRun.project_id == project_id`, 404 with `service.RUN_NOT_FOUND_DETAIL`). Reuse for the stream's pre-flight check.
- **SSE exception to the `Depends(get_session)` pattern:** do NOT hold `get_session` for the stream lifetime (RESEARCH Pattern 4; `db.py:63-66` yields a request-scoped session). Use `request.app.state.sessionmaker()` in short `async with` blocks, as `prepare_run_files` does (`service.py:248-254`: `async with sessionmaker() as session:` ... `commit()`).

**Interim-best download analog:** `backend/src/yolo_trainer_api/routers/models.py` lines 21-42:
```python
path = layout.model_file(settings.data_dir, model.id)   # id-derived, never request input (T4-03)
if not path.is_file():
    raise HTTPException(status_code=404, detail=MODEL_NOT_FOUND_DETAIL)
...
return FileResponse(path, filename=model_download_name(project_name, model.name),
                    media_type="application/octet-stream")
```
For interim best use `layout.best_weights(layout.run_dir(settings.data_dir, run.id))`, only for non-active runs, 404 when absent or zero size (`stat().st_size == 0`), via `asyncio.to_thread`.

---

### `backend/src/yolo_trainer_common/progress.py` (utility: events, tail with offsets, enrich, compact)

**Analog:** itself.

**Constants** (lines 19-22): add `EVENT_TRAIN_START = "train_start"`, `EVENT_BATCH_PROGRESS = "batch_progress"`, `SCHEMA_VERSION = 2` next to them.

**Tail rule to reuse for offsets** (lines 64-97): the complete-line rule must be preserved; the SSE variant adds each line's end offset:
```python
end = chunk.rfind(b"\n")
if end < 0:
    return []
self.offset += end + 1
for raw in chunk[:end].split(b"\n"):
    ...
    except (UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("Skipping an undecodable progress line in %s", path)
        continue
```
Add a sibling method (e.g. `read_new_lines(path) -> list[tuple[int, dict]]`) tracking running `start + position + len(raw) + 1`; keep `read_new_events` unchanged for the supervisor.

**Enrich pattern** (lines 100-128): `enrich_event(task_type, event)` must call `primary_metrics(task_type, event["metrics"])` (suffix mapping `_suffix`, lines 100-101) so `(B)`/`(M)` stays in Python. Remember `_number()` filters bool/non-finite.

Keep the module pure and torch-free (the api imports it).

---

### `backend/src/yolo_trainer_common/failures.py` (NEW, pure classifier)

**Analog:** `backend/src/yolo_trainer_common/progress.py` (module docstring "Pure and torch-free", module-level constants, small pure functions, `re.compile` at module level, line 26 `_ANSI_ESCAPE`). Shape:
```python
OUT_OF_MEMORY = "out_of_memory"; DISK_FULL = "disk_full"; INVALID_DATASET = "invalid_dataset"
WEIGHTS_DOWNLOAD = "weights_download"; PROCESS_KILLED = "process_killed"
NOT_RESUMABLE = "not_resumable"; UNKNOWN = "unknown"
CATEGORIES = frozenset({...})

def classify_exception(type_name: str, message: str, errno_code: int | None = None) -> str: ...
def classify_exit(exit_code: int | None, log_tail: str) -> str: ...
```
Ordered rules, first match wins (RESEARCH Pattern 11 table). Test with literal message fixtures (see `test_progress.py` table-style tests, e.g. line 101 `test_primary_metrics_pick_the_box_family...`).

---

### `backend/src/yolo_trainer_worker/train_job.py` (worker entry: new events, resume)

**Analog:** itself.

**Imports + event constants** (lines 19-26): extend the `yolo_trainer_common.progress` import with `EVENT_TRAIN_START`, `EVENT_BATCH_PROGRESS`; import `classify_exception` from `failures`.

**Callback registration pattern** (lines 138-181; new callbacks go beside these, same `# noqa: ANN001` closure style over `state`):
```python
writer = ProgressWriter(run_directory / layout.PROGRESS_FILE)
state: dict = {"pending": False, "last_epoch": 0, "final_metrics": None}

def on_train_epoch_end(trainer) -> None:  # noqa: ANN001
    state["pending"] = True
    state["last_epoch"] = trainer.epoch + 1
    writer.emit(EVENT_TRAIN_EPOCH_END, epoch=trainer.epoch + 1, epochs=trainer.epochs, tloss=trainer.tloss)
...
model.add_callback("on_train_epoch_end", on_train_epoch_end)
model.add_callback("on_fit_epoch_end", on_fit_epoch_end)
```
Add `on_train_start` (emit `train_start` with `epochs`, `start_epoch=trainer.start_epoch`, `resumed=bool(trainer.resume)`, `nb=len(trainer.train_loader)`), `on_train_epoch_start` (reset `state["batch"] = 0`), `on_train_batch_end` (increment own counter, throttle with `time.monotonic()` >= 2 s, always emit the last batch `batch == nb`). Extend `on_fit_epoch_end` (lines 151-165) with `last_epoch=bool(trainer.stop)` and `fitness` for non-final events. Keep the `final = not state["pending"]` final-validation rule untouched (D-12).

**Writer** (lines 104-115): `ProgressWriter.emit` appends `{"event", "time", **fields}` through `jsonable`; add `"v": 2` here. In resume mode, ensure the file ends with `\n` before the first emit (Pitfall 5).

**Resume path:** branch inside `_train` (lines 118-212) before `_resolve_weights` (line 135): on `--resume` skip `_resolve_weights`, `YOLO(str(layout.last_weights(run_directory)))`, validate `model.ckpt` (`epoch < 0`, `optimizer is None`, `epoch + 1 >= epochs`) and call `model.train(resume=True, save_dir=str(run_directory / "out" / "train"), data=..., imgsz=..., batch=args.batch, device=args.device, workers=args.workers, plots=False, verbose=False)` (RESEARCH Pattern 5 recipe; extends the `model.train(...)` call at lines 183-195). Read the base sha from a `base.json` written in the first segment (replaces `_sha256(weights)` at line 210). Add `--resume` as `action="store_true"` to `_parse_args` (lines 31-43).

**Typed errors:** replace the plain `RuntimeError` at lines 85-88 with `WeightsDownloadError(RuntimeError)`; add `NotResumableError`, `CheckpointError`.

**Error file** (lines 215-225) is where the category is added:
```python
except Exception as exc:
    layout.write_json_atomic(
        args.run_dir / layout.ERROR_FILE, {"type": type(exc).__name__, "message": str(exc)}
    )
    traceback.print_exc()  # lands in train.log
    return 1
```
-> add `"category": classify_exception(type(exc).__name__, str(exc), getattr(exc, "errno", None))`.

**Argument safety pattern** (lines 35-39, 46-47): keep validated-only argparse types (T4-02) for any new CLI flag.

---

### `backend/src/yolo_trainer_worker/supervisor.py` (service: cancel, resume, duration, category)

**Analog:** itself.

**Command builder** (lines 81-100): extend `default_command(run_directory, data_dir, resolved)` and `CommandBuilder = Callable[[Path, Path, Resolved], list[str]]` with a keyword `resume: bool = False` that appends `"--resume"` to the list. `tests/training_helpers.py:fake_command` (lines 154-160) builds against this exact signature; update both in the same plan.

**Cancel hook point** (lines 291-306 inside `_watch`): this is where the existing tick checks `_still_running` and `stop_event`; add a cancel branch next to the `stop_event` one, copying its shape:
```python
if stop_event.is_set():
    self._terminate(process)
    queue.mark_interrupted(self.engine, run_id, STOPPED_MESSAGE,
                           _read_log_tail(run_directory / layout.LOG_FILE))
    outcome = "interrupted"
    break
```
-> replace `_still_running` (lines 312-318) with a status+cancel-flag read (e.g. `queue.run_state`) that still treats `OperationalError` as "alive":
```python
except OperationalError:
    logger.warning("Could not check run %s; assuming it is still running", run_id)
    return True
```
On cancel flag: `self._terminate(process)` then `queue.mark_cancelled(...)`, outcome `"cancelled"`.

**Terminate** (lines 320-342): reuse as is (`os.killpg` SIGTERM -> `TERMINATE_GRACE_SECONDS=10` -> SIGKILL on posix; `process.terminate()`/`kill()` on Windows; Popen options at lines 208-212 already use `start_new_session` / `CREATE_NEW_PROCESS_GROUP`). Document the Windows limitation instead of adding CTRL_BREAK (RESEARCH summary).

**Event loop to extend** (lines 265-290): the `for event in tail.read_new_events(progress_path)` loop currently filters `event.get("event") != EVENT_FIT_EPOCH_END: continue`. Extend it to also handle `model_save` (-> `resume_epoch`), `fit_epoch_end` with `last_epoch` (-> clear `resume_epoch`), and keep the `OperationalError` guard (lines 283-286) around every new DB write.

**Failure finish** (lines 374-381): add category:
```python
message = _read_error_message(run_directory / layout.ERROR_FILE)
if message is None:
    message = f"The training process exited with code {exit_code}." ...
queue.mark_failed(self.engine, run_id, message, log_tail)
```
-> read `category` from `error.json` (extend `_read_error_message` lines 116-122 or add `_read_error_category`), else `classify_exit(exit_code, log_tail)`, pass to `mark_failed(..., category=...)`.

**Resume segment:** in `_run` (lines 187-240) use `run["resume_count"] > 0` to pass `resume=True` and reuse stored `run["resolved"]` instead of `resolve_settings(...)` (line 197). Track a monotonic segment start in `_run` and pass `active_seconds` into every terminal `queue.mark_*` call.

---

### `backend/src/yolo_trainer_worker/queue.py` (service: guarded UPDATEs)

**Analog:** itself.

**Single guarded UPDATE helper** (lines 114-122) is the base for every new write; `mark_cancelled` copies `mark_interrupted` (lines 153-161):
```python
def _update_running(engine: Engine, run_id: int, **values: object) -> int:
    with engine.begin() as connection:
        result = connection.execute(
            update(TrainingRun)
            .where(TrainingRun.id == run_id, TrainingRun.status == "running")
            .values(**values)
        )
        return result.rowcount

def mark_interrupted(engine, run_id, message, log_tail=None) -> int:
    return _update_running(engine, run_id, status="interrupted", error_message=message,
                           log_tail=log_tail, finished_at=utcnow())
```
`mark_cancelled(engine, run_id, log_tail, active_seconds)` sets `status="cancelled"`, `finished_at`, `error_message=None`, `segment_started_at=None`. `mark_failed` (142-150) and `mark_interrupted` gain `error_category`/`active_seconds`/`segment_started_at=None`.

**Claim** (lines 48-68): the `.values(status="running", started_at=stamp, progress_updated_at=stamp)` (line 64) becomes `started_at=func.coalesce(TrainingRun.started_at, stamp)`, plus `segment_started_at=stamp`, `finished_at=None`, `cancel_requested_at=None`. Keep the `oldest_queued`/`something_running` aliased subqueries as is.

**`load_run`** (lines 91-103): add `resume_count`, `resolved`, `active_seconds`. **`run_status`** (106-111): add a sibling `run_state` returning `(status, cancel_requested_at)` in one tiny SELECT. **`record_epoch`** (129-139): add optional `map50_95` -> `last_map50_95`. **`reconcile_on_start`** (71-88): if `cancel_requested_at IS NOT NULL` -> `cancelled`, else `interrupted` (two UPDATEs, same `where(status == "running")` form). **`register_model`** (175-242): add `active_seconds`, `segment_started_at=None`, `resume_epoch=None` to the completing `.values(...)` (lines 223-231).

---

### `backend/src/yolo_trainer_api/training/reconcile.py` (service, startup sweep)

**Analog:** itself, lines 62-78: the `if not worker_alive: update(...).where(TrainingRun.status == "running").values(status="interrupted", error_message=RUNNING_INTERRUPTED_DETAIL, finished_at=stamp)`. Split by `cancel_requested_at` as in `queue.reconcile_on_start`.

---

### `backend/src/yolo_trainer_api/routers/projects.py` (shared removal)

**Analog:** `_remove_project_files`, lines 119-142 (log-and-skip per run folder and per model file):
```python
for run_id in run_ids:
    try:
        remove_run_dir(settings, run_id)
    except Exception:
        logger.exception("Could not remove the folder of run %s of deleted project %s", run_id, project_id)
for model_id in model_ids:
    try:
        remove_model_file(settings, model_id)
    except Exception:
        logger.exception(...)
```
Extract the two loops into one helper (put it in `training/service.py` or `storage.py`) used by both project delete and `delete_run`. Guards come from `storage.remove_run_dir` / `remove_model_file` (`storage.py:156-168`, direct-child, non-symlink).

---

### `backend/src/yolo_trainer_api/routers/runs.py` SSE generator (streaming)

**No in-repo SSE analog** (see "No Analog Found"). Compose from: `ProgressTail` (tail rule), `asyncio.to_thread` file reads (as `service.py:130,222`), short sessions via `request.app.state.sessionmaker()` (as `service.py:248`), `fastapi.sse.EventSourceResponse` + `ServerSentEvent(id=, event=)` per RESEARCH Pattern 4. Test pattern: iterate the extracted async generator directly (TestClient buffers the whole body and never returns from an infinite stream, RESEARCH Pattern 4 "Testing").

---

### `backend/tests/test_runs_*.py` (NEW API tests)

**Analog:** `backend/tests/test_runs_remove.py` (lines 1-60). Template:
```python
from .training_helpers import XHR, fake_command, setup_project, start_run, wait_status, worker_settings

def _url(project_id: int, run_id: int) -> str:
    return f"/api/projects/{project_id}/runs/{run_id}"

def _worker_engine(settings: Settings) -> Engine:
    return queue.create_worker_engine(worker_settings(settings))

def _force_status(engine: Engine, run_id: int, status: str) -> None:
    with Session(engine) as session, session.begin():
        session.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(status=status))
```
Drive the real api (`client`/`settings` fixtures) plus a `Supervisor(...)` built with `fake_command(mode)` (see imports at lines 12-26; `Supervisor` + `ComputeDevice`). Add `fake_train_job.py` modes: `sleep` already exists (one real epoch then `time.sleep(60)`, lines 66-69) and is the cancel/resume hook; add `batch`, `resume` (emit `train_start` with `start_epoch`), and `--resume` arg handling. `fake_command.build` (training_helpers.py:154-160) must accept the new `resume` keyword.

---

### `frontend/src/api/training.ts` (client: fields, mutations, stream hook)

**Analog:** itself.

**Type additions:** `RunSummary` (lines 55-74) / `RunDetail` (76-84) get the additive fields; add `ErrorCategory` string-union type; add `StreamStatus`/`ProgressEvent` types.

**Query keys** (lines 190-196) `trainingKeys.run/runs/active`: reuse for `setQueryData`/`invalidateQueries` from the stream hook.

**Polling rule to modify** (`useRun`, lines 218-232):
```typescript
refetchInterval: (query) => {
  if (isNotFound(query.state.error)) return false;
  const run = query.state.data;
  return run !== undefined && isActiveRunStatus(run.status) ? RUN_POLL_INTERVAL_MS : false;
},
```
Lower to a slow safety poll (15 s) while `running` with a healthy stream, keep 3 s for `preparing`/`queued` or stream down (RESEARCH Pattern 10).

**Mutation pattern** (`useRemoveQueuedRun`, lines 285-298) for `useCancelRun`, `useResumeRun`, `useDeleteRun`:
```typescript
export function useRemoveQueuedRun(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) =>
      apiRequest<void>(`/projects/${projectId}/runs/${runId}`, { method: "DELETE" }),
    onSuccess: (_data, runId) => {
      queryClient.removeQueries({ queryKey: trainingKeys.run(projectId, runId) });
      void queryClient.invalidateQueries({ queryKey: trainingKeys.runs(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}
```
Cancel/resume: `method: "POST"`, `apiRequest<RunDetail>`, `onSuccess` -> `setQueryData(trainingKeys.run(...), data)` + invalidate `runs` and `active` keys. Download URL helpers: copy `modelDownloadUrl` (lines 300-302) for `interimBestUrl(projectId, runId)`.

---

### `frontend/src/features/training/progress/useRunStream.ts` (hook, EventSource)

**Analog (partial):** `useElapsedSeconds` in `RunPage.tsx` lines 39-52 for the effect-with-cleanup shape, and `useRun` in `api/training.ts` for query-cache integration:
```typescript
useEffect(() => {
  if (!active) { return; }
  setNow(Date.now());
  const timer = window.setInterval(() => setNow(Date.now()), 1000);
  return () => window.clearInterval(timer);
}, [active, startedAt]);
```
Same structure: `new EventSource(url)` in an effect keyed by `(projectId, runId)`, `addEventListener("progress"|"status"|"end")`, cleanup `source.close()`. URL is a plain same-origin path (`/api/projects/${id}/runs/${rid}/stream`), like `modelDownloadUrl`. Fall back to polling when `readyState === CLOSED`.

---

### `frontend/src/features/training/progress/foldProgress.ts`, `eta.ts` (pure reducers)

**Analog (partial):** `formatClock` in `RunPage.tsx` lines 29-37 (exported pure function, tested directly). Keep both modules framework-free with unit tests in the same folder. Behavior is specified in RESEARCH Patterns 8-9 (key by epoch, truncate on `train_start`, discover `val/*` keys, final validation never a row, ETA from segment-local epoch deltas).

---

### `frontend/src/features/training/progress/RunCharts.tsx`, `BatchProgress.tsx` (components)

**Analog:** `RunPage.tsx` `RunningBody` lines 241-317 for the Progress + number formatting + i18n idiom:
```tsx
const { t, i18n } = useTranslation("training");
const shown = hasEpoch ? Math.min(run.epoch as number, epochs as number) : 0;   // never Y+1 (D-12)
new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)
<Progress.Root size={8} role="progressbar" aria-valuemin={0} aria-valuemax={epochs as number}
  aria-valuenow={shown} aria-live="off">
  <Progress.Section value={(shown / (epochs as number)) * 100} withAria={false} />
</Progress.Root>
```
`BatchProgress` copies this block (second bar, `batch`/`nb`). Constants `TABULAR`/`ONE_LINE` (RunPage.tsx lines 33-34) are reused for number styling. Mantine dark theme colors via `var(--mantine-color-dark-6)` (as `StatusCard`, line 233). Charts: Recharts `LineChart` + `ResponsiveContainer` (no repo analog; use RESEARCH Pattern 9, `isAnimationActive={false}`, `initialDimension` in tests).

---

### `frontend/src/features/training/CancelRunModal.tsx`, `DeleteRunModal.tsx` (components)

**Analog:** `frontend/src/features/training/RemoveFromQueueModal.tsx` (full file, 98 lines): copy verbatim, swapping the mutation hook and i18n keys.

Key parts to copy:
```tsx
const { t } = useTranslation(["training", "projects", "common"]);
const remove = useRemoveQueuedRun(projectId);
const isSubmittingRef = useRef(false);   // blocks a rapid second Enter/click

function handleClose() { if (remove.isPending) return; isSubmittingRef.current = false; remove.reset(); onClose(); }
function handleConfirm() {
  if (isSubmittingRef.current) return;
  isSubmittingRef.current = true;
  remove.mutate(run.id, { onSuccess: () => {...navigate("..", { relative: "path" }); notifications.show({color:"green", message: t("training:run.remove.done", {name: run.name})});},
                          onError: () => { isSubmittingRef.current = false; } });
}
const errorMessage = remove.error instanceof ApiError || remove.error instanceof Error ? remove.error.message : null;
<Modal opened={opened} onClose={handleClose} size={440} title={<Text fz={16} fw={600}>...</Text>}
  closeOnClickOutside={!remove.isPending} closeOnEscape={!remove.isPending}>
  ... <Alert color="red" title={t("common:error.title")}>{errorMessage}</Alert> ...
  <Button variant="default" data-autofocus onClick={handleClose} ...>{t("projects:modal.cancel")}</Button>
  <Button color="red" loading={remove.isPending} onClick={handleConfirm}>...</Button>
```
Cancel modal: on success do NOT navigate (the run page stays and shows "Cancelling..."); body text is "Training will stop at epoch X..." with `{{epoch}}`. Delete modal: navigate back to the list and warn that the model is deleted too (D-15).

---

### `frontend/src/features/training/RunPage.tsx` (component, MOD)

**Analog:** itself.

- Header action row (lines 133-155): `completed` shows the download button, `queued` shows the red "Remove from queue" button. Add `running` -> Cancel (`color="red"`, `variant="light"`, opens `CancelRunModal`), `interrupted|cancelled|failed` -> `ResumeButton` (disabled with reason when `!run.can_resume`), non-active -> Delete.
- `StatusCard` (lines 217-240): status switch; `FailedAlert` (183-199) gets `FailureCard` with localized category title + hint above the raw `error_message` and `RunFailureLog`. `CancelledAlert` (211-217) adds Resume and "Download interim best.pt" link. `InterruptedAlert` (200-210) replaces the "start a new run" button with Resume.
- Completed duration (lines 336-340) currently `finished_at - started_at`; replace with `active_seconds` (+ live `now - segment_started_at`) per D-09.
- `StatusAnnouncer` (lines 160-181) polite live region: add `cancelled` branch only.
- Follow the modal wiring at lines 156-168 (`removeOpened` state, `onClose` refetches the run).

---

### `frontend/src/features/training/TrainingPage.tsx` + `TrainingPage.module.css` (history table)

**Analog:** itself (lines 28-158) for the header-row/row grid and `RunRow`; `frontend/src/features/images/ImagesPage.tsx` lines 75-125 for URL-state sort/filter:
```tsx
const [searchParams, setSearchParams] = useSearchParams();
...
const params = new URLSearchParams();
if (next.sort === "name") params.set("sort", "name");
// Defaults are omitted; an unchanged URL is not written again
if (params.toString() !== searchParams.toString()) setSearchParams(params, { replace: true });
```
Add `sort`, `dir`, `status` params; nulls sort last; the header row (lines 87-107) becomes clickable column headers; extend the grid columns in `TrainingPage.module.css` (`headerRow`/`row`/`cell`/`numeric`/`download`) for duration, epochs X/Y, key settings, mAP50-95, image count. Download cell (lines 143-155) stays for completed runs.

---

### `frontend/src/test/trainingApi.ts`, `frontend/src/test-setup.ts` (test helpers)

**Analog:** themselves. `makeRun` (trainingApi.ts lines 56-80) is an untyped `Json` literal "so additive fields in later plans must never break `tsc`": add new fields with defaults (`error_category: null`, `resume_count: 0`, `active_seconds: 0`, `cancelling: false`, `can_resume: false`, ...). `test-setup.ts` stubs missing jsdom APIs with `if (!("ResizeObserver" in window))` guards (lines 40-48); add the same guarded stub style for a global `FakeEventSource` (or put it in a `test/` helper imported per test), exposing `emit(name, data, id)`.

---

### `frontend/src/i18n/locales/{en,ru}/training.json`

**Analog:** itself. Existing nesting: `list.columns.*`, `status.*`, `run.remove.*`, `run.failed.*`, `run.interrupted.*`, `run.cancelled.*`. Add `failure.<code>.title/hint` (keys = category codes, fallback `failure.unknown`), `run.cancel.*`, `run.resume.*`, `run.delete.*`, `list.columns.{duration,epochs,settings,map5095,images}`, `chart.*`. Keep en and ru key sets identical (no hardcoded strings, P1 D-02).

---

## Shared Patterns

### Single-writer guarded transitions (cross-process control through the DB)
**Source:** `backend/src/yolo_trainer_worker/queue.py:114-122` (`_update_running`) and `backend/src/yolo_trainer_api/training/service.py:279-297` (`remove_queued_run`)
**Apply to:** `cancel_run`, `resume_run`, `delete_run`, `mark_cancelled`, `claim_next`, `reconcile_*`. Every state change is ONE UPDATE/DELETE with `WHERE status = ...` in the predicate; rowcount 0 -> re-select to choose 404 vs 409. The api never signals the worker PID (`queue.py:71-77` docstring; T4-05-02).

### Mutating route protection
**Source:** `backend/src/yolo_trainer_api/routers/runs.py:23-28, 93-97`
**Apply to:** `POST .../cancel`, `POST .../resume`, widened `DELETE .../runs/{run_id}`
```python
dependencies=[Depends(require_xhr)]
```
GET routes (stream, interim-best) are unauthenticated GETs behind the app-level Host allow-list; `require_xhr` does not apply to them.

### Path safety
**Source:** `backend/src/yolo_trainer_api/routers/models.py:29-32`, `backend/src/yolo_trainer_api/storage.py:156-168`, `layout.run_dir/best_weights/last_weights`
**Apply to:** SSE tail path, interim best download, run delete. Paths come from integer ids through `layout`, never request input; deletions go through `storage.remove_run_dir` / `remove_model_file`.

### Plain-English API errors, localized failure text in the frontend
**Source:** `backend/src/yolo_trainer_api/training/service.py:54-66` (constants), `frontend/src/i18n/locales/en/training.json`
**Apply to:** all new `HTTPException(detail=...)` strings and the `error_category` UI mapping (code -> `failure.<code>.title/hint`).

### Atomic run-state files and tail rules
**Source:** `layout.write_json_atomic` (used in `train_job.py:198,220`, `supervisor.py:198`), `progress.py:64-97` (`ProgressTail`)
**Apply to:** `base.json`, `error.json`(+category), any new run file; SSE reader and supervisor both consume only complete `\n`-terminated lines.

### DB resilience in the supervisor loop
**Source:** `supervisor.py:283-286, 312-318`
```python
except OperationalError:
    logger.warning("Could not record progress of run %s", run_id, exc_info=True)
    continue
```
**Apply to:** every new DB write/read inside `_watch` (a busy database must not kill a long training).

### Frontend mutation/modal conventions
**Source:** `frontend/src/features/training/RemoveFromQueueModal.tsx`, `frontend/src/api/training.ts:285-298`
**Apply to:** `CancelRunModal`, `DeleteRunModal`, `ResumeButton` (ref-guard against double submit, `ApiError` message in a red `Alert`, notifications on success, cache invalidation of `runs`/`run`/`active`/`projectKeys.detail`).

### Test conventions
**Source:** `backend/tests/test_runs_remove.py`, `backend/tests/training_helpers.py`, `frontend/src/features/training/RunPage.test.tsx`
**Apply to:** all new tests. Backend: real api over temp-file SQLite, `fake_command` + `fake_train_job.py`, no mocking of Ultralytics for classifier tests (literal messages). Frontend: Vitest + Testing Library, `makeRun` fixtures, `FakeEventSource`, `initialDimension` for Recharts under jsdom.

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| SSE route in `routers/runs.py` (`EventSourceResponse`) | controller | streaming | No SSE or long-lived streaming endpoint exists yet; use RESEARCH Pattern 4 plus the tail/session patterns cited above |
| `RunCharts.tsx` (Recharts) | component | render | `recharts` is not installed yet; no chart component exists. Use RESEARCH Pattern 9 |
| `FakeEventSource` test helper | test helper | streaming | jsdom has no `EventSource`; nothing similar exists |
| `foldProgress.ts` / `eta.ts` | utility | transform | No client-side event reducer exists; `formatClock` is the only pure-helper style reference |

## Metadata

**Analog search scope:** `backend/src/yolo_trainer_api` (routers, training, migrations, models, schemas, storage), `backend/src/yolo_trainer_common`, `backend/src/yolo_trainer_worker`, `backend/tests`, `frontend/src/api`, `frontend/src/features/training`, `frontend/src/features/images/ImagesPage.tsx`, `frontend/src/test*`, `frontend/src/i18n/locales/en`
**Files scanned:** about 30 (read in full or in targeted ranges; all paths confirmed tracked via `git ls-files`)
**Pattern extraction date:** 2026-10-11
