---
phase: 05-live-training-monitoring-control
verified: 2026-10-12T11:30:00Z
status: human_needed
score: 20/20 must-haves verified
covered_files:
  - ".planning/phases/05-live-training-monitoring-control/05-01-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-01-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-02-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-02-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-03-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-03-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-04-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-04-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-05-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-05-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-06-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-06-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-07-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-07-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-08-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-08-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-09-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-09-SUMMARY.md"
  - ".planning/phases/05-live-training-monitoring-control/05-10-PLAN.md"
  - ".planning/phases/05-live-training-monitoring-control/05-10-SUMMARY.md"
  - "backend/src/yolo_trainer_api/routers/runs.py"
  - "backend/src/yolo_trainer_api/training/service.py"
  - "backend/src/yolo_trainer_api/training/stream.py"
  - "backend/src/yolo_trainer_common/failures.py"
  - "backend/src/yolo_trainer_common/progress.py"
  - "backend/src/yolo_trainer_worker/queue.py"
  - "backend/src/yolo_trainer_worker/supervisor.py"
  - "backend/src/yolo_trainer_worker/train_job.py"
  - "frontend/src/features/training/FailureAlert.tsx"
  - "frontend/src/features/training/RunPage.tsx"
  - "frontend/src/features/training/TrainingPage.tsx"
  - "frontend/src/features/training/progress/RunCharts.tsx"
  - "frontend/src/features/training/progress/foldProgress.ts"
  - "frontend/src/features/training/progress/useRunStream.ts"
  - "scripts/compose_smoke_test.sh"
covered_digest: "v3:sha256:67ba7229bbbaa9ceaa87c8c5c07e8b9388adca7a0831c1dd37b34d60458da867"
behavior_unverified: 0
overrides_applied: 0
re_verification: null
gaps: []
deferred:
  - truth: "GPU memory is released after a cancel (no orphan DataLoader workers or CUDA contexts on the GPU path)"
    addressed_in: "Phase 12"
    evidence: "README.md 'Native Windows limitation' and ROADMAP Phase 12 (GPU acceleration, hardware diagnostics, validated on NVIDIA hardware); the orchestrator brief fixes the same boundary"
