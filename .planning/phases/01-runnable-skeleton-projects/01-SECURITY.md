---
phase: "1"
slug: "runnable-skeleton-projects"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-29"
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → nginx (`web`) | Only published port, bound to 127.0.0.1 by default | Project names/descriptions (low sensitivity) |
| nginx → FastAPI (`api`) | Compose-internal network, no host port | JSON API requests |
| API/worker → `./data` bind mount | SQLite DB and worker heartbeat on host disk | Application data |
| Build → package registries | npm / PyPI / pytorch-cpu index during image build | Third-party code (supply chain) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Information Disclosure / Elevation of Privilege | docker-compose.yml `web.ports` | high | mitigate | compose: only `web` has `ports:` bound to `${BIND_ADDR:-127.0.0.1}`; smoke asserts 127.0.0.1; `.env.example` 0.0.0.0 warning | closed |
| T-01-02 | Tampering | routers/projects.py | medium | mitigate | no raw SQL in `routers/`; ORM only | closed |
| T-01-03 | Denial of Service | schemas.py, nginx.conf | low | mitigate | `schemas.py` length limits 100/2000 + `extra="forbid"`; nginx `client_max_body_size 1m` (applies to every route except the image-upload route `/api/projects/{id}/images`, which uses `MAX_UPLOAD_MB`; Phase 2 Plan 02-04) | closed |
| T-01-04 | Tampering (stored XSS) | ProjectCard / CreateProjectModal | medium | mitigate | no `dangerouslySetInnerHTML` in `frontend/src`; CSP `script-src 'self'` | closed |
| T-01-05 | Information Disclosure | index.html / nginx CSP | medium | mitigate | nginx CSP `default-src 'self'`, `connect-src 'self'`; no http(s) URLs in `frontend/src` | closed |
| T-01-06 | Tampering (integrity) | SQLite WAL on Docker Desktop bind mount | medium | mitigate | `db.py` WAL/synchronous/busy_timeout pragmas; smoke down/up | closed |
| T-01-07 | Elevation of Privilege | api container runs as root | low | accept | Accepted — see Accepted Risks Log | closed |
| T-01-SC | Tampering | npm / pip / uv installs | high | mitigate | `uv.lock` + `package-lock.json` committed; `uv sync --frozen`, `npm ci`; no `mantine` package | closed |
| T-02-01 | Spoofing / Elevation of Privilege | main.py (no auth) | medium | mitigate | `TrustedHostMiddleware` in `main.py`; `test_persistence.py` foreign Host rejected | closed |
| T-02-02 | Tampering (integrity) | SQLite WAL on Docker Desktop bind mount | high | mitigate | `wal_checkpoint(TRUNCATE)` in `db.py`; `stop_grace_period: 20s`; smoke `PRAGMA integrity_check` | closed |
| T-02-03 | Tampering / Denial of Service | settings.validate_data_dir | medium | mitigate | `settings.validate_data_dir` called at startup | closed |
| T-02-04 | Tampering (injection) | db.py journal-mode PRAGMA | low | mitigate | `sqlite_journal_mode: Literal["WAL","DELETE"]` | closed |
| T-02-05 | Denial of Service (data loss) | lifespan / migrations | high | mitigate | startup runs only `alembic upgrade head`; no create_all/drop_all | closed |
| T-03-01 | Tampering | schemas.ProjectName | medium | mitigate | `schemas.py` NFC + trim + control-char rejection | closed |
| T-03-02 | Spoofing (look-alike names) | normalize_project_name | low | mitigate | `models.py` NFKC + casefold normalized unique key | closed |
| T-03-03 | Tampering (stored XSS) | CreateProjectModal / ProjectCard rendering API detail and names | medium | mitigate | React text rendering only; CSP | closed |
| T-03-04 | Denial of Service | double-submit | low | mitigate | CreateProjectModal submit `disabled={isPending}`; DB unique → 409 | closed |
| T-03-SC | Tampering | npm devDependencies | high | mitigate | vitest/jsdom/@testing-library only; lockfile committed | closed |
| T-04-SC | Tampering | uv index config / uv.lock | high | mitigate | `pytorch-cpu` index `explicit = true`; `uv.lock` hashed; `--frozen` | closed |
| T-04-01 | Denial of Service | detect_compute_device | low | mitigate | `device.py` guards `get_device_name` behind `cuda.is_available()` | closed |
| T-04-02 | Tampering (behavior drift) | legacy scripts | low | mitigate | boundary unit tests `test_device.py`, `test_quality.py` | closed |
| T-04-03 | Elevation of Privilege | pickle-based `.pt` loading by ultralytics | low | accept | Accepted — see Accepted Risks Log | closed |
| T-05-01 | Tampering / Denial of Service (data loss) | untracking step | high | mitigate | index-only `git rm --cached`; SHA-256 before/after identical (01-05-SUMMARY) | closed |
| T-05-02 | Repudiation / Tampering | git history | high | mitigate | no history rewrite (01-05-SUMMARY) | closed |
| T-05-03 | Information Disclosure | future commits of datasets/app data | medium | mitigate | `.gitignore` covers `*.pt`, `runs/`, `data/`, `.env`; `check_cli_run_git_clean.py` → GIT CLEAN OK | closed |
| T-05-04 | Elevation of Privilege | `yolov8n.pt` pickle load in the check script | low | accept | Accepted — see Accepted Risks Log | closed |
| T-06-01 | Tampering | heartbeat file | low | mitigate | worker heartbeat fixed path + `os.replace` | closed |
| T-06-02 | Information Disclosure / Elevation of Privilege | worker service | medium | mitigate | worker has no `ports:` in compose | closed |
| T-06-03 | Denial of Service | worker shutdown | low | mitigate | SIGTERM handler in worker; `STOPSIGNAL SIGTERM`; `stop_grace_period: 20s` | closed |
| T-06-04 | Information Disclosure | Ultralytics analytics | low | accept | Accepted — see Accepted Risks Log | closed |
| T-06-SC | Tampering | torch/ultralytics wheels, apt packages | high | mitigate | `uv sync --frozen`; apt limited to `libgl1 libglib2.0-0` | closed |
| T-07-01 | Tampering | resolveInitialLanguage | low | mitigate | `SUPPORTED_LANGUAGES` allow-list in `language.ts` (tested) | closed |
| T-07-02 | Denial of Service | localStorage access | low | mitigate | try/catch around localStorage in `language.ts` | closed |
| T-07-03 | Tampering (XSS via translations) | i18n interpolation | low | accept | Accepted — see Accepted Risks Log | closed |
| T-08-01 | Tampering | GET /api/projects/{project_id} | low | mitigate | `project_id: int` path params; `session.get` by PK | closed |
| T-08-02 | Information Disclosure | 404 handling | low | accept | Accepted — see Accepted Risks Log | closed |
| T-08-03 | Tampering (XSS) | ProjectOverviewPage description rendering | medium | mitigate | description rendered as React text; CSP | closed |
| T-09-01 | Tampering (mass assignment) | ProjectUpdate | medium | mitigate | `ProjectUpdate` `extra="forbid"`, task_type refused; `model_fields_set` applied | closed |
| T-09-02 | Tampering / Denial of Service (data loss) | DeleteProjectModal | high | mitigate | DeleteProjectModal `disabled={!isMatch || isPending}` exact-name match | closed |
| T-09-03 | Spoofing (CSRF from other origins) | PATCH/DELETE | medium | mitigate | no CORSMiddleware; Host allow-list; multipart uploads additionally require the `X-Requested-With` header (Phase 2 `require_xhr`), because multipart POSTs skip the CORS preflight | closed |
| T-09-04 | Repudiation | hard delete | low | accept | Accepted — see Accepted Risks Log | closed |
| T-09-SC | Tampering | @mantine/notifications install | medium | mitigate | `@mantine/notifications` from approved audit; lockfile | closed |
| T-10-01 | Information Disclosure / Elevation of Privilege | README LAN instructions | high | mitigate | README security notice on `BIND_ADDR=0.0.0.0`; default loopback | closed |
| T-10-02 | Elevation of Privilege | `.pt` pickle files | medium | mitigate | README states `.pt` pickle can execute code | closed |
| T-10-03 | Tampering (data loss) | SQLite on Docker Desktop | medium | mitigate | README documents backup, WAL caveat, `SQLITE_JOURNAL_MODE=DELETE` | closed |
| T-10-04 | Tampering | uv install instructions | low | mitigate | README links official Astral uv install page | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-07 | T-01-07 | Local single-operator tool with no host ports on `api`; revisit when auth or uploads land | plan-time threat model (owner) | 2026-09-24 |
| AR-04-03 | T-04-03 | No new `.pt` loading surface in this plan; the CLI scripts load the owner's own weights as before; upload-time risk is handled in Phase 7 | plan-time threat model (owner) | 2026-09-24 |
| AR-05-04 | T-05-04 | Loads the repo's own Ultralytics base weights (or Ultralytics' official download) exactly as the legacy script already does | plan-time threat model (owner) | 2026-09-24 |
| AR-06-04 | T-06-04 | No train/predict calls in Phase 1; SUMMARY records the Phase 4 follow-up to disable analytics before jobs run | plan-time threat model (owner) | 2026-09-24 |
| AR-07-03 | T-07-03 | `escapeValue: false` is safe because React escapes rendered text; translations are bundled static JSON, not user-supplied | plan-time threat model (owner) | 2026-09-24 |
| AR-08-02 | T-08-02 | Single-operator app without auth; 404 reveals only non-existence of an id | plan-time threat model (owner) | 2026-09-24 |
| AR-09-04 | T-09-04 | Single-operator tool, hard delete by explicit decision D-10; no audit log in v1 | plan-time threat model (owner) | 2026-09-24 |

*Accepted risks do not resurface in future audit runs.*

Follow-up: T-06-04 requires disabling Ultralytics analytics (`settings.update({"sync": False})`) before Phase 4 runs real jobs.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-29 | 46 | 46 | 0 | /gsd-secure-phase (L1 grep verification, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-29
