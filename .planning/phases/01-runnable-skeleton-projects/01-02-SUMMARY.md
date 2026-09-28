---
phase: 01-runnable-skeleton-projects
plan: 02
subsystem: infra
tags: [fastapi, sqlalchemy, sqlite, wal, starlette, pydantic-settings, docker-compose, pytest]

# Dependency graph
requires:
  - phase: 01-runnable-skeleton-projects (plan 01)
    provides: "Settings/create_engine_for/create_app skeleton, projects API, docker-compose.yml, compose_smoke_test.sh"
provides:
  - "Settings.sqlite_journal_mode (Literal WAL/DELETE, env SQLITE_JOURNAL_MODE) and Settings.allowed_hosts (comma-parsed, env ALLOWED_HOSTS)"
  - "validate_data_dir(settings) -> Path: fail-fast DATA_DIR validation naming the offending path"
  - "db.apply_sqlite_pragmas(dbapi_connection, journal_mode) and db.checkpoint_wal(engine, journal_mode) (PRAGMA wal_checkpoint(TRUNCATE) on shutdown)"
  - "TrustedHostMiddleware registered in create_app, rejecting non-allow-listed Host headers with 400"
  - "backend/tests/test_persistence.py: 7 tests pinning journal-mode, WAL checkpoint, DATA_DIR validation, migration-restart no-op, and Host allow-list behavior"
  - "compose_smoke_test.sh burst-write + image-rebuild + PRAGMA integrity_check + alembic_version-row-count stage"
affects: [03, 04, 06, 07, 08, 09, 10]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 5920
  tasks: 2
  commits: 2
plan_head_before: ad41bfeb78473f9df5b3517938aa32ae1f72aadd

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQLite pragma application extracted into a standalone, directly-testable function (apply_sqlite_pragmas) instead of only living inside a SQLAlchemy connect-event closure"
    - "Fail-fast startup validation (validate_data_dir) that names the offending path in the exception, run before migrations in the FastAPI lifespan"
    - "pydantic-settings NoDecode + field_validator(mode=\"before\") pattern for accepting a comma-separated env var as a list[str] without pydantic's default JSON-decode attempt"
    - "Compose smoke test as the load-bearing acceptance check for a risk that fails silently (SQLite WAL cross-VM bind-mount corruption) rather than with an exception"

key-files:
  created:
    - backend/tests/test_persistence.py
  modified:
    - backend/src/yolo_trainer_api/settings.py
    - backend/src/yolo_trainer_api/db.py
    - backend/src/yolo_trainer_api/main.py
    - backend/tests/conftest.py
    - backend/tests/test_migrations.py
    - docker-compose.yml
    - .env.example
    - scripts/compose_smoke_test.sh

key-decisions:
  - "RED confirmed via `git stash` on the four implementation files before writing them: re-running the new test module against Plan 01's pre-hardening code failed with ImportError on apply_sqlite_pragmas (intentional RED - the target behavior didn't exist yet), then the stash was popped to restore GREEN."
  - "Plan 01's test_migrations.py used raw `Settings(data_dir=...)` calls (bypassing the `settings` fixture), which broke once TrustedHostMiddleware went live because FastAPI's TestClient sends `Host: testserver` by default and the new default allow-list is `localhost,127.0.0.1`. Fixed by adding `allowed_hosts=[\"testserver\", \"localhost\", \"127.0.0.1\"]` to both call sites (Rule 3 - blocking; explicitly required by this plan's acceptance criteria: 'Plan 01 tests still pass with the host allow-list active')."
  - "TrustedHostMiddleware strips the port before matching (Starlette's own `parse_host_header`), so a single `127.0.0.1` allow-list entry covers `Host: 127.0.0.1:8080` from the browser and `Host: 127.0.0.1` from container-internal healthchecks/curl."

requirements-completed: []  # DEPL-01/DEPL-03 are shared with sibling plans 01-06 and 01-10 (not yet executed) - shared-ID gate (#2388) correctly blocks marking them complete until the last declaring plan finishes (confirmed via `requirements.ready-ids`: 0/2 ready this run).