human_verification:
  - test: "Live charts on a real CPU run in a real browser (success criterion 1)"
    expected: "Start a CPU run with 6+ epochs. The mAP, loss and precision/recall charts grow after each epoch without a refresh. Reloading the page mid-run restores the whole curve and keeps updating. After the last epoch the card reads 'Final validation…' (never 'Epoch Y+1'), and a 'Final results (best.pt)' card then appears."
    why_human: "Real EventSource, Recharts rendering and timing are not exercised by jsdom, so only the folding logic and the stream contract are tested automatically."
  - test: "Held-out visual checks at 1024 and 1280 px in en and ru (six backstop statements from plans 05-02, 05-03, 05-04, 05-08)"
    expected: "At 1200 px and wider the three chart panels fit the 960 column and stack below that, with no clipped axis labels or legend. The running headline (epoch on the left, time and ETA on the right) stays on one line with a 3-digit epoch count. The ru final-validation title and hint wrap inside the card. A 10,000-character error message and a 5,000-character log line wrap without widening the page. A 100-character run name and ru header labels (Длительность, Изображений, Базовая модель) fit the history table."
    why_human: "These are layout and visual properties (`verification: backstop`); presence checks and jsdom cannot judge them, so they are abstained as insufficient_spec."
  - test: "Cancel from the UI during a real run, then start another run (success criterion 2)"
    expected: "Press Cancel, confirm. The page shows 'Cancelling…' and then 'Cancelled' within seconds. No `yolo_trainer_worker.train_job` process is left (Docker: `docker compose exec worker ps`). A newly started run is claimed at once."
    why_human: "The automated proof is a real subprocess test and a headless smoke script. The actual button, dialog and transient UI state have not been seen by a person."
  - test: "Resume from the UI after cancel and after `kill -9` of the training process (success criteria 3 and 5)"
    expected: "Resume the cancelled run: it is queued, then runs again as the same run with a 'Resumed' marker on the charts, and its first epoch is the checkpoint epoch + 1, not 1. After `kill -9` of the training process the run ends 'failed' with the 'Training process was killed' title and hint, the original message and the log tail, and Resume is offered."
    why_human: "The real browser flow and an OS-level kill on the target environment cannot be reproduced by the unit and CPU tests."
  - test: "Run page for interim, delete and queued-resume states; history table in the browser"
    expected: "A cancelled or failed run offers 'Download interim best.pt' with the 'incomplete' note, and the file is not in the model list. 'Delete run' names the model in bold. A queued resume shows 'Cancel resume' and no 'Remove from queue'. The history table sorts by every sortable column and filters by status, and the choice survives a reload (?sort, ?dir, ?status)."
    why_human: "Click-through UX of the delete and interim dialogs and of URL-persisted sorting needs a person (planner-deferred `human-check` items)."
  - test: "Decision on code review WR-01 (project delete vs a base model used by an active run of another project)"
    expected: "Decide: accept as a known limitation or fix before closing the phase. Deleting project A removes its models even when an active (queued or preparing) run of project B uses one as its base. The queued run then fails with the categorized 'The base model file is missing.' message instead of being protected."
    why_human: "Judgment call. The 05-09 prohibition is written generally, but its guard covers only the run-delete route. The project-delete route is Phase 4 behavior and has no cross-project check. The failure is loud and recoverable, and the phase goal does not depend on it."
  - test: "Re-run `bash scripts/compose_smoke_test.sh` once on the final tree"
    expected: "'SMOKE OK'. The Phase 5 stage covers cancel, no orphan, next run, resume and the SSE end frame through nginx."
    why_human: "After the last comment-only edit only `bash -n` was run (confirmed again here: syntax OK). A full Docker run takes many minutes and was not repeated by the verifier."
---

# Phase 5: Live Training Monitoring & Control. Verification Report

**Phase Goal:** A user can watch training progress live, stop or resume runs, understand failures, and browse the history of all runs
**Verified:** 2026-10-12T11:30:00Z
**Status:** human_needed
**Re-verification:** No. Initial verification.

Automated evidence is complete and found no goal-blocking gap. Status is `human_needed` only because the live, visual and real-browser checks listed above were deliberately left for end-of-phase UAT. They are not gaps.

## Goal Achievement

