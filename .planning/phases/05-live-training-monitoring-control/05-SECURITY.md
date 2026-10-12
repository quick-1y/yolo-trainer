---
phase: "5"
slug: "live-training-monitoring-control"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-12"
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| DB (error_message, log_tail, error_category) -> React | process output rendered in the UI |
| DB -> list read model -> React | run names, base names and settings rendered in a table |
| URL query (?sort, ?dir, ?status) -> client state | user-editable values driving sort/filter |
| api -> DB -> worker supervisor | the cancel flag crosses the container boundary through the database |
| api -> browser (interim download) | a file from an unfinished run with a user-chosen name in the header |
| api -> filesystem (last.pt check) | id-derived path probed per run read |
| api -> filesystem (run folder and model file removal) | deletion of user data by id-derived paths |
| api / worker -> training_runs | concurrent resume, claim, cancel and delete on one row |
| api process lifetime | long-lived responses vs container stop and DB connections |
| browser -> api (DELETE run) | a one-way, state-changing request |
| browser -> api (GET stream) | integer ids from the URL and a client-controlled Last-Event-ID header |
| browser -> api (POST cancel on a queued resumed run, DELETE, POST resume) | state-changing requests |
| browser -> api (POST cancel) | state-changing request with integer ids |
| browser -> api (POST resume) | state-changing request with integer ids |
| browser -> api (polling) | fallback polling when the stream is down |
| docs -> user | instructions that include process-kill commands |
| progress.jsonl -> api -> browser | batch events in replay and live |
| progress.jsonl -> api -> browser | file content written by the training subprocess, forwarded as JSON |
| run folder last.pt -> train_job | a pickle-based checkpoint loaded by Ultralytics |
| run folder progress.jsonl -> api | a worker-written file parsed by the api to derive a Phase 4 run's checkpoint epoch |
| smoke script -> running stack | test requests against the local compose stack |
| stream frames -> React | event field names (loss component keys) and numbers from the training subprocess rendered in the UI |
| training subprocess -> error.json -> supervisor -> DB | exception text and a category written by the child process |
| training subprocess -> progress.jsonl | new high-frequency event source |
| worker supervisor -> OS processes | process-group signals |

---

## Threat Register

Verified by gsd-security-auditor on 2026-10-12 (ASVS L1, block_on: high). Evidence = where the mitigation lives in code/tests.

