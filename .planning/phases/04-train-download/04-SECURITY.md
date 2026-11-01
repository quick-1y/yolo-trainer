---
phase: "4"
slug: "train-download"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-10"
---

# Phase 4 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register taken from the `<threat_model>` blocks of 04-01…04-11-PLAN.md (authored at plan time). Mitigations were verified against code and tests by gsd-security-auditor on 2026-10-10.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser → nginx → api (JSON POST/DELETE) | untrusted split, auto-split, run, queue-removal and project-delete requests | ids, names, settings, base model name / model id |
| api → filesystem | run folders, snapshots and model files built from database ids | paths derived from integers and allow-listed names |
| project storage → run snapshot | images and labels hard-linked into a folder later read by the worker | write-once image files, YOLO label text |
| worker → subprocess | the training command line and its environment | validated literals and ints |
| worker → internet | first-use download of official weights (github.com/ultralytics/assets) | allow-listed weight names over HTTPS |
| `.pt` files → torch.load | pickle-based checkpoints executed on load | service-produced model files only |
| worker heartbeat / train.log → api → UI | worker-written files and process output become stored and rendered text | timestamps, ANSI-stripped log tail |
| api JSON → React | run, project, class and model names, error text in pages and the global header | user-chosen display names |
| api startup → filesystem | orphan sweep deletes folders and files under `data/runs` and `data/models` | canonical id names only |
| downloaded `.pt` → verify script | the operator's own model file is unpickled locally | trusted-user input |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T4-01-01 | Elevation (pickle) | RunCreate.base, train_job weights | high | mitigate | Base is official name from the catalog or model id; no path field (extra=forbid); train_job re-checks `OFFICIAL_WEIGHTS_PATTERN` | closed |
| T4-01-02 | Tampering (command injection) | Supervisor Popen | high | mitigate | Argument list, no shell; run dir from int id; device/batch/workers validated | closed |
| T4-01-03 | Tampering (path traversal) | layout, storage, download name | high | mitigate | Paths from ints and allow-listed names; sanitized download filename | closed |
| T4-01-04 | Information Disclosure (cross-project) | capture_snapshot, split route | medium | mitigate | Every select/update filtered by project_id | closed |
| T4-01-05 | Spoofing (CSRF) | POST split, POST runs | high | mitigate | `require_xhr` + JSON preflight; pytest 403 tests (smoke covers `/images/split`) | closed |
| T4-01-06 | Denial of Service | RunCreate | medium | mitigate | Bounded epochs/imgsz/batch/ids; materialization in a background task | closed |
| T4-01-07 | Tampering (supply chain) | official weights download | medium | mitigate | Allow-listed name only, `YOLO_AUTOINSTALL=false`, sha256 recorded in result.json | closed |
| T4-01-08 | Information Disclosure (telemetry) | train_job | medium | mitigate | `sync: False` before any model; isolated `YOLO_CONFIG_DIR` | closed |
| T4-01-09 | Tampering (integrity) | register_model | medium | mitigate | One transaction; file removed on rollback; update guarded by status running | closed |
| T4-01-10 | Information Disclosure | server paths inside best.pt | low | accept | Documented in README (en/ru) | closed |
| T4-01-SC | Tampering (supply chain) | package installs | low | accept | No new packages in phase 4 | closed |
| T4-02-01 | Tampering (stored XSS) | Training pages | medium | mitigate | React text rendering only; no HTML injection APIs in `frontend/src` | closed |
| T4-02-02 | Elevation (arbitrary weights) | base select | high | mitigate | Client sends official name only; server allow-list | closed |
| T4-02-03 | Denial of Service | form values | medium | mitigate | Client bounds mirror server bounds; server authoritative | closed |
| T4-02-04 | Spoofing | heartbeat file | low | accept | Written only by the worker on the operator's volume | closed |
| T4-02-05 | Spoofing (CSRF) | POST runs | high | mitigate | `apiRequest` sends X-Requested-With; route keeps `require_xhr` | closed |
| T4-02-06 | Information Disclosure | download link | low | accept | Single-operator, no-auth model (README) | closed |
| T4-03-01 | Tampering (cross-project write) | split route | high | mitigate | Update scoped by project_id; cross-project test | closed |
| T4-03-02 | Tampering (annotation change) | editor split menu | medium | mitigate | Separate split route touching only `split`; no PUT, reviewed flag unchanged (tests) | closed |
| T4-03-03 | Denial of Service | bulk split | low | mitigate | Client chunks of 1000; server max_length 1000 | closed |
| T4-03-04 | Spoofing (CSRF) | split route | high | mitigate | `require_xhr`; 403 test | closed |
| T4-04-01 | Tampering (silent drift) | snapshot files | high | mitigate | Hard links to write-once images; immutability tests | closed |
| T4-04-02 | Tampering (inconsistent capture) | capture_snapshot | medium | mitigate | INSERT-first transaction holds the write lock; concurrency test | closed |
| T4-04-03 | Information Disclosure (cross-project) | capture_snapshot | medium | mitigate | project_id filters; two-project test | closed |
| T4-04-04 | Denial of Service | migration 0005 | medium | mitigate | `ADD COLUMN` only on upgrade; populated-database test | closed |
| T4-05-01 | Denial of Service (orphan process) | supervisor stop | medium | mitigate | Process group SIGTERM, 10 s, then SIGKILL; test | closed |
| T4-05-02 | Tampering (wrong kill) | reconcile_on_start | high | mitigate | Recorded PIDs are never signalled; runtime test patches `os.kill`/`os.killpg` | closed |
| T4-05-03 | Repudiation (lost run state) | api/worker sweeps | medium | mitigate | preparing → failed, running → interrupted only on stale heartbeat | closed |
| T4-05-04 | Tampering (stored XSS via log) | log_tail | medium | mitigate | ANSI stripped; rendered as text (`RunFailureLog`) | closed |
| T4-05-05 | Information Disclosure (telemetry) | train_job | medium | mitigate | `configure_ultralytics` sets sync false first; settings-file test | closed |
| T4-05-06 | Tampering (integrity) | register_model failure | medium | mitigate | Rollback + file removal; test | closed |
| T4-06-01 | Tampering (unconfirmed change) | auto-split apply | medium | mitigate | Seed + expected count must reproduce preview, else 409; `split IS NULL` guard | closed |
| T4-06-02 | Tampering (cross-project write) | auto-split apply | high | mitigate | project_id scoping; test | closed |
| T4-06-03 | Denial of Service | IN-list size | low | mitigate | 500-id chunks; test | closed |
| T4-06-04 | Spoofing (CSRF) | preview/apply | high | mitigate | `require_xhr`; 403 tests on both routes | closed |
| T4-07-01 | Tampering (race with claim) | remove_queued_run | medium | mitigate | Guarded DELETE on `status='queued'`; race tests both ways | closed |
| T4-07-02 | Tampering (stored XSS) | RunFailureLog, error message | medium | mitigate | Text-only rendering | closed |
| T4-07-03 | Tampering (header injection / traversal) | download filename | medium | mitigate | Sanitized name, RFC 5987 `filename*`, path from int id; tests | closed |
| T4-07-04 | Spoofing (CSRF) | DELETE run | medium | mitigate | `require_xhr`; 403 test | closed |
| T4-07-05 | Information Disclosure | download | low | accept | Single-operator, no-auth model (README) | closed |
| T4-08-01 | Elevation (pickle via chosen model) | ModelBase | high | mitigate | Only `models` table rows at id-derived paths; strict int; extra keys 422 | closed |
| T4-08-02 | Tampering (task mismatch) | ModelBase | medium | mitigate | task_type equality → 422; mismatched models not listed | closed |
| T4-08-03 | Information Disclosure (cross-project) | eligible_models | low | accept | Intended cross-project reuse (D-08); limited fields exposed | closed |
| T4-08-04 | Tampering (stored XSS) | class names, model labels | medium | mitigate | React text rendering only | closed |
| T4-09-01 | Tampering (integrity) | project delete during training | high | mitigate | One DELETE with NOT EXISTS active run; 409 tests incl. late-queued run | closed |
| T4-09-02 | Tampering (mass deletion) | orphan sweep | high | mitigate | Canonical id names, links/junctions skipped, empty-table safety valve, `data/weights` never scanned | closed |
| T4-09-03 | Denial of Service (dangling base) | other projects' runs | low | mitigate | FK `SET NULL`, base_name kept; test | closed |
| T4-09-04 | Spoofing (CSRF) | DELETE project | medium | mitigate | No CORS grant anywhere, so DELETE fails preflight | closed |
| T4-10-01 | Tampering (stored XSS) | active-run indicator | medium | mitigate | Names rendered as text/attributes | closed |
| T4-10-02 | Denial of Service | polling | low | accept | One shared 3 s GET per tab; indexed lookup | closed |
| T4-10-03 | Tampering (lost edits) | editor indicator click | medium | mitigate | Plain clicks go through `goTo` (save flush + leave dialog); failing-flush test | closed |
| T4-10-04 | Information Disclosure | /api/training/active | low | accept | Single-operator; names and epoch only | closed |
| T4-11-01 | Elevation (pickle) | verify_model_download.py | medium | accept | Operator's own files; README `.pt` trust warning | closed |
| T4-11-02 | Information Disclosure (telemetry) | verify script | low | mitigate | `sync: False` before `YOLO()` | closed |
| T4-11-03 | Information Disclosure | server paths in `.pt` | low | accept | Documented in README | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Totals: 55 threats (45 mitigate, 10 accept), all closed. Per-threat code and test evidence is in the auditor's verdict for this run (file:line and test names).