### Observable Truths (ROADMAP success criteria and PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Epoch, losses and mAP/precision/recall update live in charts without refresh. Reloading mid-run restores the view. The post-training validation shows as "final validation", never as an epoch past the total. | ✓ VERIFIED (visual part to UAT) | `stream.py:progress_frames` replays progress.jsonl, then follows it. `useRunStream.ts` folds frames through `foldProgress`, the same reducer for replay and live. `train_job.py:on_fit_epoch_end` marks the post-training event `final_validation: true` through the `pending` flag. `foldProgress` never makes it a row, and `RunPage.RunningBody` clamps `shown = min(reached, epochs)`, shows "Final validation…" and hides the batch bar and ETA. The real 2-epoch CPU test asserts exactly one final event. |
| 2 | SC2: Cancel shows as cancelled within seconds, no orphan process remains, a new run starts immediately (CPU path). | ✓ VERIFIED | `service.cancel_run` sets only the flag (guarded UPDATE). `supervisor._watch` reads `run_control` every 1 s tick, then `_terminate` (killpg SIGTERM, 10 s grace, SIGKILL; Windows terminate/kill) and `mark_cancelled`. `_terminate` returns only after the child is dead, so `claim_next` runs afterwards. Independent run: `pytest -m training -k cancelled_mid_training` passed (real subprocess, cancel, resume, complete). The `test_runs_cancel.py` suite is green. The compose smoke stage is covered by executor and orchestrator evidence (UAT item 7). |
| 3 | SC3: Resume continues from the last saved checkpoint instead of epoch 1. | ✓ VERIFIED | `service.resume_run` is one guarded UPDATE (same row, `resume_count+1`, fresh `queued_at`). The worker starts `train_job --resume`, and `_load_checkpoint` plus `check_resumable` refuse a stripped or finished checkpoint. `save_dir` is pinned. The real CPU test asserts `train_start.resumed == true`, the first resumed epoch is `start_epoch+1` and never 1, exactly one model is registered, and checkpoint writes stay in the run folder. It passed here on a second run. |
| 4 | SC4: History of all runs with status, settings, duration and final metrics. | ✓ VERIFIED | `TrainingPage.tsx` renders 11 columns (name, status, base, created, duration, epochs X/Y, settings, mAP50, mAP50-95, images, download), sorts 9 columns with `aria-sort`, filters by status, and persists `?sort/?dir/?status` through `historyTable.ts`. `GET /runs` reads no files per row. The supervisor records `last_map50_95` (migration 0009) so unfinished runs show how far they got. |
| 5 | SC5: A failing run ends failed with an understandable error, not a silent stop. | ✓ VERIFIED | `failures.py` has an ordered classifier with 7 allow-listed codes. `train_job.main` writes `category` into `error.json`. The supervisor stores it and falls back to `classify_exit(exit_code, log_tail)` when there is no file (OS kill). `FailureAlert.tsx` shows a localized title and hint, then "Original message" (pre-wrap) and the collapsible log. Unknown codes fall back to "Unexpected error" with the raw text. All 7 codes have title and hint in en and ru (checked by script, en/ru key parity 0 differences). |
| 6 | SSE contract (05-01): frame id = byte offset, `Last-Event-ID` is digits only and not above the file size, only the last `batch_progress` is replayed, partial last line withheld, 404 before any byte, no DB session held, `end` on a terminal run or vanished row. | ✓ VERIFIED | `stream.py` (`parse_last_event_id`, `compact_replay`, `ProgressTail.read_new_lines`, `stream_target` with a short session, `read_run_status` per tick). nginx `/api/` has `proxy_buffering off` and a 3600 s read timeout. uvicorn has `--timeout-graceful-shutdown 5`. `test_run_stream.py` is green. |
| 7 | Client stream lifecycle (05-01/02): one EventSource per page, closed on `end` and unmount, safety poll 15 s with a healthy stream and 3 s otherwise. | ✓ VERIFIED | `useRunStream.ts` (close on `end`, cleanup closes, `resumeKey` reopens a resumed run, `retry`). `runPollInterval` / `RUN_SAFETY_POLL_INTERVAL_MS = 15000` in `api/training.ts`. |
| 8 | Charts (05-02): three charts, loss sums from discovered keys, rows keyed by epoch (last write wins), `train_start` trims rows above `start_epoch`, final validation is never a point, Phase 4 files render, best-epoch marker, resume markers, skeleton/waiting/reconnecting/unavailable states. | ✓ VERIFIED | `foldProgress.ts`, `RunCharts.tsx` (ReferenceDot, ReferenceLine at `start_epoch+0.5`, `connectNulls`, `isAnimationActive={false}`, 5 integer ticks). Covered by `foldProgress.test.ts` and `RunCharts.test.tsx`. |
| 9 | Events v2 (05-03): `v:2`, `train_start`, throttled `batch_progress` (2 s, always the last batch of an epoch, no loss payload), `last_epoch` and `fitness` on real epochs. | ✓ VERIFIED | `train_job.make_callbacks` (`BATCH_EVENT_MIN_INTERVAL = 2.0`, per-epoch counter reset, injectable clock). Covered by 10 unit tests in `test_train_job.py` plus the real CPU run. |
| 10 | Batch bar, segment-local ETA, "Final validation…" state, "Final results (best.pt)" card only for completed or finishing runs, early-stop note. | ✓ VERIFIED | `eta.ts` (last up-to-5 segment epoch durations from `train_start`, rounded to 10 s, never wall clock), `BatchProgress.tsx`, `FinalResultsCard.tsx` (renders only for `completed` with metrics or `running` with a final event), `RunPage.CompletedBody` early-stop line. |
| 11 | Failure categories (05-04): migration 0006 (nullable `String(32)`, no CHECK), allow-list on every read from file or DB, status frame carries `error_category`, raw message never hidden. | ✓ VERIFIED | `0006_failure_category.py`, `normalize_category`, `stream.STATUS_COLUMNS`. Prohibition "do not hide the raw message" is tested in `RunPage.test.tsx` ("keeps the original message and log", "10,000-character raw message"). |
| 12 | Cancel mechanics (05-05): XHR header required, one UPDATE guarded by `status='running'`, idempotent 200, 409 otherwise, 404 for foreign project, worker restart turns a pending cancel into `cancelled`, a child that exited on its own is finished normally. | ✓ VERIFIED | `service.cancel_run`, `queue.reconcile_on_start`, `reconcile_runs_on_startup` (`cancel_requested_at` → cancelled), `supervisor._watch` (`cancel_requested_at is not None and process.poll() is None`). Migration 0007. 12 tests in `test_runs_cancel.py`. |
| 13 | Prohibitions (05-05): the api never signals a process or PID, and a cancel is never a failure (no `error_category`, no message, no model, exit code not classified). | ✓ VERIFIED | `cancel_run` only issues UPDATEs. `mark_cancelled` writes `error_message=None, error_category=None`, and `_finish` is never reached for a cancelled run. Tests: `test_the_api_only_sets_the_flag_and_never_touches_the_worker_pid` and `test_cancelling_a_running_run_ends_it_without_a_model_and_the_queue_moves_on`. |
| 14 | Resume mechanics (05-06): refusals 409 (wrong status, no checkpoint, checkpoint provably ended or refused), Phase 4 runs resumable through `checkpoint_state`, resume re-checks the device, FIFO by `queued_at`, claim keeps `started_at` and clears `finished_at` and the cancel flag, stored device/batch/workers reused, `base.json` for the base weights, half-line repair, supervisor maintains `resume_epoch`. | ✓ VERIFIED | `service.resume_state` / `resume_run`, `progress.checkpoint_state`, `queue.claim_next` (`coalesce(queued_at, created_at)`), `supervisor._resolved_for` / `_watch`, `train_job.ensure_line_boundary` and `_write_base_record`. Migration 0008. `test_runs_resume.py` and 20+ `test_train_job.py` tests. |
| 15 | Prohibition (05-06): never silently restart from epoch 1 on a resume. | ✓ VERIFIED | `check_resumable` raises `NotResumableError`, and `CheckpointError` covers a missing or unreadable file, both classified `not_resumable`. Real test `test_resuming_a_finished_runs_stripped_checkpoint_fails_honestly_without_retraining` passed here: no new `train_start`, progress file byte-identical, a second resume answers 409. |
| 16 | Active-time duration (05-07): measured on `time.monotonic()`, banked on every terminal write, restart sweep banks `progress_updated_at - segment_started_at`, UI ticks `active_seconds + live part`, Phase 4 fallback `finished - started`. | ✓ VERIFIED | `supervisor._active_total`, `queue._segment_end`, `reconcile.swept_active_seconds`, `duration.ts`. Datetimes are serialized as UTC ISO (`_utc_iso`), so the browser parse is correct. See review WR-05 (clock skew) below. |
| 17 | Resume explanations and queued resume (05-07): `can_resume` and `resume_blocked` (3 codes), disabled Resume with visible reason and `aria-describedby`, "Cancel resume" for a queued resume, DELETE of a resumed queued run answers 409. | ✓ VERIFIED | `run_read`, `ResumeInfo`/`resumeDescribedBy`, `CancelResumeButton`, `service.cancel_run` (first UPDATE) and `remove_queued_run` (`resume_count == 0` guard). Prohibition covered by `RunPage.test.tsx` and `test_runs_remove.py` / `test_runs_cancel.py`. |
| 18 | History table (05-08): 11 columns, sort and filter state in the URL with fallback on malformed values, sticky name column, 1272 px min width, `last_map50_95` recorded for non-completed runs. | ✓ VERIFIED | `TrainingPage.tsx`, `historyTable.ts`, `0009_last_map50_95.py`, `supervisor._watch` (`primary_metrics(...)["map50_95"]` into `record_epoch`). `historyTable.test.ts` and `TrainingPage.test.tsx` are green. |
| 19 | Delete and interim (05-09): one guarded DELETE (terminal status plus base-in-use), 409 messages, rows first and files after through the shared helper, interim `best.pt` as a labelled download only (never registered, never in the base picker), one action set per run state. | ✓ VERIFIED | `service.delete_run`, `storage.remove_run_files`, `download_interim_best`, `interim_best_file`, `DeleteRunModal`, `RunPage` action matrix. `test_runs_delete.py`, `test_runs_interim.py` (including `test_the_interim_file_never_becomes_a_model_or_a_base_option`). Caveat: WR-01 (project delete path), see Human Verification. |
| 20 | Docs and real-stack proof (05-10): README en/ru cover progress, cancel, resume, failures, history, interim, native-Windows limitation. The smoke script has a cancel / no-orphan / next-run / resume / SSE-end stage. | ✓ VERIFIED (smoke re-run → UAT) | README.md lines 87-132 read and match the implementation (three resume-disabled cases, SIGTERM then SIGKILL after 10 s, Windows limitation). `scripts/compose_smoke_test.sh` has the stage (greps for `/cancel`, `/resume`, `yolo_trainer_worker.train_job`, `event: end`) and `bash -n` passes. The Docker run itself was not repeated by the verifier. |

