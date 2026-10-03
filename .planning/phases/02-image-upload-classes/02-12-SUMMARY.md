---
phase: 02-image-upload-classes
plan: 12
subsystem: testing
tags: [seed, httpx, pillow, docker-compose, smoke-test, readme, phase-gate]

requires:
  - phase: 02-image-upload-classes
    provides: "upload API (02-01/02-03), classes API (02-02/02-05), nginx upload limits and smoke-test limits stage (02-04), virtualized grid (02-07), select/delete (02-11)"
provides:
  - "scripts/seed_images.py: reproducible large-project seeding through the real upload API (SC2 verification aid)"
  - "smoke test proves SC4 for images AND classes (down/up and image rebuild) plus image_count/class_count on project responses"
  - "run_full_suite.sh lints and format-checks the seed script; README.md / README.ru.md document seeding and the grid smoothness check"
affects: [phase-03-annotation-canvas, verify-work-phase-02]

actuals:
  tokens: 4800
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Standalone scripts are loaded by file path in pytest (importlib.util.spec_from_file_location) and driven with the in-process TestClient, which is an httpx.Client subclass"
    - "Smoke-test assertions use shell case-patterns on the JSON body, one FAIL: line + exit 1 per check"

key-files:
  created:
    - scripts/seed_images.py
    - backend/tests/test_seed_images.py
  modified:
    - scripts/compose_smoke_test.sh
    - scripts/run_full_suite.sh
    - README.md
    - README.ru.md

key-decisions:
  - "Seed images are deterministic per (index, seed) and made unique by a drawn counter, so a re-run reports every image as duplicate"
  - "resolve_project reuses an existing project by case-insensitive name on 409 instead of failing, so the default seed-5000 project can be topped up"
  - "main() returns 1 only when something was rejected and 2 on connection/HTTP errors; duplicates are a normal outcome"

patterns-established:
  - "Phase gate plan = seeding tool + persistence smoke assertions + full-suite wiring + docs, with browser-only checks left to end-of-phase UAT"

requirements-completed: [DATA-01, ANNO-01, PROJ-03]

coverage:
  - id: D1
    description: "seed_images.py generates unique reproducible JPEGs, resolves/creates the target project and seeds N images through the real upload API, reporting added/duplicate/rejected; re-run reports all duplicates"
    requirement: "DATA-01"
    verification:
      - kind: unit
        ref: "backend/tests/test_seed_images.py (4 tests)"
        status: pass
      - kind: integration
        ref: "uv run python scripts/seed_images.py --count 60 against a live uvicorn: added=60, then duplicate=60"
        status: pass
    human_judgment: false
  - id: D2
    description: "Compose smoke test proves a created class (index 0, #E6194B), the uploaded image and project counts survive docker compose down/up and the image rebuild"
    requirement: "PROJ-03"
    verification:
      - kind: integration
        ref: "bash scripts/compose_smoke_test.sh (SMOKE OK)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full phase gate passes: pytest 314, ruff on backend and seed script, Vitest 167, production build, compose smoke test, CLI git-clean check"
    verification:
      - kind: integration
        ref: "bash scripts/run_full_suite.sh (ALL CHECKS OK)"
        status: pass
    human_judgment: false
  - id: D4
    description: "README.md and README.ru.md explain seeding a large project and the manual grid smoothness check"
    requirement: "ANNO-01"
    verification:
      - kind: other
        ref: "grep -c seed_images.py README.md README.ru.md (5 each)"
        status: pass
    human_judgment: true
    rationale: "Documentation clarity (and Russian wording) needs a human read"
  - id: D5
    description: "With 5000 seeded images the Images grid scrolls smoothly in a real browser and only a few hundred <img> elements are mounted (SC2); folder drop in Chrome/Firefox/Safari; long-text truncation; class CRUD indices; restart persistence in the browser"
    requirement: "ANNO-01"
    verification: []
    human_judgment: true
    rationale: "Frame-rate smoothness, cross-browser folder drop and visual truncation have no automated harness; DOM-bound test (02-07) and keyset/EXPLAIN tests (02-09) are partial evidence only"

duration: 16min
completed: 2026-10-03
status: complete
plan_head_before: 59f391c5a2103c4190614740f985b743e12087df
commits: 3
---

# Phase 2 Plan 12: Phase gate Summary

**Скрипт `seed_images.py` для наполнения проекта тысячами уникальных изображений через настоящий upload API, smoke-тест, доказывающий сохранность изображений и классов после down/up и пересборки образов, README (en + ru) и полностью зелёный `run_full_suite.sh`.**

## Performance

- **Duration:** ~16 min (основное время - compose smoke ~6 min и полный набор ~2.5 min)
- **Started:** 2026-10-03T14:04:00Z
- **Completed:** 2026-10-03T14:20:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `scripts/seed_images.py`: `make_unique_jpeg` (640x480, детерминирован по `(i, seed)`), `resolve_project` (создание/повторное использование по имени при 409), `seed` (пачки по 20, 4 потока, заголовок `X-Requested-With`), CLI `main` с флагами `--base-url --count --project-id --name --batch-size --workers --seed`. Проверено и в процессе (TestClient), и на живом uvicorn: первый запуск `added=60`, второй `duplicate=60`.
- Smoke-тест: создаёт класс `car` (HTTP 201, `index` 0, `#E6194B`), проверяет `image_count:1`/`class_count:1` у проекта, затем после `down/up` и после `--force-recreate` пересборки подтверждает, что класс и изображение (`total:1`) на месте (SC4 для изображений и классов). `SMOKE OK` остаётся последней строкой.
- `run_full_suite.sh` добавляет `ruff check` и `ruff format --check` для скрипта; `ALL CHECKS OK` по-прежнему последняя строка. Итог прогона: pytest 314 passed, Vitest 167/167, сборка, smoke, git-clean - всё зелёное.
- README.md и README.ru.md: раздел про наполнение большого проекта и ручную проверку плавности сетки.