### Unregistered Flags (informational, non-blocking)

| Flag | Source | Severity | Status | Notes |
|------|--------|----------|--------|-------|
| startup-sweep-vs-model-registration | 04-09-SUMMARY; `api/main.py` + `api/storage.py` vs `worker/queue.py` register_model | low | open — below high threshold (non-blocking) | The api start-up sweep reads model ids once. The worker links `<id>.pt` before committing. An api start in that window can delete a just-registered model file: the row stays, download returns 404, `runs/<id>/.../best.pt` survives. Fix later: re-query candidate ids before unlink and/or skip files younger than N seconds. Not yet accepted: the owner decides between fixing and accepting. |
| heartbeat naive timestamp | auditor note on T4-02-04 | low | informational | `common/heartbeat.py` catches only KeyError/ValueError, so a timestamp without an offset would raise TypeError (500 on options). The worker always writes `Z`, so this is not reachable today. |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-4-01 | T4-01-10, T4-11-03 | Server paths embedded in `.pt`; single-operator install; documented in README | plan threat model (04-01, 04-11) | 2026-10-10 |
| AR-4-02 | T4-01-SC | No new packages installed in phase 4 | plan threat model (04-01) | 2026-10-10 |
| AR-4-03 | T4-02-04 | Heartbeat file written only by the worker on the operator's own volume | plan threat model (04-02) | 2026-10-10 |
| AR-4-04 | T4-02-06, T4-07-05, T4-10-04 | Single-operator, no-auth model (README "no authentication in v1") | plan threat model (04-02, 04-07, 04-10) | 2026-10-10 |
| AR-4-05 | T4-08-03 | Cross-project model reuse is intended (D-08); only names, task, mAP50 and class names exposed | plan threat model (04-08) | 2026-10-10 |
| AR-4-06 | T4-10-02 | One shared 3 s poll per tab with an indexed lookup | plan threat model (04-10) | 2026-10-10 |
| AR-4-07 | T4-11-01 | Verify script unpickles the operator's own service-produced files; README trust warning | plan threat model (04-11) | 2026-10-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-10 | 55 | 55 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-10