**Score:** 20/20 truths verified. 0 present-but-behavior-unverified. The 6 held-out visual (`backstop`) statements are not scored. They are routed to Human Verification as `insufficient_spec`.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | GPU memory released and DataLoader worker grandchildren ended after a cancel on the GPU path | Phase 12 | README "Native Windows limitation" and the Phase 12 goal (GPU validated on NVIDIA hardware); CPU-path proof is in this phase. |

### Required Artifacts

`verify.artifacts` against all 10 PLAN files: **38/38 artifacts pass** (exist, substantive, patterns present). Key files read in full during this verification: `stream.py`, `progress.py`, `failures.py`, `train_job.py`, `supervisor.py`, `queue.py`, `service.py`, `runs.py`, `reconcile.py`, migrations 0006-0009, `useRunStream.ts`, `foldProgress.ts`, `RunCharts.tsx`, `RunPage.tsx`, `TrainingPage.tsx`, `FailureAlert.tsx`, `FinalResultsCard.tsx`, `CancelRunModal.tsx`, `ResumeButton.tsx`, `eta.ts`, `duration.ts`, `nginx.conf.template`.

### Key Link Verification

`verify.key-links` against all 10 PLAN files: **25/25 links verified** (for example `useRunStream` → `/stream`, `runs.py` → `progress_frames`, `train_job` → `classify_exception`, `supervisor` → `mark_cancelled` / `classify_exit` / `--resume`, `queue.claim_next` → `queued_at`, `service` → `read_checkpoint_state` / `remove_run_files`, `CancelRunModal` / `ResumeButton` / `DeleteRunModal` → their mutations).

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `RunCharts` | `progress.rows` | EventSource `progress` frames ← `progress_frames` ← `progress.jsonl` ← Ultralytics callbacks in `train_job` | Yes (real CPU run asserts the events) | ✓ FLOWING |
| `RunningBody` | `run.epoch`, `last_map50`, `progress.batch`, ETA | `status` frame and run query ← supervisor `record_epoch` ← events; batch and ETA from frames | Yes | ✓ FLOWING |
| `FailureAlert` | `error_category`, `error_message`, `log_tail` | `error.json` / `classify_exit` ← `mark_failed` ← `run_read` | Yes | ✓ FLOWING |
| `TrainingPage` rows | `RunSummary` fields | `run_summaries` ← DB columns written by supervisor / worker | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite | `pytest -q` in `backend/` (default `-m 'not training'`) | 883 passed, 5 deselected | ✓ PASS |
| Backend lint and format | `ruff check backend` / `ruff format --check backend` | All checks passed / 101 files formatted | ✓ PASS |
| Frontend suite | `npx vitest run` | 64 files, 927 tests passed | ✓ PASS |
| Frontend types | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Real CPU cancel then resume | `pytest -m training -k "cancelled_mid_training or stripped_checkpoint"` | 2 passed (31 s) | ✓ PASS |
| Smoke script syntax | `bash -n scripts/compose_smoke_test.sh` | OK | ✓ PASS |

