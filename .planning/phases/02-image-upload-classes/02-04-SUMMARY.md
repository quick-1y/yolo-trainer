---
phase: 02-image-upload-classes
plan: 04
subsystem: infra
tags: [nginx, envsubst, docker-compose, upload-limits, smoke-test]

requires:
  - phase: 02-image-upload-classes
    provides: "02-01 upload route POST /api/projects/{id}/images, Settings.max_upload_mb, require_xhr"
provides:
  - "nginx envsubst template with per-route upload body limit (MAX_UPLOAD_MB MiB on the upload route only, 1m elsewhere)"
  - "MAX_UPLOAD_MB wired through .env -> compose (web + api) -> image default"
  - "README (en + ru) documentation of MAX_UPLOAD_MB, image storage layout and no-quota risk"
  - "Smoke-test stage proving the limits end-to-end through nginx"
affects: [phase-03-gallery, upload-ui]

actuals:
  tokens: 9000
  tasks: 2
  commits: 3
plan_head_before: b61f2c0db4695674e88f6b15279823147f207d70
commits: 3

tech-stack:
  added: []
  patterns:
    - "nginx image /etc/nginx/templates/*.template envsubst rendering with an ENV default"
    - "Regex location repeats every proxy_set_header and defines no add_header, so server-level security headers are inherited"

key-files:
  created:
    - docker/nginx.conf.template
  modified:
    - docker/Dockerfile.frontend
    - docker/Dockerfile.backend
    - docker-compose.yml
    - .env.example
    - README.md
    - README.ru.md
    - .planning/phases/01-runnable-skeleton-projects/01-SECURITY.md
    - scripts/compose_smoke_test.sh
  deleted:
    - docker/nginx.conf (renamed to nginx.conf.template)

key-decisions:
  - "Upload route gets client_max_body_size ${MAX_UPLOAD_MB}m via a regex location; the server-level 1m limit is untouched for every other route"
  - "Default MAX_UPLOAD_MB=50 baked into the web image (ENV) and in compose (${MAX_UPLOAD_MB:-50}) so nginx always starts"
  - "uv wheel downloads in the worker image are serialized (UV_CONCURRENT_DOWNLOADS=1, UV_HTTP_TIMEOUT=300) because Docker Desktop on Windows resets large parallel downloads"

requirements-completed: [DATA-01]

coverage:
  - id: D1
    description: "nginx accepts upload bodies up to MAX_UPLOAD_MB MiB only on /api/projects/{id}/images; other routes keep 1 MiB and answer 413"
    requirement: DATA-01
    verification:
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (upload limits stage: 1.44 MB added, 3.3 MB BMP 413, 1.5 MB JSON 413)"
        status: pass
    human_judgment: false
  - id: D2
    description: "api enforces the decimal per-file limit behind nginx (2.05 MB file rejected as 'larger than 2 MB' with MAX_UPLOAD_MB=2)"
    requirement: DATA-01
    verification:
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (edge BMP stage)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Upload-route responses keep nosniff and Content-Security-Policy headers"
    verification:
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (header check) + awk region grep add_header == 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "README.md and README.ru.md document MAX_UPLOAD_MB, image storage paths and the missing disk quota"
    verification: []
    human_judgment: true
    rationale: "Documentation wording and Russian translation quality need a human read"

duration: 15min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 04: Upload size limits through nginx Summary

**Per-route nginx upload body limit driven by one MAX_UPLOAD_MB value shared with the api (envsubst template), proven end-to-end by the compose smoke test**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-10-03T08:30:15Z
- **Tasks:** 2
- **Files modified:** 9 (plus one rename)

## Accomplishments
- `docker/nginx.conf` became `docker/nginx.conf.template`; a new regex location `^/api/projects/[0-9]+/images/?$` has `client_max_body_size ${MAX_UPLOAD_MB}m` and `proxy_request_buffering off`, repeating all proxy settings and defining no `add_header` (security headers inherited). The server-level `1m` limit stays for all other routes.
- `MAX_UPLOAD_MB` flows from `.env` to both `web` (nginx MiB limit) and `api` (per-file decimal MB limit); the web image has `ENV MAX_UPLOAD_MB=50` so nginx starts even without compose.
- README.md / README.ru.md: configuration row, image storage layout (`data/projects/<id>/images/`, `.../thumbs/`) and the accepted no-quota risk. 01-SECURITY.md T-01-03 / T-09-03 amended.
- Smoke test (MAX_UPLOAD_MB=2, own `smoke-limits-<ts>` project): rendered config check, 1.44 MB BMP added, 2.05 MB BMP rejected by the api as "larger than 2 MB", 3.3 MB BMP and 1.5 MB JSON body get HTTP 413, nosniff and CSP present on the upload route. Full run ends with `SMOKE OK`.

## Task Commits

1. **Task 1: nginx envsubst template, compose/env wiring, docs** - `c60e470` (feat)
2. **Task 2: smoke-test upload limits** - `c608199` (test)
3. **Deviation (Rule 3): serialize uv wheel downloads in worker image** - `7dd0c56` (fix)

## Files Created/Modified
- `docker/nginx.conf.template` - envsubst template with per-route upload limit
- `docker/Dockerfile.frontend` - copies the template into /etc/nginx/templates, ENV MAX_UPLOAD_MB=50
- `docker/Dockerfile.backend` - UV_CONCURRENT_DOWNLOADS=1 / UV_HTTP_TIMEOUT=300 in the worker stage
- `docker-compose.yml` - MAX_UPLOAD_MB for api and web
- `.env.example`, `README.md`, `README.ru.md` - configuration docs
- `.planning/phases/01-runnable-skeleton-projects/01-SECURITY.md` - T-01-03 / T-09-03 text
- `scripts/compose_smoke_test.sh` - upload limits stage

## Decisions Made
See key-decisions. The plan's README "Repository layout" line (`docker/ Dockerfiles and nginx config`) does not name the file, so it was left unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worker image build failed on large wheel downloads**
- **Found during:** Task 2 (running the smoke test, which rebuilds the stack)
- **Issue:** `uv sync ... --extra worker` failed twice with "error reading a body from connection" (polars-runtime-32, torch) on Docker Desktop for Windows; unrelated to this plan's changes, but it blocked the required smoke verification.
- **Fix:** In the worker stage of Dockerfile.backend set `UV_CONCURRENT_DOWNLOADS=1` and `UV_HTTP_TIMEOUT=300` (same class of fix as the npm `--maxsockets=1` workaround from 02-01). Build then succeeded and the full smoke test passed.
- **Files modified:** docker/Dockerfile.backend
- **Verification:** `docker compose build worker` rc=0; `bash scripts/compose_smoke_test.sh` rc=0, last line `SMOKE OK`
- **Committed in:** 7dd0c56

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Build-reliability only; no behavior change to the app.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Upload route accepts real-size photos through the proxy; ready for the remaining Phase 2 plans (frontend upload UI, gallery).
- No stubs introduced; no new threat surface beyond the plan's threat model (T2-04-01..05 mitigated/accepted as planned).

## Self-Check: PASSED

- docker/nginx.conf.template: FOUND; docker/nginx.conf: absent
- Commits c60e470, 7dd0c56, c608199: FOUND
- All Task 1 and Task 2 acceptance criteria re-run: PASS (grep counts 1/1/0/3/1/1/1/1/2, docs counts >=1; smoke test SMOKE OK)

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
