---
phase: quick-261004-rnk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/ci.yml
  - frontend/package.json
  - frontend/package-lock.json
  - README.md
  - README.ru.md
autonomous: true
requirements: [QUICK-261004-rnk]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A push to dev or main, or a pull request targeting dev or main, starts one GitHub Actions workflow (CI) with two jobs, backend and frontend, both on ubuntu-latest"
    - "The backend job installs uv 0.12.19 with the uv cache enabled, runs uv sync --locked, then uv run pytest backend/tests, uv run ruff check backend and uv run ruff format --check backend"
    - "The frontend job gets its Node version from frontend/package.json (engines.node = ^24.15.0) with the npm cache enabled, then runs npm ci, npm run test -- --run and npm run build inside frontend/"
    - "Both jobs' exact command sequences pass on Linux against the committed tree (replayed in containers from git archive HEAD), so the first GitHub run is expected to be green"
    - "README.md and README.ru.md both show the same CI status badge, linking to the workflow, with their section structure unchanged"
    - "The workflow token is read-only and every action is pinned to a full 40-character commit SHA"
  artifacts:
    - path: ".github/workflows/ci.yml"
      provides: "CI workflow: backend (uv, pytest, ruff) and frontend (npm ci, vitest, build) jobs"
      contains: "uv run pytest backend/tests"
    - path: "frontend/package.json"
      provides: "Single source of the CI Node version (engines.node)"
      contains: "\"engines\""
    - path: "README.md"
      provides: "CI status badge (English README)"
      contains: "actions/workflows/ci.yml/badge.svg"
    - path: "README.ru.md"
      provides: "CI status badge (Russian README)"
      contains: "actions/workflows/ci.yml/badge.svg"
  key_links:
    - from: ".github/workflows/ci.yml"
      to: "frontend/package.json"
      via: "actions/setup-node node-version-file reads engines.node"
      pattern: "node-version-file: frontend/package.json"
    - from: ".github/workflows/ci.yml"
      to: "uv.lock"
      via: "uv sync --locked fails CI when the lockfile is stale"
      pattern: "uv sync --locked"
    - from: "README.md"
      to: ".github/workflows/ci.yml"
      via: "status badge image + link URL"
      pattern: "github.com/quick-1y/yolo-trainer/actions/workflows/ci.yml/badge.svg"
---

<objective>
Add GitHub Actions CI for the repo: `.github/workflows/ci.yml`, triggered on push and pull_request to `dev` and `main`, with a `backend` job (uv + pytest + ruff lint + ruff format check) and a `frontend` job (Node version from `frontend/package.json`, npm ci + vitest + build), with uv and npm caching. Add a CI status badge to `README.md` and `README.ru.md`.

Purpose: every push and PR to `dev`/`main` is checked automatically with the same commands the repo already uses locally (`scripts/run_full_suite.sh` runs the same backend and frontend commands), so regressions show up before merge.

Output: `.github/workflows/ci.yml`, an `engines.node` field in `frontend/package.json` (mirrored into the lockfile root entry), and badge lines in both READMEs. A Linux replay of both jobs against the committed tree is the final gate.