### Probe Execution

SKIPPED. The phase declares no `probe-*.sh` scripts. The Docker smoke test is the phase's runnable check, and its full run is a Human Verification item.

### Test Quality Audit

| Area | Linked Req | Disabled tests | Circular | Assertion level | Verdict |
|------|-----------|----------------|----------|-----------------|---------|
| `test_run_stream.py`, `test_progress.py` | TRAN-05 | 0 | none (fixtures are literal event lines) | Value / behavioral | OK |
| `test_train_job.py` (incl. 2 real `training` runs) | TRAN-05, 06, 07 | 0 (3 environment `skip`s guarded by file availability) | none | Behavioral (real Ultralytics) | OK |
| `test_runs_cancel.py`, `test_worker_supervisor.py` | TRAN-06, 11 | 0 | none | Behavioral (real subprocesses) | OK |
| `test_runs_resume.py`, `test_worker_queue.py` | TRAN-07 | 0 | none | Value / behavioral | OK |
| `test_failures.py` | TRAN-11 | 0 | none (literal message fixtures) | Value | OK |
| `test_runs_api.py`, `test_runs_delete.py`, `test_runs_interim.py`; Vitest `RunPage`, `TrainingPage`, `historyTable`, `foldProgress`, `eta`, `duration`, `RunCharts` | TRAN-05, 08 | 0 | none | Value / behavioral | OK |

