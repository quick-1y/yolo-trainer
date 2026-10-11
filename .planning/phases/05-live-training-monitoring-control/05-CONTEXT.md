# Phase 5: Live Training Monitoring & Control - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A user watches a training run live in charts, cancels it cleanly, resumes an interrupted, cancelled, or failed run from its last checkpoint, understands why a run failed, and browses the full history of a project's runs.

The work extends the Phase 4 run page, run list, worker supervisor, and train job. It does not replace them.

In scope: SSE live progress with charts (TRAN-05), cancel (TRAN-06), resume in place (TRAN-07), a full run history with delete (TRAN-08), and categorized failure messages (TRAN-11).

Out of scope here and owned by later phases:
- Advanced hyperparameters, per-class metrics, and run comparison (Phase 11).
- Checking that GPU memory is freed after a cancel, and the diagnostics page (Phase 12, needs NVIDIA hardware).
- The model library page, `.pt` upload, and model rename/delete (Phase 7).
- Segment-specific metric charts beyond what the shared key mapping gives (Phase 6 makes segment training end-to-end).

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Training architecture & progress
- `docs/roadmap.md` §9.1 — Subprocess job model, cancellation by terminate signal, restart reconciliation.
- `docs/roadmap.md` §9.2 — Callbacks → per-job JSONL (`on_fit_epoch_end`, `on_train_batch_end`, `on_model_save`, `on_train_end`).
- `docs/roadmap.md` §9.3 — SSE (not WebSockets), API tails the JSONL. Cancel is a normal REST POST.
- `docs/roadmap.md` §9.4 — Config tiers (`resume` is listed as Advanced. Here it is a run action, not a form field).
- `docs/roadmap.md` §11.4 — Recharts for training metrics.
- `docs/roadmap.md` §5.6 — Startup reconciliation → `interrupted`.
- `docs/phase-0-decisions.md` §2 — Exact metric keys, the extra final `on_fit_epoch_end`, and recursive serialization.
- `docs/phase-0-decisions.md` §4 — Popen/terminate behavior: hard kill on Windows, SIGTERM on Linux/Docker.

### Prior phase context
- `.planning/phases/04-train-download/04-CONTEXT.md` — Run page, queue, snapshot, model registration, and failure log decisions this phase extends.
- `.planning/phases/04-train-download/04-SECURITY.md` — Mitigations that new run, SSE, cancel, resume, and delete routes must follow.
- `.planning/phases/04-train-download/04-UI-SPEC.md` — Existing training UI contract to extend.
- `.planning/phases/01-runnable-skeleton-projects/01-CONTEXT.md` — Compose services, data dir, api/worker image split.

### Project-level
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria, and notes (final validation label, Windows terminate, SSE/Recharts, GPU check → Phase 12).
- `.planning/REQUIREMENTS.md` — TRAN-05, TRAN-06, TRAN-07, TRAN-08, TRAN-11.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/yolo_trainer_worker/train_job.py`: the callbacks `on_train_epoch_end` / `on_fit_epoch_end` (with the `final_validation` flag) / `on_model_save` / `on_train_end` writing `progress.jsonl`. Add a throttled batch event and resume support here.
- `backend/src/yolo_trainer_worker/supervisor.py`: `_watch` tails progress and already terminates the child when the run row disappears or is no longer `running` (`_still_running`). It is the natural hook for an api-initiated cancel. `_terminate` does SIGTERM → grace → SIGKILL on the process group. `_finish` decides the final state.
- `backend/src/yolo_trainer_worker/queue.py`: atomic claim and `mark_interrupted`. Extend it for cancelled, the resume re-queue, and the error category.
- `backend/src/yolo_trainer_common/progress.py`: event constants, `jsonable`, `primary_metrics(task_type, …)`, and `clean_log_tail`. Share it between the worker and the SSE reader in the api.
- `backend/src/yolo_trainer_common/layout.py`: `run_dir`, `PROGRESS_FILE`, `LOG_FILE`, `ERROR_FILE`, `RESULT_FILE`. Path-safe run files for the SSE tail and the interim `best.pt` download.
- `backend/src/yolo_trainer_api/routers/runs.py`: existing run routes (create, active, options, list, delete from queue, detail). Add stream, cancel, resume, and run delete here.
- `backend/src/yolo_trainer_api/routers/models.py`: the `.pt` download pattern with a sanitized `Content-Disposition`. Reuse it for the interim `best.pt`.
- `frontend/src/features/training/RunPage.tsx`, `RunMetrics.tsx`, `RunFailureLog.tsx`, `RunStatusBadge.tsx`, `TrainingPage.tsx`, `RemoveFromQueueModal.tsx`, `ActiveRunIndicator.tsx`: extend these with charts, cancel/resume, history columns, and categorized errors. Use `RemoveFromQueueModal` as the pattern for the cancel and delete dialogs.

### Established Patterns
- Alembic migrations only, a Postgres-portable schema, pydantic `extra="forbid"`, and AUTOINCREMENT ids.
- TanStack Query for server state. Vitest + Testing Library, and pytest on temp-file SQLite.
- Atomic file writes (temp + `os.replace`) for run state files.
- The api container is torch-free and cannot spawn into or signal the worker. Control flows through DB status changes.

### Integration Points
- New dependency: `recharts` in `frontend/package.json` (not present yet).
- nginx in front of the api: the SSE route needs buffering disabled and suitable timeouts.
- `training_runs` table: new columns for error category, resume count, and accumulated active duration (Alembic).
- Project delete cleanup (P4 D-21) and the new per-run delete must share the run-folder and model removal logic.

</code_context>

<specifics>
## Specific Ideas

- On the CPU dev machine an epoch can take minutes. The batch bar and ETA (D-03) exist so the page never looks frozen.
- Overnight queue use (P4): an interrupted run must not block the queue (D-13). The user resumes it manually in the morning.
- Validate cancel and resume on the CPU path. The GPU-memory-freed check is Phase 12.

</specifics>

<deferred>
## Deferred Ideas

- Pre-start checks (free disk space in `DATA_DIR`, CPU batch-size warning) on the start form → a future phase (possibly with Phase 11 or Phase 12 diagnostics).
- "Cancel after the current epoch" (graceful option) → not chosen. Immediate cancel only.
- Changing device/batch when resuming (e.g. after OOM) → not chosen. Start a new run from the model instead.
- Auto-resume of interrupted runs after a worker restart → not chosen.
- Cancel from the header indicator or the run list → not chosen.
- A full Ultralytics-style metric grid → could return with Phase 11 detailed evaluation.

</deferred>

---

*Phase: 05-live-training-monitoring-control*
*Context gathered: 2026-10-11*
