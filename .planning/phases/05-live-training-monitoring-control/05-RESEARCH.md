# Phase 5: Live Training Monitoring & Control - Research

**Researched:** 2026-10-11
**Domain:** SSE live progress from a per-run `progress.jsonl`, Recharts charts, DB-signalled cancel of a supervised Ultralytics subprocess, `resume=True` continuation of the same run row, categorized failures, run history/delete (FastAPI + SQLAlchemy/Alembic + React/Mantine on the Phase 4 worker/supervisor pipeline)
**Confidence:** HIGH for Ultralytics resume/event/callback behavior and the cancel/resume/SSE mechanics (installed 8.4.159 source read, and kill/resume/relocation/SSE experiments executed this session on the dev machine). MEDIUM for the frontend (read from code, not prototyped) and for anything that depends on Linux/Docker rather than the Windows 11 dev host (the supervisor's POSIX branch is already covered by Phase 4 tests; the Phase 5 changes to it were not run in a container here).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Carried forward from earlier phases (still binding)
- Mantine, dark theme only, i18n en/ru with no hardcoded strings (P1 D-01..D-04). API errors are plain English (P1 D-05). Localized failure text belongs in the frontend i18n catalog and is keyed by error category.
- One training job per installation with a FIFO queue across projects. Removing a run from the queue already exists (P4 D-11). The worker polls the DB with an atomic claim. The supervisor is the single writer of run state (PROJECT.md Key Decisions).
- `running` becomes `interrupted` when the worker restarts, and `queued` stays queued (P4 D-13). The global header indicator links to the run page (P4 D-14).
- Each run trains on an immutable snapshot under `data/runs/<run_id>/dataset/` (P4 D-19/D-20). `last.pt` is kept in the run folder for resume, and only `best.pt` of a completed run is registered as a model (P4 D-16).
- Deleting a project deletes its runs, run folders, and models. Models trained elsewhere from one of them keep the base name as plain text (P4 D-21).
- The extra post-training `on_fit_epoch_end` must never show as "epoch Y+1 of Y". `train_job.py` already marks it `final_validation: true` (P4 D-12, `docs/phase-0-decisions.md` §2).
- The run status enum already allows `cancelled` (`ck_training_runs_status`).

### Live charts (TRAN-05)
- **D-01:** The run page shows **three compact charts** (Recharts, `docs/roadmap.md` §11.4): (1) **losses**, train and val on one chart (box/cls/dfl as series, or summed; the planner decides readability), (2) **mAP50 + mAP50-95**, (3) **precision + recall**. Exact values appear in the tooltip. No Ultralytics-style grid of 8+ charts.
- **D-02:** Updates stream over **SSE** from the run's `progress.jsonl` (`docs/roadmap.md` §9.3). They replace the Phase 4 polling for live data on the run page. Reloading the page mid-run restores the full history, then continues live (success criterion 1). The SSE endpoint must follow the existing Host allow-list and path-safety rules.
- **D-03:** **In-epoch progress:** a second progress bar shows "batch N of M" for the current epoch, plus an **ETA** for the whole run. The data comes from a **throttled** `on_train_batch_end` event (at most every ~1–2 s), so `progress.jsonl` stays small. Batch events are **not charted**. The epoch bar from Phase 4 stays.
- **D-04:** **Final validation** is not a chart point. While it runs, the status line says "Final validation…". When it finishes, a separate **"Final results (best.pt)"** card shows P/R/mAP50/mAP50-95 and the quality verdict, labeled as final validation. The mAP chart may mark the best epoch.
- **D-05:** Charts **stay available for every past run**: completed, failed, cancelled, and interrupted. They are rebuilt from that run's `progress.jsonl`. A failed or cancelled run shows how far it got. — **Reversibility:** costly — `progress.jsonl` becomes a durable per-run artifact whose event schema (including the new batch event and resume boundaries) the history view depends on. Schema changes need backward-compatible readers.

### Cancel (TRAN-06)
- **D-06:** A **Cancel** button is shown **on the run page only**: not in the run list, and not in the header indicator. Clicking it opens a **confirm dialog** ("Training will stop at epoch X. You can resume it from the last checkpoint."). After confirming, the run shows a transient **"Cancelling…"** state and becomes `cancelled` within seconds.
- **D-07:** Cancel is **immediate**. There is no "finish the current epoch" option. The unfinished epoch is lost, and resume continues from the last completed epoch's `last.pt`. No orphaned process remains, and the next queued run can start right away (success criterion 2). The supervisor's existing SIGTERM → grace → SIGKILL on the process group is the mechanism. For native Windows dev, the planner applies the Phase 0 note (`CREATE_NEW_PROCESS_GROUP` + `CTRL_BREAK_EVENT` with fallback, or a documented limitation).
- **D-08:** A cancelled run **does not register a model**. If an interim `best.pt` exists, the run page offers **"Download interim best.pt"**, clearly marked incomplete. It does not appear in the base-model picker. A full model is registered only if the run is later resumed and completes.
- Cancel applies to `running` (and `preparing`, if a run can be cancelled during weight download or setup). `queued` runs keep the existing "Remove from queue" action.

### Resume (TRAN-07)
- **D-09:** Resume **continues the same run** using Ultralytics `resume=True` from `last.pt`. The run row, the snapshot, the folder, and the charts are reused, and the chart curve continues from the checkpoint epoch. The status goes back to `queued`, then `running`. The run records how many times it was resumed, shown on the run page. Timing must account for multiple running segments, so duration is the sum of active time, not `finished - started`. — **Reversibility:** costly — reusing one run row across attempts shapes the run state machine, the duration columns, and how `progress.jsonl` represents restarts.
- **D-10:** You can resume **`interrupted`, `cancelled`, and `failed` runs, but only when `last.pt` exists**. Without a checkpoint (it failed before the first epoch was saved), the Resume button is disabled with a reason ("No checkpoint saved yet — start a new run").
- **D-11:** **Settings cannot change** on resume. Ultralytics takes them from the checkpoint. To use different settings, start a new run with this run's model as the base.
- **D-12:** A resumed run joins the **end of the FIFO queue**. If the worker is idle, it starts immediately.
- **D-13:** There is **no auto-resume** after a worker or host restart. Interrupted runs wait for a manual Resume, and the queue moves on, as in P4 D-13.

### History & failures (TRAN-08, TRAN-11)
- **D-14:** The run list becomes a full history table with these columns: name, status, base model, created, **duration**, **epochs X/Y**, **key settings ("imgsz · batch · device")**, mAP50, **mAP50-95**, **images in snapshot**, and download. It can be **sorted by column** and **filtered by status**. Full settings are on the run page.
- **D-15:** Individual runs can be **deleted**, except active ones (`queued` / `preparing` / `running`; a queued run is removed via the queue action). Deleting removes the run row, its folder (snapshot, checkpoints, `progress.jsonl`), and **its registered model**. The confirm dialog warns that the model will be deleted too. Models fine-tuned from it elsewhere keep the base name as plain text (same rule as P4 D-21). — **Reversibility:** one-way — a hard delete of user data (P1 D-10, no trash).
- **D-16:** Failures are **categorized**. The worker or supervisor maps the exception or exit reason to a stable category code stored on the run: at least **out of memory (GPU/RAM)**, **invalid dataset**, **weights download failed / no network**, **disk full**, **process killed** (e.g. the OS OOM-killer, signal exit), and **unknown**. The UI shows a localized title plus an actionable hint (e.g. "Reduce batch or image size"). The original exception message and the Phase 4 collapsible log tail stay below. Unknown errors show as "Unexpected error" with the raw message. — **Reversibility:** costly — category codes become a contract between the worker, the DB, and the i18n catalog.
- **D-17:** There are **no pre-start checks** in this phase, such as a disk-space warning or a CPU batch warning. Only clear failure reporting.

### Claude's Discretion
- The SSE endpoint shape, the event framing, and the reconnect/`Last-Event-ID` strategy. Whether polling stays for the run list and the header indicator.
- The batch event throttle interval, the ETA algorithm, and which loss components are shown or summed.
- How resume boundaries are represented in `progress.jsonl`: a `resumed` event, or the epoch-number reset handling, so charts don't duplicate points. Ultralytics may re-emit epochs from the checkpoint.
- How an intermediate "cancelling" state is modeled: a DB flag or status, or purely client-side until `cancelled`. How the api signals cancel to the worker: a DB status change the supervisor already watches, since the api container cannot signal the worker's PID.
- The exception-to-category matching rules, and the new DB columns via Alembic (error category, resume count, accumulated duration).
- The new run-detail and history API shapes, the sorting defaults, and how status filtering persists.

### Deferred Ideas (OUT OF SCOPE)
- Pre-start checks (free disk space in `DATA_DIR`, CPU batch-size warning) on the start form → a future phase (possibly with Phase 11 or Phase 12 diagnostics).
- "Cancel after the current epoch" (graceful option) → not chosen. Immediate cancel only.
- Changing device/batch when resuming (e.g. after OOM) → not chosen. Start a new run from the model instead.
- Auto-resume of interrupted runs after a worker restart → not chosen.
- Cancel from the header indicator or the run list → not chosen.
- A full Ultralytics-style metric grid → could return with Phase 11 detailed evaluation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRAN-05 | Live progress: current epoch, losses, mAP metrics, charts updating in real time; final-validation event labeled correctly | Native FastAPI `EventSourceResponse` tailing `progress.jsonl` with byte-offset ids (Pattern 4); event schema v2 incl. `train_start`, throttled `batch_progress`, `last_epoch` flag (Pattern 2); client fold + Recharts 3.10.1 (Patterns 8, 9); final-validation rules (Pitfall 15) |
| TRAN-06 | Cancel a running job; clean stop, no orphan | `cancel_requested_at` flag column read by the supervisor each tick, then the existing `_terminate` and a guarded `cancelled` write (Pattern 3); Windows `terminate()` / CTRL_BREAK measured (Pitfall 8) |
| TRAN-07 | Resume an interrupted/cancelled run from its last checkpoint | Verified Ultralytics resume semantics: epochs continue (not re-emitted), stripped `last.pt` silently restarts, stale `save_dir` writes to the old folder (Pattern 5, Pitfalls 1-5); same-row state machine and active-time accounting (Pattern 6) |
| TRAN-08 | History of runs with status, settings, duration, final metrics | Extended list read model, client-side sort/filter with URL state, shared run-delete helper (Patterns 7, 10) |
| TRAN-11 | Failures shown with an understandable error | Shared pure `failures.py` classifier used by `train_job` and the supervisor, category column, i18n keyed by code (Pattern 11) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `./.claude/CLAUDE.md` (its Conventions/Architecture blocks describe only the legacy root scripts; backend code in Phases 1-4 uses English comments, type hints and ruff, and Phase 5 follows that):

- **GSD workflow enforcement:** no repo edits outside a GSD command; this phase executes through `/gsd-execute-phase`.
- **Phase completion:** after the phase is marked complete, commit all remaining `.planning/` changes (not `.gsd/` or lock files), make sure the branch is `dev`, `git push origin dev`, and report the pushed commit range. Merging `dev` into `main` only when the user asks.
- **Stack pins:** Python 3.12, Ultralytics 8.4.159, PyTorch 2.14.0; FastAPI + SQLAlchemy/Alembic + SQLite (WAL), Postgres-ready; React + Vite SPA (react-konva canvas).
- **Deployment:** Docker Compose, separate CPU and GPU images; must also run on CPU-only hosts; the api image stays torch-free.
- **Job execution:** training as subprocesses tracked in the DB, progress via Ultralytics callbacks → JSONL → SSE; no Redis/Celery.
- **Data model:** one task type per project; classes and tags are distinct.
- **Hardware:** no NVIDIA GPU on the dev machine; GPU-path checks (GPU memory freed after cancel) are Phase 12.
- **Security:** `.pt` files are pickle-based and may execute code on load: treat as trusted-user input and document the risk; mounted/derived paths must be validated.
- **Language:** RESEARCH.md and code in English; user-facing prose to the orchestrator in Russian.

## Summary

Phase 5 extends the Phase 4 pipeline (`api` inserts a run → `worker` polls and claims → `Supervisor` runs `train_job` as a subprocess and tails its `progress.jsonl`). Nothing needs a new backend dependency: FastAPI 0.141.1 ships native Server-Sent Events (`fastapi.sse.EventSourceResponse`, `ServerSentEvent`, keep-alive pings and `X-Accel-Buffering: no`), nginx `location /api/` already has `proxy_buffering off` and `proxy_read_timeout 3600s`, and the one new frontend package is `recharts` 3.10.1 (plus its `react-is` peer).

The experiments run this session on the pinned stack changed three design points that the CONTEXT left open. (1) **Resume does not re-emit earlier epochs**: after a kill during epoch 4 and `resume=True`, the new segment emitted epoch 4, 5, … 8 and then the final-validation event; there are no duplicates except when the kill lands between `on_train_epoch_end` and the checkpoint save, so a `train_start` event per segment (with `start_epoch`) is a sufficient boundary marker. (2) **`last.pt` existing is not a sufficient resume gate**: `final_eval()` runs `strip_optimizer(self.last)` which sets `epoch = -1` and drops the optimizer, and `model.train(resume=True)` on such a file does **not** fail, it logs a warning and silently starts a **new** training from epoch 1 with exit code 0 (executed: 8 `epoch_start` events from epoch 1). `train_job` must validate the checkpoint itself before calling `train()`, and the supervisor must track whether a resumable checkpoint exists. (3) **The checkpoint pins the output folder**: `train_args.save_dir` is an absolute path stored inside `last.pt`; a relocated run folder resumed without an explicit `save_dir` writes into the old location and strips the old `last.pt` (executed). Passing `save_dir=<run_dir>/out/train` on resume keeps everything in place (executed).

Cancel needs no new status value: add a nullable `cancel_requested_at` column that the api sets with a guarded UPDATE and the supervisor reads in its existing 1 s tick (it already polls `run_status` there). The "Cancelling…" UI state is `status == running and cancel_requested_at is not null`. On Windows both `Popen.terminate()` (exit 1 in 0.00 s) and `CTRL_BREAK_EVENT` (exit 3221225786 after 0.23 s) are abrupt hard stops, so CTRL_BREAK buys nothing without an in-process handler: keep `terminate()` and document the limitation.

**Primary recommendation:** Keep the Phase 4 architecture and add: migration `0006` (columns below), events schema v2 in `train_job`, DB-flag cancel, same-row resume with a validated checkpoint and `save_dir` pinned, a shared pure failure classifier, an SSE route that sends compacted raw events plus a `status`/`end` frame, and a client-side fold feeding three Recharts charts. Run `/gsd-ui-phase 5` first (config `ui_phase: true`, UI hint yes, no `05-UI-SPEC.md` exists yet).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Emit batch/epoch/segment events, validate checkpoint, call `train(resume=True)` | Worker subprocess (`train_job`) | Filesystem (`progress.jsonl`) | Only process with torch/ultralytics; must not touch the DB |
| Cancel execution (stop the child, mark `cancelled`), resume claim, duration accounting, category fallback | Worker supervisor | Database | Single writer of run state (PROJECT.md); api cannot signal the worker PID |
| Cancel/resume/delete requests, guarded state transitions | API / Backend | Database | One guarded UPDATE/DELETE per action closes races with the worker's claim |
| SSE stream (tail, enrich, compact, Last-Event-ID, terminal `end`) | API / Backend | Filesystem, Database | Torch-free api already reads run files; DB gives status |
| Failure categorization rules | Shared pure module (`yolo_trainer_common`) | Worker, API | Same rules in `train_job` (exceptions) and supervisor (exit codes, log tail) |
| Fold events into chart rows, ETA, current-batch state | Browser / Client | — | Presentation state; avoids a second source of truth on the server |
| Charts, dialogs, history table sort/filter | Browser / Client | — | Recharts + Mantine; list is unpaginated (< ~200 runs) so sort/filter stay client-side |
| i18n of failure categories and hints | Browser / Client | — | P1 D-05: API stays plain English, localized text keyed by code |
| Interim `best.pt` download | API / Backend | Filesystem | Id-derived path, sanitized `Content-Disposition`, same pattern as `routers/models.py` |
| Run folder and model file removal | API / Backend (thread) | Filesystem | Shared helper with project delete; direct-child/non-symlink guards |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ultralytics | 8.4.159 (installed) | `resume=True`, callbacks | Pinned project-wide; behavior below was read from and executed against this version [VERIFIED: `.venv` import printed `8.4.159 2.14.0+cpu`] |
| FastAPI native SSE (`fastapi.sse`) | 0.141.1 (installed) | SSE endpoint | Exposes `EventSourceResponse`, `ServerSentEvent`, `format_sse_event`, 15 s keep-alive comments, `Cache-Control: no-cache`, `X-Accel-Buffering: no` [VERIFIED: `fastapi/sse.py` and `fastapi/routing.py:520-650` read; header values observed in an executed probe] |
| recharts | 3.10.1 (latest, modified 2026-10-03) | Loss / mAP / P-R charts | Named in `docs/roadmap.md` §11.4 and locked by CONTEXT D-01; peers `react ^19` OK [VERIFIED: npm view; package-legitimacy OK] |
| react-is | peer of recharts | Recharts peer dependency | `npm install recharts` pulls it as a peer (npm 7+); confirm it lands in `package-lock.json` [VERIFIED: npm view peerDependencies; not currently in `frontend/node_modules`] |
| SQLAlchemy 2 + Alembic | existing | Migration `0006`, guarded UPDATE/DELETE | Existing stack |
| Mantine 9.6.3 / TanStack Query 5 / react-router 7 / i18next | existing | Dialogs, `Progress`, URL state (`useSearchParams`), server state, en/ru | Existing frontend stack [VERIFIED: `frontend/package.json`, installed `@mantine/core` 9.6.3] |
| Python stdlib `signal`, `subprocess`, `asyncio`, `json`, `re`, `errno` | 3.12 | Cancel, tail, classifier | No dependency needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| native browser `EventSource` | — | Client side of SSE | Same-origin GET, auto-reconnect; the 6-connections-per-origin HTTP/1.1 limit applies [CITED: developer.mozilla.org/en-US/docs/Web/API/EventSource] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FastAPI native SSE | `sse-starlette` | Extra dependency for something FastAPI 0.141.1 already does; do not add |
| `recharts` directly | `@mantine/charts` 9.7.1 | Peer-pins `@mantine/core` to exactly 9.7.1 while 9.6.3 is installed [VERIFIED: npm view peerDependencies vs installed version]; would force a Mantine bump. Use Recharts directly |
| SSE | Keep 3 s polling | Rejected by D-02 |
| `cancel_requested_at` column | New `cancelling` status | A new value needs a CHECK rewrite on `ck_training_runs_status` (SQLite cannot alter a CHECK in place, see 0005); a nullable column is one portable `ADD COLUMN` |
| In-process graceful stop (`trainer.stop = True`) | Immediate kill | Setting `trainer.stop` makes Ultralytics finish validation, save and run `final_eval`: that is the "cancel after epoch" option CONTEXT rejected (D-07) |

**Installation:**
```bash
npm --prefix frontend install recharts@3.10.1
```
Backend: none (`uv.lock` untouched).

**Version verification:** `npm view recharts version` → `3.10.1`, `time.modified` 2026-10-03; peers `react ^16.8 || … || ^19`, `react-dom`, `react-is` [VERIFIED: npm registry, run this session]. `recharts@3.10.1` tarball inspected: `ResponsiveContainer` accepts `initialDimension?: {width, height}` (default `-1/-1`), `Line` has `isAnimationActive?: boolean | 'auto'` and `connectNulls`, `ReferenceDot`/`ReferenceLine` are exported [VERIFIED: tarball `types/` read].

## Package Legitimacy Audit

Run via `gsd_run query package-legitimacy check --ecosystem npm recharts react-is` this session.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| recharts | npm | last publish 2026-07-25 (v3 line since 2025) | ~56.3M/wk | github.com/recharts/recharts | OK | Approved (locked by CONTEXT D-01) |
| react-is | npm | last publish 2026-09-09 | ~371M/wk | github.com/react/react | OK | Approved (peer of recharts) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
`postinstall` script: none for either [VERIFIED: seam signals `postinstall: null`]. No new Python packages.

## Architecture Patterns

### System Architecture Diagram

```
 Browser (React)                  api container (torch-free)                         worker container (torch + ultralytics)
 ───────────────                  ──────────────────────────                         ──────────────────────────────────────
 Run page ──GET /runs/{id}/stream (EventSource, Last-Event-ID)──▶ SSE generator
      ▲                             │ every ~0.5 s: read new complete lines of progress.jsonl ◀── train_job appends events
      │ events: progress | status | end    │ every ~1-2 s: SELECT status, cancel_requested_at, epoch… (short session)
      │                             └─ replay = all non-batch events + LAST batch event (compaction); id = byte offset
      │
 Cancel ──POST /runs/{id}/cancel──▶ UPDATE … SET cancel_requested_at WHERE status='running'  ──┐
 Resume ──POST /runs/{id}/resume──▶ UPDATE … status='queued', resume_count+1 WHERE status IN   │ DB is the control channel
                                     (interrupted,cancelled,failed); pre-check: last.pt exists │
                                     and checkpoint not ended/refused (resume_epoch or events) │
 Delete ──DELETE /runs/{id}──────▶ DELETE … WHERE status NOT IN (preparing,running) → files    │
                                                                                               ▼
                                              Supervisor._watch tick (1 s): poll(); read events; check (status, cancel_requested_at)
                                                cancel flag → _terminate(group) → UPDATE status='cancelled' (guarded) → serve loop claims next
                                                events → record_epoch / resume_epoch / last metrics / error category
                                              claim_next(): queued → running; started_at kept; segment_started_at=now; finished_at/cancel flag cleared
                                              Popen(train_job … [--resume]) → progress.jsonl(v2), result.json | error.json(+category), train.log
 Client fold (pure TS): progress events → chart rows (dedupe by epoch, truncate on train_start), batch state, final validation, ETA
 Recharts: losses · mAP50 + mAP50-95 · precision + recall (animation off)
```

### Recommended Project Structure

```
backend/src/
├── yolo_trainer_common/
│   ├── progress.py        # + EVENT_TRAIN_START, EVENT_BATCH_PROGRESS, SCHEMA_VERSION, enrich_event(task_type, event), compact_replay()
│   └── failures.py        # NEW pure: classify_exception(type_name, message, errno) / classify_exit(exit_code, log_tail) -> category
├── yolo_trainer_api/
│   ├── migrations/versions/0006_training_control.py   # NEW
│   ├── models.py          # TrainingRun + new columns
│   ├── schemas.py         # RunSummary/RunRead additive fields; SSE payload models
│   ├── routers/runs.py    # + stream, cancel, resume, interim best, extended DELETE
│   └── training/service.py# + cancel_run, resume_run, delete_run, history fields; shared remove_run_files()
└── yolo_trainer_worker/
    ├── train_job.py       # + train_start/batch_progress events, last_epoch/fitness, --resume path, typed WeightsDownloadError
    ├── supervisor.py      # + cancel flag, resume flag in command, duration, category, resume_epoch
    └── queue.py           # + mark_cancelled, claim keeps started_at, record_progress extras, reconcile honors cancel flag
frontend/src/
├── api/training.ts        # + run stream hook, cancel/resume/delete mutations, new fields
├── features/training/
│   ├── progress/          # foldProgress.ts (pure), eta.ts (pure), useRunStream.ts, RunCharts.tsx, BatchProgress.tsx
│   ├── CancelRunModal.tsx, ResumeButton.tsx, DeleteRunModal.tsx, FailureCard.tsx, FinalResultsCard.tsx
│   └── TrainingPage.tsx   # history table with sort/filter (URL state)
└── i18n/locales/{en,ru}/training.json   # + failure.* , cancel.*, resume.*, history.* keys
```

### Verbatim in-repo values the patterns rely on

- `backend/src/yolo_trainer_api/models.py:240-244` — the status CHECK (unchanged by this phase):
  `"status IN ('preparing', 'queued', 'running', 'completed', 'failed', "` / `"'interrupted', 'cancelled')"`, name `"ck_training_runs_status"`.
- `backend/src/yolo_trainer_common/progress.py:19-22`:
  `EVENT_TRAIN_EPOCH_END = "train_epoch_end"`, `EVENT_FIT_EPOCH_END = "fit_epoch_end"`, `EVENT_MODEL_SAVE = "model_save"`, `EVENT_TRAIN_END = "train_end"`.
- `backend/src/yolo_trainer_common/layout.py:23-30`: `JOB_FILE = "job.json"`, `PROGRESS_FILE = "progress.jsonl"`, `LOG_FILE = "train.log"`, `RESULT_FILE = "result.json"`, `ERROR_FILE = "error.json"`, `RESOLVED_FILE = "resolved.json"`, `MANIFEST_FILE = "manifest.json"`, `DATA_YAML = "data.yaml"`; `layout.py:76-81`: `best_weights()` → `run_directory / "out" / "train" / "weights" / "best.pt"`, `last_weights()` → `… / "last.pt"`.
- `backend/src/yolo_trainer_worker/supervisor.py:44` `TERMINATE_GRACE_SECONDS = 10`; `:53` `VANISHED = "vanished"`; `:299-305` the stop-event path calls `queue.mark_interrupted(...)` and sets `outcome = "interrupted"`.
- `backend/src/yolo_trainer_worker/queue.py:60-66` claim: `.values(status="running", started_at=stamp, progress_updated_at=stamp)` (this overwrites `started_at` on every claim and does not clear `finished_at`).
- `backend/src/yolo_trainer_api/db.py:63-66` `get_session` yields an `AsyncSession` for the whole request (do not use it for a stream).
- Ultralytics 8.4.159 (`.venv/Lib/site-packages/ultralytics/engine/trainer.py`): `:463` `on_train_start`; `:474` `epoch = self.start_epoch`; `:611` `on_train_batch_end`; `:643` `self.stop |= self.stopper(epoch + 1, self.fitness) or final_epoch`; `:662` `on_fit_epoch_end`; `:977-993` `final_eval` (`:982` `strip_optimizer(self.last)`; `:993` the extra `on_fit_epoch_end`); `:996-1035` `check_resume`; `:1091-1108` `resume_training` (`:1096` `assert 0 < start_epoch < self.epochs`); `engine/model.py:859-868` the "is not a resumable training checkpoint … Starting new training instead" branch; `utils/torch_utils.py:957-958` `for k in "optimizer", "best_fitness", "ema", "updates", "scaler": x[k] = None` / `x["epoch"] = -1`; `engine/trainer.py:804` `self.last.write_bytes(serialized_ckpt)  # save last.pt` (not atomic).
- `docker/nginx.conf.template` `location /api/`: `proxy_http_version 1.1;` `proxy_set_header Connection "";` `proxy_buffering off;` `proxy_cache off;` `proxy_read_timeout 3600s;` (SSE needs no nginx change). `docker/Dockerfile.backend:26` api CMD: `["/app/.venv/bin/uvicorn", "yolo_trainer_api.main:app", "--host", "0.0.0.0", "--port", "8000"]` (no graceful-shutdown timeout). `docker-compose.yml` api and worker: `stop_grace_period: 20s`.

### Pattern 1: Migration `0006_training_control` (additive, portable)

Only `ADD COLUMN` (no CHECK change; SQLite cannot alter a CHECK in place, see the 0005 comment). Columns on `training_runs`:

| Column | Type | Meaning |
|--------|------|---------|
| `error_category` | `String(32)` NULL | Stable code, no CHECK (a new code later must not need a table rebuild); validated in Python against a constant set on write |
| `resume_count` | `Integer` NOT NULL `server_default="0"` | Times the run was resumed (D-09) |
| `active_seconds` | `Float` NOT NULL `server_default="0"` | Sum of finished running segments (D-09) |
| `segment_started_at` | `DateTime(timezone=True)` NULL | Start of the current running segment |
| `cancel_requested_at` | `DateTime(timezone=True)` NULL | Cancel signal from api to supervisor (D-06/D-07) |
| `resume_epoch` | `Integer` NULL | Epochs fully checkpointed with optimizer state; NULL = not known from the DB (nothing saved yet, the loop ended, or a Phase 4 row). It is not a resumability gate on its own: the api derives the state from `last.pt` and the progress events when it is NULL (Pitfall 3; Open Question 4, user-confirmed 2026-10-11) |
| `last_map50_95` | `Float` NULL | Last epoch's mAP50-95 for the history table of non-completed runs |

`started_at` keeps its meaning as the **first** start. Add a `0005 → head` populated-database test like the existing ones in `test_migrations.py`.

### Pattern 2: Progress event schema v2 (backward compatible)

Every event gets `"v": 2`; an event without `v` is v1 (Phase 4 runs on disk). Readers must treat every new field as optional (D-05).

| Event | Fields | Notes |
|-------|--------|-------|
| `train_start` (NEW, `on_train_start`) | `epochs`, `start_epoch` (0 fresh, k on resume), `resumed` (`bool(trainer.resume)`), `nb` (`len(trainer.train_loader)`) | The per-segment boundary marker. Verified: `trainer.start_epoch` is 3 after resuming a checkpoint saved at epoch index 2 |
| `batch_progress` (NEW, `on_train_batch_end`) | `epoch` (1-based), `batch` (own counter, reset in `on_train_epoch_start`), `nb`, `epochs` | Throttle with `time.monotonic()` (≥ 2 s) **and always emit the last batch of an epoch**; no loss payload (not charted, avoids GPU `.item()` syncs) |
| `train_epoch_end` | unchanged (`epoch`, `epochs`, `tloss`) | `tloss` holds the training loss components |
| `model_save` | unchanged | The supervisor derives `resume_epoch` from it |
| `fit_epoch_end` | existing fields + `last_epoch: bool(trainer.stop)`, `fitness` (non-final only) | `trainer.stop` is already True when this is the last real epoch (final epoch or early stop), so the UI can say "Final validation…" before the final event arrives [VERIFIED: executed, `stop=True` on epoch 3 of 3 and on the final event] |
| `train_end` | unchanged | |

**Batch counter, not trainer state:** the `on_train_batch_end` callback receives only the trainer; the loop index `i` is a local. Count in the callback and reset on `on_train_epoch_start` [VERIFIED: executed spike printed `batch 1..4` of `nb=4` per epoch, and a counter reset at epoch start re-aligned after resume].

**Fitness / best epoch:** in 8.4.159 detect fitness is `0*P + 0*R + 0*mAP50 + 1*mAP50-95` (`utils/metrics.py:1011` `w = [0.0, 0.0, 0.0, 1.0]`), segment adds the mask term. Prefer the emitted `fitness` for the "best epoch" marker over recomputing; ties write `best.pt` again (later epoch wins) [CITED: ultralytics/engine/trainer.py `validate` and `save_model` read this session].

### Pattern 3: Cancel via a DB flag read in the existing supervisor tick (TRAN-06)

- `POST /api/projects/{pid}/runs/{rid}/cancel` (`Depends(require_xhr)`): one guarded `UPDATE training_runs SET cancel_requested_at = :now WHERE id = :r AND project_id = :p AND status = 'running' AND cancel_requested_at IS NULL`. rowcount 0 → re-select: missing → 404 (`RUN_NOT_FOUND_DETAIL`), `cancel_requested_at` already set and still running → 200 idempotent, other status → 409 with a plain message. Return the run read model.
- Supervisor `_watch`: replace `_still_running` (which currently treats "not running" as `VANISHED`, no write) by one tiny SELECT of `(status, cancel_requested_at)` per tick. Cancel flag set → `_terminate(process)` (waits for exit) → `queue.mark_cancelled(...)` (UPDATE guarded by `status='running'`: set `status='cancelled'`, `finished_at`, `active_seconds`, `log_tail`, clear `error_message`) → outcome `"cancelled"`. Because `_terminate` returns only after the process is dead, the serve loop's next `claim_next` cannot overlap with a dying trainer (success criterion 2, "a new run can start immediately").
- Race rule: if the child already exited on its own when the flag is seen, `_finish` wins (a successful run stays `completed`; the stale flag is ignored by the UI unless `status == running`). `mark_cancelled` is guarded so it cannot overwrite a finished state.
- `reconcile_on_start` (worker) and `reconcile_runs_on_startup` (api): a `running` row with `cancel_requested_at` set should become `cancelled`, not `interrupted` (user intent was explicit).
- `cancelling` in the read model = `status == "running" and cancel_requested_at is not None`.
- `preparing` runs: no subprocess exists (weight download happens inside `train_job`, i.e. status `running`), so Cancel is a `running`-only action. A cheap optional variant is `UPDATE … SET status='cancelled' WHERE status='preparing'`; `prepare_run_files` already deletes the folder when its own `preparing → queued` update matches 0 rows (`service.py:255-257`). See Open Question 2.

### Pattern 4: SSE endpoint (TRAN-05, D-02)

`GET /api/projects/{pid}/runs/{rid}/stream` with `response_class=EventSourceResponse`, an `async def` generator that yields `ServerSentEvent`.

- **Do not use `Depends(get_session)`** for the stream's lifetime: FastAPI 0.141.1 enters the SSE context on the request-scoped exit stack (`routing.py:610-620`), so a yielded dependency session would stay open for the whole stream. Do the ownership check (`run.project_id == pid`, else 404 before any bytes) in a short `async with request.app.state.sessionmaker()` block, and poll status in short sessions.
- **Frames:** `event: progress` (data = the raw event + `primary` headline numbers added by `enrich_event(task_type, event)` for `fit_epoch_end`, so the `(B)`/`(M)` key mapping stays in Python), `event: status` (data = `{status, cancelling, epoch, epochs, resume_count, resume_epoch, error_category}`, sent on connect and on change), `event: end` (sent once the run is terminal and the file is drained; the client then calls `close()` because EventSource would otherwise reconnect forever; `end` for a non-active run right after replay gives the same code path for history charts, D-05).
- **Ids:** `id:` on `progress` frames = the byte offset just after that line in `progress.jsonl` (the file is append-only, also across resumes). `Last-Event-ID` (header) → start reading at that offset; validate as a non-negative integer ≤ file size, otherwise restart at 0. A fresh page load has no id and replays from 0 (success criterion 1).
- **Compaction (replay only):** send every non-`batch_progress` event, but only the **last** `batch_progress`. The file stays complete; a long CPU run at one batch event per 2 s would otherwise replay thousands of useless lines (≈ 120 B each).
- **Tail loop:** reuse the `ProgressTail` complete-line rule (a partial last line stays for the next read; Phase 4 Pitfall 10) with a variant that also returns each line's end offset. Run file reads in `asyncio.to_thread` (bind-mount file ops cost ~6 ms each on Docker Desktop, Phase 4 Pitfall 4). Tick ≈ 0.5 s for the file, ≈ 1-2 s for the status SELECT. After seeing a terminal status, drain the file once more, then `status` + `end`.
- **Shutdown:** uvicorn's graceful shutdown waits for open streaming responses; with compose `stop_grace_period: 20s` an open run page would turn every `docker compose stop` into a SIGKILL after 20 s and skip the lifespan WAL checkpoint. Add `--timeout-graceful-shutdown 5` to the api CMD (the flag exists in the installed uvicorn 0.54.0) [VERIFIED: `uvicorn --help`].
- **Headers:** FastAPI already sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` [VERIFIED: executed probe]. Host allow-list is enforced by the app-level `TrustedHostMiddleware`; the route is a GET with no custom headers, so `require_xhr` is not applicable (it guards mutating routes).
- **Testing:** Starlette's `TestClient` buffers the whole body (executed: all lines arrived at once after the stream ended) and never returns from an infinite stream (executed: the probe had to be killed by `timeout`). Test the live tail by iterating the extracted async generator directly against a temp file and a stub status function; test the HTTP layer only with runs that are already terminal (stream ends).

### Pattern 5: Resume = same row, `resume=True`, validated checkpoint (TRAN-07)

**API** `POST /api/projects/{pid}/runs/{rid}/resume` (`require_xhr`): re-run `ensure_device_available(settings, run.settings["device"])` (a resume onto a host that lost its GPU must give the same "No GPU is available." as a start), check `layout.last_weights(...)` exists (in `asyncio.to_thread`), then one guarded UPDATE: `status = 'queued'`, `resume_count = resume_count + 1`, `finished_at = NULL`, `cancel_requested_at = NULL`, `error_message = NULL`, `error_category = NULL`, `log_tail = NULL` `WHERE id AND project_id AND status IN ('interrupted','cancelled','failed')`. Resumability is decided before the UPDATE, read-only: `last.pt` missing → 409 `no_checkpoint`; a checkpoint already refused by the worker (`error_category = 'not_resumable'`) or one whose progress events show the loop ended → 409; otherwise resumable, with the checkpoint epoch from `resume_epoch` or, when it is NULL (Phase 4 rows), derived from the run's `model_save` / `last_epoch` / `final_validation` events by a torch-free helper and stored with the resume. A NULL `resume_epoch` alone never blocks (D-10, Open Question 4 user-confirmed 2026-10-11). rowcount 0 → 404 / 409 `not_resumable_status`. The row goes to the end of the FIFO because `claim_next` orders by `id` and the row is `queued` again (D-12 holds as "FIFO among queued rows by run id": a resumed old run therefore jumps ahead of newer queued runs. If true end-of-queue order is wanted, order the claim by a new `queued_at`; see Open Question 3).

**Supervisor**: `load_run` additionally returns `resume_count`, `resolved`, `active_seconds`; the command gets `--resume` when `resume_count > 0`. Reuse the stored `run.resolved` (device, batch, workers) for a resumed segment instead of re-resolving `auto`, so D-11 ("settings cannot change") holds even if the host changed. `CommandBuilder` is `Callable[[Path, Path, Resolved], list[str]]` and `tests/training_helpers.py:fake_command` builds against that exact signature: extend it with a keyword (`resume: bool = False`) and keep the fake working.

**`train_job --resume`** (this is the verified-safe recipe):

```python
# Source: ultralytics 8.4.159 engine/model.py:859-868, engine/trainer.py:996-1035, :1091-1108; executed spike this session
last = layout.last_weights(run_directory)
model = YOLO(str(last))                      # load errors -> typed CheckpointError (truncated file after a kill)
ckpt = model.ckpt or {}
args = ckpt.get("train_args") or {}
if ckpt.get("epoch", -1) < 0 or ckpt.get("optimizer") is None:
    raise NotResumableError("The checkpoint has no training state (training had already finished).")
if ckpt["epoch"] + 1 >= int(args.get("epochs", 0)):
    raise NotResumableError("All epochs were already trained; nothing is left to resume.")
model.train(
    data=str(layout.dataset_dir(data_dir, job["run_id"]) / layout.DATA_YAML),
    resume=True,
    save_dir=str(run_directory / "out" / "train"),   # keeps output in THIS folder (see Pitfall 2)
    imgsz=int(settings["imgsz"]), batch=args_batch, device=args_device, workers=args_workers,
    plots=False, verbose=False,
)
```

`epochs`, `lr0`, augmentation and the rest come from the checkpoint (`check_resume` lets only `imgsz, batch, device, close_mosaic, augmentations, save_period, workers, cache, patience, time, freeze, val, plots, channels_last, distill_model, save_dir` be overridden) [CITED: `engine/trainer.py:1017-1033`]. Register the same four callbacks before `train()`; the pending-flag logic for the final validation works unchanged on a resumed segment [VERIFIED: executed, events 4-8 `final=False`, then the extra event `final=True`].

Also: (a) at `ProgressWriter` creation in resume mode, ensure `progress.jsonl` ends with `\n` (a SIGTERM/SIGKILL can leave a partial line; the next appended event would otherwise be glued to it and dropped by the "undecodable line" rule); (b) `result.json` records `base_weights` sha256 computed from the base file: persist `{name, sha256}` in a small `base.json` during the first segment, and read it on resume so a deleted base model does not break resume; (c) skip `_resolve_weights` on resume (`last.pt` is the only weights input).

### Pattern 6: Run state machine, durations, categories in the supervisor

- **Claim** (`claim_next`): `started_at = COALESCE(started_at, :stamp)`, `segment_started_at = :stamp`, `finished_at = NULL`, `cancel_requested_at = NULL`, `progress_updated_at = :stamp`. (D-09: do not lose the first start.)
- **End of every segment** (`_finish`, `mark_failed`, `mark_interrupted`, `mark_cancelled`, `register_model`): `active_seconds = active_seconds_at_claim + (monotonic_now - segment_monotonic_start)`, `segment_started_at = NULL`. Compute it in Python from the supervisor's own monotonic clock (portable; no `julianday` SQL) and pass it in. Do not also update `active_seconds` in `record_epoch` (it would blur "sum of finished segments"); instead let the read model compute `duration = active_seconds + (now - segment_started_at)` while running. Accept that a hard worker crash leaves `active_seconds` short by the unfinished segment; `reconcile_on_start` can add `progress_updated_at - segment_started_at` (Python-side, one running row at most).
- **Read model additions** (`RunSummary`/`RunRead`, additive): `error_category`, `resume_count`, `active_seconds`, `segment_started_at`, `cancelling`, `resume_epoch`, `can_resume` + `resume_blocked` reason code (`no_checkpoint` only when `last.pt` is missing | `finished` | `not_resumable`; planned in 05-06/05-07, single-run read only), `map50_95` (final metrics, else `last_map50_95`), `image_count` (sum of `dataset_counts`), compact `settings`/`resolved` for the key-settings column, `interim_best: bool` (non-active run with a `best.pt` on disk).
- **`resume_epoch` bookkeeping** (supervisor, from events): on `model_save` with epoch N and N < `epochs` and no `last_epoch` flag seen → `resume_epoch = N`; on a `fit_epoch_end` with `last_epoch: true` → `resume_epoch = NULL` (the loop is over; `final_eval` is about to strip `last.pt`); clear on completion.

### Pattern 7: History table and delete (TRAN-08, D-14/D-15)

- List stays unpaginated and client-sorted (the existing page comment: "expected under about 200 runs"). Persist `sort`, `dir`, `status` in the URL with `useSearchParams` and `replace`, as `ImagesPage` does (03-04 decision). Nulls sort last. Status filter values = the seven statuses plus "all".
- `DELETE /api/projects/{pid}/runs/{rid}` keeps its route and `require_xhr`; its guard widens from `status = 'queued'` to `status NOT IN ('preparing','running')` and the 409 text changes for those two. Collect the run's model ids first (`models.source_run_id`, FK `ON DELETE CASCADE`), delete the row, then remove files with the existing direct-child/non-symlink helpers. Extract the file-removal part of project delete (`routers/projects.py:119-142`) into one shared helper (CONTEXT integration point).
- **New guard (not in CONTEXT):** if the run's model is the `base_model_id` of a `preparing`/`queued`/`running` run, refuse with 409. `train_job._resolve_weights` reads `layout.model_file(data_dir, model_id)` and raises "The base model file is missing." if the file is gone; the FK only nulls the column, `job.json` still names the id.
- **Interim `best.pt`:** `GET /api/projects/{pid}/runs/{rid}/interim-best` → `FileResponse(layout.best_weights(layout.run_dir(...)), filename=model_download_name(project, run.name + "_interim") …)`, only for non-active runs, 404 when absent or zero-size. A `best.pt` written by an unfinished run still contains optimizer state (it is larger than a final one and loads with `YOLO(path)`), and may be truncated if the process was killed during its write (Pitfall 4); label it incomplete in the UI.

### Pattern 8: Client fold, ETA, state (TRAN-05)

`foldProgress(state, event)` is a pure reducer used for replay and live (replay is just reducing the replayed frames):

- `train_start` (segment boundary): drop rows with `epoch > start_epoch` (these belong to an interrupted attempt), remember segment start time, `resumed`.
- `train_epoch_end` → upsert the row for `epoch`: `train` losses from `tloss`. `fit_epoch_end` non-final → upsert `val` losses (every key `val/<name>`, **discovered**, never hard-coded: YOLO26 has `l1_loss` and no `dfl_loss`, segment adds `seg_loss`/`sem_loss`) and `primary` metrics. Rows are keyed by epoch, last write wins.
- `fit_epoch_end` with `final_validation: true` → `finalMetrics` only, never a row (D-04); `last_epoch: true` on a real epoch → `phase = "final_validation"` until the final event or `status` terminal.
- `batch_progress` → `{epoch, batch, nb, time}` (latest only).
- Shown epoch = `min(epoch, epochs)` everywhere (Phase 4 rule kept).
- **ETA** (pure `eta.ts`): `avgEpochSeconds` = mean of the last ≤ 5 deltas between consecutive `train_epoch_end` event times **inside the current segment** (a delta includes validation and the save, so it is the real epoch cost), seeded by `train_start.time` for the first epoch of a segment; `remaining = (epochs − completedEpochs − currentFraction) × avg`, `currentFraction = batch / nb`. Show "—" until one delta or at least one batch fraction exists. On resume the first delta is measured from the new `train_start`, so the idle gap is never averaged in.
- ETA must not use wall clock minus `started_at` (breaks after a resume, D-09).

### Pattern 9: Recharts usage

- Three `LineChart`s in `ResponsiveContainer`; `isAnimationActive={false}` on every `Line` (re-animating on each new point flickers) and `connectNulls` where a metric can be missing for an epoch; best-epoch marker with `ReferenceDot` at `(epoch, mAP50-95)`; `Tooltip` with exact 3-decimal values via `Intl.NumberFormat(i18n.language)`.
- **Loss chart (planner's discretion, D-01):** recommended 2 series, train solid and val dashed, each the **sum of all present components**, with the per-component breakdown in the tooltip; label it "sum of box, cls, …" because the sum is not Ultralytics' weighted `trainer.loss` (box×7.5, cls×0.5, dfl×1.5 are applied inside the criterion, `loss_items` are unweighted). Per-component lines would be up to 6 (detect) or 10 (segment) series.
- **jsdom:** `ResponsiveContainer` measures 0×0 under jsdom; pass `initialDimension={{ width, height }}` (exists in 3.10.1) or mock it, and keep the existing `ResizeObserver` stub in `test-setup.ts` [VERIFIED: tarball types; `test-setup.ts` read]. jsdom has no `EventSource`: add a `FakeEventSource` test helper (global stub in a `test/` helper, driven by tests via `emit(name, data, id)`).
- Segment-specific charts are out of scope (Phase 6); the `primary` mapping already returns `(M)` numbers for segment projects.

### Pattern 10: `useRunStream` and TanStack integration

- One hook per run page: `new EventSource(url)` in an effect keyed by `(projectId, runId)`; `addEventListener("progress"|"status"|"end")`; on `status` → `queryClient.setQueryData(trainingKeys.run(...), merge)` for the live fields; on a terminal status or `end` → `close()` and `invalidateQueries(trainingKeys.run, trainingKeys.runs, trainingKeys.active)` (one GET returns the model ref and final metrics). `onerror`: show a small "reconnecting" hint while `readyState === CONNECTING`; if `readyState === CLOSED` (non-200 or wrong content type; the browser then does not retry [ASSUMED], see A3) fall back to the existing 3 s polling.
- Keep `useRun` polling at 3 s only while `preparing`/`queued` or when the stream is down; while `running` with a healthy stream use a slow safety poll (15 s) rather than none (a proxy can swallow a stream silently). Keep `useRuns` and `useActiveRun` polling as is (Claude's discretion; both already exist and are cheap).
- Fresh stubs: any test that renders `RunPage` now needs the `FakeEventSource` helper; extend `test/trainingApi.ts:makeRun` with the new fields in the same plan (Phase 4 Pitfall 16 pattern).

### Pattern 11: Failure categories (TRAN-11, D-16)

Shared pure `yolo_trainer_common/failures.py`, ordered rules, first match wins, used twice:

1. `classify_exception(type_name, message, errno)` in `train_job.main()` → written as `"category"` in `error.json` next to `type` and `message`.
2. `classify_exit(exit_code, log_tail)` in the supervisor when there is **no** `error.json` (hard crash / OS kill), and as a fallback when the file has no category.

| Code | Match (ordered) | Hint topic |
|------|-----------------|------------|
| `out_of_memory` | type `OutOfMemoryError` (`torch.OutOfMemoryError` is a `RuntimeError` subclass and `torch.cuda.OutOfMemoryError is torch.OutOfMemoryError` [VERIFIED: executed]) or `MemoryError`, or message contains `out of memory`, `CUBLAS_STATUS_ALLOC_FAILED`, `can't allocate memory` | Reduce batch or image size |
| `disk_full` | `OSError` with `errno == errno.ENOSPC` (28), message `No space left on device`, `database or disk is full`; torch's writer failure `file write failed` [ASSUMED] | Free disk space in `DATA_DIR` |
| `invalid_dataset` | message starts `Dataset '` and contains `error ❌` (Ultralytics wraps every dataset-load failure into this `RuntimeError`, `engine/trainer.py:835`), or contains `No labels found in`, `No valid images found in`, `Segment dataset requires equal numbers of boxes and segments` | Check the dataset; open an image or class and fix the annotations |
| `weights_download` | typed `WeightsDownloadError` (replace the plain `RuntimeError` in `_resolve_weights`), or network exception names (`ConnectionError`, `URLError`, `gaierror`, `TimeoutError`, `MaxRetryError`) [ASSUMED] | Check the worker's internet access or place the file in `DATA_DIR/weights/` |
| `process_killed` | no `error.json` and `exit_code < 0` (POSIX signal; `-9` is the OOM-killer) or `exit_code in (137, 143)`; Windows has no signal codes, so also treat `0xC000013A`/`3221225786` as terminated | The system may have run out of memory; reduce batch/image size or give Docker more memory |
| `not_resumable` | typed `NotResumableError` / `CheckpointError` from the resume path | Start a new run from this run's model |
| `unknown` | everything else | "Unexpected error" + raw message |

Store the code in `training_runs.error_category`; `error_message` keeps the raw text. The UI maps `failure.<code>.title/hint` through i18n and falls back to `unknown` for an unrecognized code (so adding a code never needs a migration). Tests are fixture-based: literal messages from the table above (not mocks of Ultralytics) so a rule change cannot silently drift. Order matters: OOM before generic `RuntimeError`, dataset wrapper before "No labels found" substrings.

### Anti-Patterns to Avoid

- **A cancel/resume path that signals the PID from the api** (different PID namespace; Phase 4 T4-05-02): control only through DB columns.
- **Trusting `last.pt` existence for resume:** see Pitfalls 1 and 3.
- **Calling `model.train(resume=True)` without `save_dir`** after the run folder could have moved (Pitfall 2).
- **Holding a DB session for the SSE lifetime** (Pattern 4).
- **Hard-coding loss key names** (`dfl_loss`): derive them from the events.
- **Computing duration as `finished_at - started_at`** or ETA from `started_at` (wrong after a resume).
- **Recomputing `(B)`/`(M)` metric keys in TypeScript:** enrich on the server with `primary_metrics`.
- **Adding `@mantine/charts`** (exact-version peer pin, see Alternatives).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE framing, keep-alive, buffering headers | Manual `StreamingResponse` + `data:` strings | `fastapi.sse.EventSourceResponse` + `ServerSentEvent(id=, event=)` | Encodes ids/events, 15 s `: ping`, `X-Accel-Buffering: no` [VERIFIED] |
| Reconnect + resume of the stream | Custom websocket/poll protocol | Browser `EventSource` + `Last-Event-ID` = byte offset | Auto-reconnect is the default behavior [CITED: MDN Using server-sent events] |
| Optimizer/EMA/scheduler continuation | Own checkpoint format | Ultralytics `resume=True` from `last.pt` | Restores optimizer, EMA, scaler, epoch; verified |
| Process-group termination | New kill logic | Existing `Supervisor._terminate` (SIGTERM → 10 s → SIGKILL on the group; `terminate()`/`kill()` on Windows) | Already covered by Phase 4 tests |
| JSONL tailing with partial lines | New reader | `ProgressTail` rule (complete `\n`-terminated lines only), extended to return offsets | Pitfall 10 of Phase 4 |
| Atomic file writes | Ad hoc writes | `layout.write_json_atomic` | Existing helper |
| Direct-child/non-symlink deletion | `shutil.rmtree` on a built path | `storage.remove_run_dir` / `remove_model_file` | Existing guards (T2-08-02, T4-09-02) |
| Download header quoting/sanitizing | Manual RFC 5987 | `model_download_name` + `FileResponse(filename=…)` | Existing, tested |
| Chart rendering | Hand-made SVG | Recharts | Locked by D-01 |
| Table sort/filter library | `mantine-datatable` or AG Grid | Plain array sort + `useSearchParams` | < ~200 rows; no new dependency |
| Elapsed/duration formatting | New formatter | Existing `formatClock` in `RunPage.tsx` | Already used |
| Failure text localization | Server-side translated strings | Category codes + i18n catalog | P1 D-05 |

**Key insight:** the only genuinely new logic is control-plane glue (flag-based cancel, same-row resume bookkeeping, event schema, classifier) and a thin client reducer. Everything heavy (resume, SSE framing, kill, charts) exists and must be used as-is; the pitfalls are all at the seams.

## Runtime State Inventory

Not a rename/refactor phase. One backward-compatibility inventory item: runs created in Phase 4 (including UAT runs in `data/`) have `progress.jsonl` files without `v`, `train_start`, `batch_progress`, `last_epoch` and `fitness`, and DB rows without the new columns (migration gives them defaults: `resume_count = 0`, `active_seconds = 0`, others NULL). For such completed/failed rows: `active_seconds` is 0 (show duration from `finished_at - started_at` as fallback when `active_seconds == 0` and both timestamps exist), `resume_epoch` is NULL. Completed runs are not resumable anyway (status, and their `last.pt` is stripped). An old `interrupted`, `cancelled` or `failed` run with a resumable `last.pt` stays resumable per D-10: its checkpoint epoch is derived from its `model_save` events at read and resume time, and "No checkpoint saved yet" is shown only when `last.pt` is missing (Open Question 4, RESOLVED: user-confirmed 2026-10-11, honor D-10 for Phase 4 rows). Stored data, live service config, OS-registered state and secrets: none affected (no rename); build artifacts: `npm install recharts` changes `package-lock.json` only.

## Common Pitfalls

### Pitfall 1: `resume=True` on a non-resumable checkpoint silently starts a new training
**What goes wrong:** `model.train(resume=True)` with a `last.pt` whose `epoch` is -1 or whose optimizer is None logs "is not a resumable training checkpoint … Starting new training instead" and trains from epoch 1 with exit code 0.
**Evidence:** `engine/model.py:859-868`; executed: a stripped `last.pt` resumed with `resume=True` produced 8 `epoch_start` events starting at epoch 1 and exit 0 [VERIFIED: executed].
**How to avoid:** the explicit `model.ckpt` check in the `train_job --resume` recipe (Pattern 5) raising `NotResumableError` → failed run with category `not_resumable`.
**Warning signs:** a "resumed" run whose first epoch event is `epoch: 1`.

### Pitfall 2: The checkpoint pins the output directory
**What goes wrong:** `last.pt` stores `train_args.save_dir` (absolute); `check_resume` keeps it unless `save_dir` is passed. A run folder that moved (different `DATA_DIR` mount, native Windows run resumed in Docker) resumes into the **old** path and strips the old `last.pt`.
**Evidence:** executed: copying a killed run to a new folder and resuming without `save_dir` modified the original folder's `last.pt` (20.7 MB → 5.3 MB, stripped); with `save_dir=<new>/out/train` the original stayed untouched and the new folder got epochs 3-8 [VERIFIED: executed].
**How to avoid:** always pass `save_dir` (and `data`) on resume; assert `Path(trainer.save_dir)` equals the run's `out/train` in a test.

### Pitfall 3: `last.pt` exists but is not resumable
**What goes wrong:** `final_eval()` (`trainer.py:977-993`) strips `last.pt` **before** the final validation (`strip_optimizer(self.last)`: `epoch = -1`, optimizer None). A run cancelled/failed/interrupted during final validation, a run that early-stopped, or a failure after the loop all have a stripped `last.pt`; also `resume_training` asserts `0 < start_epoch < self.epochs`, so a checkpoint saved at the last epoch ("finished, nothing to resume") raises `AssertionError`.
**How to avoid:** the supervisor maintains `resume_epoch` (Pattern 6) from `model_save`/`last_epoch`; the api gates the Resume button on file existence **and** on the checkpoint state (`resume_epoch`, or, when it is NULL as for Phase 4 rows, the same rule applied to the run's progress events; a checkpoint the worker already refused stays blocked); `train_job` re-validates (Pattern 5). Three layers because each covers a different window.

### Pitfall 4: A kill can corrupt `last.pt` / `best.pt`
**What goes wrong:** Ultralytics writes checkpoints with `Path.write_bytes` (`trainer.py:804`, not temp+rename). A cancel or SIGKILL during that call leaves a truncated file; `check_resume` then reports a misleading `FileNotFoundError("Resume checkpoint not found …")`. The window is small for `yolo26n` (a 20 MB write) and grows with model size and slow bind mounts.
**How to avoid:** `YOLO(last)` load inside a try → `CheckpointError` with a plain message ("The saved checkpoint is damaged; start a new run from this run's interim model"); optionally keep one previous checkpoint copy (`last.prev.pt`, renamed in `on_model_save` before the next save) at the cost of a second checkpoint of disk per run. Decide with the user (Open Question 5; resolved 2026-10-11: no copy, user-confirmed). Interim `best.pt` download carries the same risk; refuse zero-size files.

### Pitfall 5: A partial last line in `progress.jsonl` corrupts the first event of the next segment
**What goes wrong:** the child can be killed mid-`write`. The next segment appends to the same file; the first new record is glued to the partial fragment and both are dropped by the "undecodable line" rule, losing `train_start`.
**How to avoid:** in resume mode, open the file and append `\n` if the last byte is not `\n` before emitting. Test: truncate a line, resume, assert `train_start` is parseable.

### Pitfall 6: Duplicate or stale chart rows around a resume
**What goes wrong:** epoch N can have a `train_epoch_end` (and no `fit_epoch_end`) when the kill lands between them; the resumed segment then re-emits epoch N or N+1. Executed result for a kill during epoch 4: the new segment began at epoch 4, nothing earlier was re-emitted [VERIFIED: executed].
**How to avoid:** key rows by epoch (last write wins) and truncate rows with `epoch > start_epoch` on every `train_start` (Pattern 8). A kill after the checkpoint save but before `on_fit_epoch_end` leaves one epoch with train loss but no val/mAP point; accepted and documented (the chart tolerates null values with `connectNulls`).

### Pitfall 7: `started_at` and `finished_at` semantics break on resume
**What goes wrong:** `claim_next` overwrites `started_at` and leaves `finished_at` set; `RunPage` computes elapsed from `started_at` and `CompletedBody` duration from `finished_at - started_at`; the header indicator shows `started_at`.
**How to avoid:** Patterns 1 and 6; update `useElapsedSeconds`/`CompletedBody` to `active_seconds + live segment`.

### Pitfall 8: Windows cancel is abrupt either way
**What goes wrong:** the Phase 0 note suggests `CREATE_NEW_PROCESS_GROUP` + `CTRL_BREAK_EVENT` for a graceful stop. Executed on the dev host: `Popen.terminate()` → exit 1 in 0.00 s; `send_signal(CTRL_BREAK_EVENT)` to a group-created child → exit code 3221225786 (0xC000013A) after 0.23 s. Without a `SIGBREAK` handler in the child, CTRL_BREAK is also a hard stop; both left a valid `last.pt` when the kill landed mid-epoch [VERIFIED: executed].
**How to avoid / decision:** keep `terminate()` (already the code path), do not add CTRL_BREAK, and document in the README (en/ru) that native-Windows development has an abrupt cancel and that DataLoader worker grandchildren are not killed by `TerminateProcess` [ASSUMED; irrelevant on the CPU dev path where `workers = 0`]. Docker/Linux uses SIGTERM to the process group (default disposition, immediate death; GPU memory is released by the OS on process exit, verified in Phase 12). Never classify a cancel by exit code: the DB flag is the source of truth.

### Pitfall 9: TestClient and SSE
`TestClient` buffers the response and hangs on endless streams (executed, Pattern 4). Test the tail generator directly; test HTTP only on terminal runs. Also `StarletteDeprecationWarning` about `httpx` appears in the output and is unrelated.

### Pitfall 10: Open streams block graceful shutdown
See Pattern 4 (`--timeout-graceful-shutdown 5`). Also verify in `scripts/compose_smoke_test.sh` or a manual `docker compose stop` that the api exits within the grace period with a stream open.

### Pitfall 11: EventSource limits and endings
Six connections per origin over HTTP/1.1 [CITED: MDN EventSource]: open one stream per run page (not per component), close it on unmount and on `end`. The server closing the stream makes `EventSource` reconnect by default [CITED: MDN Using server-sent events], hence the explicit `end` event + client `close()`.

### Pitfall 12: Replay size
A CPU run with a 10-minute epoch and one batch event per 2 s writes ~300 batch lines per epoch; 100 epochs ≈ 30k lines. Compaction (Pattern 4) plus a ≥ 2 s throttle keeps replay to a few hundred KB. Do not drop the batch events from the file (D-03/D-05 say the file is the durable artifact).

### Pitfall 13: Cancel racing with completion or the worker stop
Cancel flag set while the child finishes → `completed` wins; `mark_cancelled` is guarded by `status = 'running'`. A worker `stop_event` and a cancel at the same time → whichever write lands first wins; both are guarded. Test both orders.

### Pitfall 14: Reconcile paths ignore the new columns
`queue.reconcile_on_start` and `training.reconcile.reconcile_runs_on_startup` are bulk UPDATEs that set `interrupted` + `finished_at`; they must also close the segment (`segment_started_at = NULL`, add partial `active_seconds`) and honor a pending cancel flag (Pattern 3). Extend `test_worker_queue.py` / `test_training_reconcile.py`.

### Pitfall 15: Final validation display
Rules: the final event never becomes a row; before it arrives, `last_epoch` on a real epoch → "Final validation…"; the "Final results (best.pt)" card uses `finalMetrics` (events) and, after completion, `run.metrics` + `quality`. An early-stopped run (patience) legitimately has fewer than `epochs` real epochs: do not render "epoch N of M" as an error. Shown epoch stays `min(epoch, epochs)`.

### Pitfall 16: Ultralytics runs a PyPI version check on every `train()`
`checks.check_pip_update_available()` is called at the start of `model.train` (`engine/model.py:~833`); the log shows "New https://pypi.org/project/ultralytics/8.4.175 available". It is wrapped by Ultralytics and harmless offline; do not classify its output as a network failure when matching log tails.

### Pitfall 17: Strict fetch stubs and new request shapes
New fields in `makeRun`, a new `EventSource`, and extra queries on the Training page (history now needs `settings`) can break the existing strict test stubs (Phase 3 Pitfall 13, Phase 4 Pitfall 16). Update `test/trainingApi.ts` in the same plan as the API change.

### Pitfall 18: A resumed queued run can be "removed from the queue" = hard delete
`DELETE` on a `queued` row removes the row and the folder (existing D-11 behavior). For a run with `resume_count > 0` that destroys its whole history and checkpoint. See Open Question 1.

## Code Examples

### Throttled batch event and segment marker (train_job)
```python
# Source: ultralytics 8.4.159 engine/trainer.py:463 (on_train_start), :611 (on_train_batch_end);
# executed spike printed batch 1..4 of nb=4 per epoch with start_epoch=3 after resume.
BATCH_EVENT_MIN_INTERVAL = 2.0

def on_train_start(trainer) -> None:
    writer.emit(EVENT_TRAIN_START, v=SCHEMA_VERSION, epochs=trainer.epochs,
                start_epoch=trainer.start_epoch, resumed=bool(trainer.resume),
                nb=len(trainer.train_loader))

def on_train_epoch_start(trainer) -> None:
    state["batch"] = 0

def on_train_batch_end(trainer) -> None:
    state["batch"] += 1
    now = time.monotonic()
    nb = len(trainer.train_loader)
    if state["batch"] == nb or now - state["last_batch_emit"] >= BATCH_EVENT_MIN_INTERVAL:
        state["last_batch_emit"] = now
        writer.emit(EVENT_BATCH_PROGRESS, v=SCHEMA_VERSION, epoch=trainer.epoch + 1,
                    epochs=trainer.epochs, batch=state["batch"], nb=nb)
```

### Cancel route and supervisor check (guarded, no PID signalling)
```python
# api: one guarded statement (pattern of service.remove_queued_run)
result = await session.execute(
    update(TrainingRun)
    .where(TrainingRun.id == run_id, TrainingRun.project_id == project_id,
           TrainingRun.status == "running", TrainingRun.cancel_requested_at.is_(None))
    .values(cancel_requested_at=utcnow())
)
await session.commit()

# worker: replaces _still_running inside _watch (same 1 s tick)
status, cancel_requested = queue.run_control(self.engine, run_id)   # one SELECT
if status is None or status != "running":
    self._terminate(process); outcome = VANISHED
elif cancel_requested is not None and exit_code is None:
    self._terminate(process)                                          # waits for exit
    queue.mark_cancelled(self.engine, run_id, active_seconds=..., log_tail=...)
    outcome = "cancelled"
```

### SSE route skeleton
```python
# Source: fastapi/sse.py + routing.py:520-650 (read); header values observed in an executed probe.
@router.get("/projects/{project_id}/runs/{run_id}/stream", response_class=EventSourceResponse)
async def stream_run(project_id: int, run_id: int, request: Request,
                     last_event_id: Annotated[str | None, Header()] = None):
    sessionmaker = request.app.state.sessionmaker
    run = await load_run_scoped(sessionmaker, project_id, run_id)     # 404 before any bytes
    path = layout.run_dir(request.app.state.settings.data_dir, run_id) / layout.PROGRESS_FILE
    offset = parse_offset(last_event_id, path)                         # strict int, clamped, else 0
    async for frame in progress_frames(sessionmaker, run, path, offset):   # unit-testable generator
        yield frame        # ServerSentEvent(event="progress"|"status"|"end", id=str(end_offset), data=...)
```

### Resume claim and "not resumable" guard (api)
```python
# Pre-check (read-only, in a thread): last.pt exists, checkpoint not ended/refused;
# state.epoch = resume_epoch or the epoch derived from progress events (Phase 4 rows).
# No resume_epoch condition in the guard: D-10, Open Question 4 user-confirmed 2026-10-11.
result = await session.execute(
    update(TrainingRun)
    .where(TrainingRun.id == run_id, TrainingRun.project_id == project_id,
           TrainingRun.status.in_(("interrupted", "cancelled", "failed")))
    .values(status="queued", resume_count=TrainingRun.resume_count + 1, finished_at=None,
            cancel_requested_at=None, error_message=None, error_category=None, log_tail=None)
)
```

### Fixture-style classifier test
```python
@pytest.mark.parametrize(("type_name", "message", "category"), [
    ("OutOfMemoryError", "CUDA out of memory. Tried to allocate 2.00 GiB.", "out_of_memory"),
    ("RuntimeError", "Dataset '/data/runs/3/dataset/data.yaml' error ❌ train: images not found", "invalid_dataset"),
    ("OSError", "[Errno 28] No space left on device", "disk_full"),
    ("WeightsDownloadError", "Could not download yolo26n.pt.", "weights_download"),
    ("ValueError", "something else", "unknown"),
])
def test_classify_exception(type_name, message, category): ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sse-starlette` for SSE in FastAPI | Native `fastapi.sse.EventSourceResponse` | FastAPI ≥ 0.135 line; present in installed 0.141.1 | No extra dependency |
| Recharts 2 (`ResponsiveContainer` always measured) | Recharts 3.x (`initialDimension`, Redux-based state) | 3.0 in 2025; current 3.10.1 | Easier jsdom tests; keep `isAnimationActive={false}` for live data |
| Ultralytics `val/dfl_loss` for every detect model | YOLO26 reports `l1_loss`, no `dfl_loss` | YOLO26 | Discover loss series from events (Phase 4 Pitfall 1) |

**Deprecated/outdated:** the Phase 0 `CTRL_BREAK_EVENT` suggestion (adds nothing without a handler, Pitfall 8). `starlette.testclient` with `httpx` prints a deprecation warning in 8.x of this stack (no action).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PyTorch's `PytorchStreamWriter ... file write failed` `RuntimeError` is what a full disk produces from `torch.save`, so `disk_full` should also match it | Pattern 11 | A disk-full run would show as `unknown` with the raw message; low impact |
| A2 | Network failures inside `attempt_download_asset` surface as `ConnectionError`/`URLError`/`gaierror`/`TimeoutError`/`MaxRetryError` or as the existing "Could not download" `RuntimeError` | Pattern 11 | An offline first-use download would be classed `unknown` unless the typed `WeightsDownloadError` path is hit; verify with the offline-download test already in `test_train_job.py` |
| A3 | Per the HTML spec an `EventSource` response with non-200 or a non-`text/event-stream` content type fails the connection without retry; `Last-Event-ID` is sent on reconnect when an id was received (MDN pages fetched did not cover either) | Patterns 4, 10 | If the browser retries on 5xx, the fallback-to-polling trigger may fire late; the id logic only matters for reconnect after drop |
| A4 | `TerminateProcess` on Windows does not kill DataLoader worker grandchildren | Pitfall 8 | Orphan workers on native Windows with `workers > 0` (not the CPU path); only a README note |
| A5 | `pgrep` is not present in the slim worker image, so the "no orphan" container check should scan `/proc` from Python | Validation Architecture | A shell one-liner in the smoke script fails; trivial to adapt |
| A6 | Docker Desktop's OOM-killer kills only the training child (exit `-9`), leaving the worker alive | Pattern 11 | If the whole container is killed the run becomes `interrupted` instead of `failed/process_killed`; both are acceptable end states |
| A7 | `last.pt` truncation risk is small for small models and grows with size; no field data on bind-mount timing for large models | Pitfall 4 | Resume of a cancelled large run may fail with `CheckpointError`; decision on a `last.prev.pt` copy: resolved as no copy (Open Question 5, user-confirmed 2026-10-11) |
| A8 | The baseline suite counts/time (not re-run this session) are those of the Phase 4 close | Validation Architecture | Wave 0 estimate only |

## Open Questions (RESOLVED)

All six questions were resolved before planning closed (2026-10-11). Each carries an inline `RESOLVED:` line with the decision, its source (user confirmation in the planning session, a locked CONTEXT decision, or an approved UI-SPEC default) and the plan that implements it.

1. **What does "Remove from queue" do to a resumed queued run?**
   - What we know: `DELETE` on a `queued` row deletes the row and the run folder (Phase 4 D-11, `remove_queued_run`). A run with `resume_count > 0` that sits in the queue has history, charts, `last.pt` and possibly a model-less interim `best.pt`.
   - What's unclear: CONTEXT D-15 says a queued run is removed via the queue action, without distinguishing.
   - Recommendation: for `queued` rows with `resume_count > 0`, make the queue action "Cancel resume": a guarded `UPDATE … SET status='cancelled' WHERE status='queued'` (resume_count unchanged, `resume_epoch` kept) instead of a delete; plain first-time queued runs keep the hard delete. Needs a user confirmation because it changes what the existing button does.
   - **RESOLVED (user-confirmed 2026-10-11): "Cancel resume".** For a `queued` run with `resume_count > 0` the queue action is "Cancel resume": one UPDATE guarded by `status = 'queued' AND resume_count > 0` sets `cancelled` and keeps `resume_count`, `resume_epoch`, `last.pt`, the charts and `progress.jsonl`; `DELETE` of such a run answers 409. First-time queued runs (`resume_count = 0`) keep the hard delete. Implemented in Plan 05-07 Task 2 (`cancel_run` queued-resume branch, `remove_queued_run` guard `resume_count == 0` with `RUN_RESUMED_DETAIL`, the run page "Cancel resume" action); Plan 05-09 keeps the guard in `delete_run`.

2. **Should `preparing` be cancellable?** (CONTEXT: "if a run can be cancelled during weight download or setup")
   - What we know: weight download happens in `train_job` (status `running`), so the supervisor path covers it. `preparing` is only the api's file materialization.
   - Recommendation: `running` only. If the user wants more, the guarded `preparing → cancelled` UPDATE is a few lines and reuses the existing folder cleanup.
   - **RESOLVED: `running` only** (approved UI-SPEC default 4, "Defaults to confirm"; CONTEXT allows `preparing` only "if a run can be cancelled during weight download or setup", and weight download already runs under `running`). `preparing` has no cancel action. Implemented in Plan 05-05 (`cancel_run` guarded by `status = 'running'`, 409 otherwise) and Plan 05-09 (run page action matrix: `preparing` shows no actions).

3. **FIFO position of a resumed run.** `claim_next` picks the lowest `id` among `queued`, so a resumed old run jumps ahead of newer queued runs, contrary to D-12 ("end of the FIFO queue"). Recommendation: add `queued_at` (set on creation-to-queued and on resume) and order the claim and `queue_positions` by `(queued_at, id)`; otherwise document the deviation. Costs one more nullable column in `0006`.
   - **RESOLVED: add `queued_at`, per locked D-12** ("end of the FIFO queue"), so no deviation is documented. `queued_at` is set whenever a run becomes `queued` (first time in `prepare_run_files` and on every resume); `claim_next` and `queue_positions` order by `coalesce(queued_at, created_at), id`. The column lands in migration `0008` (the plans number the migrations 0006 failure category, 0007 cancel flag, 0008 resume). Implemented in Plan 05-06 Task 1.

4. **Backfill of `resume_epoch` for Phase 4 `interrupted` rows** (Runtime State Inventory). A Phase 4 `interrupted` run has a valid `last.pt` but `resume_epoch IS NULL`, so Resume is disabled. Options: leave as is (document), or a one-time worker-side check at the first resume attempt. Recommendation: leave as is (Phase 4 data is dev/UAT data). Phase 4 progress files do contain `model_save` events, so a one-off sweep could derive `resume_epoch` if the user has real interrupted Phase 4 runs worth resuming; ask before adding it.
   - **RESOLVED (user-confirmed 2026-10-11): honor D-10 for Phase 4 rows.** The earlier "no backfill, Phase 4 runs stay non-resumable" resolution is withdrawn: it narrowed locked D-10. Interrupted, cancelled and failed Phase 4 runs are resumable whenever a resumable `last.pt` exists, and the api stays torch-free. There is no SQL backfill. When `resume_epoch` is NULL, the api derives the checkpoint epoch from the run's `progress.jsonl` (`model_save` epochs; the loop counts as ended after `last_epoch`, the `final_validation` event, or a save at the last epoch) at read and resume time. It stores the derived value with the resume, and the resumed segment's `train_start` confirms the epoch the worker actually loaded. `train_job`'s `check_resumable` stays the final guard: a stripped checkpoint fails as `not_resumable`, after which Resume stays disabled. "No checkpoint saved yet" appears only when `last.pt` is missing. The list carries no resumability field (no per-row filesystem check); the run page's single-run read does the check. Implemented in Plan 05-06 (`progress.checkpoint_state`, `service.resume_state`, the resume gate, `run_read.can_resume`, the supervisor `train_start` write), Plan 05-07 (`resume_blocked`: `no_checkpoint` | `finished` | `not_resumable`) and Plan 05-10 (no "Phase 4 runs not resumable" README note; UAT check on Phase 4 data).

5. **Keep a previous checkpoint (`last.prev.pt`) to survive a kill during `write_bytes`?** Costs one extra checkpoint per run on disk (≈ 20 MB for n, ≈ 250 MB for x). Recommendation: do not, v1 shows a clear `not_resumable`/damaged-checkpoint error and offers a new run from the interim model; revisit if it happens in practice.
   - **RESOLVED (user-confirmed 2026-10-11): no `last.prev.pt`.** A checkpoint that a kill damaged during its write fails the resume with category `not_resumable` (`CheckpointError` "The saved checkpoint is damaged; start a new run from this run's interim model."); no previous checkpoint copy is kept. Implemented in Plan 05-06 Task 2 (train_job resume path) with the `CheckpointError -> not_resumable` rule from Plan 05-04.

6. **Loss chart: sum of components vs per-component lines** (D-01 discretion). Recommendation: the sum with a tooltip breakdown (Pattern 9). A UI-SPEC from `/gsd-ui-phase 5` should confirm.
   - **RESOLVED: the sum with a tooltip breakdown** (approved UI-SPEC default 1). The loss chart draws two lines (train and validation, each the sum of every loss component discovered in the events) and the tooltip adds the per-component grid. Implemented in Plan 05-02 (`foldProgress` loss sums and components, `ChartTooltip`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (venv) | backend tests, spikes | ✓ | 3.12.10 | — |
| uv | `uv run pytest`, ruff | ✓ | 0.12.19 | — |
| Ultralytics + torch (CPU) | `training`-marked real runs, resume spike | ✓ | 8.4.159 / 2.14.0+cpu | — |
| `yolo26n.pt` in repo root | real CPU training tests | ✓ | present | download from GitHub (network reachable) |
| Node / npm | frontend tests/build | ✓ | 24.19.0 / 11.17.0 | — |
| Docker + Compose | `scripts/compose_smoke_test.sh`, nginx/SSE check | ✓ | 29.7.2 / v5.4.0 | — |
| NVIDIA GPU | GPU memory freed after cancel | ✗ | — | Phase 12 (explicitly out of scope) |
| `pgrep` in worker image | container "no orphan" check | ? (unverified) | — | scan `/proc` with Python |

**Missing dependencies with no fallback:** none for this phase.
**Missing dependencies with fallback:** NVIDIA GPU → Phase 12.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.1.1 (backend, `addopts = "-ra -m 'not training'"`), Vitest 5 + Testing Library + jsdom (frontend) |
| Config file | `backend/pyproject.toml` `[tool.pytest.ini_options]` (marker `training`), `frontend/vite.config.ts` `test` block |
| Quick run command | `uv run pytest backend/tests/<file> -x`; `npm --prefix frontend run test -- --run <path>` |
| Full suite command | `uv run pytest backend/tests -x`, `uv run ruff check backend && uv run ruff format --check backend`, `npm --prefix frontend run test -- --run`, `npm --prefix frontend run build`, `bash scripts/compose_smoke_test.sh` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRAN-05 | Event schema v2: `train_start`, throttled `batch_progress` (last batch always emitted), `last_epoch`, final tagged, v1 events still readable | unit (fake clock) + `training`-marked real run | `uv run pytest backend/tests/test_train_job.py -x` ; `-m training` | ✅ extend / ❌ Wave 0 for new cases |
| TRAN-05 | `foldProgress`: dedupe by epoch, truncate on `train_start`, final never a row, discovered loss keys, tolerant of missing fields | unit (Vitest) | `npm --prefix frontend run test -- --run src/features/training/progress` | ❌ Wave 0 |
| TRAN-05 | SSE generator: ids = offsets, `Last-Event-ID`, compaction, partial line held back, status change and `end` | unit (async generator vs temp file) | `uv run pytest backend/tests/test_run_stream.py -x` | ❌ Wave 0 |
| TRAN-05 | SSE HTTP layer on a terminal run: 404 for other project, replay then `end`, bad `Last-Event-ID` ignored | integration (TestClient, finite) | `uv run pytest backend/tests/test_run_stream.py -x` | ❌ Wave 0 |
| TRAN-05 | `useRunStream` reload restores history then continues; charts render rows; ETA | component (FakeEventSource) | `npm --prefix frontend run test -- --run src/features/training/RunPage.test.tsx` | ✅ extend |
| TRAN-06 | Cancel route guards (404/409/idempotent), supervisor terminates child, `cancelled`, next run claimable, no orphan | integration (fake trainer `sleep` mode) | `uv run pytest backend/tests/test_worker_supervisor.py -x` | ✅ extend |
| TRAN-06 | Cancel vs completion and vs stop-event races | integration | same file | ❌ Wave 0 |
| TRAN-06 | Real container: cancel within seconds, no `train_job` process left, next run starts | smoke | `bash scripts/compose_smoke_test.sh` | ✅ extend |
| TRAN-07 | Resume route (guards, device check, stays same row, `resume_count`), claim keeps `started_at`, `active_seconds` accumulates | integration | `uv run pytest backend/tests/test_runs_api.py backend/tests/test_worker_queue.py -x` | ✅ extend |
| TRAN-07 | Real CPU kill then resume: continues at epoch k+1, no restart, completes, registers model; stripped checkpoint refused; relocated folder stays in place; partial progress line repaired | `training` marker | `uv run pytest -m training backend/tests/test_train_job.py` | ❌ Wave 0 |
| TRAN-08 | History fields (duration, key settings, mAP50-95, images), sort + status filter in URL, delete (guards, model + folder removal, base-in-use 409) | integration + component | `uv run pytest backend/tests/test_runs_remove.py -x`; `npm … TrainingPage.test.tsx` | ✅ extend |
| TRAN-11 | Classifier fixtures; supervisor sets category for error.json, crash (signal exit), unknown; UI shows localized title + hint + raw message + log | unit + integration + component | `uv run pytest backend/tests/test_failures.py backend/tests/test_worker_supervisor.py -x` | ❌ Wave 0 |
| All | Migration `0006` on a populated `0005` DB | integration | `uv run pytest backend/tests/test_migrations.py -x` | ✅ extend |

### Sampling Rate
- **Per task commit:** the touched test file(s) (`-x`), plus `uv run ruff check backend` / the touched Vitest file.
- **Per wave merge:** `uv run pytest backend/tests -x` and `npm --prefix frontend run test -- --run`.
- **Phase gate:** full suite green, `npm --prefix frontend run build`, ruff check + format check, `bash scripts/compose_smoke_test.sh`, then `/gsd-verify-work`. Human check (end-of-phase mode): watch a real CPU run on the dev host, cancel, resume, reload mid-run.

### Wave 0 Gaps
- [ ] `backend/tests/test_run_stream.py` — SSE generator and HTTP layer (TRAN-05)
- [ ] `backend/tests/test_failures.py` — classifier fixtures (TRAN-11)
- [ ] `frontend/src/features/training/progress/*.test.ts(x)` — fold, ETA, hook with `FakeEventSource` (TRAN-05)
- [ ] `frontend/src/test/fakeEventSource.ts` — shared stub, plus additive fields in `test/trainingApi.ts:makeRun`
- [ ] `fake_train_job.py` — new modes (`slow` with batch events, `resume`) and a `resume` parameter in `fake_command`
- [ ] `training`-marked real kill-and-resume test (TRAN-07), modelled on the spike run this session
- [ ] Framework install: `npm --prefix frontend install recharts@3.10.1`

## Security Domain

### Applicable ASVS Categories (Level 1, `security_enforcement` on)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-operator, no auth in v1 (accepted AR-4-04) |
| V3 Session Management | no | No sessions |
| V4 Access Control | yes | Every run route scoped by `project_id` (404 for other projects), as Phase 4 |
| V5 Input Validation | yes | Integer path params only; `Last-Event-ID` parsed as a strict non-negative int and clamped; no body fields on cancel/resume; pydantic `extra="forbid"` where bodies exist |
| V6 Cryptography | no | None added |
| V7 Error handling / logging | yes | Error text rendered as text only; categories are an allow-listed code set |
| V12 Files | yes | Run/model paths derived from integer ids via `layout`; deletion through direct-child/non-symlink helpers |
| V13 API | yes | State-changing routes keep `Depends(require_xhr)` (CSRF); GET stream/download need none |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF on cancel/resume/delete | Spoofing/Tampering | `require_xhr` + no CORS grant (preflight fails), pytest 403 tests as in T4-07-04 |
| Cross-project run access via the stream or download | Information Disclosure | `run.project_id == project_id` check before any bytes |
| Path traversal via `Last-Event-ID` or ids | Tampering | Offsets are ints; the file path is built from `layout.run_dir(data_dir, int)` only |
| Cross-site page reading the stream (DNS rebinding / CSRF-style GET) | Information Disclosure | `TrustedHostMiddleware` allow-list + no CORS headers (browser blocks reading); CSP `connect-src 'self'` |
| Stored XSS via error message, log tail, class names, run names, category | Tampering | React text rendering only; unknown category → `unknown` key; no HTML injection APIs |
| Resource exhaustion by many open streams/tabs | DoS | Stream ends at terminal state; 0.5-2 s ticks; accepted as single-operator risk like AR-4-06 (optionally cap concurrent streams) |
| Hard-delete of the wrong user data (one-way) | Tampering | Guarded DELETE by status, explicit confirm dialog naming the model, base-in-use 409, folder removal only through id-derived paths |
| Resume executing an unexpected pickle | Elevation | `last.pt` is service-written inside the run folder; `YOLO(path)` unpickles it (same trust model as Phase 4 T4-01-01; documented `.pt` risk) |
| Wrong-process kill | Tampering | Still never signals a recorded PID (T4-05-02); cancel kills only the supervisor's own child group |
| Interim `best.pt` of an active run served half-written | Integrity | Download refused while the run is active; zero-size refused |

## Sources

### Primary (HIGH confidence)
- Installed Ultralytics 8.4.159 source: `engine/trainer.py` (callbacks, `check_resume`, `resume_training`, `final_eval`, `save_model`), `engine/model.py` (resume branch), `utils/torch_utils.py` (`strip_optimizer`), `utils/metrics.py` (fitness), `cfg/__init__.py` (`get_save_dir`) — read this session
- Installed FastAPI 0.141.1 `fastapi/sse.py`, `fastapi/routing.py:520-650` — read; behavior observed in executed probes
- Repository source read this session: `supervisor.py`, `queue.py`, `train_job.py`, `progress.py`, `layout.py`, `routers/runs.py`, `routers/models.py`, `training/service.py`, `training/reconcile.py`, `storage.py`, `models.py`, `schemas.py`, `main.py`, `db.py`, `security.py`, migration `0005`, `docker/nginx.conf.template`, `docker-compose.yml`, `RunPage.tsx`, `TrainingPage.tsx`, `api/training.ts`, `RunFailureLog.tsx`, `RunStatusBadge.tsx`, `RunMetrics.tsx`, `RemoveFromQueueModal.tsx`, `test-setup.ts`, `tests/fake_train_job.py`, `tests/test_train_job.py`
- Executed experiments (scratchpad, throwaway): kill mid-epoch via `terminate()` and `CTRL_BREAK_EVENT`, resume with `resume=True`, resume of a stripped checkpoint, relocation with/without `save_dir`, `trainer.stop`/`start_epoch`/batch counter values, SSE `TestClient` buffering, torch OOM class
- npm registry: `npm view recharts`, `@mantine/charts`; `recharts@3.10.1` tarball types; `gsd_run query package-legitimacy check`
- `.planning/phases/04-train-download/04-RESEARCH.md`, `04-SECURITY.md`, `docs/phase-0-decisions.md` §2/§4, `docs/roadmap.md` §5.6, §9.1-9.3, §11.4

### Secondary (MEDIUM confidence)
- MDN `EventSource` (6-connection limit, `close()`) and `Using server-sent events` (default auto-reconnect, `retry`) — fetched this session

### Tertiary (LOW confidence)
- HTML-spec behavior for non-200 responses and `Last-Event-ID` on reconnect (A3), torch disk-full message (A1), network exception names (A2): training knowledge, not verified this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH: no new backend dependency; Recharts version/peers/props verified from registry and tarball; Mantine charts rejection verified by peer pin
- Architecture: HIGH for resume/cancel/events (source + executed); MEDIUM for the SSE generator and client reducer (designed from source, not prototyped end to end beyond a minimal probe)
- Pitfalls: HIGH for 1-3, 5-8, 9 (executed); MEDIUM for 4, 10-14, 16-18 (reasoned from source/config)

**Research date:** 2026-10-11
**Valid until:** 2026-11-10 for Ultralytics-internals findings (the pin is 8.4.159; a version bump invalidates Pitfalls 1-4); Recharts/FastAPI facts 30 days.