No `it.skip`, `xit`, `@pytest.mark.skip` or `todo` markers. No `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` / `PLACEHOLDER` in `backend/src`, `frontend/src`, `scripts`, `docker`, README (en/ru).

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts (17/17, `check.decision-coverage-verify`).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TRAN-05 | 05-01, 05-02, 05-03, 05-10 | Live progress: epoch, losses, mAP charts in real time; final-validation event labeled correctly | ✓ SATISFIED (real-browser live view → UAT) | Truths 1, 6-10. SSE + charts + v2 events + final-validation handling. |
| TRAN-06 | 05-05, 05-09, 05-10 | Cancel a running job; process stops cleanly and frees resources | ✓ SATISFIED (GPU memory release deferred to Phase 12) | Truths 2, 12, 13. Real subprocess cancel, no orphan on the CPU path, next run claimed. |
| TRAN-07 | 05-06, 05-07, 05-10 | Resume an interrupted or cancelled run from its last checkpoint | ✓ SATISFIED | Truths 3, 14, 15, 17. Real CPU test continues at `start_epoch+1`. |
| TRAN-08 | 05-07, 05-08, 05-09, 05-10 | History of runs with status, settings, duration, final metrics | ✓ SATISFIED | Truths 4, 16, 18, 19. |
| TRAN-11 | 05-04, 05-10 | Failures shown with an understandable error, not a silent stop | ✓ SATISFIED (kill -9 in a browser → UAT) | Truths 5, 11. |