| Threat ID | Category | Component | Severity | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|----------|-------------|-----------------------|--------|
| T-05-01 | Information Disclosure | stream_target | medium | mitigate |  `training/stream.py:53-69` `stream_target` selects by `TrainingRun.id == run_id, TrainingRun.project_id == project_id` in a plain dependency, 404 before any byte; tests `test_run_stream.py:196` (foreign/unknown run 404), `:488` (unknown project 404)  | closed |
| T-05-02 | Tampering | parse_last_event_id / progress path | medium | mitigate |  `training/stream.py:79-88` ASCII-digits-only `re.fullmatch(r"[0-9]+")`, len <= 18, clamped to file size, else 0; path only from `layout.run_dir(data_dir, run.id)` (`stream.py:75`, `layout.py:40-41` `int()`); test `test_run_stream.py:227` (parametrized: -5, 12a, 1e3, padded, Arabic digit, > size)  | closed |
| T-05-03 | Denial of Service | open streams | low | accept |  Rationale in `05-01-PLAN.md` STRIDE register: single operator (AR-4-06), streams end at terminal status (`stream.py:152-158`), 0.5 s tick, status read every 3 ticks  | closed (accepted) |
| T-05-04 | Denial of Service | DB connections / shutdown | medium | mitigate |  `routers/runs.py:221-244` `stream_run` has no `get_session` (grep gate = 0 in route and in `stream.py`); short sessions `stream.py:59`, `:107`; `docker/Dockerfile.backend:28` `--timeout-graceful-shutdown 5` (compose does not override the command)  | closed |
| T-05-05 | Tampering (stored XSS) | chart text | low | mitigate |  grep `dangerouslySetInnerHTML/innerHTML/outerHTML/insertAdjacentHTML/__html` over `frontend/src` = 0 in production code (only `editor/lib/shortcuts.test.ts:70` test reset); charts render through Recharts/React text  | closed |
| T-05-SC (05-01) | Tampering | npm install recharts@3.10.1 (+ react-is peer) | high | mitigate |  `frontend/package.json:29` `"recharts": "3.10.1"` exact; lockfile root `package-lock.json:24` exact, `:2654-2657` resolved+integrity, `react-is` 17.0.2 at `:2436`; no `hasInstallScript` among the packages added by commit 2e126ce; legitimacy verdict OK in `05-RESEARCH.md:155-160`  | closed |
| T-05-06 | Tampering (stored XSS) | ChartTooltip component names | low | mitigate |  `progress/ChartTooltip.tsx:117-130` names rendered as `{name}` React text, values through `Intl.NumberFormat`; test `RunCharts.test.tsx:195-208` (hostile `<img onerror>` name shown as text)  | closed |
| T-05-07 | Denial of Service | polling fallback | low | accept |  Rationale in `05-02-PLAN.md` register; implementation matches: `api/training.ts:249` 3000 ms, `:252` 15000 ms safety poll, `:261-268`  | closed (accepted) |
| T-05-SC (05-02) | Tampering | npm/pip installs | high | mitigate |  `git log 84f3933..HEAD` on package.json, package-lock.json, pyproject.toml, uv.lock, backend/pyproject.toml, docker/: only 2e126ce (05-01) and 070a13f (Dockerfile CMD flag only); working tree clean for these files  | closed |
| T-05-08 | Denial of Service | progress.jsonl growth / replay size | medium | mitigate |  `worker/train_job.py:38` `BATCH_EVENT_MIN_INTERVAL = 2.0`, `:251-264` throttle (first/last batch of epoch) with no loss payload; append-only writer `:182-187`; `common/progress.py:167-181` `compact_replay` applied in `stream.py:138`; tests `test_train_job.py:247,267,280`, `test_progress.py:152`, `test_run_stream.py:337`  | closed |
| T-05-09 | Tampering (stored XSS) | running card / final results text | low | mitigate |  No HTML-injection API anywhere in `frontend/src` (grep = 0 in production code); numbers and i18n labels rendered as React children  | closed |
| T-05-SC (05-03) | Tampering | npm/pip installs | high | mitigate |  No dependency-file change after 2e126ce (05-01) - same git log evidence as T-05-SC (05-02)  | closed |
| T-05-10 | Tampering (stored XSS) | FailureAlert raw message and log | medium | mitigate |  `features/training/FailureAlert.tsx:30-33` `<Text>{run.error_message}</Text>`; `RunFailureLog.tsx:54-66` `<Code block>{log}</Code>`; grep gate `dangerouslySetInnerHTML` in FailureAlert.tsx = 0; test `RunPage.test.tsx:1101` "renders log and message as text only" (hostile `<img onerror>`) passes  | closed |
| T-05-11 | Tampering | error.json category | low | mitigate |  `common/failures.py:75-77` `normalize_category` allow-list; applied before DB write in `worker/supervisor.py:147-164` (`_read_error_file`), `worker/queue.py:238` (`mark_failed`), `api/training/service.py:251`; UI `api/training.ts:48-50` `failureCategory` -> "unknown"; test `test_worker_supervisor.py:307` (badcategory -> unknown)  | closed |
| T-05-12 | Information Disclosure | raw exception messages (paths) | low | accept |  Rationale in `05-04-PLAN.md` register: single-operator tool, same data already exposed in Phase 4 (error_message, log_tail)  | closed (accepted) |
| T-05-SC (05-04) | Tampering | npm/pip installs | high | mitigate |  No dependency-file change after 2e126ce - same git log evidence  | closed |
| T-05-13 | Spoofing (CSRF) | POST cancel | medium | mitigate |  `routers/runs.py:128-131` `dependencies=[Depends(require_xhr)]`; `security.py:8-17`; no CORS middleware (`main.py:81` only TrustedHostMiddleware), no Access-Control headers in `docker/nginx.conf.template`; test `test_runs_cancel.py:147` (403)  | closed |
| T-05-14 | Tampering / Elevation | wrong-process kill | high | mitigate |  grep `os.kill/killpg/send_signal/signal.` over `backend/src/yolo_trainer_api` = 0 (plan gate on service.py and runs.py = 0); `worker/supervisor.py:276-279` child in its own session/group, `:483-504` `_terminate` acts only on the `Popen` object (`os.getpgid(process.pid)` after `poll()` check); `worker_pid` only written (`queue.py:185`), never read for signalling; tests `test_runs_cancel.py:101`, `test_worker_queue.py:92` (killpg monkeypatched as forbidden)  | closed |
| T-05-15 | Tampering | cancel racing completion / worker stop | medium | mitigate |  `worker/queue.py:263-283` `mark_cancelled` through `_update_running` (`:173-181`, `status == "running"`); cancel branch only when `process.poll() is None` (`supervisor.py:440`); reconcile honors flag in `queue.py:110-113` and `api/training/reconcile.py:108-115`; tests `test_worker_supervisor.py:161,187,206`, `test_worker_queue.py:129,166`, `test_training_reconcile.py:126,142,154`  | closed |
| T-05-16 | Information Disclosure / Tampering | cross-project cancel | medium | mitigate |  `api/training/service.py:427-447` both UPDATEs filter `TrainingRun.id == run_id, TrainingRun.project_id == project_id`; re-select `:449-457` also scoped; test `test_runs_cancel.py:196` (foreign/unknown 404, nothing changed)  | closed |
| T-05-SC (05-05) | Tampering | npm/pip installs | high | mitigate |  No dependency-file change after 2e126ce - same git log evidence  | closed |
| T-05-17 | Spoofing (CSRF) | POST resume | medium | mitigate |  `routers/runs.py:148-151` `dependencies=[Depends(require_xhr)]`; test `test_runs_resume.py:187` (403 asserted at `:199`); smoke `compose_smoke_test.sh:612-616`  | closed |
| T-05-18 | Elevation of Privilege | `YOLO(last.pt)` unpickling | medium | accept |  Rationale in `05-06-PLAN.md` register (service-written, id-derived folder; same trust model as T4-01-01 and the documented `.pt` risk); code matches: `worker/train_job.py:337` loads only `layout.last_weights(run_directory)`  | closed (accepted) |
| T-05-19 | Tampering | resumed output location | medium | mitigate |  `worker/train_job.py:387-397` `save_dir=str(run_directory / "out" / "train")` on every resume; tests `test_train_job.py:698-699` (save_dir pinned), `:910-912` real run: every `model_save` path `is_relative_to(run_directory)`  | closed |
| T-05-20 | Tampering | resume racing claim / cancel / delete | medium | mitigate |  `api/training/service.py:550-564` one UPDATE guarded by `status.in_(RESUMABLE_STATUSES)` + `(id, project_id)`, re-select decides 404/409; `resume_state` read-only (`:471-497`); claim is one guarded UPDATE (`worker/queue.py:69-83`); every other TrainingRun write in the api/worker is status-guarded (grep of `update(`/`delete(`)  | closed |
| T-05-35 | Denial of Service / Tampering | progress.jsonl scan in the api (`read_checkpoint_state`) | low | mitigate |  `api/training/service.py:483-492` path from `layout.run_dir(data_dir, run.id)`, scan only after status/last.pt/not_resumable/resume_epoch IS NULL checks; called only via `asyncio.to_thread` from `run_read` (`:688-692`) and `resume_run` (`:527`), never in `run_summaries`; `common/progress.py:228-233` parses through `ProgressTail` (`json.loads`, undecodable lines skipped); final guard `train_job.py:53-74` `check_resumable`  | closed |
| T-05-SC (05-06) | Tampering | npm/pip installs | high | mitigate |  No dependency-file change after 2e126ce - same git log evidence  | closed |
| T-05-21 | Tampering (data loss) | queue removal of a resumed run | high | mitigate |  `api/training/service.py:331-352` DELETE guarded by `status == "queued"` AND `resume_count == 0`, 409 `RUN_RESUMED_DETAIL`; "Cancel resume" `:427-436` is a status-only UPDATE (no file removal); tests `test_runs_remove.py:110` (folder and checkpoint kept), `test_runs_delete.py:187`, `test_runs_cancel.py:245`  | closed |
| T-05-22 | Elevation / Misuse | resume onto a host without the stored device | low | mitigate |  `api/training/service.py:534-536` `ensure_device_available(settings, run.settings["device"])` before the UPDATE (same function as start, `routers/runs.py:51`); tests `test_runs_resume.py:657`, `:682`  | closed |
| T-05-23 | Denial of Service | filesystem probes | low | mitigate |  `resume_state`/`interim_best_file` only via `asyncio.to_thread` in `run_read` (`service.py:688-712`), used only by single-run routes (`routers/runs.py:62,145,163,183`) and `resume_run`; `run_summaries` (`service.py:644-678`) has no fs access; tests `test_runs_api.py:396` (`Path.is_file` never called for the list), `test_runs_interim.py:147`, `test_runs_resume.py:246`  | closed |
| T-05-SC (05-07) | Tampering | npm/pip installs | high | mitigate |  No dependency-file change after 2e126ce - same git log evidence  | closed |
| T-05-24 | Tampering | URL sort/filter params | low | mitigate |  `features/training/historyTable.ts:63-72` `parseHistoryParams` matches against `HISTORY_SORTS`/`RUN_STATUSES`/asc-desc, defaults otherwise; list request `api/training.ts:298` carries no query params; test `historyTable.test.ts:76` (`__proto__`, `<img>`)  | closed |
| T-05-25 | Tampering (stored XSS) | run/base names, settings text | low | mitigate |  No HTML-injection API in `frontend/src` (grep = 0); `TrainingPage.tsx:326,335` `title={run.name}` / `title={run.base_name}` plain strings; names rendered as React text  | closed |
| T-05-26 | Denial of Service | list read model | low | mitigate |  `api/training/service.py:644-678` `run_summaries` does three bulk SELECTs, no per-row fs access; test `test_runs_api.py:396` `test_listing_the_history_checks_no_file_per_row`  | closed |
| T-05-SC (05-08) | Tampering | npm/pip installs | high | mitigate |  No dependency-file change after 2e126ce - same git log evidence  | closed |
| T-05-27 | Tampering (irreversible data loss) | delete_run | high | mitigate |  Decision record `05-09-SUMMARY.md:140-142` (guarded-delete, user-chosen); `api/training/service.py:386-402` one DELETE guarded by `(id, project_id)`, `status.in_(TERMINAL_RUN_STATUSES)` and NOT EXISTS (dependent run with `base_model_id` in this run's model ids AND status in `ACTIVE_RUN_STATUSES`); files after commit (`:410`); `DeleteRunModal.tsx:78-83` names the run and the model (`run.delete.bodyModel`); tests `test_runs_delete.py:160,207,233`  | closed |
| T-05-28 | Tampering | run folder / model file removal paths | high | mitigate |  `api/storage.py:142-188` `_remove_direct_child` (parent == root, not symlink) used by `remove_run_dir`/`remove_model_file` via `remove_run_files`; `service.py:381-385` model ids from DB, `:410` call; grep gate `shutil.rmtree` in `service.py` = 0, all `rmtree` calls in `backend/src` are inside `storage.py`  | closed |
| T-05-29 | Spoofing (CSRF) | DELETE run | medium | mitigate |  `routers/runs.py:107-111` `dependencies=[Depends(require_xhr)]`; test `test_runs_delete.py:244` (403 asserted at `:255`)  | closed |
| T-05-30 | Integrity | interim best.pt of an active run | medium | mitigate |  `api/training/service.py:568-582` `interim_best_file` returns None unless status in failed/interrupted/cancelled and `st_size > 0`; `routers/runs.py:209-213` 404; UI note `i18n/locales/en/training.json:146` "Incomplete: ..." shown in `FailureAlert.tsx:52-54` and `RunPage.tsx:318-320`; tests `test_runs_interim.py:83` (preparing/queued/running/completed 404), `:99` (missing/empty 404)  | closed |
| T-05-31 | Information Disclosure | cross-project interim download / delete | medium | mitigate |  `routers/runs.py:199-208` interim lookup by `(id, project_id)`; `service.py:500-507` `_find_run` and DELETE guard scoped by project; tests `test_runs_interim.py:114`, `test_runs_delete.py:244`  | closed |
| T-05-32 | Tampering (header injection) | interim download filename | low | mitigate |  `routers/runs.py:216` `service.model_download_name(project.name, run.name + "_interim")`; `service.py:100-102,585-595` NFKC, every char outside Unicode word chars, dot and hyphen replaced by underscore, leading dots stripped, 120-char cap; Starlette `FileResponse` percent-encodes via `quote()` and emits the RFC 5987 `filename*=utf-8` form for non-ASCII (`.venv/Lib/site-packages/starlette/responses.py:322-328`); test `test_runs_interim.py:77`  | closed |
| T-05-SC (05-09) | Tampering | npm/pip installs | high | mitigate |  No dependency-file change after 2e126ce - same git log evidence  | closed |
| T-05-33 | Denial of Service | smoke stage leaving a training run active | low | mitigate |  `scripts/compose_smoke_test.sh:535-688`: smoke-cancel cancelled (`:565-571`), resumed, cancelled again (`:662-663`); smoke-next waited to completion (`:609`) before the persistence stage (`:690`); deadlines `:540/553`, `:512-530`, `:633/647`, `curl --max-time 30` (`:681`); `trap cleanup EXIT` (`:14-29`) tears the stack down on any failure  | closed |
| T-05-34 | Tampering | README process-kill instruction | low | accept |  Rationale in `05-10-PLAN.md` register; kill command appears only in the UAT checklist (`05-10-PLAN.md:139`, `05-10-SUMMARY.md:179`), scoped to `docker compose exec worker kill -9 <pid of train_job>`; `README.md` contains no kill command  | closed (accepted) |
| T-05-SC (05-10) | Tampering | npm/pip installs | high | mitigate |  No dependency-file change after 2e126ce - same git log evidence  | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-5-01 | T-05-03 | Open SSE streams (DoS, low): single-operator tool (precedent AR-4-06); streams end on terminal status, file read every 0.5 s, one EventSource per run page | plan 05-01 threat model | 2026-10-12 |
| AR-5-02 | T-05-07 | Fallback polling (DoS, low): 3 s only while the stream is down, else 15 s safety poll; single operator | plan 05-02 threat model | 2026-10-12 |
| AR-5-03 | T-05-12 | Raw exception messages with paths shown (Info Disclosure, low): single-operator tool; same data (error_message, log tail) already shown since Phase 4 | plan 05-04 threat model | 2026-10-12 |
| AR-5-04 | T-05-18 | Unpickling `YOLO(last.pt)` on resume (EoP, medium): `last.pt` is written by the service into the id-derived run folder only; same trust model as T4-01-01 and the documented `.pt` risk | plan 05-06 threat model | 2026-10-12 |
| AR-5-05 | T-05-34 | Process-kill command in the UAT checklist (Tampering, low): developer UAT only, scoped to the `train_job` process in the worker container; not in README | plan 05-10 threat model | 2026-10-12 |

Non-blocking observations from the audit (no status impact): `scripts/compose_smoke_test.sh` polling `curl -fsS` calls inside deadline loops have no `--max-time`; the interim `best.pt` status check and `FileResponse` are not atomic (a resume during download could overwrite the file mid-transfer — the file is already labelled incomplete).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-12 | 45 | 45 | 0 | gsd-security-auditor (secure-phase, state B) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-12

## Security Audit 2026-10-12

| Metric | Count |
|---|---|
| Threats found | 45 |
| Closed | 45 |
| Open | 0 |