coverage:
  - id: D1
    description: "The api opens app.db with journal_mode=wal, synchronous=NORMAL, busy_timeout=30000 by default; SQLITE_JOURNAL_MODE=DELETE switches to journal_mode=delete with no app.db-wal file"
    requirement: "DEPL-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_persistence.py#test_default_journal_mode_is_wal"
        status: pass
      - kind: integration
        ref: "backend/tests/test_persistence.py#test_delete_journal_mode_escape_hatch"
        status: pass
    human_judgment: false
  - id: D2
    description: "On graceful api shutdown the WAL is checkpointed with TRUNCATE, so app.db-wal is absent or 0 bytes after the app stops, and the data is still readable"
    requirement: "DEPL-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_persistence.py#test_wal_checkpointed_on_shutdown"
        status: pass
    human_judgment: false
  - id: D3
    description: "A DATA_DIR pointing at an existing regular file (or otherwise unwritable) fails api startup fast with an error naming the offending path"
    requirement: "DEPL-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_persistence.py#test_data_dir_that_is_a_file_fails_fast"
        status: pass
    human_judgment: false
  - id: D4
    description: "Restarting the app on an existing DATA_DIR re-runs alembic upgrade head as a no-op: alembic_version keeps exactly one row and project count is unchanged"
    requirement: "DEPL-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_persistence.py#test_restart_is_migration_noop"
        status: pass
    human_judgment: false
  - id: D5
    description: "A request whose Host header is not in ALLOWED_HOSTS gets HTTP 400; an allow-listed Host (with port) gets 200; ALLOWED_HOSTS parses a comma-separated env string"
    requirement: "DEPL-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_persistence.py#test_disallowed_host_rejected"
        status: pass
      - kind: unit
        ref: "backend/tests/test_persistence.py#test_allowed_hosts_parses_comma_list"
        status: pass
    human_judgment: false
  - id: D6
    description: "After 10 rapid project creates, an image rebuild (`docker compose up -d --build --force-recreate`) keeps all projects listed and PRAGMA integrity_check on /data/app.db returns ok, with alembic_version holding exactly one row"
    requirement: "DEPL-03"
    verification:
      - kind: other
        ref: "scripts/compose_smoke_test.sh (SMOKE OK, run against the real Docker Desktop stack on this Windows dev machine)"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 2: Persistence Hardening & Host Allow-List Summary

**SQLite WAL pragma tuning with a checkpoint-on-shutdown and a DELETE-mode escape hatch, fail-fast DATA_DIR validation, and a Host-header allow-list via TrustedHostMiddleware, all pinned by 7 new pytest tests and a compose smoke-test stage that rebuilds the image under burst writes and checks `PRAGMA integrity_check`.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments

- `Settings.sqlite_journal_mode` (env `SQLITE_JOURNAL_MODE`, `Literal["WAL", "DELETE"]`, case-insensitive input) and `Settings.allowed_hosts` (env `ALLOWED_HOSTS`, comma-parsed via a `NoDecode` + `field_validator(mode="before")` pair, `*` supported)
- `validate_data_dir(settings)`: resolves DATA_DIR to an absolute path, creates it, and proves writability with a probe file; raises `RuntimeError` naming the exact path on any failure — called in the FastAPI lifespan before migrations run
- `db.apply_sqlite_pragmas()` extracted from the connect-event closure so it's directly testable against a plain stdlib `sqlite3` connection; `db.checkpoint_wal(engine, journal_mode)` runs `PRAGMA wal_checkpoint(TRUNCATE)` on shutdown (WAL mode only)
- `TrustedHostMiddleware` registered in `create_app` with the settings-derived allow-list, defaulting to `localhost,127.0.0.1`
- `backend/tests/test_persistence.py`: 7 tests covering default WAL pragmas, the DELETE escape hatch, WAL-checkpoint-on-shutdown, DATA_DIR-is-a-file fail-fast, restart-is-migration-noop, disallowed-Host-rejected/allowed-Host-accepted, and ALLOWED_HOSTS comma-list parsing
- `docker-compose.yml` forwards `SQLITE_JOURNAL_MODE` and `ALLOWED_HOSTS` from `.env` and adds `stop_grace_period: 20s`; `.env.example` documents both with guidance on when to use the DELETE escape hatch
- `scripts/compose_smoke_test.sh` extended with a burst-write (10 rapid creates) + `docker compose up -d --build --force-recreate --wait` + `PRAGMA integrity_check` + `alembic_version` row-count stage — run against the real Docker Desktop stack on this Windows machine and confirmed `SMOKE OK`

## Task Commits

1. **Task 1: Journal-mode setting, WAL checkpoint on shutdown, DATA_DIR validation and Host allow-list in the api** - `b0d1fae` (feat)
2. **Task 2: Compose passes the new settings; smoke test adds burst writes, image rebuild and integrity check** - `b855fca` (feat)

**Plan metadata:** commit to follow this SUMMARY (docs(01-02): complete plan)

_Note: Task 1 was `tdd="true"`. RED was verified for real via `git stash` (see Deviations/Decisions), not just asserted — the new test module failed with `ImportError: cannot import name 'apply_sqlite_pragmas'` against Plan 01's pre-hardening code, which is the correct intentional-RED failure mode for net-new behavior. GREEN followed after restoring the implementation, so this task's single `feat(01-02)` commit contains both the tests and the implementation, matching this project's non-strict `tdd="true"` convention (`workflow.tdd_mode` is not enabled in `.planning/config.json`) established in Plan 01's SUMMARY._