Facts observed live at planning time (2026-10-04, this branch `dev` at 52a9369). They give scope authority and must be re-checked, not assumed:
- Layout: uv workspace at the repo root (`pyproject.toml` with `[tool.uv.workspace] members = ["backend"]`, root `uv.lock`, `.python-version` = `3.12`). Root deps = `yolo-trainer-backend[worker]`, so `uv sync` installs torch 2.14.0 CPU + ultralytics 8.4.159. The `pytorch-cpu` index lives in `backend/pyproject.toml`. `uv.lock` has the `torch-2.14.0+cpu-cp312-cp312-manylinux_2_28_x86_64` wheel, so ubuntu-latest resolves from the lock.
- Dev group (root `pyproject.toml`) = pytest, httpx, ruff. `uv sync` includes it by default. The ruff config (line-length 100, py312, select E/F/I/UP/B) lives in `backend/pyproject.toml`. Pytest `testpaths`/`addopts` are there too, and the rootdir resolves to `backend/` when invoked as `uv run pytest backend/tests` from the root.
- uv 0.12.19 locally, and `docker/Dockerfile.backend` pins `ARG UV_VERSION=0.12.19` ("same uv version that produced uv.lock"). ruff 0.16.9 comes from the lock. `uv sync --locked --dry-run` reports "Would make no changes".
- Host (Windows) results right now: `uv run pytest backend/tests` gives 389 passed. `uv run ruff check backend` gives "All checks passed!". `uv run ruff format --check backend` gives "52 files already formatted". `npm run test -- --run` (frontend) gives 51 files / 564 tests passed. `npm run build` succeeds (chunk-size warnings only). So there are NO pre-existing lint/format/test failures on the host. Linux has never run these suites, which is why Task 3 exists.
- `frontend/package.json` has NO `engines`, `volta`, `devEngines` or `.nvmrc`. `frontend/package-lock.json` is lockfileVersion 3. Node in use: Docker `node:24-alpine` (24.21.0), host 24.19.0, README says "Node.js 24 LTS". Dependency engine floors: jsdom 30.1.1 needs `^22.22.2 || ^24.15.0 || >=26`, vitest 5.0.2 needs `^22.12.0 || ^24.0.0 || >=26`, vite 8.3.1 needs `^20.19.0 || >=22.12.0`.
- Remote: `origin https://github.com/quick-1y/yolo-trainer.git`. `origin/HEAD` points to `main` (default branch). There is no `.github/` directory yet. `.gitattributes` has `* text=auto`, and `core.autocrlf=true` locally.
- Action releases (from `git ls-remote --tags`; all lightweight tags, so the listed hash is the commit): actions/checkout 7.0.1 = `3d3c42e5aac5ba805825da76410c181273ba90b1`. actions/setup-node 7.0.0 = `820762786026740c76f36085b0efc47a31fe5020`. astral-sh/setup-uv 10.2.0 = `c18668ad3cf93ea998bef934396af7bb5c839dc7`. setup-uv publishes NO floating major tag, so it must be pinned exactly. setup-uv 10 inputs: `version`, `enable-cache` (default auto; true is explicit), `cache-dependency-glob` (default already covers `**/uv.lock` and `**/pyproject.toml`). setup-node 7 `node-version-file: <package.json>` reads `volta.node`, then `devEngines.runtime`, then `engines.node`.
- `gh` is not authenticated on this machine. The executor cannot see GitHub-side runs, and per constraints it must NOT push.
</objective>

<execution_context>
@C:/Users/admin/PycharmProjects/yolo-trainer/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/admin/PycharmProjects/yolo-trainer/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md
@pyproject.toml
@backend/pyproject.toml
@frontend/package.json
@docker/Dockerfile.backend
@docker/Dockerfile.frontend
@scripts/run_full_suite.sh
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer: CI workflow with both jobs wired end-to-end, plus the Node version source in frontend/package.json</name>
  <files>.github/workflows/ci.yml, frontend/package.json, frontend/package-lock.json</files>
  <read_first>pyproject.toml, backend/pyproject.toml, frontend/package.json, docker/Dockerfile.backend (UV_VERSION pin), docker/Dockerfile.frontend (Node 24 base), scripts/run_full_suite.sh (the same commands, already proven locally)</read_first>
  <action>
