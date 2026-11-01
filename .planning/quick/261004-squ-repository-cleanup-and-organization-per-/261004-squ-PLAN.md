---
phase: quick-261004-squ
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .gitignore
  - README.md
  - README.ru.md
autonomous: true
requirements: [QUICK-261004-squ]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "`git status` no longer lists the GSD runtime directory `.gsd/` as untracked, and `.gsd/` and its contents are still on disk and unmodified"
    - "No tracked file was deleted, moved, renamed or newly ignored: the tracked top-level set is still the same 23 entries, `git ls-files -d` is empty, and `git ls-files -ci --exclude-standard` is empty"
    - "The 13 stale tool-cache directories observed at planning time (gitignored, untracked, regenerable) are gone before the checks run, and no local user data, virtualenv, weights or IDE state was removed"
    - "The 'Repository layout' section of README.md and README.ru.md names every tracked top-level entry (except the ignore/attribute files and the READMEs themselves), each README keeps exactly the same `## ` headings (12) as commit 6ab713e, and everything above that section is byte-identical to commit 6ab713e"
    - "Every CI check passes after the cleanup (uv lock consistency, backend pytest, ruff lint and format for backend and the seed script, frontend vitest, frontend build), and the legacy CLI git-clean check prints GIT CLEAN OK"
    - "The SUMMARY has a Cleanup Report listing every removed item with its justification, every moved item (none), and every ambiguous or required item left in place with the reason"
  artifacts:
    - path: ".gitignore"
      provides: "Root-anchored ignore rule for the GSD runtime directory"
      contains: "/.gsd/"
    - path: "README.md"
      provides: "Complete Repository layout section (English)"
      contains: "example_ready_dataset/"
    - path: "README.ru.md"
      provides: "Complete Repository layout section (Russian, paths verbatim)"
      contains: "example_ready_dataset/"
    - path: ".planning/quick/261004-squ-repository-cleanup-and-organization-per-/261004-squ-SUMMARY.md"
      provides: "Cleanup Report: removed / moved / left in place, with justification and check results"
      contains: "## Cleanup Report"
  key_links:
    - from: ".gitignore"
      to: ".gsd/"
      via: "root-anchored ignore rule; git status reports the directory as ignored (!!) instead of untracked (??)"
      pattern: "^/\\.gsd/$"
    - from: "README.md"
      to: "git ls-files top-level entries"
      via: "the Repository layout block names every tracked top-level directory and root file"
      pattern: "spikes/"
    - from: "scripts/check_cli_run_git_clean.py"
      to: ".gitignore"
      via: "a real legacy CLI training run must leave `git status --porcelain --untracked-files=all` unchanged"
      pattern: "GIT CLEAN OK"
---

<objective>
Clean up and organize the repository strictly within cleanup scope: no architecture changes, no features, no refactoring of working code. Delete only confirmed garbage, move nothing that would need code changes, and leave and report anything ambiguous.

Purpose: a reproducible, honest repository state before Phase 4. `git status` stays clean, the documented layout matches the real tree, and stale local artifacts are gone, while the owner's local data, weights and virtualenvs stay untouched.

Output: one `.gitignore` rule (`/.gsd/`), a completed "Repository layout" section in both READMEs, 13 stale cache directories removed from the working tree (all gitignored and untracked, so no tracked diff), a green run of every CI check plus the legacy CLI git-clean check, and a Cleanup Report in the SUMMARY.

Facts observed live at planning time (2026-10-04, branch `dev` at 6ab713e). They are the ONLY source of authority for what may be changed or deleted. Task 1 re-checks them. If the live state differs, do not widen scope. Act only on authorized items that still pass their gates, and record the drift in the SUMMARY.