## Files Created/Modified

- `backend/src/yolo_trainer_api/settings.py` - `sqlite_journal_mode`, `allowed_hosts`, `validate_data_dir()`
- `backend/src/yolo_trainer_api/db.py` - `apply_sqlite_pragmas()`, `checkpoint_wal()`
- `backend/src/yolo_trainer_api/main.py` - lifespan calls `validate_data_dir`/`checkpoint_wal`; `TrustedHostMiddleware` registered
- `backend/tests/conftest.py` - `settings` fixture now sets `allowed_hosts=["testserver", "localhost", "127.0.0.1"]`
- `backend/tests/test_migrations.py` - two `Settings(...)` call sites updated with `allowed_hosts` so Plan 01 tests keep passing under the new middleware
- `backend/tests/test_persistence.py` - new, 7 tests (see Accomplishments)
- `docker-compose.yml` - `api.environment.SQLITE_JOURNAL_MODE`/`ALLOWED_HOSTS`, `api.stop_grace_period: 20s`
- `.env.example` - documents `SQLITE_JOURNAL_MODE` and `ALLOWED_HOSTS`
- `scripts/compose_smoke_test.sh` - burst-write + rebuild + integrity-check + alembic-version stage

## Decisions Made

See frontmatter `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01's `test_migrations.py` broke under the new Host allow-list**
- **Found during:** Task 1 (running the full backend suite after adding `TrustedHostMiddleware`)
- **Issue:** `test_startup_creates_data_dir_and_migrates` and `test_data_persists_across_app_restart` construct `Settings(data_dir=...)` directly instead of using the `settings` fixture, so they didn't inherit the fixture's `allowed_hosts` override. FastAPI's `TestClient` sends `Host: testserver` by default, which isn't in the new default allow-list (`localhost,127.0.0.1`), so requests got rejected with 400.
- **Fix:** Added `allowed_hosts=["testserver", "localhost", "127.0.0.1"]` to both `Settings(...)` calls.
- **Files modified:** `backend/tests/test_migrations.py`
- **Verification:** `uv run pytest backend/tests -x -q` -> 14 passed (7 Plan 01 + 7 new)
- **Committed in:** `b0d1fae` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy this plan's own acceptance criterion ("Plan 01 tests still pass with the host allow-list active"). No scope creep — fix was scoped to the two call sites the new middleware directly affected.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DEPL-03 (persistence) and DEPL-01 (single-host, no-auth-but-locked-down startup) both have real, running evidence now: 14/14 backend tests pass and the compose smoke test (real Docker Desktop, Windows) prints `SMOKE OK` after burst writes, an image rebuild, and a `PRAGMA integrity_check`.
- `requirements-completed` is intentionally empty in this SUMMARY's frontmatter: DEPL-01 and DEPL-03 are also declared by sibling plans 01-06 and 01-10, which haven't executed yet. The shared-ID gate (#2388) correctly reported `0/2 ready` via `requirements.ready-ids` — these will flip to `Complete` in REQUIREMENTS.md automatically once 01-10 (the last declaring plan) finishes.
- RESEARCH Assumption A1 (the Docker-Desktop WAL cross-VM root cause) remains a monitored risk, not a proven absence, exactly as the plan's "Flagged assumptions" section anticipated — the compose smoke test is the load-bearing mitigation, and it passed.
- No new blockers. Pre-existing STATE.md blockers (DEPL-01 on Linux/macOS, tracked-binary history rewrite, GPU-path acceptance) remain open and are unaffected by this plan.

## Self-Check: PASSED

All key files confirmed present on disk (`backend/tests/test_persistence.py`, `backend/src/yolo_trainer_api/{settings,db,main}.py`, `docker-compose.yml`, `scripts/compose_smoke_test.sh`). Both task commits (`b0d1fae`, `b855fca`) confirmed in `git log --oneline --all`. `uv run pytest backend/tests -x -q` re-run clean: 14 passed. `uv run ruff check backend` and `uv run ruff format --check backend` both clean. `bash scripts/compose_smoke_test.sh` re-run against the real Docker Desktop stack: `SMOKE OK`. All plan-level acceptance-criteria greps (`TrustedHostMiddleware`, `wal_checkpoint(TRUNCATE)`, absence of `drop_all|create_all`, `force-recreate`, `integrity_check`, `SQLITE_JOURNAL_MODE`/`ALLOWED_HOSTS` in both `docker-compose.yml` and `.env.example`) verified passing.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