Step A: Node version source (the user's "Node from frontend/package.json"). In `frontend/package.json`, add a top-level `engines` object with `node` set to `^24.15.0`. Put it directly after the `type` key and keep 2-space JSON formatting. Why this range:
- Node 24 matches `docker/Dockerfile.frontend` (`node:24-alpine`) and the README's "Node.js 24 LTS".
- The 24.15.0 floor is the strictest one any dependency needs on the 24 line (jsdom 30.1.1).
- A caret range keeps setup-node on the newest 24.x and stops it from jumping to 26+ the way an open `>=` range would.

Then run `npm install --package-lock-only --ignore-scripts` inside `frontend/` so the lockfile root entry (`packages[""]`) mirrors `engines`. Check `git diff --ignore-cr-at-eol frontend/package-lock.json`. At planning time, a scratch copy showed exactly one 3-line addition (the root `engines` block) and nothing else. If the diff touches anything beyond that root block, restore the lockfile with `git checkout -- frontend/package-lock.json` and keep only the package.json change. Planning-time `npm ci --dry-run` showed npm ci accepts the lock without the root engines block. Do not change any dependency versions.

Step B: create `.github/workflows/ci.yml` (new directory). Use English comments, like the `docker/` files. Contents:
- `name: CI`.
- `on`: `push` and `pull_request`, each with `branches: [dev, main]`. Use only the plain `pull_request` event (fork PRs get a read-only token and no secrets). Do not use the privileged PR-target event variant.
- Top-level `permissions` with only `contents: read` (least-privilege GITHUB_TOKEN).
- `concurrency`: group `ci-${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Superseded PR runs get cancelled. A run for a push to dev or main is never cancelled.
- Job `backend`: `name: backend`, `runs-on: ubuntu-latest`, `timeout-minutes: 30` (the first run downloads torch). Steps in this order:
  (1) actions/checkout pinned to commit `3d3c42e5aac5ba805825da76410c181273ba90b1`, with a trailing comment naming release 7.0.1 and `with: persist-credentials: false`.
  (2) `name: Install uv`, astral-sh/setup-uv pinned to commit `c18668ad3cf93ea998bef934396af7bb5c839dc7` (trailing comment: release 10.2.0), `with: version: "0.12.19"` (the same uv as `docker/Dockerfile.backend`, which produced `uv.lock`) and `enable-cache: true` (this is the requested uv caching). Leave `cache-dependency-glob` and `prune-cache` at their defaults: the default glob already keys on `uv.lock` and `pyproject.toml`.
  (3) `name: Install dependencies`, `id: sync`, `run: uv sync --locked`. This is the user's `uv sync`, plus `--locked` so a stale `uv.lock` fails CI instead of being silently re-resolved. The README install step uses the same flag. Python 3.12 comes from `.python-version`, which uv reads, so do not add a separate setup-python step.
  (4) `name: Run backend tests`, `run: uv run pytest backend/tests`.
  (5) `name: Ruff lint`, `run: uv run ruff check backend`, `if: ${{ !cancelled() && steps.sync.conclusion == 'success' }}`. A failing test step must not hide lint results.
  (6) `name: Ruff format check`, `run: uv run ruff format --check backend`, with the same `if`.
- Job `frontend`: `name: frontend`, `runs-on: ubuntu-latest`, `timeout-minutes: 20`, `defaults: run: working-directory: frontend`. Steps:
  (1) The same pinned checkout with `persist-credentials: false`.
  (2) actions/setup-node pinned to commit `820762786026740c76f36085b0efc47a31fe5020` (trailing comment: release 7.0.0), `with: node-version-file: frontend/package.json` (reads `engines.node` from Step A), `cache: npm` (the requested npm caching), `cache-dependency-path: frontend/package-lock.json`. The `with:` paths are relative to the repo root because `defaults.run` does not apply to `uses:` steps.
  (3) `name: Install dependencies`, `id: install`, `run: npm ci`. Do NOT copy the `--maxsockets=1` flag from the Dockerfile: it only works around Docker Desktop on Windows.
  (4) `name: Run frontend tests`, `run: npm run test -- --run`.
  (5) `name: Build`, `run: npm run build`, `if: ${{ !cancelled() && steps.install.conclusion == 'success' }}`.
- No `run:` script may interpolate any event-payload expression (script-injection guard). The only `${{ }}` expressions allowed are the concurrency ones and the step `if:` conditions above.

Before writing, re-resolve each pin with `git ls-remote --tags https://github.com/actions/checkout`, `.../actions/setup-node` and `.../astral-sh/setup-uv`. If a tag also has a peeled `^{}` line, use the peeled hash. If a release tag now resolves to a different commit than listed above, STOP and report it: a moved release tag is a supply-chain red flag. Never pin with a floating tag reference.
  </action>
  <verify>
    <automated>cd C:/Users/admin/PycharmProjects/yolo-trainer && MSYS_NO_PATHCONV=1 docker run --rm -v "C:/Users/admin/PycharmProjects/yolo-trainer:/repo:ro" -w /repo rhysd/actionlint:1.7.12 -color .github/workflows/ci.yml && uv run python -c 'import yaml,re,json;d=yaml.safe_load(open(".github/workflows/ci.yml",encoding="utf-8"));on=d.get("on",d.get(True));assert set(on)=={"push","pull_request"},on;assert all(set(on[e]["branches"])=={"dev","main"} for e in on);assert d["permissions"]=={"contents":"read"};j=d["jobs"];assert all(j[k]["runs-on"]=="ubuntu-latest" for k in ("backend","frontend"));run=lambda k:[s.get("run","").strip() for s in j[k]["steps"]];b=run("backend");f=run("frontend");assert any(r.startswith("uv sync") for r in b),b;assert all(c in b for c in ("uv run pytest backend/tests","uv run ruff check backend","uv run ruff format --check backend")),b;assert all(c in f for c in ("npm ci","npm run test -- --run","npm run build")),f;assert j["frontend"]["defaults"]["run"]["working-directory"]=="frontend";uses=[s["uses"] for k in j for s in j[k]["steps"] if "uses" in s];assert all(re.fullmatch(r"[\w.-]+/[\w.-]+@[0-9a-f]{40}",u) for u in uses),uses;w=lambda k,p:next(s["with"] for s in j[k]["steps"] if s.get("uses","").startswith(p));su=w("backend","astral-sh/setup-uv@");assert su["enable-cache"] in (True,"true") and su["version"]=="0.12.19",su;sn=w("frontend","actions/setup-node@");assert sn["node-version-file"]=="frontend/package.json" and sn["cache"]=="npm" and sn["cache-dependency-path"]=="frontend/package-lock.json",sn;assert json.load(open("frontend/package.json",encoding="utf-8"))["engines"]["node"].startswith("^24");print("ci.yml structure OK")' && ! grep -q 'pull_request_target' .github/workflows/ci.yml && ! grep -q 'github\.event\.' .github/workflows/ci.yml && uv sync --locked --dry-run && echo TASK1 OK</automated>
  </verify>
  <done>
- `.github/workflows/ci.yml` exists and actionlint 1.7.12 reports zero findings. The verified docker command is above; at planning time a draft of exactly this shape passed with exit 0.
- The structural check prints "ci.yml structure OK": triggers are push and pull_request on {dev, main}; permissions are contents read; both jobs run on ubuntu-latest; the backend runs contain `uv sync --locked`, `uv run pytest backend/tests`, `uv run ruff check backend`, `uv run ruff format --check backend`; the frontend runs contain `npm ci`, `npm run test -- --run`, `npm run build` with working-directory `frontend`; every `uses:` is pinned to a 40-hex SHA; setup-uv has version 0.12.19 and enable-cache true; setup-node has node-version-file `frontend/package.json`, cache npm, cache-dependency-path `frontend/package-lock.json`.
- The privileged PR-target event and event-payload interpolation each appear 0 times in the file.
- `frontend/package.json` has `engines.node` = `^24.15.0`. The lockfile diff is at most the root `engines` block. `uv sync --locked --dry-run` still reports no changes.
- The change is committed as this task's atomic commit. Task 3 replays `HEAD`.
  </done>
</task>

<task type="auto">
  <name>Task 2: CI status badge in README.md and README.ru.md</name>
  <files>README.md, README.ru.md</files>
  <read_first>README.md (lines 1-5), README.ru.md (lines 1-5)</read_first>
  <action>
In BOTH READMEs, insert one identical badge line as line 3: after the `# YOLO Trainer Platform` H1 (line 1) and its following blank line (line 2), then a blank line, so the existing language-switch link moves from line 3 to line 5. The badge line is exactly:
[![CI](https://github.com/quick-1y/yolo-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/quick-1y/yolo-trainer/actions/workflows/ci.yml)

Owner and repo come from `git remote -v` (`origin https://github.com/quick-1y/yolo-trainer.git`). Leave out the `?branch=` query param on purpose. Per GitHub docs, the badge then shows the default branch (`main`), and while `main` has no run yet it shows the most recent run on any branch, so it starts reporting as soon as `dev` is pushed. Keep the alt text `CI` in both files: the line is a URL, not prose, and identical lines keep the two READMEs diffable section-by-section (Phase 01 Plan 10 decision).

Do NOT add a new `##` section or change any other line. Each file has 12 `##` headings now and must still have 12. Use the Edit tool so the existing line endings of the files are preserved.
  </action>
  <verify>
    <automated>cd C:/Users/admin/PycharmProjects/yolo-trainer && B='[![CI](https://github.com/quick-1y/yolo-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/quick-1y/yolo-trainer/actions/workflows/ci.yml)' && for f in README.md README.ru.md; do test "$(sed -n 3p "$f" | tr -d '\r')" = "$B" && test -z "$(sed -n 4p "$f" | tr -d '\r')" && test "$(grep -o '^## ' "$f" | wc -l)" -eq 12 && test "$(grep -o 'actions/workflows/ci.yml/badge.svg' "$f" | wc -l)" -eq 1 || { echo "FAIL $f"; exit 1; }; done && grep -n 'README.ru.md' README.md | head -1 && grep -n '(README.md)' README.ru.md | head -1 && echo TASK2 OK</automated>
  </verify>
  <done>
- Line 3 of both README.md and README.ru.md is exactly the badge line, and line 4 is blank.
- Each file contains the badge URL exactly once and still has 12 `##` headings.
- The language-switch links are still present (now on line 5).
- Committed as this task's atomic commit.
  </done>
</task>

<task type="auto">
  <name>Task 3: Replay both CI jobs on Linux against the committed tree (final gate, no push)</name>
  <files>.github/workflows/ci.yml (changed only if the replay exposes a workflow defect; otherwise this task changes no tracked files)</files>
  <read_first>.github/workflows/ci.yml (as committed by Task 1), scripts/run_full_suite.sh, docker/Dockerfile.backend (Docker Desktop download workarounds), docker/Dockerfile.frontend</read_first>
  <precondition>Tasks 1 and 2 are committed (`git status --porcelain .github frontend/package.json frontend/package-lock.json README.md README.ru.md` prints nothing) and `docker version` reaches the daemon</precondition>
  <action>
Goal: prove the exact command sequences of both jobs pass on Linux before the user's next push. Nothing in this repo has ever run pytest or vitest on Linux; the host runs are Windows. The replay feeds the containers `git archive HEAD`, which is what actions/checkout gives the runner. It must be exported with `-c core.autocrlf=false -c core.eol=lf`: with `* text=auto` and core.eol=native, a plain archive on Windows writes CRLF files. At planning time a plain archive gave 46 CRLF lines in frontend/package.json; the override gives 0. Set `CI=true` in both containers, as the GitHub runner does. Run each replay with run_in_background and a generous timeout (up to 30 min each): the first backend run downloads torch.

Frontend replay (node:24-alpine is cached locally and ships Node 24.21.0, which satisfies ^24.15.0). From Git Bash at the repo root:
git -c core.autocrlf=false -c core.eol=lf archive --format=tar HEAD frontend | MSYS_NO_PATHCONV=1 docker run --rm -i -e CI=true node:24-alpine sh -c 'mkdir -p /w && tar -xf - -C /w && cd /w/frontend && npm ci --maxsockets=1 && npm run test -- --run && npm run build'
`--maxsockets=1` is here only because Docker Desktop on Windows resets parallel registry connections (STATE decision 02-01). The workflow itself keeps plain `npm ci`.

Backend replay (python:3.12-slim with the same uv 0.12.19; a named volume keeps the uv cache across retries). From Git Bash at the repo root:
git -c core.autocrlf=false -c core.eol=lf archive --format=tar HEAD | MSYS_NO_PATHCONV=1 docker run --rm -i -e CI=true -e UV_LINK_MODE=copy -e UV_CONCURRENT_DOWNLOADS=1 -e UV_HTTP_TIMEOUT=300 -v yolo-trainer-ci-uv-cache:/root/.cache/uv python:3.12-slim sh -c 'mkdir -p /w && tar -xf - -C /w && pip install -q uv==0.12.19 && cd /w && uv sync --locked && uv run pytest backend/tests && uv run ruff check backend && uv run ruff format --check backend'
The serial downloads and long HTTP timeout are the same Docker Desktop workaround as STATE decision 02-04. The full tree is archived because `backend/tests/test_seed_images.py` loads `scripts/seed_images.py`. The slim image has no libGL, so the `cv2` cases in `test_image_processing.py` will SKIP through `pytest.importorskip`. Expect skips; they are not failures. Record the Linux passed/skipped counts.

How to handle results:
- Both replays pass: run `docker volume rm yolo-trainer-ci-uv-cache` to free the cache. Record the counts in SUMMARY.
- A ruff lint or format finding: fix it with `uv run ruff check --fix backend` / `uv run ruff format backend` if that touches 10 files or fewer. Otherwise stop and report it as a blocker.
- A test fails only on Linux:
  - If the root cause is test-side portability (path separators, case sensitivity, symlink semantics, locale or timezone) and the fix stays within 3 test files without changing production behaviour, fix it as a Rule 1 deviation, commit it, and re-run that replay.
  - If it is a production bug, do not fix it here. Record the failing test ids and root cause in SUMMARY as a blocker that will turn CI red.
  - Never skip, xfail or deselect tests, and never weaken the workflow commands, to get green.
- A workflow defect: fix `.github/workflows/ci.yml`, re-run the Task 1 verify, and commit.
- Infrastructure failure only: Docker is unavailable, or an image pull or package download keeps failing after one retry. Do not block on it. Instead, run the host fallback from the repo root: `uv sync --locked && uv run pytest backend/tests && uv run ruff check backend && uv run ruff format --check backend && npm --prefix frontend ci && npm --prefix frontend run test -- --run && npm --prefix frontend run build`. Record in SUMMARY "Linux replay not completed: <exact error>" next to the host results.

Do NOT push. Per the constraints the work stays on `dev`, and the first real GitHub run happens on the user's next `git push origin dev`. State that in SUMMARY.
  </action>
  <verify>
    <automated>cd C:/Users/admin/PycharmProjects/yolo-trainer && git -c core.autocrlf=false -c core.eol=lf archive --format=tar HEAD frontend | MSYS_NO_PATHCONV=1 docker run --rm -i -e CI=true node:24-alpine sh -c 'mkdir -p /w && tar -xf - -C /w && cd /w/frontend && npm ci --maxsockets=1 && npm run test -- --run && npm run build' && git -c core.autocrlf=false -c core.eol=lf archive --format=tar HEAD | MSYS_NO_PATHCONV=1 docker run --rm -i -e CI=true -e UV_LINK_MODE=copy -e UV_CONCURRENT_DOWNLOADS=1 -e UV_HTTP_TIMEOUT=300 -v yolo-trainer-ci-uv-cache:/root/.cache/uv python:3.12-slim sh -c 'mkdir -p /w && tar -xf - -C /w && pip install -q uv==0.12.19 && cd /w && uv sync --locked && uv run pytest backend/tests && uv run ruff check backend && uv run ruff format --check backend' && echo LINUX REPLAY OK</automated>
  </verify>
  <done>
- Both container replays exit 0 against `HEAD`. The frontend reports 51 test files / 564 tests passed or the current equivalent, and the build succeeds. The backend passes with only the documented cv2 skips, and both ruff checks are clean.
- Alternatively, the infra-failure path is documented with the exact error and a green host fallback.
- Any Linux-only fix is committed and within the stated limits; no test was skipped, xfailed or deselected to get there.
- SUMMARY lists the Linux counts, any deviations, and the note that the GitHub-side run is unobserved until the next push to `dev`.
- The `yolo-trainer-ci-uv-cache` volume has been removed. Nothing was pushed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub event → workflow runner | Push/PR content (including fork PRs) runs as code on the runner, with the GITHUB_TOKEN available |
| Workflow → third-party actions | Action code from actions/* and astral-sh/* runs with the job's token and workspace |
| Runner → package registries | uv/npm download dependencies from PyPI, download.pytorch.org and registry.npmjs.org |
| Runner → Actions cache | Cached uv/npm artifacts are restored into later runs |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-rnk-01 | Elevation of Privilege | GITHUB_TOKEN in ci.yml | high | mitigate | Top-level `permissions: contents: read` only. Task 1 structural check asserts it equals `{contents: read}` |
| T-rnk-02 | Tampering | Third-party action supply chain | high | mitigate | Every `uses:` pinned to a full 40-hex commit SHA with a release comment. SHAs re-resolved via `git ls-remote` at execution, and a moved tag stops the task. The regex check in Task 1 verify rejects any non-SHA ref |
| T-rnk-03 | Elevation of Privilege | Fork PR runs | high | mitigate | Only the plain `pull_request` event (read-only token, no secrets for forks). Task 1 verify asserts `pull_request_target` appears 0 times |
| T-rnk-04 | Tampering | Script injection through `run:` steps | medium | mitigate | No event-payload expressions interpolated into `run:` scripts. Task 1 verify asserts `github.event.` appears 0 times (`github.event_name` in concurrency is not payload data) |
| T-rnk-05 | Information Disclosure | Persisted git credentials in workspace | medium | mitigate | `persist-credentials: false` on both checkouts, so later steps (npm/uv scripts) cannot read the token from `.git/config` |
| T-rnk-06 | Tampering | Actions cache poisoning | low | accept | Caches are keyed on lockfile hashes and PR caches are scoped to the PR ref. setup-uv 10 disables caching for privileged events by default, and installs are hash-verified (`uv sync --locked` against uv.lock hashes, `npm ci` against lockfile integrity) |
| T-rnk-SC | Tampering | uv/npm installs in CI | high | mitigate | No new packages are added. CI installs exactly the already-locked set (`uv sync --locked`, `npm ci`) with hash/integrity checks, so the package-legitimacy gate is not triggered (no RESEARCH audit needed, no new npm/pip/cargo dependency). Local-only verification images: rhysd/actionlint:1.7.12 (published by the actionlint author, repo mounted read-only) and the official node:24-alpine and python:3.12-slim |
</threat_model>

<verification>
- Task 1 verify: actionlint clean, the structural assertions pass, the negative gates are at 0, and the lock is unchanged.
- Task 2 verify: the badge is on line 3 of both READMEs, followed by a blank line, and section counts are unchanged (12/12).
- Task 3 verify: both CI jobs' exact commands pass in Linux containers fed with `git archive HEAD` (LF line endings, CI=true), or the documented infra fallback is green on the host.
- Source audit: every item of the request is covered. Workflow path and triggers (T1); backend job uv/sync/pytest/ruff check/ruff format --check (T1); frontend job with Node from package.json, npm ci/test --run/build (T1, engines added because none existed); uv and npm caching (T1); badge in README.md and README.ru.md (T2); local verification of the same commands with pre-existing failures noted (T3, and planning-time host runs: none found).
</verification>

<success_criteria>
- `.github/workflows/ci.yml` exists on `dev`, is actionlint-clean, and matches the requested triggers, jobs, commands and caching.
- `frontend/package.json` declares `engines.node` `^24.15.0`, the single Node version source for CI.
- Both READMEs show the CI badge with their structure intact.
- The Linux replay of both jobs is green against the committed tree, or the infra fallback is documented.
- Three task commits on `dev` (plus any documented deviation commits); nothing pushed.
</success_criteria>

<output>
Create `C:/Users/admin/PycharmProjects/yolo-trainer/.planning/quick/261004-rnk-dobavit-github-actions-ci-backend-uv-pyt/261004-rnk-SUMMARY.md` when done
</output>