- Tracked top-level entries (23, from `git ls-files | cut -d/ -f1 | sort -u`): `.dockerignore .env.example .gitattributes .github .gitignore .planning .python-version README.md README.ru.md backend config docker docker-compose.yml docs example_ready_dataset finetune_yolo.py frontend gpu_test.py pyproject.toml scripts spikes train_yolo.py uv.lock`.
- The tracked tree is already clean. There are no duplicate blobs outside `.planning/`, no tracked files over 500 KB, and `git ls-files -ci --exclude-standard` is empty, so no tracked file matches an ignore rule. The only empty tracked file is `backend/src/yolo_trainer_api/routers/__init__.py`, a required package marker. Every frontend/src module is imported somewhere (`src/test-setup.ts` is wired via `vite.config.ts` `setupFiles`), and every backend module is imported.
- Every tracked non-app item is referenced. `spikes/*.py` are cited by `docs/phase-0-decisions.md` and `docs/roadmap.md` as the Phase 0 evidence. `train_yolo.py`, `finetune_yolo.py` and `config/config.ini` are the legacy CLI workflow (README "Legacy CLI scripts" section, ROADMAP Phase 1 SC2, Phase 4 and Phase 11 notes). `scripts/check_cli_run_git_clean.py` imports `train_yolo`. `gpu_test.py` is scheduled for replacement in ROADMAP Phase 12 and is documented in README. `example_ready_dataset/{data.yaml,README.dataset.txt,README.roboflow.txt}` are the tracked provenance record (decision D-23 in `.gitignore`), and the dataset is used by the CLI check and by Phase 9 SC1. Both `docs/*.md` files are cited by ROADMAP. All `scripts/*` are cited by README and `scripts/run_full_suite.sh`.
- Untracked and NOT ignored: `.gsd/` (GSD runtime state, which project instructions say must never be committed) and `.planning/ui-reviews/` (GSD ui-review output: its own `.gitignore` for screenshots plus one empty run directory `03-20261004-194229/`).
- Ignored local state that must NEVER be deleted: `.venv/` (1.1 GB), `spikes/.venv312/` (1.2 GB, unreferenced Phase 0 venv), `spikes/output/` (cited as evidence by `docs/phase-0-decisions.md`), `data/` (app DB and images), `runs/`, `trained_models/best.pt` (the downstream project's model), `yolov8n.pt` (used by `config/config.ini` [Train] and the CLI check), `yolo26n.pt`, `.idea/`, `.claude/`, `.planning/research/.cache/`, `example_ready_dataset/{train,valid,test}/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/tsconfig.tsbuildinfo` (the last two are rebuilt by the build check).
- Stale, regenerable tool caches. All 13 exist, are untracked, and `git check-ignore` matches each one: `__pycache__` (repo root; holds stale legacy-script bytecode including `gpu_test.cpython-312-pytest-9.1.1.pyc`), `scripts/__pycache__`, `.pytest_cache`, `.ruff_cache`, `backend/.pytest_cache`, `backend/.ruff_cache`, `backend/src/yolo_trainer_api/__pycache__`, `backend/src/yolo_trainer_api/migrations/__pycache__`, `backend/src/yolo_trainer_api/migrations/versions/__pycache__`, `backend/src/yolo_trainer_api/routers/__pycache__`, `backend/src/yolo_trainer_common/__pycache__`, `backend/src/yolo_trainer_worker/__pycache__`, `backend/tests/__pycache__`.
- README.md and README.ru.md each have 12 `## ` sections. The last one is "## Repository layout" / "## Структура репозитория". Its fenced block omits `spikes/`, `example_ready_dataset/`, `.github/`, `docker-compose.yml`, `pyproject.toml`, `uv.lock`, `.python-version` and `.env.example`, and describes `scripts/` without the seed script and the CLI git-clean check. Both READMEs use CRLF in the working tree (`core.autocrlf=true`, `* text=auto`). `.gitignore` uses LF.
- No moves are warranted. The legacy scripts are run from the repo root and read `config/config.ini` and `Config/Config.ini` by relative path. `spikes/` paths are cited in docs and in `.gitignore`/`.dockerignore`. Every app directory is already in place. Any move would need code or doc path rewrites with no structural gain.
- CI (`.github/workflows/ci.yml`) runs: `uv sync --locked`, `uv run pytest backend/tests`, `uv run ruff check backend`, `uv run ruff format --check backend`, `npm ci`, `npm run test -- --run`, `npm run build` (in `frontend/`). `scripts/run_full_suite.sh` adds a ruff check of `scripts/seed_images.py`, the compose smoke test and `scripts/check_cli_run_git_clean.py`. Local tools: uv 0.12.19, node 24.19.0. The previous quick task recorded 389 backend tests and 564 frontend tests passing.
</objective>

<execution_context>
@C:/Users/admin/PycharmProjects/yolo-trainer/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/admin/PycharmProjects/yolo-trainer/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.gitignore
@.dockerignore
@README.md
@README.ru.md
@.github/workflows/ci.yml
@scripts/run_full_suite.sh
@scripts/check_cli_run_git_clean.py
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer: live re-audit gate, then ignore `.gsd/` and prove it through git status</name>
  <files>.gitignore</files>
  <precondition>Current branch is `dev` and `git status --porcelain -- . ':!.planning'` prints exactly one line, `?? .gsd/`, so there are no tracked modifications outside `.planning/`</precondition>
  <reversibility rating="reversible">Removing one ignore line restores the previous behavior. No file on disk is touched.</reversibility>
  <action>
Use Git Bash from `C:/Users/admin/PycharmProjects/yolo-trainer`. This task takes one cleanup item through the whole path: live audit gate, then change, then git-level proof, then commit.

1. Live re-audit (mutable-scope gate). Re-run the planning-time observations and keep their outputs for the SUMMARY. Keep them in the session scratchpad or in memory, never as a new repo file. The observations are:
   - `git ls-files | cut -d/ -f1 | sort -u` must equal the 23 entries listed in the objective.
   - `git status --porcelain --untracked-files=normal -- . ':!.planning'` must list only `?? .gsd/`.
   - `git status --porcelain --untracked-files=normal -- .planning` may list `?? .planning/ui-reviews/` and entries under this quick directory `.planning/quick/261004-squ-repository-cleanup-and-organization-per-/`, plus any orchestrator-modified `.planning/` state files.
   - `git ls-files -ci --exclude-standard` must print nothing.
   - For each of the 13 cache paths in the objective, record exists/tracked/ignored.
   If anything differs, do NOT add new deletion or move targets. Continue only with the items authorized in this plan that still pass their gates, and record the drift under "Drift" in the SUMMARY.

2. Edit `.gitignore` only. After the existing "# Planning tool caches" block (which ends with `.planning/research/.cache/`), add one blank line, then the comment line `# GSD runtime state -- never commit (see project instructions)`, then the rule `/.gsd/`. The leading slash anchors the rule to the repo root so it cannot hide any nested path. Keep the file's LF line endings and do not touch any other line. Do NOT read, modify, move or delete anything inside `.gsd/`. Do NOT add `.planning/ui-reviews/` to any ignore file: it belongs to `.planning/` and the GSD tooling, and the owner decides whether to track it (it is reported as ambiguous in Task 3).

3. Prove the result. `git status --porcelain --ignored` must contain the exact line `!! .gsd/`. `git status --porcelain` must no longer contain `?? .gsd/`. `.gsd/` must still exist. `git ls-files -ci --exclude-standard` must still be empty, which shows the new rule matches no tracked file. The tracked top-level count must still be 23.

4. Commit only `.gitignore` with the message `chore(quick-261004-squ): ignore GSD runtime directory .gsd/`. Do not stage anything else, and never stage `.gsd/` or `.planning/ui-reviews/`.
  </action>
  <verify>
    <automated>cd C:/Users/admin/PycharmProjects/yolo-trainer && files=$(git ls-files) && st=$(git status --porcelain) && sti=$(git status --porcelain --ignored) && ci=$(git ls-files -ci --exclude-standard) && gi=$(git status --porcelain -- .gitignore) && test "$(printf '%s\n' "$files" | cut -d/ -f1 | sort -u | wc -l)" -eq 23 && test -d .gsd && git grep -q -x '/.gsd/' -- .gitignore && printf '%s\n' "$sti" | grep -qx '!! .gsd/' && ! printf '%s\n' "$st" | grep -q '^?? \.gsd/' && test -z "$ci" && test -z "$gi" && echo TRACER OK</automated>
  </verify>
  <done>`.gitignore` has the root-anchored `/.gsd/` rule under a GSD comment and nothing else changed. `git status` reports `.gsd/` as ignored, not untracked. `.gsd/` is untouched on disk. No tracked file matches any ignore rule. The change is committed on `dev`. The live audit outputs and any drift are recorded for the SUMMARY.</done>
</task>

<task type="auto">
  <name>Task 2: Make the README "Repository layout" section match the real tracked tree (en + ru)</name>
  <files>README.md, README.ru.md</files>
  <action>
Edit ONLY the fenced block inside the last section of each README: "## Repository layout" in `README.md` and "## Структура репозитория" in `README.ru.md`. Text above that heading must stay byte-identical. Section headings and the section count (12 each) must not change. Keep CRLF line endings. Keep the existing column convention: a name of up to 12 characters is padded with spaces so its description starts at column 14, the way `backend/     ` is. A longer name is followed by exactly three spaces, like the existing `train_yolo.py, finetune_yolo.py, gpu_test.py   ` line. Per the Phase 01 README decision, README.ru.md translates only the prose. Every path and file name stays verbatim, so the two blocks have the same entries in the same order.

Target entries in order. Lines marked (keep) stay exactly as they are:
1. `backend/` (keep)
2. `frontend/` (keep)
3. `docker/` (keep)
4. `scripts/` (change the description). EN: `Full-suite, compose smoke-test, fresh-clone, legacy CLI git-clean check, and large-project seed scripts`. RU: `Скрипты полного набора проверок, smoke-теста compose, проверки чистого клона, проверки git-чистоты после CLI-обучения и наполнения большого проекта`.
5. `config/` (keep)
6. `docs/` (keep)
7. `spikes/` (new). EN: `Phase 0 architecture-validation spike scripts (results in docs/phase-0-decisions.md)`. RU: `Скрипты spike-проверок архитектуры фазы 0 (результаты — в docs/phase-0-decisions.md)`.
8. `example_ready_dataset/` (new, long name, three spaces). EN: `Sample Roboflow detect dataset; only data.yaml and its two README files are tracked, the images and labels are git-ignored`. RU: `Пример датасета Roboflow для detect; в git хранятся только data.yaml и два его README, изображения и разметка игнорируются`.
9. `.github/` (new). EN: `CI workflow (backend and frontend checks)`. RU: `Workflow CI (проверки backend и frontend)`.
10. `.planning/` (keep)
11. `docker-compose.yml` (new, long name, three spaces). EN: `Docker Compose stack (api, worker, web services)`. RU: `Стек Docker Compose (сервисы api, worker, web)`.
12. `pyproject.toml, uv.lock, .python-version` (new, long name, three spaces). EN: `uv workspace root (Python 3.12, locked dependencies)`. RU: `Корень uv-workspace (Python 3.12, зафиксированные зависимости)`.
13. `.env.example` (new, 12 characters, so one space brings the description to column 14). EN: `Template for .env settings`. RU: `Шаблон настроек для .env`.
14. `train_yolo.py, finetune_yolo.py, gpu_test.py` (keep, last line)

These lines are facts already true in the repo (compose services are `api`, `worker`, `web`; `.python-version` is `3.12`; the dataset tracking rule comes from `.gitignore`). Do not add any other prose, section or badge. Commit both files together with the message `docs(quick-261004-squ): complete README repository layout`.
  </action>
  <verify>
    <automated>cd C:/Users/admin/PycharmProjects/yolo-trainer && files=$(git ls-files) && en0=$(git show 6ab713e:README.md) && ru0=$(git show 6ab713e:README.ru.md) && rs=$(git status --porcelain -- README.md README.ru.md) && out=$(for e in $(printf '%s\n' "$files" | cut -d/ -f1 | sort -u | grep -v -x -E '\.dockerignore|\.gitattributes|\.gitignore|README\.md|README\.ru\.md'); do awk '/^## Repository layout/{p=1} p' README.md | grep -q -F "$e" || echo "MISSING $e in README.md"; awk '/^## Структура репозитория/{p=1} p' README.ru.md | grep -q -F "$e" || echo "MISSING $e in README.ru.md"; done) && echo "$out" && test -z "$out" && diff <(printf '%s\n' "$en0" | grep '^## ' | tr -d '\r') <(grep '^## ' README.md | tr -d '\r') && diff <(printf '%s\n' "$ru0" | grep '^## ' | tr -d '\r') <(grep '^## ' README.ru.md | tr -d '\r') && diff <(printf '%s\n' "$en0" | sed '/^## Repository layout/,$d' | tr -d '\r') <(sed '/^## Repository layout/,$d' README.md | tr -d '\r') && diff <(printf '%s\n' "$ru0" | sed '/^## Структура репозитория/,$d' | tr -d '\r') <(sed '/^## Структура репозитория/,$d' README.ru.md | tr -d '\r') && test -z "$rs" && echo LAYOUT OK</automated>
  </verify>
  <done>Both layout blocks list the same 14 entries in the same order and cover all 18 relevant tracked top-level entries. Both READMEs keep 12 sections. Everything above the layout heading is unchanged from 6ab713e. The change is committed.</done>
</task>

<task type="auto">
  <name>Task 3: Remove the 13 stale tool caches, run every CI check plus the CLI git-clean check, write the Cleanup Report</name>
  <files>.planning/quick/261004-squ-repository-cleanup-and-organization-per-/261004-squ-SUMMARY.md</files>
  <precondition>Tasks 1 and 2 are committed: `git status --porcelain -- .gitignore README.md README.ru.md` prints nothing</precondition>
  <reversibility rating="reversible">Only regenerable Python/pytest/ruff caches are removed. Running the tools recreates them.</reversibility>
  <action>
Use Git Bash from `C:/Users/admin/PycharmProjects/yolo-trainer`.

1. Gated cache removal. The authorized set is exactly the 13 paths listed in the objective, no more. For each path, delete it with `rm -rf -- <path>` ONLY if all four gates pass: (a) it exists as a directory; (b) its basename is `__pycache__`, `.pytest_cache` or `.ruff_cache`; (c) `git ls-files -- <path>` prints nothing; (d) `git check-ignore -q <path>` succeeds. If any gate fails, skip the path and record why. Do NOT use `git clean` in any form (its `-X` mode would also wipe `data/`, `.venv/`, `runs/`, weights and `spikes/.venv312/`). Do NOT use `find ... -delete`, globs or wildcard `rm`. Never touch `.venv/`, `spikes/.venv312/`, `spikes/output/`, `data/`, `runs/`, `trained_models/`, any `*.pt`, `.idea/`, `.claude/`, `.gsd/`, `.planning/`, `example_ready_dataset/`, `frontend/node_modules/`, `frontend/dist/` or `frontend/tsconfig.tsbuildinfo`. If a cache directory that is not on the list shows up, it is not authorized. Leave it and report it. Immediately after the loop, confirm that none of the 13 removed paths exists. This must happen before any check runs, because the checks regenerate some of them.

2. Run the checks one at a time. Use a Bash timeout of up to 600000 ms for each of the long ones, and record pass counts and durations. Run: `uv sync --locked --dry-run` (expect "Would make no changes", which shows the lock and the env are consistent and nothing gets installed); `uv run pytest backend/tests -q`; `uv run ruff check backend`; `uv run ruff format --check backend`; `uv run ruff check scripts/seed_images.py`; `uv run ruff format --check scripts/seed_images.py`; `npm --prefix frontend run test -- --run`; `npm --prefix frontend run build` (chunk-size warnings are expected); `uv run python scripts/check_cli_run_git_clean.py` (expect `GIT CLEAN OK`; this check exercises the ignore rules with a real 1-epoch CPU training run). Do not run `npm ci` or `uv sync` without `--dry-run`: dependencies are already installed and nothing in this plan changes them. Skip `scripts/compose_smoke_test.sh` and record why: nothing that enters a Docker build changed (`docker/`, `docker-compose.yml`, `.dockerignore`, `backend/src`, `frontend/` are untouched, and `.gitignore` and the READMEs are not copied by either Dockerfile). If the CLI check fails for an environment reason unrelated to this cleanup, such as exit code 3 or a network download error, record the exact output and mark it environment-blocked. If any other check fails, stop and report it. Do not "fix" code, because that is out of scope.

3. Final integrity proof. `git ls-files -d` is empty. `git ls-files -ci --exclude-standard` is empty. The tracked top-level count is still 23. `git status --porcelain --untracked-files=normal -- . ':!.planning'` prints nothing. Every protected local item still exists: `.venv`, `spikes/.venv312`, `spikes/output`, `data`, `runs`, `trained_models/best.pt`, `yolov8n.pt`, `yolo26n.pt`, `.idea`, `.gsd`, `frontend/node_modules`. No commit happens in this task, because the cache removal changes no tracked file.

4. Write the SUMMARY (per the summary template) with a `## Cleanup Report` section containing these subsections:
   - "### Removed": every path deleted in step 1 with its four gate results, its size, and the justification "regenerable tool cache, gitignored and untracked". Mention that the root `__pycache__` held stale legacy-script bytecode, including `gpu_test.cpython-312-pytest-9.1.1.pyc`.
   - "### Ignore rules": the `/.gsd/` rule and why (project instructions forbid committing `.gsd/`, and it was showing as untracked).
   - "### Moved": None. Give the reasons from the objective (relative paths in the legacy scripts, docs citations of `spikes/`, no structural gain).
   - "### Documentation": the README layout completion.
   - "### Left in place (ambiguous or required)": one row per item with its reason and evidence (the `git grep` hits you re-run). Cover at least: `train_yolo.py`, `finetune_yolo.py`, `config/config.ini` (legacy CLI workflow, README section, ROADMAP Phase 1/4/11, imported by the CLI check); `gpu_test.py` (replacement is scheduled in ROADMAP Phase 12); `spikes/*.py` and `spikes/output/` (Phase 0 evidence cited by `docs/phase-0-decisions.md`); `spikes/.venv312/` (1.2 GB untracked venv referenced nowhere, probably redundant with `.venv/`, left because it is untracked local state, so the owner may delete it by hand); `example_ready_dataset/` (D-23 provenance files plus fixture for the CLI check and Phase 9); `docs/`; `.planning/ui-reviews/` (untracked, not ignored, GSD ui-review output with one empty run directory, left because `.planning/` is out of scope, so the owner decides whether to track or ignore it); `backend/src/yolo_trainer_api/routers/__init__.py` (empty but a required package marker); local weights, data, runs, venvs, IDE and build output (untracked owner state, never deleted).
   - "### Observations (not changed)": `.claude/CLAUDE.md` codebase sections still describe the pre-app layout (`.claude/` is out of scope; regenerate via `/gsd-map-codebase` or edit by hand); `train_yolo.py` reads `Config/Config.ini` (case-sensitive filesystem issue, already documented in README; a code fix is out of scope); a bare `uv run pytest` from the repo root would collect `gpu_test.py` (pytest's default `*_test.py` pattern, shown by the stale pytest bytecode; the documented `uv run pytest backend/tests` is unaffected); `.dockerignore` does not list `.gsd`, `.pytest_cache`, `.ruff_cache` or `frontend/*.tsbuildinfo` (build-context size only, no correctness impact, left unchanged).
   - "### Drift": anything from the Task 1 re-audit that differed from the planning-time facts, or "None".
   - "### Checks run": each command with its result and pass counts, plus the compose smoke-test skip reason.
  </action>
  <verify>
    <automated>cd C:/Users/admin/PycharmProjects/yolo-trainer && uv sync --locked --dry-run && uv run pytest backend/tests -q && uv run ruff check backend && uv run ruff format --check backend && uv run ruff check scripts/seed_images.py && uv run ruff format --check scripts/seed_images.py && npm --prefix frontend run test -- --run && npm --prefix frontend run build && uv run python scripts/check_cli_run_git_clean.py && del=$(git ls-files -d) && ci=$(git ls-files -ci --exclude-standard) && files=$(git ls-files) && st=$(git status --porcelain --untracked-files=normal -- . ':!.planning') && test -z "$del" && test -z "$ci" && test "$(printf '%s\n' "$files" | cut -d/ -f1 | sort -u | wc -l)" -eq 23 && test -z "$st" && for p in .venv spikes/.venv312 spikes/output data runs trained_models/best.pt yolov8n.pt yolo26n.pt .idea .gsd frontend/node_modules; do test -e "$p" || { echo "PROTECTED ITEM MISSING: $p"; exit 1; }; done && grep -q '^## Cleanup Report' .planning/quick/261004-squ-repository-cleanup-and-organization-per-/261004-squ-SUMMARY.md && echo CLEANUP VERIFIED</automated>
  </verify>
  <done>All 13 authorized caches were removed through the gates before the checks ran, and nothing outside the list was deleted. Every CI check and the CLI git-clean check pass (or the CLI check is explicitly recorded as environment-blocked with its output). No tracked file is missing or ignored. All protected local state is intact. The SUMMARY Cleanup Report lists Removed, Ignore rules, Moved (none), Documentation, Left in place, Observations, Drift and Checks run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| executor shell → owner's working tree | Destructive filesystem commands run against a working copy that also holds about 2.5 GB of untracked owner state (venvs, app DB, weights, runs) |
| `.gitignore` → git index | Ignore rules decide what can ever be staged and committed |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-squ-01 | Tampering / Denial of Service (data loss) | Task 3 cache removal | high | mitigate | Exact 13-path allowlist observed at planning time. Four per-path gates (directory exists, cache basename, untracked, `git check-ignore` match). `git clean`, `find -delete` and globs are forbidden. A post-check asserts that 11 protected local items still exist |
| T-squ-02 | Information Disclosure | `.gsd/` runtime state | low | mitigate | Root-anchored `/.gsd/` ignore rule, so `git add -A` can no longer stage GSD runtime state |
| T-squ-03 | Tampering | Over-broad ignore rule hiding tracked or future files | medium | mitigate | Rule anchored with a leading slash. `git ls-files -ci --exclude-standard` must stay empty after the change |
| T-squ-04 | Repudiation | Silent removals | low | mitigate | The SUMMARY Cleanup Report lists every removed path with gate results and size. Drift from the planning-time audit is recorded |
| T-squ-05 | Tampering | README edits leaking outside the layout section | low | mitigate | Task 2 verify diffs everything above the layout heading against 6ab713e (CR-insensitive) and asserts 12 sections per README |
</threat_model>

<verification>
- Task 1: `TRACER OK`. `.gsd/` is ignored, not untracked, and still on disk. No tracked file is ignored.
- Task 2: `LAYOUT OK`. Both layout blocks cover every relevant tracked top-level entry, and the README prefix is unchanged.
- Task 3: `CLEANUP VERIFIED`. The CI check set and the CLI git-clean check pass after the cache removal, tracked-tree integrity holds, protected local state is intact, and the Cleanup Report exists.
- The compose smoke test is intentionally not run, because no Docker build input changed. The reason is recorded in the SUMMARY.
</verification>

<success_criteria>
- Exactly two commits on `dev`: `chore(quick-261004-squ): ignore GSD runtime directory .gsd/` (only `.gitignore`) and `docs(quick-261004-squ): complete README repository layout` (only the two READMEs).
- Zero tracked files deleted, moved or renamed. The tracked top-level set is still 23 entries.
- Only the 13 planning-time cache directories were removed from the working tree. No owner data, weights, venv, IDE or `.gsd/`/`.planning/`/`.claude/` content was touched.
- All CI checks are green after the cleanup, and the legacy CLI git-clean check prints `GIT CLEAN OK`.
- The Cleanup Report gives the owner a complete removed / moved / left-in-place picture, including the 1.2 GB `spikes/.venv312/` they can delete by hand.
</success_criteria>

<output>
Create `C:/Users/admin/PycharmProjects/yolo-trainer/.planning/quick/261004-squ-repository-cleanup-and-organization-per-/261004-squ-SUMMARY.md` when done
</output>