All five phase requirement IDs appear in PLAN frontmatter (05-01 TRAN-05; 05-02/03 TRAN-05; 05-04 TRAN-11; 05-05 TRAN-06; 05-06 TRAN-07; 05-07 TRAN-07/08; 05-08 TRAN-08; 05-09 TRAN-08/06; 05-10 all five) and in REQUIREMENTS.md. **No orphaned requirements:** REQUIREMENTS.md maps exactly TRAN-05, 06, 07, 08, 11 to Phase 5. Housekeeping: the REQUIREMENTS.md checkboxes and traceability rows for these five are still `[ ]` / `Pending`. The phase-completion step should flip them.

### Anti-Patterns Found

None blocking. Open code-review items (`05-REVIEW.md`, all `open` in `05-REVIEW-DISPOSITION.md`, 0 critical) were re-checked against the code and are real but not goal-blocking.

| File | Finding | Severity | Impact |
|------|---------|----------|--------|
| `routers/projects.py:154-170` | WR-01 confirmed: project delete guards only same-project active runs, not a base model used by another project's active run | ⚠️ Warning | The dependent queued run fails loudly with a categorized message. Needs a human decision (Human Verification item 6). |
| `supervisor.py` `_terminate` / `train_job.py` | WR-02 (cancel during a non-atomic checkpoint write may truncate `last.pt`), WR-04 (group not SIGKILLed if the leader exits within grace) | ⚠️ Warning | Fails closed (`not_resumable`), CPU path unaffected. The GPU-path orphan angle is Phase 12. |
| `supervisor.py` terminal writes | WR-03: `mark_cancelled` / `mark_interrupted` not retried on `OperationalError` | ⚠️ Warning | Under a locked DB a cancel could be recorded as `failed`. Rare. |
| `progress/duration.ts` | WR-05: live duration uses browser clock minus server stamp | ⚠️ Warning | Display-only skew. Banked time is monotonic. |
| `stream.py`, `RunPage.tsx` | IN-03 (`last_map50` not in the status frame, so the card's mAP50 lags up to 15 s while charts are live), IN-04 (DB error in the SSE loop drops the stream; the browser reconnects with `Last-Event-ID`) | ℹ️ Info | Cosmetic or self-healing. |

### Human Verification Required

See the `human_verification` list in the frontmatter (7 items). Summary:

1. **Live charts on a real run in a browser**: charts grow, reload restores them, "Final validation…" with no Y+1.
2. **Held-out visual checks** at 1024 and 1280 px in en and ru (the six `backstop` statements).
3. **Cancel from the UI** during a real run, no orphan, next run starts.
4. **Resume from the UI** after cancel, and a `kill -9` failure shown with the right category.
5. **Interim download, Delete run, Cancel resume and the history table's sorting and filtering** in the browser.
6. **Decision on WR-01** (cross-project base model vs project delete).
7. **Re-run the compose smoke test** once on the final tree.

### Gaps Summary

No must-have failed. All 5 roadmap success criteria and all 20 plan-level truths are backed by code that exists, is substantive, is wired end to end, and carries real data. Behavior-dependent truths (cancel, resume, race guards, final-validation handling) have behavioral tests. The two real-CPU tests were re-run independently and passed, and the backend (883) and frontend (927) suites, ruff and `tsc` all pass.

Remaining work is human UAT of visual and real-browser behavior, one judgment call on code review WR-01, and a final Docker smoke re-run. Merging `REQUIREMENTS.md` status for TRAN-05/06/07/08/11 is a completion-step housekeeping task.

---

_Verified: 2026-10-12T11:30:00Z_
_Verifier: Claude (gsd-verifier)_