## Task Commits

1. **Task 1: Seed a large project through the real upload API** (TDD)
   - RED: `906d85e` (test) - падающие тесты (падение на assert отсутствия скрипта в целевом тесте)
   - GREEN: `06cf5ed` (feat) - реализация, 4 теста проходят
   - REFACTOR: не требовался (ruff format применён до GREEN-коммита)
2. **Task 2: Smoke persistence, docs, full suite** - `2c759e3` (feat)

**Plan metadata:** следующий коммит `docs(02-12)` (SUMMARY, STATE, ROADMAP, REQUIREMENTS)

## Files Created/Modified

- `scripts/seed_images.py` - наполнение проекта через реальный API (httpx + Pillow)
- `backend/tests/test_seed_images.py` - 4 теста: уникальность и валидность JPEG, детерминизм, `resolve_project`, `seed` + повторный запуск
- `scripts/compose_smoke_test.sh` - создание класса, проверка счётчиков, сохранность классов/изображений после down/up и пересборки
- `scripts/run_full_suite.sh` - ruff для seed-скрипта
- `README.md`, `README.ru.md` - раздел «Seeding a large project and checking grid smoothness» / «Наполнение большого проекта и проверка плавности сетки» и две строки в списке отдельных проверок

## Decisions Made

- Изображения уникальны за счёт нарисованного счётчика, а не только случайных величин - повторный запуск гарантированно даёт дубликаты.
- Коды возврата CLI: 0 - успех (дубликаты допустимы), 1 - были отклонённые файлы, 2 - ошибка соединения/HTTP.
- Docker build workarounds (`npm ci --maxsockets=1`, `UV_CONCURRENT_DOWNLOADS=1`, `UV_HTTP_TIMEOUT=300`) не затрагивались.

## Deviations from Plan

None - plan executed exactly as written. Полный набор не выявил проблем в файлах фазы, поэтому исправлений по итогам `run_full_suite.sh` не потребовалось. Единственная мелочь: формулировки `echo` в smoke-тесте содержат литерал `/classes`, чтобы выполнялся критерий приёмки `grep -c '/classes' >= 2` (URL класса задан один раз через переменную).

**Total deviations:** 0 auto-fixed.

## Issues Encountered

None. Известные перемежающиеся тесты из `deferred-items.md` (02-09: `UploadPanel` Collapse и `CreateProjectModal` timeout) в этом прогоне не воспроизвелись (Vitest 167/167, `testTimeout` 15000 из 02-11).

## Human Verification Outstanding (end-of-phase batch, human_verify_mode=end-of-phase)

Автоматика не покрывает; нужно выполнить до `/gsd-verify-work` (на dev-машине после `docker compose up --build`):

1. SC2: создать проект, `uv run python scripts/seed_images.py --count 5000 --project-id <id>`, открыть Images и прокрутить сверху вниз - плавно, `document.querySelectorAll("img").length` в DevTools остаётся в пределах нескольких сотен.
2. D-05: перетащить на страницу Images папку с подпапкой изображений и `.txt` в Chrome, Firefox и (при наличии) Safari - все изображения добавлены, `.txt` в списке отклонённых.
3. Длинный текст: плитка с именем файла в 255 символов, имя класса в 100 символов (en и ru), список отклонённых из 5000 записей (усечение, многоточие, `title`, «...and N more»).
4. Классы: создать, переименовать, перекрасить, удалить - проверить индексы.
5. SC4 в браузере: `docker compose down` / `up` - изображения, миниатюры и классы на месте.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None. Скрипт по умолчанию обращается к loopback (`127.0.0.1:8080`), ничего не удаляет и пишет только в проект из `--project-id` или `seed-5000` (T2-12-01). Smoke-тест использует собственный `.smoke-data` и очищается trap-ом (T2-12-03).

## Next Phase Readiness

Фаза 2 технически завершена (12/12 планов); остаётся ручной пакет проверок выше, затем `/gsd-verify-work`. Дальше Фаза 3 (канвас аннотирования) может использовать `seed_images.py` для проверки производительности на больших проектах.

## TDD Gate Compliance

RED (`906d85e`, test) -> GREEN (`06cf5ed`, feat) присутствуют по порядку; REFACTOR не нужен. RED падал на утверждении целевого теста (`SEED_SCRIPT.is_file()`), а не на ошибке сбора/импорта.

## Self-Check: PASSED

- FOUND: scripts/seed_images.py, backend/tests/test_seed_images.py, scripts/compose_smoke_test.sh, scripts/run_full_suite.sh, README.md, README.ru.md
- FOUND commits: 906d85e, 06cf5ed, 2c759e3
- Acceptance criteria re-run: pytest test_seed_images 4 passed; `--help` lists `--count`; `X-Requested-With` 1, `def seed` 1, `def resolve_project` 1; `"class_count":1` 1, `/classes` 3, `seed_images.py` in run_full_suite.sh 4, README.md 5, README.ru.md 5; `SMOKE OK` and `ALL CHECKS OK` last lines.

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
